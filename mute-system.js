const fs = require('fs');
const path = require('path');
const { EmbedBuilder } = require('discord.js');

const MUTES_FILE = path.join(__dirname, 'mutes.json');
const MUTED_ROLE_NAME = 'Muted';
const MAX_TIMEOUT_MS = 28 * 24 * 60 * 60 * 1000;

// --------------------------------------------------------------------------
// Storage
// --------------------------------------------------------------------------

function loadMutes() {
  if (!fs.existsSync(MUTES_FILE)) return { mutedRoleId: null, mutes: {} };
  try {
    const parsed = JSON.parse(fs.readFileSync(MUTES_FILE, 'utf8'));
    if (!parsed.mutes) parsed.mutes = {};
    return parsed;
  } catch {
    return { mutedRoleId: null, mutes: {} };
  }
}

function saveMutes(data) {
  fs.writeFileSync(MUTES_FILE, JSON.stringify(data, null, 2), 'utf8');
}

function getMuteData() {
  return loadMutes();
}

function muteKey(guildId, userId) {
  return `${guildId}_${userId}`;
}

// --------------------------------------------------------------------------
// Duration Parsing
// --------------------------------------------------------------------------

function parseDuration(input) {
  if (!input) return null;
  const normalized = String(input).trim().toLowerCase();

  if (normalized === 'forever') return 'forever';

  const match = /^(\d+)\s*(s|m|h|d)$/.exec(normalized);
  if (!match) return null;

  const value = parseInt(match[1], 10);
  const unit = match[2];
  const multipliers = { s: 1000, m: 60 * 1000, h: 60 * 60 * 1000, d: 24 * 60 * 60 * 1000 };

  return value * multipliers[unit];
}

// --------------------------------------------------------------------------
// Muted-Rolle
// --------------------------------------------------------------------------

async function getOrCreateMutedRole(guild) {
  const data = loadMutes();

  if (data.mutedRoleId) {
    const existing =
      guild.roles.cache.get(data.mutedRoleId) || (await guild.roles.fetch(data.mutedRoleId).catch(() => null));
    if (existing) return existing;
  }

  let role = guild.roles.cache.find(r => r.name === MUTED_ROLE_NAME);

  if (!role) {
    role = await guild.roles.create({
      name: MUTED_ROLE_NAME,
      color: 0x5c5c5c,
      permissions: [],
      reason: 'Auto-created Muted role for the mute system'
    });

    for (const channel of guild.channels.cache.values()) {
      try {
        if (channel.isVoiceBased?.()) {
          await channel.permissionOverwrites.edit(role, {
            Speak: false,
            Stream: false
          });
        } else if (channel.isTextBased?.()) {
          await channel.permissionOverwrites.edit(role, {
            SendMessages: false,
            AddReactions: false,
            SendMessagesInThreads: false,
            CreatePublicThreads: false,
            CreatePrivateThreads: false
          });
        }
      } catch (err) {
        console.warn(`Konnte Muted-Rolle-Overwrite fuer Channel ${channel.id} nicht setzen:`, err.message);
      }
    }
  }

  data.mutedRoleId = role.id;
  saveMutes(data);

  return role;
}

// --------------------------------------------------------------------------
// Status-Check
// --------------------------------------------------------------------------

function isMuted(member) {
  const data = loadMutes();
  const entry = data.mutes[muteKey(member.guild.id, member.id)];
  if (!entry) return false;
  if (entry.expiresAt !== 'forever' && Date.now() > entry.expiresAt) return false;
  return true;
}

// --------------------------------------------------------------------------
// Mod-Log
// --------------------------------------------------------------------------

async function logAction(guild, action, user, moderator, reason, duration, modLogChannelId) {
  if (!modLogChannelId) return;
  const channel = await guild.channels.fetch(modLogChannelId).catch(() => null);
  if (!channel) return;

  const embed = new EmbedBuilder()
    .setTitle(action === 'mute' ? '🔇 Member Muted' : '🔊 Member Unmuted')
    .addFields(
      { name: 'User', value: `<@${user.id}> (${user.tag})`, inline: true },
      { name: 'Moderator', value: `<@${moderator.id}>`, inline: true }
    )
    .setColor(action === 'mute' ? 0xff5555 : 0x55ff88)
    .setTimestamp();

  if (duration) {
    embed.addFields({
      name: 'Duration',
      value: duration === 'forever' ? 'Permanent' : `${Math.round(duration / 1000)}s`,
      inline: true
    });
  }
  if (reason) {
    embed.addFields({ name: 'Reason', value: reason });
  }

  await channel.send({ embeds: [embed] }).catch(err =>
    console.warn('Konnte Mod-Log-Nachricht nicht senden:', err.message)
  );
}

// --------------------------------------------------------------------------
// Mute / Unmute
// --------------------------------------------------------------------------

async function applyMute(member, moderator, duration, reason, modLogChannelId) {
  const data = loadMutes();
  const key = muteKey(member.guild.id, member.id);

  let type;

  if (duration !== 'forever' && duration <= MAX_TIMEOUT_MS) {
    type = 'timeout';
    await member.timeout(duration, reason || 'No reason provided');
  } else {
    type = 'role';
    const role = await getOrCreateMutedRole(member.guild);
    await member.roles.add(role, reason || 'No reason provided');
  }

  const expiresAt = duration === 'forever' ? 'forever' : Date.now() + duration;

  data.mutes[key] = {
    userId: member.id,
    guildId: member.guild.id,
    moderatorId: moderator.id,
    reason: reason || null,
    duration,
    expiresAt,
    type
  };
  saveMutes(data);

  if (type === 'role' && expiresAt !== 'forever') {
    const remaining = expiresAt - Date.now();
    setTimeout(async () => {
      const currentData = loadMutes();
      if (!currentData.mutes[key]) return;
      const freshMember = await member.guild.members.fetch(member.id).catch(() => null);
      if (freshMember && currentData.mutedRoleId) {
        await freshMember.roles.remove(currentData.mutedRoleId, 'Mute duration expired').catch(() => {});
      }
      delete currentData.mutes[key];
      saveMutes(currentData);
    }, Math.max(remaining, 0));
  }

  await logAction(member.guild, 'mute', member.user, moderator, reason, duration, modLogChannelId);

  return { type, expiresAt };
}

async function removeMute(member, moderator, reason, modLogChannelId) {
  const data = loadMutes();
  const key = muteKey(member.guild.id, member.id);
  const entry = data.mutes[key];

  if (member.isCommunicationDisabled?.()) {
    await member.timeout(null, reason || 'Unmuted').catch(() => {});
  }

  if (data.mutedRoleId && member.roles.cache.has(data.mutedRoleId)) {
    await member.roles.remove(data.mutedRoleId, reason || 'Unmuted').catch(() => {});
  }

  delete data.mutes[key];
  saveMutes(data);

  await logAction(member.guild, 'unmute', member.user, moderator, reason, entry?.duration, modLogChannelId);

  return true;
}

// --------------------------------------------------------------------------
// Recovery nach Bot-Neustart
// --------------------------------------------------------------------------

async function recoverMutes(client, modLogChannelId) {
  const data = loadMutes();
  const now = Date.now();

  for (const [key, entry] of Object.entries(data.mutes)) {
    if (entry.type !== 'role') continue;

    const guild = await client.guilds.fetch(entry.guildId).catch(() => null);
    if (!guild) continue;

    if (entry.expiresAt !== 'forever' && entry.expiresAt <= now) {
      const member = await guild.members.fetch(entry.userId).catch(() => null);
      if (member && data.mutedRoleId) {
        await member.roles.remove(data.mutedRoleId, 'Mute expired during downtime').catch(() => {});
      }
      delete data.mutes[key];
      continue;
    }

    if (entry.expiresAt !== 'forever') {
      const remaining = entry.expiresAt - now;
      setTimeout(async () => {
        const currentData = loadMutes();
        if (!currentData.mutes[key]) return;
        const freshGuild = await client.guilds.fetch(entry.guildId).catch(() => null);
        if (!freshGuild) return;
        const member = await freshGuild.members.fetch(entry.userId).catch(() => null);
        if (member && currentData.mutedRoleId) {
          await member.roles.remove(currentData.mutedRoleId, 'Mute duration expired').catch(() => {});
        }
        delete currentData.mutes[key];
        saveMutes(currentData);
      }, remaining);
    }
  }

  saveMutes(data);
}

module.exports = {
  parseDuration,
  applyMute,
  removeMute,
  isMuted,
  logAction,
  recoverMutes,
  getMuteData,
  getOrCreateMutedRole
};
