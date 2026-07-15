const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } = require('discord.js');

const TICKET_COLOR = 0x2fd0c4;
const TICKET_CLOSED_COLOR = 0xed4245;

function formatTicketName(number) {
  return `ticket-${String(number).padStart(4, '0')}`;
}

function buildTicketPanelEmbed() {
  return new EmbedBuilder()
    .setTitle('🎫 Support Tickets')
    .setDescription('Click the button below to create a private ticket channel with our team.')
    .setColor(TICKET_COLOR);
}

function buildCreateTicketButtonRow() {
  const button = new ButtonBuilder()
    .setCustomId('ticket_create')
    .setLabel('🎫 Create Ticket')
    .setStyle(ButtonStyle.Primary);

  return new ActionRowBuilder().addComponents(button);
}

function buildTicketWelcomeEmbed(userId, ticketNumber) {
  return new EmbedBuilder()
    .setTitle(`🎫 Ticket #${String(ticketNumber).padStart(4, '0')}`)
    .setDescription(
      `Welcome <@${userId}>! Please select a reason for this ticket below, ` +
      `and our team will assist you shortly.`
    )
    .setColor(TICKET_COLOR)
    .setTimestamp();
}

// Updated embed after reason is selected
function buildTicketUpdatedEmbed(userId, ticketNumber, reason) {
  const reasonEmojis = {
    'bounty-update-request': '💰',
    'bad-member-behavior-report': '😡',
    'suggestions': '🤔',
    'Application': '💼'
  };

  const emoji = reasonEmojis[reason] || '📋';

  return new EmbedBuilder()
    .setTitle(`🎫 Ticket #${String(ticketNumber).padStart(4, '0')}`)
    .setDescription(
      `Welcome <@${userId}>! Our team will assist you shortly.`
    )
    .addFields(
      { name: '👤 Created by', value: `<@${userId}>`, inline: true },
      { name: `${emoji} Reason`, value: `\`${reason}\``, inline: true },
      { name: '\u200B', value: '\u200B', inline: true },
      { name: '📊 Status', value: '\`⏳ Open - Awaiting response\`', inline: true },
      { name: '🕐 Created at', value: `<t:${Math.floor(Date.now() / 1000)}:R>`, inline: true }
    )
    .setColor(TICKET_COLOR)
    .setTimestamp();
}

function buildReasonSelectRow() {
  const select = new StringSelectMenuBuilder()
    .setCustomId('ticket_reason_select')
    .setPlaceholder('Select a reason for this ticket')
    .addOptions(
      { label: 'bounty-update-request', value: 'bounty-update-request', emoji: '💰' },
      { label: 'bad-member-behavior-report', value: 'bad-member-behavior-report', emoji: '😡' },
      { label: 'suggestions', value: 'suggestions', emoji: '🤔' },
      { label: 'Application', value: 'Application', emoji: '💼' }
    );

  return new ActionRowBuilder().addComponents(select);
}

function buildCloseButtonRow() {
  const button = new ButtonBuilder()
    .setCustomId('ticket_close')
    .setLabel('🔒 Close Ticket')
    .setStyle(ButtonStyle.Danger);

  return new ActionRowBuilder().addComponents(button);
}

module.exports = {
  formatTicketName,
  buildTicketPanelEmbed,
  buildCreateTicketButtonRow,
  buildTicketWelcomeEmbed,
  buildTicketUpdatedEmbed,
  buildReasonSelectRow,
  buildCloseButtonRow
};