
import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  username: String,
  displayName: String,
  points: { type: Number }, 
  messageCount: { type: Number, default: 0 },
  onlineMinutes: { type: Number, default: 0 },
  lastActive: Number,
  lastUpdated: Number,
  badges: mongoose.Schema.Types.Mixed,
  badgeIcons: [String],
  profileImageUrl: String,
  color: String,
  rank: Number,
  isVip: Boolean,
  isModerator: Boolean,
  isBroadcaster: Boolean,
  isSubscriber: Boolean,
  description: String,
  viewCount: Number,
  createdAt: String,
  offlineImageUrl: String,
  broadcasterType: String,
  email: String
}, { strict: false });

const commandSchema = new mongoose.Schema({
  id: { type: String, required: true },
  name: String,
  enabled: Boolean,
  rootAction: mongoose.Schema.Types.Mixed,
  channelId: String, 
  repoId: String,
  repoVersion: Number
}, { strict: false });

commandSchema.index({ id: 1, channelId: 1 }, { unique: true });

// Sub-schema for version history
const repoVersionSchema = new mongoose.Schema({
    versionId: String,
    updatedAt: Number,
    changelog: String,
    commandData: mongoose.Schema.Types.Mixed
}, { _id: false });

const repoCommandSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  name: String,
  category: String, // Primary Category
  subCategories: [String], // New: Secondary Categories
  authorName: String,
  authorId: String,
  commandData: mongoose.Schema.Types.Mixed, // Latest Version Data
  description: String,
  executionDescription: String, // New: Technical Steps
  tags: [String],
  isSafe: Boolean,
  verificationStatus: { type: String, default: 'UNVERIFIED' },
  toxicityReason: String,
  downloads: { type: Number, default: 0 },
  createdAt: { type: Number, default: Date.now },
  updatedAt: { type: Number, default: Date.now },
  detailedReport: String,
  
  parentRepoCommandId: String, // Tracks if this is a fork/clone
  
  visibility: { type: String, enum: ['PUBLIC', 'PRIVATE'], default: 'PUBLIC' },
  allowedUsers: [String],
  
  changelog: String, // Latest changelog
  versions: [repoVersionSchema] // History
});

const authSchema = new mongoose.Schema({
  userId: { type: String, required: true, unique: true },
  username: String,
  accessToken: String,
  refreshToken: String,
  expiresAt: Number, 
  scope: [String],
  sessionToken: String,
  isBot: { type: Boolean, default: false }
});

const channelSettingsSchema = new mongoose.Schema({
  channelId: { type: String, required: true, unique: true },
  channelName: String, 
  displayName: String, // Added
  profileImageUrl: String, // Added
  editors: [{ 
      id: String, 
      username: String,
      displayName: String 
  }],
  botEnabled: { type: Boolean, default: true },
  isLocked: { type: Boolean, default: false },
  clientLocked: { type: Boolean, default: false },
  serverLocked: { type: Boolean, default: false },
  apiEnabled: { type: Boolean, default: false },
  currencyName: { type: String, default: 'Points' },
  currencySymbol: { type: String, default: '$' }
});

const emoteCacheSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  provider: String,
  channelId: String,
  data: mongoose.Schema.Types.Mixed,
  expiresAt: { type: Date, required: true }
});
emoteCacheSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const badgeCacheSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  data: mongoose.Schema.Types.Mixed,
  expiresAt: { type: Date, required: true }
});
badgeCacheSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const pointSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  channelId: { type: String, required: true },
  amount: { type: Number, default: 0, min: 0 }
});
pointSchema.index({ userId: 1, channelId: 1 }, { unique: true });

export const UserModel = mongoose.model('User', userSchema);
export const CommandModel = mongoose.model('Command', commandSchema);
export const RepoCommandModel = mongoose.model('RepoCommand', repoCommandSchema);
export const AuthModel = mongoose.model('Auth', authSchema);
export const ChannelSettingsModel = mongoose.model('ChannelSettings', channelSettingsSchema);
export const EmoteCacheModel = mongoose.model('EmoteCache', emoteCacheSchema);
export const BadgeCacheModel = mongoose.model('BadgeCache', badgeCacheSchema);
export const PointModel = mongoose.model('Point', pointSchema);

export let isDBConnected = false;

mongoose.connection.on('connected', () => {
    isDBConnected = true;
    console.log("✅ MongoDB Connection Established");
});

mongoose.connection.on('disconnected', () => {
    isDBConnected = false;
    console.log("❌ MongoDB Disconnected");
});

mongoose.connection.on('error', (err) => {
    isDBConnected = false;
    console.error("❌ MongoDB Error:", err.message);
});

export const connectDB = async () => {
    if (!process.env.MONGO_URI) {
        console.warn("⚠️ MONGO_URI not set in .env file. Running in memory-only mode (data lost on restart).");
        isDBConnected = false;
        return;
    }
    try {
        await mongoose.connect(process.env.MONGO_URI, {
            serverSelectionTimeoutMS: 5000,
            socketTimeoutMS: 45000,
        });
        isDBConnected = true;
    } catch (err) {
        isDBConnected = false;
        console.error("❌ Initial MongoDB Connection Failed:", err.message);
    }
};
