
function normalizeUrls(emote: any): Record<string, string> {
  const out: Record<string, string> = {};
  // common shapes: emote.urls = { '1': url } or [['1', url], ['2', url]] or { '1x': url }
  // also support 7TV `host` + `files` array (or nested under `data`)
  const urls = emote.urls || emote.hosting || emote.images || emote.urls_map || (emote.data && emote.data.urls);

  // prefer host/files if present
  const host = emote.host || (emote.data && emote.data.host);
  if (host && host.url && Array.isArray(host.files)) {
    const base = host.url.startsWith('//') ? 'https:' + host.url : (host.url.startsWith('http') ? host.url : 'https://' + host.url.replace(/^\/+/, ''));
    
    // Sort files to prefer WEBP > AVIF > GIF > PNG to ensure best compatibility if duplicates exist
    // Though usually last-write wins in forEach, so we reverse precedence in sort if we want last one to be best?
    // Actually, just filtering supported formats and not using static_name is the key requirement.
    
    host.files.forEach((f: any) => {
      if (!f || !f.name) return;
      
      const format = (f.format || f.name.split('.').pop() || '').toUpperCase();
      if (!['WEBP', 'AVIF', 'GIF', 'PNG'].includes(format)) return;

      const key = f.name.startsWith('1') ? '1x' : (f.name.startsWith('2') ? '2x' : (f.name.startsWith('3') ? '3x' : f.name));
      out[key] = base.replace(/\/$/, '') + '/' + f.name;
    });
  }
  
  if (urls) {
    if (Array.isArray(urls)) {
      urls.forEach((u: any) => {
        if (!u) return;
        if (Array.isArray(u) && u.length >= 2) {
            const k = u[0].toString().endsWith('x') ? u[0] : (u[0] + 'x');
            out[k] = u[1];
        }
      });
    } else if (typeof urls === 'object') {
      Object.entries(urls).forEach(([k, v]) => {
        const key = k.toString().endsWith('x') ? k : (k + 'x');
        out[key] = String(v);
      });
    }
  }

  // If no explicit urls but id exists, build best-effort urls for known providers
  if (Object.keys(out).length === 0) {
    const id = emote.id || (emote.data && emote.data.id);
    const provider = (emote.provider || emote.source || '').toLowerCase();
    if (provider.includes('bttv') || provider.includes('betterttv')) {
      out['1x'] = `https://cdn.betterttv.net/emote/${id}/1x`;
      out['2x'] = `https://cdn.betterttv.net/emote/${id}/2x`;
      out['3x'] = `https://cdn.betterttv.net/emote/${id}/3x`;
    } else {
      // default to 7tv/seventv CDN pattern
      if (id) {
        out['1x'] = `https://cdn.7tv.app/emote/${id}/1x.webp`;
        out['2x'] = `https://cdn.7tv.app/emote/${id}/2x.webp`;
        out['3x'] = `https://cdn.7tv.app/emote/${id}/3x.webp`;
      }
    }
  }

  return out;
}

function detectProvider(emote: any): '7TV' | 'BTTV' | 'FFZ' | 'Twitch' | 'Kick' {
  const p = (emote.provider || emote.source || emote.service || '').toString().toUpperCase();
  if (p) return (p.replace(/^SEVEN/, '7TV') as any);
  // Try to detect from urls
  const urls = emote.urls || emote.images;
  const anyUrl = urls && (Array.isArray(urls) ? (urls[0] && urls[0][1]) : Object.values(urls)[0]);
  if (anyUrl && typeof anyUrl === 'string') {
      if (anyUrl.includes('betterttv')) return 'BTTV';
      if (anyUrl.includes('7tv')) return '7TV';
  }
  return '7TV';
}

function buildIdMap(userData: any) {
  const idMap = new Map();
  // collect emotes in top-level lists
  const collect = (arr: any) => {
    if (!Array.isArray(arr)) return;
    arr.forEach(e => e && e.id && idMap.set(String(e.id), e));
  };
  collect(userData.emotes || userData.assets || userData.channel_emotes);
  // also collect emotes embedded in single `emote_set`
  if (userData.emote_set && Array.isArray(userData.emote_set.emotes)) collect(userData.emote_set.emotes);
  // sets may contain emotes
  const sets = userData.emote_sets || userData.sets || userData['emoteSets'];
  if (sets && typeof sets === 'object') {
    Object.values(sets).forEach((set: any) => collect(set.emotes || set));
  }
  return idMap;
}

function findActiveSet(userData: any) {
  // prefer explicit `emote_set` (single set payload)
  if (userData.emote_set && (Array.isArray(userData.emote_set.emotes) || userData.emote_set.id)) return userData.emote_set;

  // prefer pointer id/field that references collection of sets
  const sets = userData.emote_sets || userData.sets || userData['emoteSets'];
  if (!sets) return null;

  // 1) explicit pointer
  const pointer = userData.emote_set || userData.emote_set_id || userData.active_emote_set || userData.activeSet || userData.emoteSet;
  if (pointer) {
    if (typeof pointer === 'string' || typeof pointer === 'number') return sets[pointer] || null;
    if (typeof pointer === 'object' && pointer.id) return sets[pointer.id] || pointer;
  }

  // 2) look for set with `active` flag
  for (const val of Object.values(sets) as any[]) {
    if (val && (val.active === true || val.isActive === true)) return val;
  }

  // 3) fallback to first set
  const first = Object.values(sets)[0];
  return first || null;
}

export function buildEmoteMap(userData: any, channelId?: string): Record<string, any> {
  const idMap = buildIdMap(userData);
  const activeSet = findActiveSet(userData);
  if (!activeSet) return {};

  const result: Record<string, any> = {};

  // gather emotes array
  const emotes = Array.isArray(activeSet.emotes) ? activeSet.emotes : (Array.isArray(activeSet) ? activeSet : []);

  // support case where set.emotes is a list of ids
  const resolvedEmotes = emotes.map((e: any) => (typeof e === 'string' || typeof e === 'number') ? idMap.get(String(e)) : e).filter(Boolean);

  // also include any overrides mapping name -> id
  const overrides = activeSet.overrides || activeSet.override || activeSet.mappings || {};

  resolvedEmotes.forEach((emote: any) => {
    const meta = (emote && emote.data) ? Object.assign({}, emote.data, emote) : emote;
    const name = meta && (meta.name || meta.tag || meta.display_name);
    if (!name) return;
    const urls = normalizeUrls(emote);
    const provider = detectProvider(emote);
    const flags = meta.flags || meta.attributes || [];
    const isZeroWidth = Boolean((Array.isArray(flags) && (flags as any).includes && flags.includes('zerowidth')) || (meta.modifiers && Array.isArray(meta.modifiers) && meta.modifiers.includes('zerowidth')));

    const entry: any = {
      id: meta.id,
      name,
      provider,
      urls,
      channelId
    };
    if (isZeroWidth) entry.isZeroWidth = true;

    result[name] = entry;

    // aliases
    const aliases = meta.aliases || meta.alias || meta.names || [];
    if (Array.isArray(aliases)) {
      aliases.forEach((a: string) => {
        if (a && a !== name) result[a] = Object.assign({}, entry, { name: a });
      });
    }
  });

  // apply overrides: name -> emoteId
  if (overrides && typeof overrides === 'object') {
    Object.entries(overrides).forEach(([aliasName, target]) => {
      let targetEmote: any = null;
      if (typeof target === 'string' || typeof target === 'number') targetEmote = idMap.get(String(target));
      else if (typeof target === 'object' && (target as any).id) targetEmote = idMap.get(String((target as any).id)) || target;
      if (targetEmote) {
        const urls = normalizeUrls(targetEmote);
        const provider = detectProvider(targetEmote);
        result[aliasName] = { 
            id: targetEmote.id,
            name: aliasName, 
            provider, 
            urls,
            channelId
        };
      }
    });
  }

  return result;
}

export async function fetchUserData(userIdOrUrl: string): Promise<any> {
  const url = userIdOrUrl && (userIdOrUrl.startsWith('http') ? userIdOrUrl : `https://7tv.io/v3/users/twitch/${userIdOrUrl}`);
  if (!url) throw new Error('Missing user id or url');
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
  return res.json();
}

export async function fetchEmoteMapForUser(userIdOrUrl: string) {
  const data = await fetchUserData(userIdOrUrl);
  return buildEmoteMap(data, userIdOrUrl);
}

export async function fetchGlobalEmotes() {
  const res = await fetch('https://7tv.io/v3/emote-sets/global');
  if (!res.ok) throw new Error('Failed to fetch global emotes');
  const data = await res.json();
  // Wrap global set in a structure expected by findActiveSet
  return buildEmoteMap({ emote_set: data }, 'Global');
}
