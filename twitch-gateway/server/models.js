
import mongoose from 'mongoose';

const tokenSchema = new mongoose.Schema({
  twitchId: { type: String, required: true, unique: true },
  login: { type: String, required: true },
  displayName: { type: String },
  avatar: { type: String },
  accessToken: { type: String, required: false }, // Made optional for manual entries
  refreshToken: { type: String, required: false }, // Made optional for manual entries
  expiresIn: { type: Number, required: false },    // Made optional for manual entries
  obtainedAt: { type: Date, default: Date.now },
  scope: [String],
  type: { type: String, enum: ['bot', 'streamer'], required: true },
  isManual: { type: Boolean, default: false },
  botIsModerator: { type: Boolean, default: false } // New field: tracks if the Bot user is a Mod in this Streamer's channel
});

// Calculate expiry dynamically
tokenSchema.methods.isExpired = function() {
  if (this.isManual) return false; // Manual tokens never expire (they are dummy)
  const now = Date.now();
  // Buffer of 5 minutes
  return now >= this.obtainedAt.getTime() + (this.expiresIn * 1000) - (5 * 60 * 1000);
};

export const Token = mongoose.model('Token', tokenSchema);
