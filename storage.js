const {
  Verified, Pending, Giveaway, ReactionRole,
  Greeted, Reminder, Ticket, Counter, Slowmode
} = require('./models');

// --- Verified Users ---
async function getVerified(discordId) {
  const doc = await Verified.findOne({ discordId }).lean();
  return doc || null;
}

async function setVerified(discordId, robloxId, robloxUsername) {
  await Verified.findOneAndUpdate(
    { discordId },
    { robloxId, robloxUsername, verifiedAt: new Date() },
    { upsert: true }
  );
}

async function removeVerified(discordId) {
  await Verified.deleteOne({ discordId });
}

// --- Pending Codes ---
async function getPending(discordId) {
  const doc = await Pending.findOne({ discordId }).lean();
  return doc || null;
}

async function setPending(discordId, code, robloxUsername) {
  await Pending.findOneAndUpdate(
    { discordId },
    { code, robloxUsername, createdAt: new Date() },
    { upsert: true }
  );
}

async function removePending(discordId) {
  await Pending.deleteOne({ discordId });
}

async function getAllPendingReminders() {
  const now = Date.now();
  const docs = await Pending.find({ reminderAt: { $lte: now } }).lean();
  return docs.map(d => ({ userId: d.discordId, ...d }));
}

// --- Greeted Users ---
async function hasBeenGreeted(discordId) {
  const doc = await Greeted.findOne({ discordId }).lean();
  return Boolean(doc);
}

async function markGreeted(discordId) {
  await Greeted.findOneAndUpdate(
    { discordId },
    { greetedAt: new Date() },
    { upsert: true }
  );
}

// --- Reminder Status ---
async function getReminderStatus(discordId) {
  const doc = await Reminder.findOne({ discordId }).lean();
  return doc || null;
}

async function setJoinedAt(discordId, joinedAt) {
  const exists = await Reminder.findOne({ discordId });
  if (!exists) {
    await Reminder.create({ discordId, joinedAt: new Date(joinedAt), reminded: false });
  }
}

async function markReminded(discordId) {
  await Reminder.findOneAndUpdate(
    { discordId },
    { reminded: true },
    { upsert: true }
  );
}

async function clearReminderStatus(discordId) {
  await Reminder.deleteOne({ discordId });
}

// --- Giveaways ---
async function getGiveaway(messageId) {
  const doc = await Giveaway.findOne({ messageId }).lean();
  return doc || null;
}

async function getAllGiveaways() {
  return await Giveaway.find().lean();
}

async function getActiveGiveaways(guildId = null) {
  const query = { ended: false };
  if (guildId) query.guildId = guildId;
  return await Giveaway.find(query).lean();
}

async function createGiveaway(messageId, giveawayData) {
  await Giveaway.create({
    messageId,
    ...giveawayData,
    participants: [],
    ended: false,
    winners: []
  });
}

async function updateGiveaway(messageId, updates) {
  const doc = await Giveaway.findOneAndUpdate(
    { messageId },
    updates,
    { new: true }
  ).lean();
  return doc;
}

async function addParticipant(messageId, discordId) {
  const doc = await Giveaway.findOne({ messageId });
  if (!doc) return null;
  if (doc.participants.includes(discordId)) return doc;
  doc.participants.push(discordId);
  await doc.save();
  return doc;
}

// --- Reaction Roles ---
async function saveReactionRoleMessage(messageId, data) {
  await ReactionRole.findOneAndUpdate(
    { messageId },
    data,
    { upsert: true }
  );
}

async function getReactionRoleMessage(messageId) {
  const doc = await ReactionRole.findOne({ messageId }).lean();
  return doc || null;
}

async function getAllReactionRoleMessages() {
  return await ReactionRole.find().lean();
}

async function deleteReactionRoleMessage(messageId) {
  await ReactionRole.deleteOne({ messageId });
}

// --- Tickets ---
async function getNextTicketNumber() {
  const counter = await Counter.findOneAndUpdate(
    { _id: 'ticketCounter' },
    { $inc: { count: 1 } },
    { upsert: true, new: true }
  );
  return counter.count;
}

async function createTicket(channelId, ticketData) {
  await Ticket.findOneAndUpdate(
    { channelId },
    ticketData,
    { upsert: true }
  );
}

async function getTicket(channelId) {
  const doc = await Ticket.findOne({ channelId }).lean();
  return doc || null;
}

async function updateTicket(channelId, updates) {
  const doc = await Ticket.findOneAndUpdate(
    { channelId },
    updates,
    { new: true }
  ).lean();
  return doc;
}

async function deleteTicket(channelId) {
  await Ticket.deleteOne({ channelId });
}

async function hasOpenTicket(userId) {
  const doc = await Ticket.findOne({ userId, closed: false }).lean();
  return Boolean(doc);
}

// --- Slowmode Timers ---
async function saveSlowmodeTimer(channelId, cooldown, durationSeconds, guildId) {
  const endAt = Date.now() + (durationSeconds * 1000);
  await Slowmode.findOneAndUpdate(
    { channelId },
    { cooldown, endAt, guildId },
    { upsert: true }
  );
}

async function getSlowmodeTimer(channelId) {
  const doc = await Slowmode.findOne({ channelId }).lean();
  return doc || null;
}

async function getAllSlowmodeTimers() {
  return await Slowmode.find().lean();
}

async function removeSlowmodeTimer(channelId) {
  await Slowmode.deleteOne({ channelId });
}

async function cleanupExpiredSlowmodeTimers() {
  const now = Date.now();
  await Slowmode.deleteMany({ endAt: { $lte: now } });
  return await getAllSlowmodeTimers();
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
  saveSlowmodeTimer,
  getSlowmodeTimer,
  getAllSlowmodeTimers,
  removeSlowmodeTimer,
  cleanupExpiredSlowmodeTimers,
  getNextTicketNumber,
  createTicket,
  getTicket,
  updateTicket,
  deleteTicket,
  hasOpenTicket
};