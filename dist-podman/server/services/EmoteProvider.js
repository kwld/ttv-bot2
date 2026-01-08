
// Server-side adaptation of frontend emote logic

const fetchJson = async (url) => {
    try {
        const res = await fetch(url);
        if (res.status === 404) return null;
        if (!res.ok) {
            console.warn(`[EmoteProvider] Fetch failed for ${url}: ${res.status}`);
            return null;
        }
        return await res.json();
    } catch (e) {
        console.warn(`[EmoteProvider] Fetch failed for ${url}: ${e.message}`);
        return null;
    }
};

const ensureHttps = (url) => {
    if (!url) return '';
    if (url.startsWith('https://')) return url;
    if (url.startsWith('//')) return `https:${url}`;
    return `https://${url}`;
};

// --- BTTV Logic ---
const BTTV_EMOTE_URL = (id, size) => `https://cdn.betterttv.net/emote/${id}/${size}`;

const normalizeBttv = (data, channelId) => {
    if (!data) return {};
    const list = Array.isArray(data) ? data : [...(data.channelEmotes || []), ...(data.sharedEmotes || [])];
    return Object.fromEntries(list.map((e) => [e.code, {
        name: e.code, 
        provider: 'BTTV', 
        id: e.id, 
        channelId: channelId,
        urls: { 
            '1x': BTTV_EMOTE_URL(e.id, '1x'), 
            '2x': BTTV_EMOTE_URL(e.id, '2x'), 
            '3x': BTTV_EMOTE_URL(e.id, '3x') 
        }
    }]));
};

// --- FFZ Logic ---
const normalizeFfz = (data, channelId) => {
    if (!data || !data.sets) return {};
    const emotes = Object.values(data.sets).flatMap((s) => s.emoticons);
    return Object.fromEntries(emotes.map((e) => {
        const urls = { '1x': ensureHttps(e.urls['1']) };
        if (e.urls['2']) urls['2x'] = ensureHttps(e.urls['2']);
        if (e.urls['4']) urls['4x'] = ensureHttps(e.urls['4']);
        return [e.name, { name: e.name, urls, provider: 'FFZ', id: String(e.id), channelId }];
    }));
};

// --- 7TV Logic (Ported from 7tvService.tsx) ---
function normalize7tvUrls(emote) {
    const out = {};
    const host = emote.host || (emote.data && emote.data.host);
    if (host && host.url && Array.isArray(host.files)) {
        const base = host.url.startsWith('//') ? 'https:' + host.url : (host.url.startsWith('http') ? host.url : 'https://' + host.url.replace(/^\/+/, ''));
        host.files.forEach((f) => {
            if (!f || !f.name) return;
            const format = (f.format || f.name.split('.').pop() || '').toUpperCase();
            if (!['WEBP', 'AVIF', 'GIF', 'PNG'].includes(format)) return;
            const key = f.name.startsWith('1') ? '1x' : (f.name.startsWith('2') ? '2x' : (f.name.startsWith('3') ? '3x' : f.name));
            out[key] = base.replace(/\/$/, '') + '/' + f.name;
        });
    } else {
        // Fallback or explicit urls
        const urls = emote.urls || emote.hosting || emote.images;
        if(urls && Array.isArray(urls)) {
             urls.forEach(u => {
                 if(Array.isArray(u) && u.length >= 2) out[u[0]+'x'] = u[1];
             });
        }
    }
    return out;
}

function build7tvMap(userData, channelId) {
    const idMap = new Map();
    const collect = (arr) => {
        if (!Array.isArray(arr)) return;
        arr.forEach(e => e && e.id && idMap.set(String(e.id), e));
    };
    
    // Check different 7TV payload structures
    collect(userData.emotes);
    if (userData.emote_set && Array.isArray(userData.emote_set.emotes)) collect(userData.emote_set.emotes);
    
    const sets = userData.emote_sets || userData.sets;
    if (sets && typeof sets === 'object') {
        Object.values(sets).forEach(set => collect(set.emotes || set));
    }

    // Find active set
    let activeSet = userData.emote_set;
    if (!activeSet && sets) {
        // Try to find one marked active or just the first one
        activeSet = Object.values(sets).find(s => s.active) || Object.values(sets)[0];
    }

    if (!activeSet) return {};

    const emotes = Array.isArray(activeSet.emotes) ? activeSet.emotes : [];
    const resolvedEmotes = emotes.map(e => (typeof e === 'string' ? idMap.get(e) : e)).filter(Boolean);
    const result = {};

    resolvedEmotes.forEach(emote => {
        const meta = (emote && emote.data) ? Object.assign({}, emote.data, emote) : emote;
        const name = meta && (meta.name || meta.tag || meta.display_name);
        if (!name) return;
        
        result[name] = {
            id: meta.id,
            name,
            provider: '7TV',
            urls: normalize7tvUrls(emote),
            channelId
        };
    });
    return result;
}

export class EmoteProvider {
    static async fetch(provider, channelId) {
        if (provider === 'BTTV') {
            if (channelId === 'global') {
                const data = await fetchJson('https://api.betterttv.net/3/cached/emotes/global');
                return normalizeBttv(data, undefined);
            } else {
                const data = await fetchJson(`https://api.betterttv.net/3/cached/users/twitch/${channelId}`);
                return normalizeBttv(data, channelId);
            }
        } 
        else if (provider === 'FFZ') {
            if (channelId === 'global') {
                const data = await fetchJson('https://api.frankerfacez.com/v1/set/global');
                return normalizeFfz(data, undefined);
            } else {
                const data = await fetchJson(`https://api.frankerfacez.com/v1/room/id/${channelId}`);
                return normalizeFfz(data, channelId);
            }
        }
        else if (provider === '7TV') {
            if (channelId === 'global') {
                const data = await fetchJson('https://7tv.io/v3/emote-sets/global');
                return build7tvMap({ emote_set: data }, 'Global');
            } else {
                const data = await fetchJson(`https://7tv.io/v3/users/twitch/${channelId}`);
                if (!data) return {};
                return build7tvMap(data, channelId);
            }
        }
        return {};
    }
}
