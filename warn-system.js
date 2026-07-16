const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { Warn, Poll } = require('./models');

const ESCALATION = {
  3: { ms: 10 * 60 * 1000, text: '10 minutes' },
  5: { ms: 30 * 60 * 1000, text: '30 minutes' },
  7: { ms: 60 * 60 * 1000, text: '1 hour' },
  10: { ms: 2 * 60 * 60 * 1000, text: '2 hours' },
  15: { ms: 6 * 60 * 60 * 1000, text: '6 hours' },
  20: { ms: 12 * 60 * 60 * 1000, text: '12 hours' }
};

function getTimeoutForWarnCount(count) {
  const thresholds = Object.keys(ESCALATION).map(Number).sort((a, b) => b - a);
  for (const t of thresholds) {
    if (count >= t) return ESCALATION[t];
  }
  return null;
}

async function logModAction(guild, action, user, moderator, reason, extra, modLogChannelId) {
  if (!modLogChannelId) return;
  const channel = await guild.channels.fetch(modLogChannelId).catch(() => null);
  if (!channel) return;

  const titles = {
    warn: '⚠️ Member Warned',
    clearwarns: '🗑️ Warnings Cleared',
    autotimeout: '🔇 Auto-Timeout Applied',
    unmute: '🔊 Member Unmuted'
  };
  const colors = {
    warn: 0xffaa00,
    clearwarns: 0x55aaff,
    autotimeout: 0xff5555,
    unmute: 0x55ff88
  };

  const embed = new EmbedBuilder()
    .setTitle(titles[action] || 'Mod Action')
    .addFields(
      { name: 'User', value: `<@${user.id}> (${user.tag})`, inline: true },
      { name: 'Moderator', value: `<@${moderator.id}>`, inline: true }
    )
    .setColor(colors[action] || 0x5865f2)
    .setTimestamp();

  if (extra) embed.addFields({ name: 'Details', value: extra, inline: true });
  if (reason) embed.addFields({ name: 'Reason', value: reason });

  await channel.send({ embeds: [embed] }).catch(err =>
    console.warn('Konnte Mod-Log nicht senden:', err.message)
  );
}

// ==================== WARN SYSTEM ====================

async function warn(member, moderator, reason, modLogChannelId) {
  const guildId = member.guild.id;
  const userId = member.id;

  let doc = await Warn.findOne({ guildId, userId });
  if (!doc) doc = new Warn({ guildId, userId, warnings: [] });

  const warnId = doc.warnings.length + 1;
  doc.warnings.push({
    id: warnId,
    moderatorId: moderator.id,
    reason: reason || 'No reason provided',
    timestamp: new Date()
  });
  await doc.save();

  const warnCount = doc.warnings.length;
  const escalation = getTimeoutForWarnCount(warnCount);

  let timeoutResult = null;
  if (escalation && !member.permissions.has(PermissionFlagsBits.ManageMessages)) {
    try {
      await member.timeout(escalation.ms, `Auto-timeout: ${warnCount} warnings`);
      timeoutResult = escalation;
      await member.send(
        `🔇 You have been timed out for **${escalation.text}** because you reached **${warnCount}** warnings.\n` +
        `Reason: ${reason || 'No reason provided'}`
      ).catch(() => {});
      await logModAction(member.guild, 'autotimeout', member.user, moderator, reason, `Warn #${warnCount} → ${escalation.text}`, modLogChannelId);
    } catch (err) {
      console.warn('Auto-timeout failed:', err.message);
    }
  }

  await logModAction(member.guild, 'warn', member.user, moderator, reason, `Warn #${warnCount}${timeoutResult ? ` (Auto-timeout: ${timeoutResult.text})` : ''}`, modLogChannelId);

  return { warnId, warnCount, timeoutResult };
}

async function getWarnings(member) {
  const doc = await Warn.findOne({ guildId: member.guild.id, userId: member.id }).lean();
  return doc ? doc.warnings : [];
}

async function clearWarnings(member, moderator, reason, modLogChannelId) {
  const guildId = member.guild.id;
  const userId = member.id;

  const doc = await Warn.findOne({ guildId, userId }).lean();
  const count = doc ? doc.warnings.length : 0;
  if (count === 0) return 0;

  await Warn.deleteOne({ guildId, userId });

  if (member.isCommunicationDisabled?.()) {
    await member.timeout(null, 'Warnings cleared').catch(() => {});
  }

  const { getMuteData, loadMutes, saveMutes } = require('./mute-system');
  const muteData = getMuteData();
  if (muteData.mutedRoleId && member.roles.cache.has(muteData.mutedRoleId)) {
    await member.roles.remove(muteData.mutedRoleId, 'Warnings cleared').catch(() => {});
  }

  const mutesData = loadMutes();
  const muteKey = `${guildId}_${userId}`;
  if (mutesData.mutes?.[muteKey]) {
    delete mutesData.mutes[muteKey];
    saveMutes(mutesData);
  }

  await logModAction(member.guild, 'clearwarns', member.user, moderator, reason, `${count} warning(s) cleared`, modLogChannelId);
  return count;
}

// ==================== POLL SYSTEM ====================

const NUMBER_EMOJIS = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣'];

async function createPoll(interaction, question, options) {
  const validOptions = options.filter(o => o);
  if (validOptions.length < 2) throw new Error('At least 2 options required');

  const embed = new EmbedBuilder()
    .setTitle('📊 Poll')
    .setDescription(`**${question}**`)
    .setColor(0x5865F2)
    .setFooter({ text: `Poll by ${interaction.user.tag} • Click a reaction to vote` })
    .setTimestamp();

  validOptions.forEach((opt, i) => {
    embed.addFields({ name: `${NUMBER_EMOJIS[i]} Option ${i + 1}`, value: opt, inline: false });
  });

  const message = await interaction.channel.send({ embeds: [embed] });
  for (let i = 0; i < validOptions.length; i++) {
    await message.react(NUMBER_EMOJIS[i]).catch(() => {});
  }

  await Poll.create({
    messageId: message.id,
    question,
    options: validOptions,
    creatorId: interaction.user.id
  });

  return message;
}

// ==================== EMBED SYSTEM ====================

function parseColor(colorInput) {
  if (!colorInput) return 0x5865F2;
  const hex = colorInput.replace('#', '');
  if (!/^[0-9A-Fa-f]{6}$/.test(hex)) return 0x5865F2;
  return parseInt(hex, 16);
}

async function createCustomEmbed(channel, title, description, color, footer, thumbnailUrl, imageUrl, fields) {
  const embed = new EmbedBuilder()
    .setTitle(title)
    .setDescription(description)
    .setColor(parseColor(color))
    .setTimestamp();

  if (footer) embed.setFooter({ text: footer });
  if (thumbnailUrl) embed.setThumbnail(thumbnailUrl);
  if (imageUrl) embed.setImage(imageUrl);

  if (fields?.length > 0) {
    fields.forEach(f => {
      if (f.name && f.value) {
        embed.addFields({ name: f.name, value: f.value, inline: f.inline || false });
      }
    });
  }

  return await channel.send({ embeds: [embed] });
}

async function sendEmbedWithPing(channel, pingRole, embed) {
  if (pingRole) {
    const pingMsg = await channel.send({ content: pingRole }).catch(() => null);
    if (pingMsg) setTimeout(() => pingMsg.delete().catch(() => {}), 1000);
  }
  return await channel.send({ embeds: [embed] });
}

module.exports = {
  warn,
  getWarnings,
  clearWarnings,
  createPoll,
  createCustomEmbed,
  sendEmbedWithPing,
  logModAction
};