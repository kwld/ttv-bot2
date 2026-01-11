

export enum ActionType {
  START = 'START',
  SAY = 'SAY',
  LOG = 'LOG',
  AI_CHAT = 'AI_CHAT',
  EMAIL = 'EMAIL',
  WAIT = 'WAIT',
  WAIT_FOR_KEYWORD = 'WAIT_FOR_KEYWORD',
  WAIT_FOR_USER_REPLY = 'WAIT_FOR_USER_REPLY',
  CREATE_LIST = 'CREATE_LIST',
  RANDOM_PICK = 'RANDOM_PICK',
  PICK_MULTIPLE = 'PICK_MULTIPLE',
  RANDOM_NUMBER = 'RANDOM_NUMBER',
  RANDOM_EMOTE = 'RANDOM_EMOTE',
  RANDOM_CHATTER = 'RANDOM_CHATTER',
  FETCH_API = 'FETCH_API',
  CREATE_CLIP = 'CREATE_CLIP',
  CONDITION = 'CONDITION',
  CHECK_ARG = 'CHECK_ARG',
  CHECK_USER = 'CHECK_USER',
  RANK_CHECK = 'RANK_CHECK',
  ITERATE = 'ITERATE',
  POINTS_GET = 'POINTS_GET',
  POINTS_MODIFY = 'POINTS_MODIFY',
  TOP_USERS = 'TOP_USERS',
  SET_VARIABLE = 'SET_VARIABLE',
  VALIDATE_NUMBER = 'VALIDATE_NUMBER',
  CALCULATE = 'CALCULATE',
  JOIN_STRING = 'JOIN_STRING',
  JOIN = 'JOIN',
  JUMP = 'JUMP',
  CONNECTOR_IN = 'CONNECTOR_IN',
  CONNECTOR_OUT = 'CONNECTOR_OUT',
  HANDLE_ERROR = 'HANDLE_ERROR',
  HALT = 'HALT'
}

export type Provider = 'kick' | 'twitch' | 'youtube';

export interface UserEntity {
  id: string;
  username: string;
  displayName: string;
  points?: number; 
  messageCount?: number; 
  onlineMinutes?: number; 
  lastActive?: number; 
  lastUpdated?: number; 
  profileImageUrl?: string;
  isEditor?: boolean;
}

export interface User extends UserEntity {
  badges?: Record<string, string>; 
  badgeIcons?: string[]; 
  color?: string;
  rank?: number;
  isVip?: boolean;
  isModerator?: boolean;
  isBroadcaster?: boolean;
  isSubscriber?: boolean;
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
  aliases?: string[];
  producesCollection?: boolean;
  requiresCollection?: boolean;
  settingsSchema: {
    [key: string]: {
      label: string;
      type: 'text' | 'number' | 'select' | 'multiselect' | 'variable' | 'user' | 'boolean' | 'condition_list' | 'error_mapper' | 'key_value_builder';
      inputType?: 'text' | 'textarea';
      options?: string[];
      placeholder?: string;
      defaultValue?: any;
      helperText?: string;
    };
  };
  returns?: string[]; 
  isHidden?: boolean; 
  possibleErrors?: string[];
}

export interface ActionInstance {
  id: string;
  type: ActionType;
  settings: Record<string, any>;
  children: ActionInstance[];
  errorChildren?: ActionInstance[];
  branches?: Record<string, ActionInstance[]>;
  detachedChildren?: ActionInstance[];
  position?: { x: number; y: number };
  waypoints?: { x: number; y: number }[];
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
  clientRedirectUri?: string;
  mode: ChannelMode;
  connectedUser?: User;
  color?: string;
  textColor?: string;
  badgeStyle?: BadgeStyle;
  textStyle?: TextStyle;
  badgeLabel?: string;
  disableBotReplies?: boolean;
  isLocked?: boolean;
  clientLocked?: boolean;
  serverLocked?: boolean;
  botEnabled?: boolean;
  serverJoined?: boolean;
  apiEnabled?: boolean;
}

export type UserRank = 'broadcaster' | 'moderator' | 'vip' | 'regular';

export interface CommandArgument {
  name: string;
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
  options?: string[];
}

export interface Command {
  id: string;
  name: string;
  category?: string;
  channelId: string;
  provider: Provider;
  enabled: boolean;
  testAsUser?: boolean;
  allowedRanks: UserRank[];
  staticVariables: Record<string, string>;
  staticVariableDefinitions?: Record<string, VariableDefinition>;
  args?: CommandArgument[];
  globalCooldown?: number;
  userCooldown?: number;
  rootAction: ActionInstance;
  zones?: FlowZone[];
  isBuiltIn?: boolean;
  isModified?: boolean;
  usageHint?: string;
  version?: string;
  repoId?: string;
  repoVersion?: number;
}

export interface RepoVersion {
    versionId: string;
    updatedAt: number;
    changelog: string;
    commandData: Command;
}

export interface RepoCommand {
    id: string;
    name: string;
    category: string;
    subCategories?: string[];
    authorName: string;
    authorId: string;
    description?: string;
    executionDescription?: string;
    tags?: string[];
    isSafe?: boolean;
    verificationStatus?: 'VERIFIED' | 'UNVERIFIED' | 'UNSAFE';
    toxicityReason?: string;
    detailedReport?: string;
    downloads: number;
    createdAt: number;
    updatedAt?: number;
    commandData?: Command;
    parentRepoCommandId?: string;
    visibility: 'PUBLIC' | 'PRIVATE';
    allowedUsers?: string[];
    changelog?: string;
    versions?: RepoVersion[];
}

export interface ChatMessage {
  id: string;
  provider: Provider;
  channelId: string;
  channelName?: string;
  channelColor?: string;
  text: string;
  user: User;
  isModerator: boolean;
  isBroadcaster: boolean;
  isVip: boolean;
  isSubscriber?: boolean;
  isFirstMessage?: boolean;
  timestamp: number;
  isBot: boolean;
  isLive?: boolean;
  isLocalOnly?: boolean;
  isSystem?: boolean;
  isSelf?: boolean;
  hoverText?: string;
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
  alertType?: string;
  systemMsg?: string;
  userMsg?: string;
}

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
    channelName?: string;
    startedAt: number;
    currentNodeId?: string;
    waitingData?: any;
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

export interface SevenTVFile {
  name: string;
  static_name?: string;
  format?: string;
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