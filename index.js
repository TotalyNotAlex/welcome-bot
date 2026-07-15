require('dotenv').config();
const { Client, GatewayIntentBits, PermissionFlagsBits, MessageFlags, Partials, ChannelType } = require('discord.js');
const storage = require('./storage');
const { buildWelcomeMessage, buildReminderMessage } = require('./welcome-message');
const { getConfiguredRoles, buildReactionRolesEmbed } = require('./reactionroles');

// ===== TICKET SYSTEM IMPORTS =====
const {
  formatTicketName,
  buildTicketPanelEmbed,
  buildCreateTicketButtonRow,
  buildTicketWelcomeEmbed,
  buildTicketUpdatedEmbed,
  buildReasonSelectRow,
  buildCloseButtonRow
} = require('./tickets');

const {
  DISCORD_TOKEN,
  GUILD_ID,
  WELCOME_CHANNEL_ID,
  VERIFY_CHANNEL_ID,
  VERIFIED_ROLE_ID,
  UNVERIFIED_ROLE_ID,
  REMINDER_MINUTES,
  REMINDER_DM_ENABLED,
  REMINDER_CHANNEL_FALLBACK,
  SUPPORT_ROLE_ID,
  TICKET_CATEGORY_ID
} = process.env;

// ===== STAFF ROLE IDs =====
// HIER DEINE 4 ROLLEN-IDs EINTRAGEN!
const STAFF_ROLE_IDS = [
  '1524181401493180718',      // ⛧Captain⛧
  '1524181401493180717',  // 🩸ViceCaptains🩸
  '1524181401484918991',        // Admin
  '1526995353528963282'           // Mod
];

function isStaff(member) {
  if (!member || !member.roles) return false;
  return STAFF_ROLE_IDS.some(roleId => member.roles.cache.has(roleId));
}

async function denyAccess(interaction) {
  const reply = {
    content: '❌ Only Staff members (Captain, ViceCaptain, Admin, Mod) can use this command.',
    flags: MessageFlags.Ephemeral
  };
  if (interaction.deferred || interaction.replied) {
    await interaction.editReply(reply).catch(() => {});
  } else {
    await interaction.reply(reply).catch(() => {});
  }
}
// ===========================

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
    console.warn('Welcome-Channel nicht gefunden. Pruefe WELCOME_CHANNEL_ID in der .env.');
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

  const activeSlowmodes = storage.cleanupExpiredSlowmodeTimers();
  const now = Date.now();
  for (const [channelId, timer] of Object.entries(activeSlowmodes)) {
    const remaining = timer.endAt - now;
    if (remaining > 0) {
      setTimeout(async () => {
        const channel = await client.channels.fetch(channelId).catch(() => null);
        if (channel) {
          await channel.setRateLimitPerUser(0, 'Slowmode duration expired').catch(() => null);
        }
        storage.removeSlowmodeTimer(channelId);
      }, remaining);
      console.log(`[Slowmode] Recovered timer for channel ${channelId}, ${Math.round(remaining/1000)}s remaining`);
    }
  }

  const giveaway = require('./giveaway');
  await giveaway.recoverGiveaways(client);

  if (!GUILD_ID) return;
  const guild = await client.guilds.fetch(GUILD_ID).catch(() => null);
  if (!guild) {
    console.warn('GUILD_ID nicht gefunden, Recovery-Scan wird uebersprungen.');
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

    if (interaction.customId === 'ticket_create') {
      await interaction.reply({ content: '🎫 Creating your ticket...', flags: MessageFlags.Ephemeral }).catch(() => null);
      if (storage.hasOpenTicket(interaction.user.id)) {
        return interaction.editReply({ content: 'You already have an open ticket.' }).catch(() => null);
      }
      const ticketNumber = storage.getNextTicketNumber();
      const channelName = formatTicketName(ticketNumber);
      const overwrites = [
        { id: interaction.guild.id, deny: [PermissionFlagsBits.ViewChannel] },
        {
          id: interaction.user.id,
          allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory]
        },
        {
          id: client.user.id,
          allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels]
        }
      ];
      if (SUPPORT_ROLE_ID) {
        overwrites.push({
          id: SUPPORT_ROLE_ID,
          allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory]
        });
      }
      const channelOptions = {
        name: channelName,
        type: ChannelType.GuildText,
        permissionOverwrites: overwrites
      };
      if (TICKET_CATEGORY_ID) {
        channelOptions.parent = TICKET_CATEGORY_ID;
      }
      const ticketChannel = await interaction.guild.channels.create(channelOptions).catch(() => null);
      if (!ticketChannel) {
        return interaction.editReply({
          content: 'Could not create the ticket channel. Check my "Manage Channels" permission and that the Category ID is valid (or remove TICKET_CATEGORY_ID from .env to create without category).'
        }).catch(() => null);
      }
      storage.createTicket(ticketChannel.id, {
        userId: interaction.user.id,
        guildId: interaction.guildId,
        ticketNumber,
        reason: null,
        closed: false,
        createdAt: new Date().toISOString()
      });
      const welcomeEmbed = buildTicketWelcomeEmbed(interaction.user.id, ticketNumber);
      const reasonRow = buildReasonSelectRow();
      const closeRow = buildCloseButtonRow();
      await ticketChannel.send({ content: `<@${interaction.user.id}>`, embeds: [welcomeEmbed], components: [reasonRow, closeRow] }).catch(() => null);
      if (SUPPORT_ROLE_ID) {
        await ticketChannel.send(`<@&${SUPPORT_ROLE_ID}> A new ticket has been created!`).catch(() => null);
      }
      return interaction.editReply({ content: `Your ticket has been created: <#${ticketChannel.id}>` }).catch(() => null);
    }

    if (interaction.customId === 'ticket_close') {
      const ticket = storage.getTicket(interaction.channelId);
      if (!ticket) {
        return interaction.reply({ content: 'This channel is not a ticket.', flags: MessageFlags.Ephemeral });
      }
      storage.updateTicket(interaction.channelId, { closed: true });
      await interaction.reply('🔒 This ticket will be deleted in 5 seconds...');
      setTimeout(async () => {
        const channel = await client.channels.fetch(interaction.channelId).catch(() => null);
        if (channel) await channel.delete().catch(() => null);
        storage.deleteTicket(interaction.channelId);
      }, 5000);
      return;
    }
    return;
  }

  if (interaction.isStringSelectMenu() && interaction.customId === 'ticket_reason_select') {
    const ticket = storage.getTicket(interaction.channelId);
    if (!ticket) {
      return interaction.reply({ content: 'This channel is not a ticket.', flags: MessageFlags.Ephemeral });
    }
    const reason = interaction.values[0];
    storage.updateTicket(interaction.channelId, { reason });
    try {
      const messages = await interaction.channel.messages.fetch({ limit: 10 });
      const botMessage = messages.find(m =>
        m.author.id === client.user.id &&
        m.embeds.length > 0 &&
        m.embeds[0].title &&
        m.embeds[0].title.includes('Ticket #')
      );
      if (botMessage) {
        const updatedEmbed = buildTicketUpdatedEmbed(ticket.userId, ticket.ticketNumber, reason);
        await botMessage.edit({
          content: `<@${ticket.userId}>`,
          embeds: [updatedEmbed],
          components: [buildCloseButtonRow()]
        });
      }
    } catch (err) {
      console.warn('[Ticket] Could not update welcome message:', err.message);
    }
    return interaction.reply({
      content: `✅ Reason set to: **${reason}**`,
      flags: MessageFlags.Ephemeral
    });
  }

  if (!interaction.isChatInputCommand()) return;

  // ===== STAFF CHECK FOR ALL COMMANDS =====
  const staffCommands = ['testwelcome', 'purge', 'giveaway', 'reactionroles', 'ticketsetup', 'slowmode', 'unslowmode'];
  if (staffCommands.includes(interaction.commandName)) {
    if (!isStaff(interaction.member)) {
      return await denyAccess(interaction);
    }
  }
  // ========================================

  const { commandName } = interaction;

  if (commandName === 'testwelcome') {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const targetUser = interaction.options.getUser('user') || interaction.user;
    const member = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
    if (!member) {
      return interaction.editReply('Dieses Mitglied konnte auf diesem Server nicht gefunden werden.');
    }
    const channel = await client.channels.fetch(WELCOME_CHANNEL_ID).catch(() => null);
    if (!channel) {
      return interaction.editReply('Welcome-Channel wurde nicht gefunden. Pruefe WELCOME_CHANNEL_ID in der .env.');
    }
    const message = buildWelcomeMessage(member, VERIFY_CHANNEL_ID);
    const sent = await channel.send(message).catch(err => {
      console.warn(`Testnachricht konnte nicht gesendet werden: ${err.message}`);
      return null;
    });
    if (!sent) {
      return interaction.editReply('Die Willkommensnachricht konnte nicht gesendet werden (siehe Konsole fuer Details).');
    }
    return interaction.editReply(`✅ Willkommensnachricht fuer **${member.user.username}** wurde in <#${WELCOME_CHANNEL_ID}> gesendet. (Testlauf – nichts gespeichert)`);
  }

  if (commandName === 'purge') {
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
        console.warn(`Konnte Emoji ${emoji} nicht hinzufuegen:`, err.message)
      );
    }
    return interaction.editReply(`✅ Reaction-roles message posted in <#${targetChannel.id}>.`);
  }

  if (commandName === 'ticketsetup') {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const embed = buildTicketPanelEmbed();
    const row = buildCreateTicketButtonRow();
    const sent = await interaction.channel.send({ embeds: [embed], components: [row] }).catch(() => null);
    if (!sent) {
      return interaction.editReply({ content: 'Could not post the ticket panel here. Check my permissions.' });
    }
    return interaction.editReply({ content: 'Ticket panel posted.' });
  }

  if (commandName === 'slowmode') {
    const duration = interaction.options.getInteger('duration');
    const cooldown = interaction.options.getInteger('cooldown');
    const targetChannel = interaction.options.getChannel('channel') || interaction.channel;
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const applied = await targetChannel.setRateLimitPerUser(cooldown, `Slowmode set by ${interaction.user.tag}`).catch(() => null);
    if (!applied) {
      return interaction.editReply({
        content: `Could not set slowmode in <#${targetChannel.id}>. Check that I have "Manage Channel" permission there.`
      });
    }
    const existingTimer = storage.getSlowmodeTimer(targetChannel.id);
    if (existingTimer) {
      storage.removeSlowmodeTimer(targetChannel.id);
    }
    if (duration > 0) {
      storage.saveSlowmodeTimer(targetChannel.id, cooldown, duration, interaction.guildId);
      setTimeout(async () => {
        await targetChannel.setRateLimitPerUser(0, 'Slowmode duration expired').catch(() => null);
        storage.removeSlowmodeTimer(targetChannel.id);
      }, duration * 1000);
    }
    return interaction.editReply({
      content:
        `🐌 Slowmode set to **${cooldown}s** in <#${targetChannel.id}>` +
        (duration > 0 ? ` for the next **${duration}s**.` : ` (no automatic end - use /unslowmode to remove it).`)
    });
  }

  if (commandName === 'unslowmode') {
    const targetChannel = interaction.options.getChannel('channel') || interaction.channel;
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const existingTimer = storage.getSlowmodeTimer(targetChannel.id);
    if (existingTimer) {
      storage.removeSlowmodeTimer(targetChannel.id);
    }
    const applied = await targetChannel.setRateLimitPerUser(0, `Slowmode removed by ${interaction.user.tag}`).catch(() => null);
    if (!applied) {
      return interaction.editReply({
        content: `Could not remove slowmode in <#${targetChannel.id}>. Check that I have "Manage Channel" permission there.`
      });
    }
    return interaction.editReply({ content: `✅ Slowmode removed in <#${targetChannel.id}>.` });
  }
});

client.login(DISCORD_TOKEN);

const http = require('http');
const PORT = process.env.PORT || 3000;
const server = http.createServer((req, res) => {
  res.writeHead(200);
  res.end('Bot is running!');
});
server.listen(PORT, () => {
  console.log(`[HTTP] Health check server running on port ${PORT}`);
});