const { SlashCommandBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');

module.exports = [
  new SlashCommandBuilder()
    .setName('testwelcome')
    .setDescription('Sendet die Willkommensnachricht testweise erneut (nur für Admins/Mods)')
    .addUserOption(option =>
      option
        .setName('user')
        .setDescription('Für wen die Testnachricht gebaut werden soll (Standard: du selbst)')
        .setRequired(false)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .toJSON(),

  new SlashCommandBuilder()
    .setName('purge')
    .setDescription('Delete a number of messages in this channel')
    .addIntegerOption(option =>
      option
        .setName('amount')
        .setDescription('Number of messages to delete (1-100)')
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(100)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .toJSON(),

  new SlashCommandBuilder()
    .setName('giveaway')
    .setDescription('Manage server giveaways')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand(sub =>
      sub
        .setName('start')
        .setDescription('Start a new giveaway')
        .addStringOption(option =>
          option.setName('prize').setDescription('What are you giving away?').setRequired(true)
        )
        .addStringOption(option =>
          option
            .setName('duration')
            .setDescription('How long should it run? e.g. 1m, 1h, 1d, 7d')
            .setRequired(true)
        )
        .addIntegerOption(option =>
          option
            .setName('winners')
            .setDescription('Number of winners (default: 1)')
            .setRequired(false)
            .setMinValue(1)
            .setMaxValue(50)
        )
        .addChannelOption(option =>
          option
            .setName('channel')
            .setDescription('Channel to post the giveaway in (default: this channel)')
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
            .setRequired(false)
        )
    )
    .addSubcommand(sub =>
      sub
        .setName('reroll')
        .setDescription('Pick new winner(s) for an already ended giveaway')
        .addStringOption(option =>
          option.setName('message_id').setDescription('The giveaway message ID').setRequired(true)
        )
        .addIntegerOption(option =>
          option
            .setName('winners')
            .setDescription('New number of winners (default: same as before)')
            .setRequired(false)
            .setMinValue(1)
            .setMaxValue(50)
        )
    )
    .addSubcommand(sub =>
      sub
        .setName('end')
        .setDescription('End a giveaway immediately')
        .addStringOption(option =>
          option.setName('message_id').setDescription('The giveaway message ID').setRequired(true)
        )
    )
    .addSubcommand(sub => sub.setName('list').setDescription('List all active giveaways on this server'))
    .toJSON(),

  new SlashCommandBuilder()
    .setName('reactionroles')
    .setDescription('Post the language reaction-roles message')
    .addChannelOption(option =>
      option
        .setName('channel')
        .setDescription('Channel to post the message in (default: this channel)')
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
        .setRequired(false)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .toJSON(),

  // ===== TICKET SYSTEM COMMAND =====
  new SlashCommandBuilder()
    .setName('ticketsetup')
    .setDescription('Post the ticket creation panel in this channel')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .toJSON(),

  // ===== SLOWMODE COMMANDS =====
  new SlashCommandBuilder()
    .setName('slowmode')
    .setDescription('Enable slowmode in a channel')
    .addIntegerOption(option =>
      option
        .setName('duration')
        .setDescription('How long slowmode stays active, in seconds (0 = until manually disabled)')
        .setRequired(true)
        .setMinValue(0)
        .setMaxValue(21600)
    )
    .addIntegerOption(option =>
      option
        .setName('cooldown')
        .setDescription('Seconds users must wait between messages (1-21600)')
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(21600)
    )
    .addChannelOption(option =>
      option
        .setName('channel')
        .setDescription('Channel to apply slowmode to (default: this channel)')
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
        .setRequired(false)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .toJSON(),

  new SlashCommandBuilder()
    .setName('unslowmode')
    .setDescription('Disable slowmode in a channel')
    .addChannelOption(option =>
      option
        .setName('channel')
        .setDescription('Channel to remove slowmode from (default: this channel)')
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
        .setRequired(false)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .toJSON()
];