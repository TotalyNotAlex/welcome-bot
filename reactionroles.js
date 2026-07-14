const { EmbedBuilder } = require('discord.js');

const REACTION_ROLES_COLOR = 0x2fd0c4;

const ROLE_DEFINITIONS = [
  { emoji: '🇫🇷', label: 'French', envVar: 'ROLE_FRENCH_ID' },
  { emoji: '🇬🇧', label: 'English', envVar: 'ROLE_ENGLISH_ID' },
  { emoji: '🇵🇹', label: 'Portuguese', envVar: 'ROLE_PORTUGUESE_ID' },
  { emoji: '🇪🇸', label: 'Spanish', envVar: 'ROLE_SPANISH_ID' },
  { emoji: '🇩🇪', label: 'German', envVar: 'ROLE_GERMAN_ID' },
  { emoji: '🇰🇷', label: 'Korean', envVar: 'ROLE_KOREAN_ID' }
];

function getConfiguredRoles() {
  return ROLE_DEFINITIONS.map(def => ({
    ...def,
    roleId: process.env[def.envVar] || null
  }));
}

function buildReactionRolesEmbed() {
  const roles = getConfiguredRoles();
  const lines = roles.map(
    r => `${r.emoji} — ${r.label}${r.roleId ? ` (<@&${r.roleId}>)` : ' *(not configured)*'}`
  );

  return new EmbedBuilder()
    .setTitle('🌐 Choose Your Language Roles')
    .setDescription(
      `React with the flag(s) below to get the matching language role.\n` +
      `React again to remove it.\n\n${lines.join('\n')}`
    )
    .setColor(REACTION_ROLES_COLOR)
    .setFooter({ text: 'The Abyssal Emperors — Language Roles' })
    .setTimestamp();
}

module.exports = { getConfiguredRoles, buildReactionRolesEmbed, ROLE_DEFINITIONS };