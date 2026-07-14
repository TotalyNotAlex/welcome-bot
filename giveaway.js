const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const storage = require('./storage');

const GIVEAWAY_COLOR = 0xffd700;
const ENDED_COLOR = 0x555555;

function parseDuration(input) {
  const match = /^(\d+)\s*(s|m|h|d)$/i.exec(String(input).trim());
  if (!match) return null;
  const value = parseInt(match[1], 10);
  const unit = match[2].toLowerCase();
  const multipliers = { s: 1000, m: 60 * 1000, h: 60 * 60 * 1000, d: 24 * 60 * 60 * 1000 };
  return value * multipliers[unit];
}

function buildGiveawayEmbed(giveaway) {
  const endsAtSeconds = Math.floor(giveaway.endsAt / 1000);
  return new EmbedBuilder()
    .setTitle('🎉 GIVEAWAY 🎉')
    .setDescription(`**${giveaway.prize}**\n\nReact with 🎉 to enter!\n\nEnds: <t:${endsAtSeconds}:R>`)
    .addFields(
      { name: 'Winners', value: `${giveaway.winnersCount}`, inline: true },
      { name: 'Entries', value: `${giveaway.participants.length}`, inline: true },
      { name: 'Hosted by', value: `<@${giveaway.hostId}>`, inline: true }
    )
    .setColor(GIVEAWAY_COLOR)
    .setFooter({ text: `${giveaway.winnersCount} winner(s)` });
}

function buildEndedGiveawayEmbed(giveaway) {
  const winnerText = giveaway.winners?.length ? giveaway.winners.map(id => `<@${id}>`).join(', ') : 'No valid entries';
  return new EmbedBuilder()
    .setTitle('🎉 GIVEAWAY ENDED 🎉')
    .setDescription(`**${giveaway.prize}**\n\nWinner(s): ${winnerText}`)
    .addFields(
      { name: 'Winners', value: `${giveaway.winnersCount}`, inline: true },
      { name: 'Entries', value: `${giveaway.participants.length}`, inline: true },
      { name: 'Hosted by', value: `<@${giveaway.hostId}>`, inline: true }
    )
    .setColor(ENDED_COLOR);
}

function buildGiveawayButtonRow(messageId, disabled = false) {
  const button = new ButtonBuilder()
    .setCustomId(`giveaway_enter_${messageId}`)
    .setLabel(disabled ? 'Giveaway Ended' : '🎉 Enter')
    .setStyle(disabled ? ButtonStyle.Secondary : ButtonStyle.Success)
    .setDisabled(disabled);
  return new ActionRowBuilder().addComponents(button);
}

function pickWinners(participants, count) {
  const pool = [...participants];
  const winners = [];
  const winnerCount = Math.min(count, pool.length);
  for (let i = 0; i < winnerCount; i++) {
    const index = Math.floor(Math.random() * pool.length);
    winners.push(pool[index]);
    pool.splice(index, 1);
  }
  return winners;
}

async function start(interaction, client) {
  const prize = interaction.options.getString('prize');
  const durationStr = interaction.options.getString('duration');
  const winnersCount = interaction.options.getInteger('winners') || 1;
  const channel = interaction.options.getChannel('channel') || interaction.channel;

  const durationMs = parseDuration(durationStr);
  if (!durationMs) {
    return interaction.reply({ content: 'Invalid duration format. Use: 1m, 1h, 1d, 7d', ephemeral: true });
  }

  await interaction.deferReply({ ephemeral: true });

  const endsAt = Date.now() + durationMs;
  const giveawayData = {
    prize,
    channelId: channel.id,
    guildId: interaction.guildId,
    hostId: interaction.user.id,
    winnersCount,
    endsAt,
    participants: [],
    ended: false,
    winners: []
  };

  const embed = buildGiveawayEmbed({ ...giveawayData, participants: [] });
  const row = buildGiveawayButtonRow('temp', false);

  const message = await channel.send({ embeds: [embed], components: [row] });

  const fullGiveawayData = { ...giveawayData, messageId: message.id };
  storage.createGiveaway(message.id, fullGiveawayData);

  const updatedEmbed = buildGiveawayEmbed(fullGiveawayData);
  const updatedRow = buildGiveawayButtonRow(message.id, false);
  await message.edit({ embeds: [updatedEmbed], components: [updatedRow] });

  await interaction.editReply(`Giveaway started in ${channel}!`);

  setTimeout(() => endGiveaway(message.id, client), durationMs);
}

async function endGiveaway(messageId, client) {
  const giveaway = storage.getGiveaway(messageId);
  if (!giveaway || giveaway.ended) return;

  const winners = pickWinners(giveaway.participants, giveaway.winnersCount);
  storage.updateGiveaway(messageId, { ended: true, winners });

  const channel = await client.channels.fetch(giveaway.channelId).catch(() => null);
  if (!channel) return;

  const message = await channel.messages.fetch(messageId).catch(() => null);
  if (!message) return;

  const embed = buildEndedGiveawayEmbed(storage.getGiveaway(messageId));
  const row = buildGiveawayButtonRow(messageId, true);

  await message.edit({ embeds: [embed], components: [row] });

  if (winners.length > 0) {
    const winnerMentions = winners.map(id => `<@${id}>`).join(', ');
    await channel.send(`🎉 Congratulations ${winnerMentions}! You won **${giveaway.prize}**!`).catch(() => {});
    
    for (const winnerId of winners) {
      const user = await client.users.fetch(winnerId).catch(() => null);
      if (user) {
        await user.send(`🎉 Congratulations! You won **${giveaway.prize}** in ${channel.guild.name}!`).catch(() => {});
      }
    }
  }
}

async function end(interaction, client) {
  const messageId = interaction.options.getString('message_id');
  await interaction.deferReply({ ephemeral: true });

  const giveaway = storage.getGiveaway(messageId);
  if (!giveaway) {
    return interaction.editReply('Giveaway not found.');
  }
  if (giveaway.ended) {
    return interaction.editReply('This giveaway has already ended.');
  }

  await endGiveaway(messageId, client);
  await interaction.editReply('Giveaway ended early.');
}

async function reroll(interaction, client) {
  const messageId = interaction.options.getString('message_id');
  const newWinnersCount = interaction.options.getInteger('winners');

  await interaction.deferReply({ ephemeral: true });

  const giveaway = storage.getGiveaway(messageId);
  if (!giveaway) {
    return interaction.editReply('Giveaway not found.');
  }

  const count = newWinnersCount || giveaway.winnersCount;
  const winners = pickWinners(giveaway.participants, count);
  storage.updateGiveaway(messageId, { winners });

  const channel = await client.channels.fetch(giveaway.channelId).catch(() => null);
  if (channel) {
    const winnerMentions = winners.length > 0 ? winners.map(id => `<@${id}>`).join(', ') : 'No valid entries';
    await channel.send(`🎉 Reroll! New winner(s): ${winnerMentions} for **${giveaway.prize}**!`).catch(() => {});
  }

  await interaction.editReply(`Rerolled! New winner(s): ${winners.map(id => `<@${id}>`).join(', ') || 'None'}`);
}

async function list(interaction) {
  const giveaways = storage.getActiveGiveaways(interaction.guildId);
  
  if (giveaways.length === 0) {
    return interaction.reply({ content: 'No active giveaways on this server.', ephemeral: true });
  }

  const embed = new EmbedBuilder()
    .setTitle('🎉 Active Giveaways')
    .setColor(GIVEAWAY_COLOR);

  for (const g of giveaways.slice(0, 10)) {
    const endsAtSeconds = Math.floor(g.endsAt / 1000);
    embed.addFields({
      name: g.prize,
      value: `Ends: <t:${endsAtSeconds}:R> | [Jump to message](https://discord.com/channels/${g.guildId}/${g.channelId}/${g.messageId})`
    });
  }

  await interaction.reply({ embeds: [embed], ephemeral: true });
}

async function recoverGiveaways(client) {
  const all = storage.getAllGiveaways();
  const now = Date.now();
  let resumed = 0;
  let endedOverdue = 0;

  for (const [messageId, giveaway] of Object.entries(all)) {
    if (giveaway.ended) continue;

    const remaining = giveaway.endsAt - now;

    if (remaining <= 0) {
      console.log(`[Giveaway] Ending overdue giveaway: ${giveaway.prize} (${messageId})`);
      await endGiveaway(messageId, client).catch(err => 
        console.error(`[Giveaway] Failed to end overdue giveaway ${messageId}:`, err)
      );
      endedOverdue++;
    } else {
      console.log(`[Giveaway] Resuming: ${giveaway.prize}, ends in ${Math.floor(remaining / 1000)}s`);
      setTimeout(() => endGiveaway(messageId, client), remaining);
      resumed++;
    }
  }

  if (resumed > 0 || endedOverdue > 0) {
    console.log(`[Giveaway] Recovery complete: ${resumed} resumed, ${endedOverdue} ended overdue`);
  }
}

module.exports = { 
  start, 
  end, 
  reroll, 
  list, 
  recoverGiveaways,
  buildGiveawayEmbed,
  buildGiveawayButtonRow
};