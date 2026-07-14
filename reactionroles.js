const { EmbedBuilder } = require('discord.js');

const REACTION_ROLES_COLOR = 0x2fd0c4;

const ROLE_DEFINITIONS = [
  // Sprachrollen
  { emoji: '🇫🇷', label: 'French', envVar: 'ROLE_FRENCH_ID', category: 'language' },
  { emoji: '🇬🇧', label: 'English', envVar: 'ROLE_ENGLISH_ID', category: 'language' },
  { emoji: '🇵🇹', label: 'Portuguese', envVar: 'ROLE_PORTUGUESE_ID', category: 'language' },
  { emoji: '🇪🇸', label: 'Spanish', envVar: 'ROLE_SPANISH_ID', category: 'language' },
  { emoji: '🇩🇪', label: 'German', envVar: 'ROLE_GERMAN_ID', category: 'language' },
  { emoji: '🇰🇷', label: 'Korean', envVar: 'ROLE_KOREAN_ID', category: 'language' },
  // Giveaway Rollen
  { emoji: '🎁', label: 'Giveaway Hoster', envVar: 'ROLE_GIVEAWAY_HOSTER_ID', category: 'giveaway' },
  { emoji: '🔔', label: 'Giveaway Ping', envVar: 'ROLE_GIVEAWAY_PING_ID', category: 'giveaway' }
];

function getConfiguredRoles() {
  return ROLE_DEFINITIONS.map(def => ({
    ...def,
    roleId: process.env[def.envVar] || null
  }));
}

function buildReactionRolesEmbed() {
  const roles = getConfiguredRoles();
  const languageRoles = roles.filter(r => r.category === 'language');
  const giveawayRoles = roles.filter(r => r.category === 'giveaway');

  const languageLines = languageRoles.map(
    r => `${r.emoji} — ${r.label}${r.roleId ? ` (<@&${r.roleId}>)` : ' *(not configured)*'}`
  );

  const giveawayLines = giveawayRoles.map(
    r => `${r.emoji} — ${r.label}${r.roleId ? ` (<@&${r.roleId}>)` : ' *(not configured)*'}`
  );

  return new EmbedBuilder()
    .setTitle('🌐 Choose Your Roles')
    .setDescription(
      `**Language Roles**\n` +
      `React with the flag(s) below to get the matching language role. React again to remove it.\n\n` +
      `${languageLines.join('\n')}\n\n` +
      `**Giveaway Roles**\n` +
      `🎁 — **Giveaway Hoster** — Want to host giveaways? Get this role!\n` +
      `🔔 — **Giveaway Ping** — Get notified when a new giveaway starts!\n\n` +
      `${giveawayLines.join('\n')}`
    )
    .setColor(REACTION_ROLES_COLOR)
    .setFooter({ text: 'The Abyssal Emperors — Choose Your Roles' })
    .setTimestamp();
}

module.exports = { getConfiguredRoles, buildReactionRolesEmbed, ROLE_DEFINITIONS };