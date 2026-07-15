const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } = require('discord.js');

const TICKET_COLOR = 0x2fd0c4;

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
    .setColor(TICKET_COLOR);
}

function buildReasonSelectRow() {
  const select = new StringSelectMenuBuilder()
    .setCustomId('ticket_reason_select')
    .setPlaceholder('Select a reason for this ticket')
    .addOptions(
      { label: 'Support', value: 'Support', emoji: '🆘' },
      { label: 'Report', value: 'Report', emoji: '📝' },
      { label: 'Question', value: 'Question', emoji: '❓' },
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
  buildReasonSelectRow,
  buildCloseButtonRow
};
