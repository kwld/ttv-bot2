const mongoose = require('mongoose');

const tokenSchema = new mongoose.Schema({
  twitchId: { type: String, required: true, unique: true },
  login: { type: String, required: true },
  displayName: { type: String },
  avatar: { type: String },
  accessToken: { type: String, required: true },
  refreshToken: { type: String, required: true },
  expiresIn: { type: Number, required: true },
  obtainedAt: { type: Date, default: Date.now },
  scope: [String],
  type: { type: String, enum: ['bot', 'streamer'], required: true }
});

// Calculate expiry dynamically
tokenSchema.methods.isExpired = function() {
  const now = Date.now();
  // Buffer of 5 minutes
  return now >= this.obtainedAt.getTime() + (this.expiresIn * 1000) - (5 * 60 * 1000);
};

const Token = mongoose.model('Token', tokenSchema);

module.exports = { Token };