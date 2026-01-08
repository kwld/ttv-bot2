
import { fetchEmoteMapForUser, fetchGlobalEmotes } from './7tvService';
import { ServerBridge } from './ServerBridge';

export interface Emote {
  name: string;
  provider: 'BTTV' | '7TV' | 'FFZ' | 'Twitch' | 'Kick';
  urls: Record<string, string>;
  isZeroWidth?: boolean;
  id?: string;
  channelId?: string;
  source?: 'Server' | 'API' | 'Cache'; 
  originalSource?: 'S' | 'A'; // S = Server, A = API (Tracked inside Cache)
}

export type EmoteMap = Record<string, Emote>;

const SESSION_CACHE_PREFIX = 'gemini_emote_v2_';
const CACHE_TTL = 60 * 60 * 1000; // 1 Hour

// Helper: Tag emotes with source info for UI
const tagEmotes = (map: EmoteMap, source: 'Server' | 'API' | 'Cache', originalSource?: 'S' | 'A'): EmoteMap => {
    const tagged: EmoteMap = {};
    for (const [key, val] of Object.entries(map)) {
        tagged[key] = { 
            ...val, 
            source,
            originalSource: source === 'Cache' ? (originalSource || 'A') : (source === 'Server' ? 'S' : 'A')
        };
    }
    return tagged;
};

// Generic Fetch Orchestrator
async function resolveEmoteSet(
    key: string, // Cache Key Suffix
    provider: 'BTTV' | '7TV' | 'FFZ',
    scope: 'global' | string, // 'global' or Channel ID
    apiFallback: () => Promise<EmoteMap>,
    forceRefresh: boolean
): Promise<EmoteMap> {
    const cacheKey = `${SESSION_CACHE_PREFIX}${provider}_${scope}`;
    
    // 1. Local Browser Cache (Session Storage)
    if (!forceRefresh) {
        const cachedStr = sessionStorage.getItem(cacheKey);
        if (cachedStr) {
            try {
                const { data, timestamp, origin } = JSON.parse(cachedStr);
                // Check TTL (1 Hour)
                if (Date.now() - timestamp < CACHE_TTL) {
                    // console.log(`[EMOTES] Loaded ${provider} ${scope} from Browser Cache (${origin})`);
                    return tagEmotes(data, 'Cache', origin);
                }
            } catch (e) {
                console.warn("[EMOTES] Cache parse error", e);
            }
        }
    }

    // 2. Server Bridge (Preferred if connected, regardless of channel mode)
    const bridge = ServerBridge.instance;
    if (bridge && bridge.isConnected) {
        // console.log(`[EMOTES] Requesting ${provider} ${scope} via Server Bridge (Force: ${forceRefresh})...`);
        try {
            // Pass force flag to server to bypass its 24h cache if needed
            const serverData = await bridge.requestEmotes(provider, scope, forceRefresh);
            if (serverData && Object.keys(serverData).length > 0) {
                // Save to Session Cache
                sessionStorage.setItem(cacheKey, JSON.stringify({
                    data: serverData,
                    timestamp: Date.now(),
                    origin: 'S' // Source: Server
                }));
                return tagEmotes(serverData, 'Server');
            }
        } catch (e) {
            console.warn(`[EMOTES] Bridge request failed for ${provider}`, e);
        }
    }

    // 3. Direct API Fallback (Last Resort)
    console.log(`[EMOTES] Fetching ${provider} ${scope} via Direct API...`);
    try {
        const apiData = await apiFallback();
        // Save to Session Cache
        sessionStorage.setItem(cacheKey, JSON.stringify({
            data: apiData,
            timestamp: Date.now(),
            origin: 'A' // Source: API
        }));
        return tagEmotes(apiData, 'API');
    } catch (e) {
        console.warn(`[EMOTES] Direct API failed for ${provider}`, e);
        return {};
    }
}

// --- Specific API Implementations ---

const fetchJson = async (url: string) => {
    try {
        const res = await fetch(url);
        if (res.status === 404) return null;
        if (!res.ok) return null;
        return await res.json();
    } catch (e) { return null; }
};

const BTTV_EMOTE_URL = (id: string, size: string) => `https://cdn.betterttv.net/emote/${id}/${size}`;
const ensureHttps = (url: string | undefined): string => {
    if (!url) return '';
    if (url.startsWith('https://')) return url;
    if (url.startsWith('//')) return `https:${url}`;
    return `https://${url}`;
};

// BTTV API Wrappers
const getBttvGlobalAPI = async () => {
    const data = await fetchJson('https://api.betterttv.net/3/cached/emotes/global');
    if (!data) return {};
    return Object.fromEntries(data.map((e: any) => [e.code, {
        name: e.code, provider: 'BTTV', id: e.id, urls: { '1x': BTTV_EMOTE_URL(e.id, '1x'), '2x': BTTV_EMOTE_URL(e.id, '2x'), '3x': BTTV_EMOTE_URL(e.id, '3x') }
    }]));
};

const getBttvChannelAPI = async (channelId: string) => {
    const data = await fetchJson(`https://api.betterttv.net/3/cached/users/twitch/${channelId}`);
    if (!data) return {};
    const allEmotes = [...(data.channelEmotes || []), ...(data.sharedEmotes || [])];
    return Object.fromEntries(allEmotes.map((e: any) => [e.code, {
        name: e.code, provider: 'BTTV', id: e.id, channelId, urls: { '1x': BTTV_EMOTE_URL(e.id, '1x'), '2x': BTTV_EMOTE_URL(e.id, '2x'), '3x': BTTV_EMOTE_URL(e.id, '3x') }
    }]));
};

// 7TV API Wrappers
const get7tvGlobalAPI = async () => {
    try { return await fetchGlobalEmotes() as EmoteMap; } catch { return {}; }
};

const get7tvChannelAPI = async (channelId: string) => {
    try { return await fetchEmoteMapForUser(channelId) as EmoteMap; } catch { return {}; }
};

// FFZ API Wrappers
const getFfzGlobalAPI = async () => {
    const data = await fetchJson('https://api.frankerfacez.com/v1/set/global');
    if (!data || !data.sets) return {};
    const emotes = Object.values(data.sets).flatMap((s: any) => s.emoticons);
    return Object.fromEntries(emotes.map((e: any) => {
        const urls: Record<string, string> = { '1x': ensureHttps(e.urls['1']) };
        if (e.urls['2']) urls['2x'] = ensureHttps(e.urls['2']);
        if (e.urls['4']) urls['4x'] = ensureHttps(e.urls['4']);
        return [e.name, { name: e.name, urls, provider: 'FFZ', id: String(e.id) }];
    }));
};

const getFfzChannelAPI = async (channelId: string) => {
    const data = await fetchJson(`https://api.frankerfacez.com/v1/room/id/${channelId}`);
    if (!data || !data.sets) return {};
    const emotes = Object.values(data.sets).flatMap((s: any) => s.emoticons);
    return Object.fromEntries(emotes.map((e: any) => {
        const urls: Record<string, string> = { '1x': ensureHttps(e.urls['1']) };
        if (e.urls['2']) urls['2x'] = ensureHttps(e.urls['2']);
        if (e.urls['4']) urls['4x'] = ensureHttps(e.urls['4']);
        return [e.name, { name: e.name, urls, provider: 'FFZ', id: String(e.id), channelId }];
    }));
};

// --- Exported Functions ---

export async function getAllGlobalThirdPartyEmotes(forceRefresh = false): Promise<EmoteMap> {
    // console.log(`[EMOTES] Resolving Global Emotes (Refresh: ${forceRefresh})...`);
    
    const [bttv, seventv, ffz] = await Promise.all([
        resolveEmoteSet('global', 'BTTV', 'global', getBttvGlobalAPI, forceRefresh),
        resolveEmoteSet('global', '7TV', 'global', get7tvGlobalAPI, forceRefresh),
        resolveEmoteSet('global', 'FFZ', 'global', getFfzGlobalAPI, forceRefresh)
    ]);

    return { ...bttv, ...seventv, ...ffz };
}

export async function getTwitchChannelThirdPartyEmotes(channelId: string, forceRefresh = false): Promise<EmoteMap> {
    // console.log(`[EMOTES] Resolving Channel ${channelId} Emotes (Refresh: ${forceRefresh})...`);

    const [bttv, seventv, ffz] = await Promise.all([
        resolveEmoteSet(`ch_${channelId}`, 'BTTV', channelId, () => getBttvChannelAPI(channelId), forceRefresh),
        resolveEmoteSet(`ch_${channelId}`, '7TV', channelId, () => get7tvChannelAPI(channelId), forceRefresh),
        resolveEmoteSet(`ch_${channelId}`, 'FFZ', channelId, () => getFfzChannelAPI(channelId), forceRefresh)
    ]);

    return { ...bttv, ...seventv, ...ffz };
}
