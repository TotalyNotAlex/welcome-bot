require('dotenv').config();
const connectDB = require('./db');
connectDB();
const { Client, GatewayIntentBits, PermissionFlagsBits, MessageFlags, Partials, ChannelType, EmbedBuilder } = require('discord.js');
const storage = require('./storage');
const { buildWelcomeMessage, buildReminderMessage } = require('./welcome-message');
const { getConfiguredRoles, buildReactionRolesEmbed } = require('./reactionroles');
const { parseDuration, applyMute, removeMute, isMuted, recoverMutes } = require('./mute-system');
const { warn, getWarnings, clearWarnings, createPoll, createCustomEmbed, sendEmbedWithPing } = require('./warn-system');

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
  TICKET_CATEGORY_ID,
  MOD_LOG_CHANNEL_ID
} = process.env;

const STAFF_ROLE_IDS = [
  '1524181401493180718',
  '1524181401493180717',
  '1524181401484918991',
  '1526995353528963282'
];

const MEMBER_ROLE_ID = '1524181401442975750';

const GIVEAWAY_HOST_ROLE_ID = '1526662161386967210';

// ═══════════════════════════════════════════════════════
// FIXED: Async isStaff with fresh member fetch
// ═══════════════════════════════════════════════════════
async function isStaff(member) {
  if (!member || !member.guild) return false;
  try {
    const freshMember = await member.guild.members.fetch(member.id);
    return STAFF_ROLE_IDS.some(roleId => freshMember.roles.cache.has(roleId));
  } catch {
    // Fallback to cached roles if fetch fails
    return STAFF_ROLE_IDS.some(roleId => member.roles?.cache.has(roleId));
  }
}

function isMember(member) {
  if (!member || !member.roles) return false;
  return member.roles.cache.has(MEMBER_ROLE_ID);
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

const reminderMs = (Number(REMINDER_MINUTES) || 10) * 60 * 1000;
const dmEnabled = REMINDER_DM_ENABLED !== 'false';
const channelFallbackEnabled = REMINDER_CHANNEL_FALLBACK !== 'false';

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.MessageContent
  ],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction, Partials.User]
});

const activeReminderTimers = new Map();

// ═══════════════════════════════════════════════════════
// AFK System — In-Memory Storage
// ═══════════════════════════════════════════════════════
const afkUsers = new Map();
// Map<userId, { reason: string, since: timestamp }>

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
  const status = await storage.getReminderStatus(member.id);
  if (!status) {
    await storage.setJoinedAt(member.id, new Date().toISOString());
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

  const emojiName = reaction.emoji?.name || reaction.emoji?.toString();
  if (!emojiName) {
    console.warn('Reaction-Role: Kein Emoji-Name gefunden');
    return;
  }

  const data = await storage.getReactionRoleMessage(reaction.message.id);
  if (!data) return;

  const roleId = data.roles?.[emojiName];
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

  const activeSlowmodes = await storage.cleanupExpiredSlowmodeTimers();
  const now = Date.now();
  for (const [channelId, timer] of Object.entries(activeSlowmodes)) {
    const remaining = timer.endAt - now;
    if (remaining > 0) {
      setTimeout(async () => {
        const channel = await client.channels.fetch(channelId).catch(() => null);
        if (channel) {
          await channel.setRateLimitPerUser(0, 'Slowmode duration expired').catch(() => null);
        }
        await storage.removeSlowmodeTimer(channelId);
      }, remaining);
      console.log(`[Slowmode] Recovered timer for channel ${channelId}, ${Math.round(remaining/1000)}s remaining`);
    }
  }

  await recoverMutes(client, MOD_LOG_CHANNEL_ID);
  console.log('[Mute] Recovery completed.');

  const giveaway = require('./giveaway');
  await giveaway.recoverGiveaways(client);

  if (!GUILD_ID) return;
  const guild = await client.guilds.fetch(GUILD_ID).catch(() => null);
  if (!guild) {
    console.warn('GUILD_ID nicht gefunden, Recovery-Scan wird uebersprungen.');
    return;
  }

  const pending = await storage.getAllPendingReminders();
  if (pending.length === 0) return;

  console.log(`Stelle ${pending.length} offene Erinnerung(en) nach Neustart wieder her...`);
  for (const entry of pending) {
    const member = await guild.members.fetch(entry.userId).catch(() => null);
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
  if (!await storage.hasBeenGreeted(member.id)) {
    await sendWelcomeMessage(member);
    await storage.markGreeted(member.id);
  }
  await handleNewOrExistingUnverifiedMember(member, true);
});

client.on('guildMemberRemove', async member => {
  const LEAVE_LOG_CHANNEL_ID = process.env.LEAVE_LOG_CHANNEL_ID;
  if (!LEAVE_LOG_CHANNEL_ID) return;
  const channel = await client.channels.fetch(LEAVE_LOG_CHANNEL_ID).catch(() => null);
  if (!channel) return;

  const joinedAt = member.joinedAt 
    ? `<t:${Math.floor(member.joinedAt.getTime() / 1000)}:R>` 
    : 'Unknown';

  const roles = member.roles.cache
    .filter(r => r.id !== member.guild.id)
    .map(r => r.name)
    .join(', ') || 'None';

  const embed = new EmbedBuilder()
    .setAuthor({ 
      name: 'The Abyssal Emperors', 
      iconURL: member.guild.iconURL({ dynamic: true }) 
    })
    .setTitle('🌊 A Soul Returns to the Void')
    .setDescription(
      `**${member.user.tag}** has faded into the deep waters...\n\n` +
      `Once ruler of these depths, their presence now lingers only in memory.\n` +
      `The abyss grows quieter without them.`
    )
    .addFields(
      { name: '👤 User', value: `${member.user.tag} (<@${member.id}>)`, inline: true },
      { name: '📅 Joined', value: joinedAt, inline: true },
      { name: '🏷️ Roles Held', value: roles.length > 100 ? roles.substring(0, 100) + '...' : roles, inline: false }
    )
    .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
    .setImage('https://media.discordapp.net/attachments/placeholder/abyss_leave_banner.png')
    .setColor(0x2c3e50)
    .setFooter({ 
      text: `The Abyssal Emperors — Rulers of the Deep • Member #${member.guild.memberCount}`, 
      iconURL: member.guild.iconURL({ dynamic: true }) 
    })
    .setTimestamp();

  await channel.send({ embeds: [embed] }).catch(err => 
    console.warn('Konnte Leave-Log nicht senden:', err.message)
  );
});

client.on('messageReactionAdd', (reaction, user) => handleReactionRoleChange(reaction, user, 'add'));
client.on('messageReactionRemove', (reaction, user) => handleReactionRoleChange(reaction, user, 'remove'));

// ═══════════════════════════════════════════════════════
// AFK: Auto-remove when user sends a message + Welcome Back Reaction
// ═══════════════════════════════════════════════════════
client.on('messageCreate', async message => {
  if (message.author.bot) return;
  if (!message.guild) return;

  // Check if user was AFK and remove status
  if (afkUsers.has(message.author.id)) {
    const afkData = afkUsers.get(message.author.id);
    afkUsers.delete(message.author.id);
    console.log(`[AFK] ${message.author.tag} is back — AFK removed`);

    // Welcome back reaction 👋
    try {
      await message.react('👋');
    } catch (err) {
      console.warn(`[AFK] Could not react to welcome back message: ${err.message}`);
    }
  }

  // Check if message mentions any AFK users
  if (message.mentions.members.size > 0) {
    for (const [memberId, mentionedMember] of message.mentions.members) {
      if (afkUsers.has(memberId)) {
        const afkData = afkUsers.get(memberId);
        const afkEmbed = new EmbedBuilder()
          .setDescription(
            `💤 **${mentionedMember.displayName} is currently AFK**\n\n` +
            `📝 **Reason:** ${afkData.reason}\n` +
            `⏰ **Since:** <t:${Math.floor(afkData.since / 1000)}:R>\n\n` +
            `> *He'll reply once he's back — try again later!*`
          )
          .setColor(10070709)
          .setFooter({
            text: `AFK Status • Auto-removed when ${mentionedMember.displayName} sends a message`
          });

        await message.reply({ embeds: [afkEmbed], allowedMentions: { repliedUser: false } }).catch(() => {});
      }
    }
  }
});

client.on('interactionCreate', async interaction => {
  if (interaction.isButton()) {
    if (interaction.customId.startsWith('giveaway_enter_')) {
      const messageId = interaction.customId.replace('giveaway_enter_', '');
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const giveaway = await storage.getGiveaway(messageId);
      if (!giveaway) {
        return interaction.editReply({ content: 'This giveaway no longer exists.' });
      }
      if (giveaway.ended) {
        return interaction.editReply({ content: 'This giveaway has already ended.' });
      }
      if (giveaway.participants.includes(interaction.user.id)) {
        return interaction.editReply({ content: 'You have already entered this giveaway!' });
      }
      await storage.addParticipant(messageId, interaction.user.id);
      const updatedGiveaway = await storage.getGiveaway(messageId);
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
      if (await storage.hasOpenTicket(interaction.user.id)) {
        return interaction.editReply({ content: 'You already have an open ticket.' }).catch(() => null);
      }
      const ticketNumber = await storage.getNextTicketNumber();
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
      await storage.createTicket(ticketChannel.id, {
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
      const ticket = await storage.getTicket(interaction.channelId);
      if (!ticket) {
        return interaction.reply({ content: 'This channel is not a ticket.', flags: MessageFlags.Ephemeral });
      }
      await storage.updateTicket(interaction.channelId, { closed: true });
      await interaction.reply('🔒 This ticket will be deleted in 5 seconds...');
      setTimeout(async () => {
        const channel = await client.channels.fetch(interaction.channelId).catch(() => null);
        if (channel) await channel.delete().catch(() => null);
        await storage.deleteTicket(interaction.channelId);
      }, 5000);
      return;
    }
    return;
  }

  if (interaction.isStringSelectMenu() && interaction.customId === 'ticket_reason_select') {
    const ticket = await storage.getTicket(interaction.channelId);
    if (!ticket) {
      return interaction.reply({ content: 'This channel is not a ticket.', flags: MessageFlags.Ephemeral });
    }
    const reason = interaction.values[0];
    await storage.updateTicket(interaction.channelId, { reason });
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

  const staffCommands = ['testwelcome', 'purge', 'reactionroles', 'ticketsetup', 'slowmode', 'unslowmode', 'mute', 'unmute', 'warn', 'warnings', 'clearwarns', 'poll', 'embed', 'embedcode'];

  // ═══════════════════════════════════════════════════════
  // FIXED: Async staff check with fresh member fetch
  // ═══════════════════════════════════════════════════════
  if (staffCommands.includes(interaction.commandName)) {
    const staffCheck = await isStaff(interaction.member);
    if (!staffCheck) {
      return await denyAccess(interaction);
    }
  }

  // Giveaway: Staff OR Giveaway Host
  if (interaction.commandName === 'giveaway') {
    const staffCheck = await isStaff(interaction.member);
    if (!staffCheck && !interaction.member.roles.cache.has(GIVEAWAY_HOST_ROLE_ID)) {
      return await denyAccess(interaction);
    }
  }

  // AFK: Member role required
  if (interaction.commandName === 'afk') {
    if (!isMember(interaction.member)) {
      return interaction.reply({
        content: '❌ You need the Member role to use this command.',
        flags: MessageFlags.Ephemeral
      });
    }
  }

  const { commandName } = interaction;

  // ═══════════════════════════════════════════════════════
  // /afk Command
  // ═══════════════════════════════════════════════════════
  if (commandName === 'afk') {
    const reason = interaction.options.getString('reason') || 'AFK';
    afkUsers.set(interaction.user.id, {
      reason: reason,
      since: Date.now()
    });
    console.log(`[AFK] ${interaction.user.tag} set AFK: ${reason}`);
    return interaction.reply({
      content: `💤 **You are now AFK:** ${reason}\n> I'll let others know when they ping you!`,
      flags: MessageFlags.Ephemeral
    });
  }

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
    await storage.saveReactionRoleMessage(message.id, {
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
    const existingTimer = await storage.getSlowmodeTimer(targetChannel.id);
    if (existingTimer) {
      await storage.removeSlowmodeTimer(targetChannel.id);
    }
    if (duration > 0) {
      await storage.saveSlowmodeTimer(targetChannel.id, cooldown, duration, interaction.guildId);
      setTimeout(async () => {
        await targetChannel.setRateLimitPerUser(0, 'Slowmode duration expired').catch(() => null);
        await storage.removeSlowmodeTimer(targetChannel.id);
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
    const existingTimer = await storage.getSlowmodeTimer(targetChannel.id);
    if (existingTimer) {
      await storage.removeSlowmodeTimer(targetChannel.id);
    }
    const applied = await targetChannel.setRateLimitPerUser(0, `Slowmode removed by ${interaction.user.tag}`).catch(() => null);
    if (!applied) {
      return interaction.editReply({
        content: `Could not remove slowmode in <#${targetChannel.id}>. Check that I have "Manage Channel" permission there.`
      });
    }
    return interaction.editReply({ content: `✅ Slowmode removed in <#${targetChannel.id}>.` });
  }

  if (commandName === 'mute') {
    const targetUser = interaction.options.getUser('user');
    const durationInput = interaction.options.getString('duration');
    const reason = interaction.options.getString('reason');

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const member = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
    if (!member) {
      return interaction.editReply('That user could not be found on this server.');
    }

    if (member.id === interaction.user.id) {
      return interaction.editReply('You cannot mute yourself.');
    }

    if (member.permissions.has(PermissionFlagsBits.ManageMessages)) {
      return interaction.editReply('You cannot mute a member who has the "Manage Messages" permission.');
    }

    if (!member.moderatable) {
      return interaction.editReply('I cannot mute this member. My role might be positioned below theirs, or they might be the server owner.');
    }

    if (isMuted(member)) {
      return interaction.editReply(`${targetUser.tag} is already muted.`);
    }

    const durationMs = parseDuration(durationInput);
    if (durationMs === null) {
      return interaction.editReply('Invalid duration format. Use something like `60s`, `5m`, `1h`, `1d`, `7d`, or `forever`.');
    }

    try {
      const result = await applyMute(member, interaction.user, durationMs, reason, MOD_LOG_CHANNEL_ID);
      const durationText = durationMs === 'forever' ? 'permanently' : `for **${durationInput}**`;
      const roleNote = result.type === 'role'
        ? " (applied via the Muted role, since this exceeds Discord's 28-day timeout limit or is permanent)"
        : '';

      return interaction.editReply(
        `🔇 ${targetUser.tag} has been muted ${durationText}${reason ? ` for: ${reason}` : ''}.${roleNote}`
      );
    } catch (err) {
      console.warn(`Mute fehlgeschlagen fuer ${targetUser.tag}:`, err.message);
      return interaction.editReply('Something went wrong while muting this member. Check my permissions.');
    }
  }

  if (commandName === 'unmute') {
    const targetUser = interaction.options.getUser('user');
    const reason = interaction.options.getString('reason');

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const member = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
    if (!member) {
      return interaction.editReply('That user could not be found on this server.');
    }

    if (!isMuted(member)) {
      return interaction.editReply(`${targetUser.tag} is not currently muted.`);
    }

    try {
      await removeMute(member, interaction.user, reason, MOD_LOG_CHANNEL_ID);
      return interaction.editReply(`🔊 ${targetUser.tag} has been unmuted${reason ? ` (${reason})` : ''}.`);
    } catch (err) {
      console.warn(`Unmute fehlgeschlagen fuer ${targetUser.tag}:`, err.message);
      return interaction.editReply('Something went wrong while unmuting this member. Check my permissions.');
    }
  }

  if (commandName === 'warn') {
    const targetUser = interaction.options.getUser('user');
    const reason = interaction.options.getString('reason');

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const member = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
    if (!member) {
      return interaction.editReply('That user could not be found on this server.');
    }

    if (member.id === interaction.user.id) {
      return interaction.editReply('You cannot warn yourself.');
    }

    if (member.permissions.has(PermissionFlagsBits.ManageMessages)) {
      return interaction.editReply('You cannot warn a member who has the "Manage Messages" permission.');
    }

    try {
      const result = await warn(member, interaction.user, reason, MOD_LOG_CHANNEL_ID);
      let reply = `⚠️ ${targetUser.tag} has been warned (Warn #${result.warnCount})`;
      if (result.timeoutResult) {
        reply += `\n🔇 Auto-timeout applied: **${result.timeoutResult.text}**`;
      }
      if (reason) {
        reply += `\nReason: ${reason}`;
      }
      return interaction.editReply(reply);
    } catch (err) {
      console.warn(`Warn fehlgeschlagen fuer ${targetUser.tag}:`, err.message);
      return interaction.editReply('Something went wrong while warning this member.');
    }
  }

  if (commandName === 'warnings') {
    const targetUser = interaction.options.getUser('user');

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const member = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
    if (!member) {
      return interaction.editReply('That user could not be found on this server.');
    }

    const warnings = await getWarnings(member);
    if (warnings.length === 0) {
      return interaction.editReply(`✅ ${targetUser.tag} has no warnings.`);
    }

    const embed = new EmbedBuilder()
      .setTitle(`⚠️ Warnings for ${targetUser.tag}`)
      .setColor(0xffaa00)
      .setFooter({ text: `Total: ${warnings.length} warning(s)` })
      .setTimestamp();

    warnings.forEach(w => {
      const date = new Date(w.timestamp).toLocaleDateString('de-DE');
      embed.addFields({
        name: `#${w.id} — ${date}`,
        value: `**Reason:** ${w.reason}\n**By:** <@${w.moderatorId}>`,
        inline: false
      });
    });

    return interaction.editReply({ embeds: [embed] });
  }

  if (commandName === 'clearwarns') {
    const targetUser = interaction.options.getUser('user');
    const reason = interaction.options.getString('reason');

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const member = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
    if (!member) {
      return interaction.editReply('That user could not be found on this server.');
    }

    const count = await clearWarnings(member, interaction.user, reason, MOD_LOG_CHANNEL_ID);
    if (count === 0) {
      return interaction.editReply(`${targetUser.tag} has no warnings to clear.`);
    }

    return interaction.editReply(`🗑️ Cleared **${count}** warning(s) for ${targetUser.tag}${reason ? ` (${reason})` : ''}.`);
  }

  if (commandName === 'poll') {
    const question = interaction.options.getString('question');
    const options = [
      interaction.options.getString('option1'),
      interaction.options.getString('option2'),
      interaction.options.getString('option3'),
      interaction.options.getString('option4'),
      interaction.options.getString('option5')
    ];

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
      await createPoll(interaction, question, options);
      return interaction.editReply('✅ Poll created successfully!');
    } catch (err) {
      console.warn('Poll creation failed:', err.message);
      return interaction.editReply('Something went wrong while creating the poll.');
    }
  }

  if (commandName === 'embed') {
    const targetChannel = interaction.options.getChannel('channel');
    const title = interaction.options.getString('title');
    const description = interaction.options.getString('description');
    const color = interaction.options.getString('color');
    const footer = interaction.options.getString('footer');
    const thumbnail = interaction.options.getString('thumbnail');
    const image = interaction.options.getString('image');
    const ping = interaction.options.getString('ping');

    const fields = [];
    for (let i = 1; i <= 3; i++) {
      const name = interaction.options.getString(`field${i}_name`);
      const value = interaction.options.getString(`field${i}_value`);
      if (name && value) {
        fields.push({ name, value, inline: true });
      }
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
      const embed = new EmbedBuilder()
        .setTitle(title)
        .setDescription(description)
        .setColor(color ? parseInt(color.replace('#', ''), 16) || 0x5865F2 : 0x5865F2)
        .setTimestamp();

      if (footer) embed.setFooter({ text: footer });
      if (thumbnail) embed.setThumbnail(thumbnail);
      if (image) embed.setImage(image);
      if (fields.length > 0) embed.addFields(fields);

      if (ping) {
        const pingMsg = await targetChannel.send({ content: ping }).catch(() => null);
        if (pingMsg) {
          setTimeout(() => pingMsg.delete().catch(() => {}), 1000);
        }
      }

      await targetChannel.send({ embeds: [embed] });
      return interaction.editReply(`✅ Embed posted in <#${targetChannel.id}>.`);
    } catch (err) {
      console.warn('Embed creation failed:', err.message);
      return interaction.editReply('Something went wrong while creating the embed. Check my permissions.');
    }
  }

  // ═══════════════════════════════════════════════════════
  // /embedcode Handler — JSON Embed Builder
  // ═══════════════════════════════════════════════════════
  if (commandName === 'embedcode') {
    const jsonInput = interaction.options.getString('json');
    const targetChannel = interaction.options.getChannel('channel') || interaction.channel;

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
      const embedData = JSON.parse(jsonInput);

      if (!embedData.title && !embedData.description) {
        return interaction.editReply({
          content: '❌ Your JSON must contain at least a `title` or `description` field.'
        });
      }

      const embed = new EmbedBuilder(embedData);

      await targetChannel.send({ embeds: [embed] });
      return interaction.editReply(`✅ Embed posted in <#${targetChannel.id}>.`);
    } catch (err) {
      return interaction.editReply({
        content: `❌ Invalid JSON or Embed data: ${err.message}`
      });
    }
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