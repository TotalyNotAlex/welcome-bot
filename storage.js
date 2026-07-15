const fs = require('fs');
const path = require('path');

const DB_FILE = path.join(__dirname, 'verified_users.json');
const PENDING_FILE = path.join(__dirname, 'pending_codes.json');
const GIVEAWAYS_FILE = path.join(__dirname, 'giveaways.json');
const REACTION_ROLES_FILE = path.join(__dirname, 'reaction_roles.json');
const GREETED_FILE = path.join(__dirname, 'greeted_users.json');
const REMINDER_FILE = path.join(__dirname, 'reminder_status.json');

// ===== TICKET SYSTEM FILES =====
const TICKETS_FILE = path.join(__dirname, 'tickets.json');
const TICKET_COUNTER_FILE = path.join(__dirname, 'ticket_counter.json');
const SLOWMODE_TIMERS_FILE = path.join(__dirname, 'slowmode_timers.json');

function loadJson(file) {
  if (!fs.existsSync(file)) return {};
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return {};
  }
}

function saveJson(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
}

// --- Dauerhaft verifizierte User: { discordId: { robloxId, robloxUsername, verifiedAt } }
function getVerified(discordId) {
  const data = loadJson(DB_FILE);
  return data[discordId] || null;
}

function setVerified(discordId, robloxId, robloxUsername) {
  const data = loadJson(DB_FILE);
  data[discordId] = {
    robloxId,
    robloxUsername,
    verifiedAt: new Date().toISOString()
  };
  saveJson(DB_FILE, data);
}

function removeVerified(discordId) {
  const data = loadJson(DB_FILE);
  delete data[discordId];
  saveJson(DB_FILE, data);
}

// --- Ausstehende Verifizierungscodes: { discordId: { code, robloxUsername, createdAt, reminderAt } }
function getPending(discordId) {
  const data = loadJson(PENDING_FILE);
  return data[discordId] || null;
}

function setPending(discordId, code, robloxUsername) {
  const data = loadJson(PENDING_FILE);
  data[discordId] = {
    code,
    robloxUsername,
    createdAt: new Date().toISOString()
  };
  saveJson(PENDING_FILE, data);
}

function removePending(discordId) {
  const data = loadJson(PENDING_FILE);
  delete data[discordId];
  saveJson(PENDING_FILE, data);
}

function getAllPendingReminders() {
  const data = loadJson(PENDING_FILE);
  const now = Date.now();
  const reminders = [];

  for (const [userId, entry] of Object.entries(data)) {
    if (entry.reminderAt && entry.reminderAt <= now) {
      reminders.push({ userId, ...entry });
    }
  }

  return reminders;
}

// --- Begrüßte User: verhindert doppeltes Pingen bei Rejoin ---
function hasBeenGreeted(discordId) {
  const data = loadJson(GREETED_FILE);
  return Boolean(data[discordId]);
}

function markGreeted(discordId) {
  const data = loadJson(GREETED_FILE);
  data[discordId] = { greetedAt: new Date().toISOString() };
  saveJson(GREETED_FILE, data);
}

// --- Erinnerungsstatus: { discordId: { joinedAt, reminded } }
function getReminderStatus(discordId) {
  const data = loadJson(REMINDER_FILE);
  return data[discordId] || null;
}

function setJoinedAt(discordId, joinedAt) {
  const data = loadJson(REMINDER_FILE);
  if (!data[discordId]) {
    data[discordId] = { joinedAt, reminded: false };
    saveJson(REMINDER_FILE, data);
  }
}

function markReminded(discordId) {
  const data = loadJson(REMINDER_FILE);
  if (!data[discordId]) {
    data[discordId] = { joinedAt: new Date().toISOString(), reminded: true };
  } else {
    data[discordId].reminded = true;
  }
  saveJson(REMINDER_FILE, data);
}

function clearReminderStatus(discordId) {
  const data = loadJson(REMINDER_FILE);
  delete data[discordId];
  saveJson(REMINDER_FILE, data);
}

// --- Giveaways: { messageId: { prize, channelId, guildId, hostId, winnersCount,
//                                endsAt, participants: [discordId], ended, winners: [discordId] } }
function getGiveaway(messageId) {
  const data = loadJson(GIVEAWAYS_FILE);
  return data[messageId] || null;
}

function getAllGiveaways() {
  return loadJson(GIVEAWAYS_FILE);
}

function getActiveGiveaways(guildId = null) {
  const data = loadJson(GIVEAWAYS_FILE);
  return Object.values(data)
    .filter(g => !g.ended && (!guildId || g.guildId === guildId));
}

function createGiveaway(messageId, giveawayData) {
  const data = loadJson(GIVEAWAYS_FILE);
  data[messageId] = { ...giveawayData, participants: [], ended: false, winners: [] };
  saveJson(GIVEAWAYS_FILE, data);
}

function updateGiveaway(messageId, updates) {
  const data = loadJson(GIVEAWAYS_FILE);
  if (!data[messageId]) return null;
  data[messageId] = { ...data[messageId], ...updates };
  saveJson(GIVEAWAYS_FILE, data);
  return data[messageId];
}

function addParticipant(messageId, discordId) {
  const data = loadJson(GIVEAWAYS_FILE);
  const giveaway = data[messageId];
  if (!giveaway) return null;
  if (giveaway.participants.includes(discordId)) return giveaway;
  giveaway.participants.push(discordId);
  saveJson(GIVEAWAYS_FILE, data);
  return giveaway;
}

// --- Reaction Roles: { messageId: { channelId, guildId, roles: { emoji: roleId } } }
function saveReactionRoleMessage(messageId, data) {
  const store = loadJson(REACTION_ROLES_FILE);
  store[messageId] = data;
  saveJson(REACTION_ROLES_FILE, store);
}

function getReactionRoleMessage(messageId) {
  const store = loadJson(REACTION_ROLES_FILE);
  return store[messageId] || null;
}

function getAllReactionRoleMessages() {
  return loadJson(REACTION_ROLES_FILE);
}

function deleteReactionRoleMessage(messageId) {
  const store = loadJson(REACTION_ROLES_FILE);
  delete store[messageId];
  saveJson(REACTION_ROLES_FILE, store);
}

// ===== TICKET SYSTEM FUNCTIONS =====
// Tickets: { channelId: { userId, guildId, ticketNumber, reason, closed, createdAt } }

function getNextTicketNumber() {
  const data = loadJson(TICKET_COUNTER_FILE);
  const next = (data.count || 0) + 1;
  saveJson(TICKET_COUNTER_FILE, { count: next });
  return next;
}

function createTicket(channelId, ticketData) {
  const data = loadJson(TICKETS_FILE);
  data[channelId] = ticketData;
  saveJson(TICKETS_FILE, data);
}

function getTicket(channelId) {
  const data = loadJson(TICKETS_FILE);
  return data[channelId] || null;
}

function updateTicket(channelId, updates) {
  const data = loadJson(TICKETS_FILE);
  if (!data[channelId]) return null;
  data[channelId] = { ...data[channelId], ...updates };
  saveJson(TICKETS_FILE, data);
  return data[channelId];
}

function deleteTicket(channelId) {
  const data = loadJson(TICKETS_FILE);
  delete data[channelId];
  saveJson(TICKETS_FILE, data);
}

function hasOpenTicket(userId) {
  const data = loadJson(TICKETS_FILE);
  return Object.values(data).some(t => t.userId === userId && !t.closed);
}

// --- Slowmode Timers: { channelId: { cooldown, endAt, guildId } }
function saveSlowmodeTimer(channelId, cooldown, durationSeconds, guildId) {
  const data = loadJson(SLOWMODE_TIMERS_FILE);
  const endAt = Date.now() + (durationSeconds * 1000);
  data[channelId] = { cooldown, endAt, guildId };
  saveJson(SLOWMODE_TIMERS_FILE, data);
}

function getSlowmodeTimer(channelId) {
  const data = loadJson(SLOWMODE_TIMERS_FILE);
  return data[channelId] || null;
}

function getAllSlowmodeTimers() {
  return loadJson(SLOWMODE_TIMERS_FILE);
}

function removeSlowmodeTimer(channelId) {
  const data = loadJson(SLOWMODE_TIMERS_FILE);
  delete data[channelId];
  saveJson(SLOWMODE_TIMERS_FILE, data);
}

function cleanupExpiredSlowmodeTimers() {
  const data = loadJson(SLOWMODE_TIMERS_FILE);
  const now = Date.now();
  let changed = false;
  for (const [channelId, timer] of Object.entries(data)) {
    if (timer.endAt <= now) {
      delete data[channelId];
      changed = true;
    }
  }
  if (changed) {
    saveJson(SLOWMODE_TIMERS_FILE, data);
  }
  return data;
}

module.exports = {
  getVerified,
  setVerified,
  removeVerified,
  getPending,
  setPending,
  removePending,
  getAllPendingReminders,
  hasBeenGreeted,
  markGreeted,
  getReminderStatus,
  setJoinedAt,
  markReminded,
  clearReminderStatus,
  getGiveaway,
  getAllGiveaways,
  getActiveGiveaways,
  createGiveaway,
  updateGiveaway,
  addParticipant,
  saveReactionRoleMessage,
  getReactionRoleMessage,
  getAllReactionRoleMessages,
  deleteReactionRoleMessage,
  // Slowmode timer exports
  saveSlowmodeTimer,
  getSlowmodeTimer,
  getAllSlowmodeTimers,
  removeSlowmodeTimer,
  cleanupExpiredSlowmodeTimers,
  // Ticket system exports
  getNextTicketNumber,
  createTicket,
  getTicket,
  updateTicket,
  deleteTicket,
  hasOpenTicket
};