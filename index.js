require('dotenv').config();
const { Client, GatewayIntentBits, PermissionFlagsBits, MessageFlags, Partials } = require('discord.js');
const storage = require('./storage');
const { buildWelcomeMessage, buildReminderMessage } = require('./welcome-message');
const { getConfiguredRoles, buildReactionRolesEmbed } = require('./reactionroles');

const {
  DISCORD_TOKEN,
  GUILD_ID,
  WELCOME_CHANNEL_ID,
  VERIFY_CHANNEL_ID,
  VERIFIED_ROLE_ID,
  UNVERIFIED_ROLE_ID,
  REMINDER_MINUTES,
  REMINDER_DM_ENABLED,
  REMINDER_CHANNEL_FALLBACK
} = process.env;

const reminderMs = (Number(REMINDER_MINUTES) || 10) * 60 * 1000;
const dmEnabled = REMINDER_DM_ENABLED !== 'false';
const channelFallbackEnabled = REMINDER_CHANNEL_FALLBACK !== 'false';

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMessageReactions
  ],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction, Partials.User]
});

const activeReminderTimers = new Map();

function isVerified(member) {
  return VERIFIED_ROLE_ID ? member.roles.cache.has(VERIFIED_ROLE_ID) : false;
}

async function sendWelcomeMessage(member) {
  const channel = await client.channels.fetch(WELCOME_CHANNEL_ID).catch(() => null);
  if (!channel) {
    console.warn('Welcome-Channel nicht gefunden. Prüfe WELCOME_CHANNEL_ID in der .env.');
    return;
  }
  const message = buildWelcomeMessage(member, VERIFY_CHANNEL_ID);
  await channel.send(message).catch(err =>
    console.warn(`Konnte Willkommensnachricht nicht senden: ${err.message}`)
  );
}

async function sendReminder(member) {
  const fresh = await member.fetch().catch(() => null);
  if (!fresh) return;
  if (isVerified(fresh)) return;

  let dmSuccess = false;

  if (dmEnabled) {
    const dmMessage = buildReminderMessage(fresh, VERIFY_CHANNEL_ID, false);
    dmSuccess = await fresh.send(dmMessage).then(() => true).catch(() => false);
  }

  if (!dmSuccess && channelFallbackEnabled) {
    const channel = await client.channels.fetch(WELCOME_CHANNEL_ID).catch(() => null);
    if (channel) {
      const channelMessage = buildReminderMessage(fresh, VERIFY_CHANNEL_ID, true);
      await channel.send(channelMessage).catch(err =>
        console.warn(`Konnte Erinnerung im Channel nicht senden: ${err.message}`)
      );
    }
  }

  storage.markReminded(fresh.id);
  activeReminderTimers.delete(fresh.id);
}

function scheduleReminder(member, delayMs) {
  if (activeReminderTimers.has(member.id)) {
    clearTimeout(activeReminderTimers.get(member.id));
  }

  const safeDelay = Math.max(delayMs, 0);
  const timer = setTimeout(() => sendReminder(member), safeDelay);
  activeReminderTimers.set(member.id, timer);
}

async function handleNewOrExistingUnverifiedMember(member, isFreshJoin) {
  if (isVerified(member)) return;

  const status = storage.getReminderStatus(member.id);

  if (!status) {
    storage.setJoinedAt(member.id, new Date().toISOString());
    scheduleReminder(member, reminderMs);
    return;
  }

  if (status.reminded) return;

  const joinedAt = new Date(status.joinedAt).getTime();
  const elapsed = Date.now() - joinedAt;
  const remaining = reminderMs - elapsed;

  scheduleReminder(member, remaining);
}

async function resolveReaction(reaction) {
  try {
    if (reaction.partial) await reaction.fetch();
    if (reaction.message.partial) await reaction.message.fetch();
    return true;
  } catch (err) {
    console.warn('Konnte Reaction/Nachricht nicht laden:', err.message);
    return false;
  }
}

async function handleReactionRoleChange(reaction, user, action) {
  if (user.bot) return;

  const ok = await resolveReaction(reaction);
  if (!ok) return;

  const data = storage.getReactionRoleMessage(reaction.message.id);
  if (!data) return;

  const emoji = reaction.emoji.name;
  const roleId = data.roles[emoji];
  if (!roleId) return;

  const guild = reaction.message.guild;
  if (!guild) return;

  const member = await guild.members.fetch(user.id).catch(() => null);
  if (!member) return;

  const role = guild.roles.cache.get(roleId) || (await guild.roles.fetch(roleId).catch(() => null));
  if (!role) {
    console.warn(`Reaction-Role: Rolle ${roleId} existiert nicht mehr.`);
    return;
  }

  try {
    if (action === 'add') {
      await member.roles.add(role);
    } else {
      await member.roles.remove(role);
    }
  } catch (err) {
    console.warn(`Konnte Rolle nicht ${action === 'add' ? 'vergeben' : 'entfernen'}:`, err.message);
  }
}

client.once('ready', async () => {
  console.log(`Welcome-Bot eingeloggt als ${client.user.tag}`);

  const giveaway = require('./giveaway');
  await giveaway.recoverGiveaways(client);

  if (!GUILD_ID) return;
  const guild = await client.guilds.fetch(GUILD_ID).catch(() => null);
  if (!guild) {
    console.warn('GUILD_ID nicht gefunden, Recovery-Scan wird übersprungen.');
    return;
  }

  const pending = storage.getAllPendingReminders();
  if (pending.length === 0) return;

  console.log(`Stelle ${pending.length} offene Erinnerung(en) nach Neustart wieder her...`);
  for (const entry of pending) {
    const member = await guild.members.fetch(entry.discordId).catch(() => null);
    if (!member) continue;
    if (isVerified(member)) continue;

    const elapsed = Date.now() - new Date(entry.joinedAt).getTime();
    const remaining = reminderMs - elapsed;
    scheduleReminder(member, remaining);
  }
});

client.on('guildMemberAdd', async member => {
  if (UNVERIFIED_ROLE_ID) {
    await member.roles.add(UNVERIFIED_ROLE_ID).catch(err =>
      console.warn(`Konnte Unverified-Rolle nicht vergeben: ${err.message}`)
    );
  }

  if (!storage.hasBeenGreeted(member.id)) {
    await sendWelcomeMessage(member);
    storage.markGreeted(member.id);
  }

  await handleNewOrExistingUnverifiedMember(member, true);
});

client.on('messageReactionAdd', (reaction, user) => handleReactionRoleChange(reaction, user, 'add'));
client.on('messageReactionRemove', (reaction, user) => handleReactionRoleChange(reaction, user, 'remove'));

client.on('interactionCreate', async interaction => {
  // ==================== BUTTON HANDLER ====================
  if (interaction.isButton()) {
    if (interaction.customId.startsWith('giveaway_enter_')) {
      const messageId = interaction.customId.replace('giveaway_enter_', '');
      
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      
      const giveaway = storage.getGiveaway(messageId);
      
      if (!giveaway) {
        return interaction.editReply({ content: 'This giveaway no longer exists.' });
      }
      
      if (giveaway.ended) {
        return interaction.editReply({ content: 'This giveaway has already ended.' });
      }
      
      if (giveaway.participants.includes(interaction.user.id)) {
        return interaction.editReply({ content: 'You have already entered this giveaway!' });
      }
      
      storage.addParticipant(messageId, interaction.user.id);
      
      const updatedGiveaway = storage.getGiveaway(messageId);
      const { buildGiveawayEmbed, buildGiveawayButtonRow } = require('./giveaway');
      const embed = buildGiveawayEmbed(updatedGiveaway);
      const row = buildGiveawayButtonRow(messageId, false);
      
      await interaction.message.edit({ embeds: [embed], components: [row] }).catch(err => {
        console.error('[Giveaway] Failed to update message:', err.message);
      });
      
      return interaction.editReply({ content: '🎉 You have successfully entered the giveaway!' });
    }
    return;
  }

  if (!interaction.isChatInputCommand()) return;

  const { commandName } = interaction;

  // ==================== /testwelcome ====================
  if (commandName === 'testwelcome') {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const targetUser = interaction.options.getUser('user') || interaction.user;
    const member = await interaction.guild.members.fetch(targetUser.id).catch(() => null);

    if (!member) {
      return interaction.editReply('Dieses Mitglied konnte auf diesem Server nicht gefunden werden.');
    }

    const channel = await client.channels.fetch(WELCOME_CHANNEL_ID).catch(() => null);
    if (!channel) {
      return interaction.editReply('Welcome-Channel wurde nicht gefunden. Prüfe WELCOME_CHANNEL_ID in der .env.');
    }

    const message = buildWelcomeMessage(member, VERIFY_CHANNEL_ID);
    const sent = await channel.send(message).catch(err => {
      console.warn(`Testnachricht konnte nicht gesendet werden: ${err.message}`);
      return null;
    });

    if (!sent) {
      return interaction.editReply('Die Willkommensnachricht konnte nicht gesendet werden (siehe Konsole für Details).');
    }

    return interaction.editReply(`✅ Willkommensnachricht für **${member.user.username}** wurde in <#${WELCOME_CHANNEL_ID}> gesendet. (Testlauf – nichts gespeichert)`);
  }

  // ==================== /purge ====================
  if (commandName === 'purge') {
    const memberPermissions = interaction.member?.permissions;
    if (!memberPermissions || !memberPermissions.has(PermissionFlagsBits.ManageMessages)) {
      return interaction.reply({
        content: 'Du hast keine Berechtigung dafür.',
        flags: MessageFlags.Ephemeral
      });
    }

    const amount = interaction.options.getInteger('amount');
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
      const fetched = await interaction.channel.messages.fetch({ limit: amount });
      const twoWeeksMs = 14 * 24 * 60 * 60 * 1000;
      const deletable = fetched.filter(msg => Date.now() - msg.createdTimestamp < twoWeeksMs);

      if (deletable.size === 0) {
        return interaction.editReply('No messages younger than 14 days were found to delete (Discord only allows bulk-deleting recent messages).');
      }

      let deletedCount;
      if (deletable.size === 1) {
        await deletable.first().delete();
        deletedCount = 1;
      } else {
        await interaction.channel.bulkDelete(deletable);
        deletedCount = deletable.size;
      }

      await interaction.editReply(`Successfully deleted ${deletedCount} messages.`);

      setTimeout(() => {
        interaction.deleteReply().catch(() => {});
      }, 5000);
    } catch (err) {
      console.warn(`Purge fehlgeschlagen im Channel ${interaction.channelId}:`, err.message);
      await interaction.editReply('Something went wrong while deleting messages. Note: messages older than 14 days cannot be bulk deleted, and the bot needs the "Manage Messages" permission in this channel.');
    }
  }

  // ==================== /giveaway ====================
  if (commandName === 'giveaway') {
    const sub = interaction.options.getSubcommand();
    const giveaway = require('./giveaway');

    try {
      if (sub === 'start') {
        await giveaway.start(interaction, client);
      } else if (sub === 'end') {
        await giveaway.end(interaction, client);
      } else if (sub === 'reroll') {
        await giveaway.reroll(interaction, client);
      } else if (sub === 'list') {
        await giveaway.list(interaction, client);
      }
    } catch (err) {
      console.error('Giveaway error:', err);
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({ content: 'An error occurred with the giveaway.', flags: MessageFlags.Ephemeral }).catch(() => {});
      } else {
        await interaction.editReply({ content: 'An error occurred with the giveaway.' }).catch(() => {});
      }
    }
  }

  // ==================== /reactionroles ====================
  if (commandName === 'reactionroles') {
    const targetChannel = interaction.options.getChannel('channel') || interaction.channel;
    const configuredRoles = getConfiguredRoles();
    const missing = configuredRoles.filter(r => !r.roleId);

    if (missing.length > 0) {
      return interaction.reply({
        content: `Missing role ID(s) in .env for: ${missing.map(r => r.label).join(', ')}`,
        flags: MessageFlags.Ephemeral
      });
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const embed = buildReactionRolesEmbed();
    const message = await targetChannel.send({ embeds: [embed] }).catch(() => null);

    if (!message) {
      return interaction.editReply(`Could not send message in <#${targetChannel.id}>. Check permissions.`);
    }

    const roles = {};
    for (const { emoji, roleId } of configuredRoles) {
      roles[emoji] = roleId;
    }
    storage.saveReactionRoleMessage(message.id, {
      channelId: targetChannel.id,
      guildId: interaction.guildId,
      roles
    });

    for (const { emoji } of configuredRoles) {
      await message.react(emoji).catch(err =>
        console.warn(`Konnte Emoji ${emoji} nicht hinzufügen:`, err.message)
      );
    }

    return interaction.editReply(`✅ Reaction-roles message posted in <#${targetChannel.id}>.`);
  }
});

client.login(DISCORD_TOKEN);

// ===== RENDER: HTTP Server für Health Checks =====
const http = require('http');
const PORT = process.env.PORT || 3000;

const server = http.createServer((req, res) => {
  res.writeHead(200);
  res.end('Bot is running!');
});

server.listen(PORT, () => {
  console.log(`[HTTP] Health check server running on port ${PORT}`);
});