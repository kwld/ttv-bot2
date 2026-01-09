
import { TwitchIRCClient } from '../twitch-gateway/server/TwitchIRC.js';
import { User, Provider } from '../types';

export interface TwitchMessage {
  channel: string;
  message: string;
  user: {
      id: string;
      username: string;
      displayName: string;
      isMod: boolean;
      isSub: boolean;
      isVip: boolean;
      isBroadcaster: boolean;
      badges: Record<string, string>;
      color?: string;
  };
  isFirstMessage?: boolean; // New field
  reply?: {
    parentDisplayName: string;
    parentMessageBody: string;
    parentMessageId: string;
    parentUserId: string;
    parentUserLogin: string;
  };
  tags: Record<string, string>;
  redemption?: {
      id: string;
      title: string;
  };
}

export interface TwitchUserNotice {
  channel: string;
  message: string;
  tags: Record<string, string>;
}

export interface TwitchChatClientOptions {
    channelNames: string[];
    token: string;
    username: string;
    onMessage: (msg: TwitchMessage) => void;
    onJoin?: (channel: string) => void;
    onPart?: (channel: string) => void;
    onUserJoin?: (channel: string, username: string) => void;
    onUserPart?: (channel: string, username: string) => void;
    onUserNotice?: (notice: TwitchUserNotice) => void;
    onClearChat?: (channel: string, user?: string) => void;
    onAuthFailed?: () => void;
    onConnected?: () => void;
    onDisconnected?: () => void;
}

// Re-export the shared client class as TwitchChatClient for frontend compatibility
export class TwitchChatClient extends TwitchIRCClient {
    constructor(options: TwitchChatClientOptions) {
        super({
            token: options.token,
            username: options.username,
            channels: options.channelNames,
            onMessage: options.onMessage,
            onJoin: options.onJoin,
            onPart: options.onPart,
            onUserJoin: options.onUserJoin,
            onUserPart: options.onUserPart,
            onUserNotice: options.onUserNotice,
            onClearChat: options.onClearChat,
            onAuthFailed: options.onAuthFailed,
            onConnected: options.onConnected,
            onDisconnected: options.onDisconnected,
            WebSocket: (typeof WebSocket !== 'undefined' ? WebSocket : null)
        });
    }
}

// Helper to ensure token is just the string, without "oauth:" prefix
const cleanToken = (token: string): string => {
    if (!token) return '';
    return token.replace(/^oauth:/i, '').trim();
};

export const getTwitchAuthUrl = (clientId: string, redirectUri: string, readOnly = false) => {
  const scopesList = readOnly 
      ? 'chat:read user:read:email'
      : 'chat:read chat:edit user:read:email clips:edit channel:bot'; // Added channel:bot
      
  const scopes = encodeURIComponent(scopesList);
  const cleanUri = redirectUri.split('#')[0].split('?')[0].trim();
  const encodedUri = encodeURIComponent(cleanUri);
  return `https://id.twitch.tv/oauth2/authorize?client_id=${clientId}&redirect_uri=${encodedUri}&response_type=token&scope=${scopes}`;
};

export const fetchTwitchUserProfile = async (token: string, clientId: string) => {
  try {
    const response = await fetch('https://api.twitch.tv/helix/users', {
      headers: {
        'Authorization': `Bearer ${cleanToken(token)}`,
        'Client-Id': clientId
      }
    });

    if (response.status === 401) {
        const body = await response.json().catch(() => ({ message: "UNAUTHORIZED" }));
        throw new Error(body.message || "UNAUTHORIZED");
    }

    const data = await response.json();
    if (data.data && data.data[0]) {
      const user = data.data[0];
      return {
        id: user.id,
        username: user.login,
        displayName: user.display_name,
        badges: {}, 
        profileImageUrl: user.profile_image_url
      };
    }
    return null;
  } catch (error: any) {
    if (error.message && (error.message === "UNAUTHORIZED" || error.message.includes("match"))) throw error;
    console.error('Twitch Profile Fetch Error:', error);
    return null;
  }
};

export const fetchTwitchUsers = async (token: string, clientId: string, logins: string[]): Promise<any[]> => {
    if (logins.length === 0) return [];
    try {
        const query = logins.map(l => `login=${encodeURIComponent(l)}`).join('&');
        const response = await fetch(`https://api.twitch.tv/helix/users?${query}`, {
            headers: {
                'Authorization': `Bearer ${cleanToken(token)}`,
                'Client-Id': clientId
            }
        });

        if (response.status === 401) {
            const body = await response.json().catch(() => ({ message: "UNAUTHORIZED" }));
            throw new Error(body.message || "UNAUTHORIZED");
        }

        const data = await response.json();
        return data.data || [];
    } catch (error: any) {
        if (error.message && (error.message === "UNAUTHORIZED" || error.message.includes("match"))) throw error;
        console.error('Twitch Users Fetch Error:', error);
        return [];
    }
};

export const fetchTwitchBadges = async (token: string, clientId: string, broadcasterId?: string): Promise<Record<string, string>> => {
    const map: Record<string, string> = {};
    const headers = { 'Authorization': `Bearer ${cleanToken(token)}`, 'Client-Id': clientId };

    try {
        const url = broadcasterId 
          ? `https://api.twitch.tv/helix/chat/badges?broadcaster_id=${broadcasterId}`
          : 'https://api.twitch.tv/helix/chat/badges/global';
        
        const res = await fetch(url, { headers });
        if (res.status === 401) {
            const body = await res.json().catch(() => ({ message: "UNAUTHORIZED" }));
            throw new Error(body.message || "UNAUTHORIZED");
        }

        const data = await res.json();
        
        if (data.data) {
            data.data.forEach((set: any) => {
                set.versions.forEach((ver: any) => {
                    map[`${set.set_id}/${ver.id}`] = ver.image_url_1x;
                });
            });
        }
    } catch (e: any) {
        if (e.message && (e.message === "UNAUTHORIZED" || e.message.includes("match"))) throw e;
        console.warn(`[Twitch] Failed to fetch badges (Broadcaster: ${broadcasterId || 'Global'}).`, e);
    }
    return map;
};

export const fetchChannelInfo = async (token: string, clientId: string, broadcasterId: string): Promise<{ game_name: string; title: string; broadcaster_name: string; description: string } | null> => {
    try {
        const headers = { 'Authorization': `Bearer ${cleanToken(token)}`, 'Client-Id': clientId };
        const [channelRes, userRes] = await Promise.all([
            fetch(`https://api.twitch.tv/helix/channels?broadcaster_id=${broadcasterId}`, { headers }),
            fetch(`https://api.twitch.tv/helix/users?id=${broadcasterId}`, { headers })
        ]);

        if (channelRes.status === 401 || userRes.status === 401) {
             const body = await channelRes.json().catch(() => ({ message: "UNAUTHORIZED" }));
             throw new Error(body.message || "UNAUTHORIZED");
        }

        const channelData = await channelRes.json();
        const userData = await userRes.json();

        if (channelData.data && channelData.data[0]) {
            const ch = channelData.data[0];
            const u = (userData.data && userData.data[0]) ? userData.data[0] : {};
            
            return {
                game_name: ch.game_name,
                title: ch.title,
                broadcaster_name: ch.broadcaster_name,
                description: u.description || ''
            };
        }
        return null;
    } catch (error: any) {
        if (error.message && (error.message === "UNAUTHORIZED" || error.message.includes("match"))) throw error;
        console.error('Twitch Channel Info Fetch Error:', error);
        return null;
    }
};

export const fetchLiveStreams = async (token: string, clientId: string, userLogins: string[]): Promise<Set<string>> => {
    if (userLogins.length === 0) return new Set();
    const liveSet = new Set<string>();
    
    // Ensure token is clean for Bearer Auth
    const safeToken = cleanToken(token);
    
    const chunks = [];
    for (let i = 0; i < userLogins.length; i += 100) {
        chunks.push(userLogins.slice(i, i + 100));
    }

    try {
        await Promise.all(chunks.map(async (chunk) => {
            const query = chunk.map(l => `user_login=${encodeURIComponent(l)}`).join('&');
            const res = await fetch(`https://api.twitch.tv/helix/streams?${query}`, {
                headers: { 'Authorization': `Bearer ${safeToken}`, 'Client-Id': clientId }
            });
            
            if (res.status === 401) {
                const body = await res.json().catch(() => ({ message: "UNAUTHORIZED" }));
                throw new Error(body.message || "UNAUTHORIZED");
            }

            const data = await res.json();
            if (data.data) {
                data.data.forEach((stream: any) => {
                    if (stream.type === 'live') {
                        liveSet.add(stream.user_login.toLowerCase());
                    }
                });
            }
        }));
    } catch (e: any) {
        // Re-throw if critical auth error to be caught by the hook
        if (e.message && (e.message === "UNAUTHORIZED" || e.message.includes("match"))) throw e;
        console.error("[Twitch] Failed to fetch live streams:", e);
    }
    
    return liveSet;
};
