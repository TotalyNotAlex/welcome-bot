const { EmbedBuilder } = require('discord.js');

// Dunkle Tiefsee-Farbpalette
const ABYSS_COLOR = 0x0a1a2f; // fast schwarzes Tiefseeblau
const ABYSS_ACCENT = 0x2fd0c4; // leuchtendes Türkis, wie Biolumineszenz

// Ein paar wechselnde epische Intro-Zeilen (Englisch), damit es sich nicht
// wie ein Standard-Bot anfühlt
const INTROS = [
  'From the endless deep, a new shadow rises...',
  'The current has washed a new throne-seeker ashore...',
  'Something vast has stirred from the Abyss...',
  'The waves whisper a new name...',
  'A new ruler steps into the waters of the Emperors...'
];

function pickIntro() {
  return INTROS[Math.floor(Math.random() * INTROS.length)];
}

/**
 * Baut die Willkommensnachricht für ein neues Mitglied (Englisch).
 * @param {import('discord.js').GuildMember} member
 * @param {string} verifyChannelId
 * @returns {{ content: string, embeds: EmbedBuilder[] }}
 */
function buildWelcomeMessage(member, verifyChannelId) {
  const guildName = member.guild.name;
  const memberCount = member.guild.memberCount;
  const intro = pickIntro();

  const embed = new EmbedBuilder()
    .setColor(ABYSS_COLOR)
    .setAuthor({
      name: `${guildName}`,
      iconURL: member.guild.iconURL({ size: 128 }) || undefined
    })
    .setTitle('🌊 A New Emperor Rises From the Deep')
    .setDescription(
      `${intro}\n\n` +
      `Welcome, **${member.user.username}**, to the dark waters of **${guildName}**.\n` +
      `You are ruler **#${memberCount}** of this realm.\n\n` +
      `But before you can claim your throne and explore the rest of the depths ` +
      `this server holds, you must prove your origin.\n\n` +
      `⚓ **Head over to <#${verifyChannelId}>**\n` +
      `⚔️ Use \`/verify\` there (or \`/quickverify\` for the fast route)\n` +
      `👑 Once verified, you'll receive the **Verified** role and full access ` +
      `to the entire realm of the Abyssal Emperors\n\n` +
      `*The deep does not wait forever. Don't linger too long...*`
    )
    .setThumbnail(member.user.displayAvatarURL({ size: 256 }))
    .setFooter({ text: 'The Abyssal Emperors — Rulers of the Deep' })
    .setTimestamp();

  return {
    content: `<@${member.id}>, the deep has been waiting for you.`,
    embeds: [embed]
  };
}

/**
 * Baut die Erinnerungsnachricht auf Englisch (per DM oder Channel-Fallback).
 * @param {import('discord.js').GuildMember} member
 * @param {string} verifyChannelId
 * @param {boolean} isChannelFallback - true wenn im Channel statt per DM gesendet
 */
function buildReminderMessage(member, verifyChannelId, isChannelFallback = false) {
  const embed = new EmbedBuilder()
    .setColor(ABYSS_ACCENT)
    .setTitle('🔱 The Deep Calls Again')
    .setDescription(
      `Hey **${member.user.username}**, you're still drifting unverified in the ` +
      `outer waters of **${member.guild.name}**.\n\n` +
      `Verify now in <#${verifyChannelId}> using \`/verify\` or \`/quickverify\` ` +
      `to gain full access to the realm.\n\n` +
      `*Without verification, the deeper halls of the Emperors remain closed to you.*`
    )
    .setFooter({ text: 'The Abyssal Emperors' })
    .setTimestamp();

  return {
    content: isChannelFallback ? `<@${member.id}>` : undefined,
    embeds: [embed]
  };
}

module.exports = { buildWelcomeMessage, buildReminderMessage };
