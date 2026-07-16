const { SlashCommandBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');

module.exports = [
  new SlashCommandBuilder()
    .setName('testwelcome')
    .setDescription('Sendet die Willkommensnachricht testweise erneut (nur fuer Staff)')
    .addUserOption(option =>
      option
        .setName('user')
        .setDescription('Fuer wen die Testnachricht gebaut werden soll (Standard: du selbst)')
        .setRequired(false)
    )
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
    .toJSON(),

  new SlashCommandBuilder()
    .setName('giveaway')
    .setDescription('Manage server giveaways')
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
    .toJSON(),

  new SlashCommandBuilder()
    .setName('ticketsetup')
    .setDescription('Post the ticket creation panel in this channel')
    .toJSON(),

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
    .toJSON(),

  new SlashCommandBuilder()
    .setName('mute')
    .setDescription('Mute a member for a set duration or permanently')
    .addUserOption(option =>
      option
        .setName('user')
        .setDescription('The member to mute')
        .setRequired(true)
    )
    .addStringOption(option =>
      option
        .setName('duration')
        .setDescription('How long the mute should last')
        .setRequired(true)
        .addChoices(
          { name: '60 seconds', value: '60s' },
          { name: '5 minutes', value: '5m' },
          { name: '10 minutes', value: '10m' },
          { name: '20 minutes', value: '20m' },
          { name: '30 minutes', value: '30m' },
          { name: '40 minutes', value: '40m' },
          { name: '50 minutes', value: '50m' },
          { name: '1 hour', value: '1h' },
          { name: '2 hours', value: '2h' },
          { name: '3 hours', value: '3h' },
          { name: '6 hours', value: '6h' },
          { name: '12 hours', value: '12h' },
          { name: '24 hours', value: '24h' },
          { name: '1 day', value: '1d' },
          { name: '2 days', value: '2d' },
          { name: '7 days', value: '7d' },
          { name: 'Forever', value: 'forever' }
        )
    )
    .addStringOption(option =>
      option
        .setName('reason')
        .setDescription('Reason for the mute')
        .setRequired(false)
    )
    .toJSON(),

  new SlashCommandBuilder()
    .setName('unmute')
    .setDescription('Remove an active mute from a member')
    .addUserOption(option =>
      option
        .setName('user')
        .setDescription('The member to unmute')
        .setRequired(true)
    )
    .addStringOption(option =>
      option
        .setName('reason')
        .setDescription('Reason for the unmute')
        .setRequired(false)
    )
    .toJSON(),

  new SlashCommandBuilder()
    .setName('warn')
    .setDescription('Warn a member')
    .addUserOption(option =>
      option
        .setName('user')
        .setDescription('The member to warn')
        .setRequired(true)
    )
    .addStringOption(option =>
      option
        .setName('reason')
        .setDescription('Reason for the warning')
        .setRequired(true)
    )
    .toJSON(),

  new SlashCommandBuilder()
    .setName('warnings')
    .setDescription('View all warnings for a member')
    .addUserOption(option =>
      option
        .setName('user')
        .setDescription('The member to check')
        .setRequired(true)
    )
    .toJSON(),

  new SlashCommandBuilder()
    .setName('clearwarns')
    .setDescription('Clear all warnings for a member')
    .addUserOption(option =>
      option
        .setName('user')
        .setDescription('The member to clear warnings for')
        .setRequired(true)
    )
    .addStringOption(option =>
      option
        .setName('reason')
        .setDescription('Reason for clearing')
        .setRequired(false)
    )
    .toJSON(),

  new SlashCommandBuilder()
    .setName('poll')
    .setDescription('Create a poll with up to 5 options')
    .addStringOption(option =>
      option
        .setName('question')
        .setDescription('The poll question')
        .setRequired(true)
    )
    .addStringOption(option =>
      option
        .setName('option1')
        .setDescription('First option')
        .setRequired(true)
    )
    .addStringOption(option =>
      option
        .setName('option2')
        .setDescription('Second option')
        .setRequired(true)
    )
    .addStringOption(option =>
      option
        .setName('option3')
        .setDescription('Third option')
        .setRequired(false)
    )
    .addStringOption(option =>
      option
        .setName('option4')
        .setDescription('Fourth option')
        .setRequired(false)
    )
    .addStringOption(option =>
      option
        .setName('option5')
        .setDescription('Fifth option')
        .setRequired(false)
    )
    .toJSON(),

  new SlashCommandBuilder()
    .setName('embed')
    .setDescription('Create a custom embed message')
    .addChannelOption(option =>
      option
        .setName('channel')
        .setDescription('Channel to post the embed in')
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
        .setRequired(true)
    )
    .addStringOption(option =>
      option
        .setName('title')
        .setDescription('Embed title')
        .setRequired(true)
    )
    .addStringOption(option =>
      option
        .setName('description')
        .setDescription('Embed description')
        .setRequired(true)
    )
    .addStringOption(option =>
      option
        .setName('color')
        .setDescription('Hex color (e.g. #ff0000)')
        .setRequired(false)
    )
    .addStringOption(option =>
      option
        .setName('footer')
        .setDescription('Footer text')
        .setRequired(false)
    )
    .addStringOption(option =>
      option
        .setName('thumbnail')
        .setDescription('Thumbnail URL')
        .setRequired(false)
    )
    .addStringOption(option =>
      option
        .setName('image')
        .setDescription('Image URL')
        .setRequired(false)
    )
    .addStringOption(option =>
      option
        .setName('ping')
        .setDescription('Ping role (@everyone, @here, or role ID)')
        .setRequired(false)
    )
    .addStringOption(option =>
      option
        .setName('field1_name')
        .setDescription('Field 1 name')
        .setRequired(false)
    )
    .addStringOption(option =>
      option
        .setName('field1_value')
        .setDescription('Field 1 value')
        .setRequired(false)
    )
    .addStringOption(option =>
      option
        .setName('field2_name')
        .setDescription('Field 2 name')
        .setRequired(false)
    )
    .addStringOption(option =>
      option
        .setName('field2_value')
        .setDescription('Field 2 value')
        .setRequired(false)
    )
    .addStringOption(option =>
      option
        .setName('field3_name')
        .setDescription('Field 3 name')
        .setRequired(false)
    )
    .addStringOption(option =>
      option
        .setName('field3_value')
        .setDescription('Field 3 value')
        .setRequired(false)
    )
    .toJSON(),

  // ===== EMBEDCODE COMMAND (unlimited fields) =====
  new SlashCommandBuilder()
    .setName('embedcode')
    .setDescription('Create an embed from raw JSON code (unlimited fields)')
    .addStringOption(option =>
      option
        .setName('json')
        .setDescription('Paste your embed JSON here')
        .setRequired(true)
    )
    .toJSON()
];