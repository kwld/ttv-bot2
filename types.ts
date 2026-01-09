
export enum ActionType {
  START = 'START',
  SAY = 'SAY',
  LOG = 'LOG', // New Type
  AI_CHAT = 'AI_CHAT',
  EMAIL = 'EMAIL', // New Node
  WAIT = 'WAIT',
  WAIT_FOR_KEYWORD = 'WAIT_FOR_KEYWORD',
  WAIT_FOR_USER_REPLY = 'WAIT_FOR_USER_REPLY',
  RANDOM_PICK = 'RANDOM_PICK',
  PICK_MULTIPLE = 'PICK_MULTIPLE',
  RANDOM_NUMBER = 'RANDOM_NUMBER',
  RANDOM_EMOTE = 'RANDOM_EMOTE', // New
  RANDOM_CHATTER = 'RANDOM_CHATTER', // New
  FETCH_API = 'FETCH_API',
  CREATE_CLIP = 'CREATE_CLIP', // New Node
  CONDITION = 'CONDITION',
  CHECK_ARG = 'CHECK_ARG', // New Node for Argument Validation
  CHECK_USER = 'CHECK_USER', // New Node for User Validation
  RANK_CHECK = 'RANK_CHECK',
  ITERATE = 'ITERATE',
  POINTS_GET = 'POINTS_GET',
  POINTS_MODIFY = 'POINTS_MODIFY',
  TOP_USERS = 'TOP_USERS', // New Node
  SET_VARIABLE = 'SET_VARIABLE',
  VALIDATE_NUMBER = 'VALIDATE_NUMBER',
  CALCULATE = 'CALCULATE',
  JOIN_STRING = 'JOIN_STRING', // New Node for list formatting
  JOIN = 'JOIN',
  JUMP = 'JUMP',
  HANDLE_ERROR = 'HANDLE_ERROR',
  HALT = 'HALT' // New Node
}

export type Provider = 'kick' | 'twitch' | 'youtube';

export interface UserEntity {
  id: string;
  username: string;
  displayName: string;
  points?: number; // Stores user currency
  messageCount?: number; // Total messages sent
  onlineMinutes?: number; // Minutes active while stream is live
  lastActive?: number; // Timestamp of last message
  lastUpdated?: number; // Timestamp of last interaction/update
  profileImageUrl?: string;
  isEditor?: boolean;
}

export interface User extends UserEntity {
  badges?: Record<string, string>; // Key: badge_set_id, Value: version_id
  badgeIcons?: string[]; // Legacy/Resolved URLs
  color?: string;
  // Rank: 0 = Broadcaster, 1 = Moderator, 2 = VIP, 3 = Regular
  rank?: number;
  isVip?: boolean;
  isModerator?: boolean;
  isBroadcaster?: boolean;
  isSubscriber?: boolean;
  
  // Extended Twitch Profile Data
  description?: string;
  viewCount?: number;
  createdAt?: string;
  offlineImageUrl?: string;
  broadcasterType?: string;
  email?: string;
}

export interface ActionPlugin {
  type: ActionType;
  name: string;
  description: string;
  icon: string;
  category: 'Triggers' | 'Logic' | 'Actions' | 'Data' | 'Flow';
  aliases?: string[]; // Search keywords (e.g., "loop" for Iterate)
  producesCollection?: boolean;
  requiresCollection?: boolean;
  settingsSchema: {
    [key: string]: {
      label: string;
      type: 'text' | 'number' | 'select' | 'multiselect' | 'variable' | 'user' | 'boolean' | 'condition_list' | 'error_mapper' | 'key_value_builder';
      inputType?: 'text' | 'textarea'; // Added to support textarea
      options?: string[];
      placeholder?: string;
      defaultValue?: any; // Default value for the field
      helperText?: string; // Optional helper/hint text key for localization
    };
  };
  returns?: string[]; 
  isHidden?: boolean; // For JUMP nodes
  possibleErrors?: string[]; // List of errors this node can throw
}

export interface ActionInstance {
  id: string;
  type: ActionType;
  settings: Record<string, any>;
  children: ActionInstance[];
  errorChildren?: ActionInstance[]; // Used as ELSE path for Conditions
  branches?: Record<string, ActionInstance[]>; // Named branches for multi-condition
  detachedChildren?: ActionInstance[]; // Nodes that exist visually but are not connected to the main flow
  position?: { x: number; y: number };
  waypoints?: { x: number; y: number }[]; // Routing points for the incoming connection
}

export interface FlowZone {
  id: string;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  color: 'red' | 'green' | 'blue' | 'amber' | 'purple' | 'slate';
}

export type ChannelMode = 'testing' | 'serverless' | 'server';
export type BadgeStyle = 'filled' | 'outlined' | 'neon' | 'glass' | 'cyber';
export type TextStyle = 'none' | 'shadow' | 'glow' | 'outline' | 'retro';

export interface Channel {
  id: string;
  name: string;
  provider: Provider;
  currencyName: string;
  currencySymbol: string;
  twitchId?: string;
  botClientId?: string;
  clientRedirectUri?: string; // New field for manual redirect override
  mode: ChannelMode;
  connectedUser?: User; // Tożsamość bota dla tego kanału
  color?: string; // Hex color for UI distinction
  textColor?: string; // Custom font color for the channel name header
  badgeStyle?: BadgeStyle; // New style property
  textStyle?: TextStyle; // New text style property
  badgeLabel?: string; // Custom label override for the badge
  disableBotReplies?: boolean; // If true, bot messages are local-only simulation
  
  isLocked?: boolean; // General Lock (Legacy/Local)
  clientLocked?: boolean; // Frontend Connection Lock
  serverLocked?: boolean; // Backend Connection Lock

  botEnabled?: boolean; // Whether the bot is active/connected for this channel (Server mode)
  serverJoined?: boolean; // Whether the bot is ACTUALLY connected to IRC (Server mode status)
  apiEnabled?: boolean; // Whether AI/External API calls are allowed (Server mode)
}

export type UserRank = 'broadcaster' | 'moderator' | 'vip' | 'regular';

export interface CommandArgument {
  name: string; // e.g., "Target User"
  type: 'user' | 'number' | 'text' | 'selection';
  optional: boolean;
  defaultValue?: string;
}

export interface VariableDefinition {
  key: string;
  type: 'text' | 'number' | 'slider' | 'select';
  label?: string;
  min?: number;
  max?: number;
  step?: number;
  options?: string[]; // comma separated for now in UI, array in structure
}

export interface Command {
  id: string;
  // trigger: string; // REMOVED: Trigger is now inside rootAction.settings
  name: string;
  category?: string; // New Category Field
  channelId: string;
  provider: Provider;
  enabled: boolean;
  testAsUser?: boolean;
  allowedRanks: UserRank[];
  staticVariables: Record<string, string>;
  staticVariableDefinitions?: Record<string, VariableDefinition>; // Configuration metadata
  args?: CommandArgument[]; // Defined arguments for UI hints
  globalCooldown?: number; // Seconds
  userCooldown?: number;   // Seconds
  rootAction: ActionInstance;
  zones?: FlowZone[]; // Visual grouping zones
  isBuiltIn?: boolean;
  isModified?: boolean;
  usageHint?: string;
  version?: string; // Added version property
  
  // Repository Linking
  repoId?: string; // ID of the connected repository item
  repoVersion?: number; // Timestamp/Version of the repo item when imported/updated
}

export interface RepoVersion {
    versionId: string;
    updatedAt: number;
    changelog: string;
    commandData: Command; // Snapshot of the command at this version
}

// --- NEW REPO TYPE ---
export interface RepoCommand {
    id: string;
    name: string;
    category: string;
    subCategories?: string[]; // New: Secondary categories
    authorName: string;
    authorId: string;
    description?: string;
    executionDescription?: string; // New: Technical step-by-step
    tags?: string[];
    isSafe?: boolean;
    verificationStatus?: 'VERIFIED' | 'UNVERIFIED' | 'UNSAFE'; // New field
    toxicityReason?: string;
    detailedReport?: string; // Added detailed report
    downloads: number;
    createdAt: number;
    updatedAt?: number; // Last updated timestamp
    commandData?: Command; // Filled only on import/detail view
    
    // Access Control
    visibility: 'PUBLIC' | 'PRIVATE';
    allowedUsers?: string[]; // Array of User IDs who can access this private command
    
    // Versioning
    changelog?: string; // Latest changelog
    versions?: RepoVersion[]; // History of versions
}

export interface ChatMessage {
  id: string;
  provider: Provider;
  channelId: string;
  channelName?: string;
  channelColor?: string; // Visual color
  text: string;
  user: User;
  isModerator: boolean;
  isBroadcaster: boolean;
  isVip: boolean;
  isSubscriber?: boolean;
  isFirstMessage?: boolean; // New: First message highlighting
  timestamp: number;
  isBot: boolean;
  isLive?: boolean; // Czy wiadomość pochodzi z prawdziwego sererwa/twitcha
  isLocalOnly?: boolean; // Czy wiadomość jest widoczna tylko lokalnie (symulacja)
  isSystem?: boolean; // Wiadomości systemowe (np. błędy cooldownu)
  isSelf?: boolean; // Wiadomość wysłana przez użytkownika z poziomu aplikacji (Dashboard)
  hoverText?: string; // Additional detailed text shown on hover (supports color tags)
  metadata?: {
      level?: 'info' | 'success' | 'warning' | 'error';
  };
  reply?: {
    parentDisplayName: string;
    parentMessageBody: string;
    parentMessageId?: string;
    parentUserId?: string;
    parentUserLogin?: string;
  };
  tags?: Record<string, string>;
  redemption?: {
      id: string;
      title: string;
      cost?: number;
  };
}

export interface ActivityNotification {
  id: string;
  channelName: string;
  channelColor?: string;
  joins?: string[];
  parts?: string[];
  // New fields for alerts
  alertType?: string; // e.g. SUB, RESUB, RAID
  systemMsg?: string; // System text
  userMsg?: string; // Optional user message attached
}

// --- Process Tracking Types ---

export interface WaitingInfo {
  channelId: string;
  actionId: string;
  executionId: string;
  startTime: number;
  keyword: string;
  duration: number;
  targetUserId?: string;
  targetDisplayName?: string;
  maxUsers?: number;
  useRegex?: boolean;
  participantCount?: number;
  isImplicitDelay?: boolean;
  label?: string;
}

export interface ServerProcess {
    executionId: string;
    commandId: string;
    commandName: string;
    channelId: string;
    channelName?: string; // Added: Used in Activity Monitor
    startedAt: number;
    currentNodeId?: string; // Currently executing node
    waitingData?: any; // If waiting (keyword/delay), includes details
    user: {
        displayName: string;
        username: string;
    };
    source: 'server' | 'local';
}

export interface ServerHistoryItem {
    executionId: string;
    commandId: string;
    commandName: string;
    channelId: string;
    startedAt: number;
    endedAt: number;
    status: 'completed' | 'error' | 'halted';
    error?: string;
    user: {
        displayName: string;
    };
    durationMs: number;
}

// --- 7TV API types (used by services/7tvservice.ts)
export interface SevenTVFile {
  name: string;
  static_name?: string;
  format?: string; // Added: Used for filtering image formats
}

export interface SevenTVHost {
  url?: string;
  files?: SevenTVFile[];
}

export interface SevenTVEmote {
  id?: string;
  name?: string;
  tag?: string;
  display_name?: string;
  urls?: Record<string, string> | Array<[string, string]>;
  host?: SevenTVHost;
  data?: any;
  aliases?: string[];
  provider?: string;
  source?: string;
  flags?: any;
  modifiers?: string[];
  // Additional fields for compatibility with various API response shapes
  hosting?: any;
  images?: any;
  urls_map?: any;
  service?: string;
}

export interface SevenTVUserData {
  emote_set?: any;
  emotes?: SevenTVEmote[];
  emote_sets?: Record<string, any>;
  emote_sets_map?: Record<string, any>;
  [key: string]: any;
}
