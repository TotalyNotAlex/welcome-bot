const mongoose = require('mongoose');

// --- Warns ---
const warnSchema = new mongoose.Schema({
  guildId: String,
  userId: String,
  warnings: [{
    id: Number,
    moderatorId: String,
    reason: { type: String, default: 'No reason provided' },
    timestamp: { type: Date, default: Date.now }
  }]
});
warnSchema.index({ guildId: 1, userId: 1 });

// --- Polls ---
const pollSchema = new mongoose.Schema({
  messageId: { type: String, unique: true },
  question: String,
  options: [String],
  creatorId: String,
  createdAt: { type: Date, default: Date.now }
});

// --- Mutes ---
const muteSchema = new mongoose.Schema({
  guildId: String,
  userId: String,
  moderatorId: String,
  reason: String,
  duration: mongoose.Schema.Types.Mixed,
  expiresAt: mongoose.Schema.Types.Mixed,
  type: { type: String, enum: ['timeout', 'role'] },
  createdAt: { type: Date, default: Date.now }
});
muteSchema.index({ guildId: 1, userId: 1 });

// --- Verified Users ---
const verifiedSchema = new mongoose.Schema({
  discordId: { type: String, unique: true },
  robloxId: String,
  robloxUsername: String,
  verifiedAt: { type: Date, default: Date.now }
});

// --- Pending Codes ---
const pendingSchema = new mongoose.Schema({
  discordId: { type: String, unique: true },
  code: String,
  robloxUsername: String,
  createdAt: { type: Date, default: Date.now },
  reminderAt: Number
});

// --- Giveaways ---
const giveawaySchema = new mongoose.Schema({
  messageId: { type: String, unique: true },
  prize: String,
  channelId: String,
  guildId: String,
  hostId: String,
  winnersCount: Number,
  endsAt: Date,
  participants: [String],
  ended: { type: Boolean, default: false },
  winners: [String]
});

// --- Reaction Roles ---
const reactionRoleSchema = new mongoose.Schema({
  messageId: { type: String, unique: true },
  channelId: String,
  guildId: String,
  roles: mongoose.Schema.Types.Mixed
});

// --- Greeted Users ---
const greetedSchema = new mongoose.Schema({
  discordId: { type: String, unique: true },
  greetedAt: { type: Date, default: Date.now }
});

// --- Reminder Status ---
const reminderSchema = new mongoose.Schema({
  discordId: { type: String, unique: true },
  joinedAt: Date,
  reminded: { type: Boolean, default: false }
});

// --- Tickets ---
const ticketSchema = new mongoose.Schema({
  channelId: { type: String, unique: true },
  userId: String,
  guildId: String,
  ticketNumber: Number,
  reason: String,
  closed: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});

// --- Ticket Counter ---
const counterSchema = new mongoose.Schema({
  _id: { type: String, default: 'ticketCounter' },
  count: { type: Number, default: 0 }
});

// --- Slowmode Timers ---
const slowmodeSchema = new mongoose.Schema({
  channelId: { type: String, unique: true },
  cooldown: Number,
  endAt: Number,
  guildId: String
});

module.exports = {
  Warn: mongoose.model('Warn', warnSchema),
  Poll: mongoose.model('Poll', pollSchema),
  Mute: mongoose.model('Mute', muteSchema),
  Verified: mongoose.model('Verified', verifiedSchema),
  Pending: mongoose.model('Pending', pendingSchema),
  Giveaway: mongoose.model('Giveaway', giveawaySchema),
  ReactionRole: mongoose.model('ReactionRole', reactionRoleSchema),
  Greeted: mongoose.model('Greeted', greetedSchema),
  Reminder: mongoose.model('Reminder', reminderSchema),
  Ticket: mongoose.model('Ticket', ticketSchema),
  Counter: mongoose.model('Counter', counterSchema),
  Slowmode: mongoose.model('Slowmode', slowmodeSchema)
};