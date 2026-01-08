
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { EmoteMap, getAllGlobalThirdPartyEmotes, getTwitchChannelThirdPartyEmotes } from '../services/emoteService';
import { fetchTwitchUsers } from '../services/twitchService';
import { Channel } from '../types';

export const useEmoteManager = (activeChannel: Channel, botToken: string | null, globalClientId: string) => {
  const [globalEmotes, setGlobalEmotes] = useState<EmoteMap>({});
  const [channelEmotes, setChannelEmotes] = useState<Record<string, EmoteMap>>({});
  const [emoteRefreshTimers, setEmoteRefreshTimers] = useState<Record<string, number>>({});
  const [isEmotesLoading, setIsEmotesLoading] = useState(false);
  const loadedEmoteChannels = useRef<Set<string>>(new Set());

  // Fetch Global Emotes on Mount
  useEffect(() => {
      getAllGlobalThirdPartyEmotes().then(emotes => {
          setGlobalEmotes(emotes);
      });
  }, []);

  const loadChannelEmotes = useCallback(async (channelId: string, channelName: string, twitchId: string | undefined, forceRefresh = false) => {
      let lookupId = twitchId;
      if ((!lookupId || lookupId.startsWith('sim_') || lookupId.startsWith('ch_')) && botToken && globalClientId) {
          try {
              const users = await fetchTwitchUsers(botToken, globalClientId, [channelName]);
              if (users.length > 0) {
                  lookupId = users[0].id;
              }
          } catch (e) { }
      }
      const effectiveLookup = (lookupId && !lookupId.startsWith('sim_') && !lookupId.startsWith('ch_')) ? lookupId : channelName;

      if (effectiveLookup) {
          try {
              const emotes = await getTwitchChannelThirdPartyEmotes(effectiveLookup, forceRefresh);
              setChannelEmotes(prev => ({ ...prev, [channelId]: emotes }));
          } catch(e) { }
      }
  }, [botToken, globalClientId]);

  const checkAndLoadEmotes = useCallback((channelId: string, channelName: string) => {
      if (!channelId || !channelName) return;
      if (loadedEmoteChannels.current.has(channelId)) return;
      loadedEmoteChannels.current.add(channelId);
      // We need to find the channel object to get twitchId, usually passed in context but here we rely on basic info
      // Ideally this hook should have access to the channel list, but passing ID/Name is often enough
      loadChannelEmotes(channelId, channelName, undefined); 
  }, [loadChannelEmotes]);

  // Load active channel emotes
  useEffect(() => {
      const load = async () => {
          if (!activeChannel || activeChannel.provider !== 'twitch') return;
          if (activeChannel.mode === 'testing') {
              if (activeChannel.id.startsWith('sim_') || activeChannel.name === 'DevStudio_Mock') return; 
          }
          loadedEmoteChannels.current.add(activeChannel.id);
          await loadChannelEmotes(activeChannel.id, activeChannel.name, activeChannel.twitchId);
      };
      load();
  }, [activeChannel.id, activeChannel.name, activeChannel.provider, activeChannel.twitchId, activeChannel.mode, loadChannelEmotes]);

  const handleEmoteRefresh = useCallback(async () => {
      const now = Date.now();
      const lastRefresh = emoteRefreshTimers[activeChannel.id] || 0;
      if (now - lastRefresh < 3600000) return; // 1h cooldown

      setIsEmotesLoading(true);
      setEmoteRefreshTimers(prev => ({ ...prev, [activeChannel.id]: now }));
      
      try {
          await loadChannelEmotes(activeChannel.id, activeChannel.name, activeChannel.twitchId, true);
      } catch (e) {
      } finally {
          setIsEmotesLoading(false);
      }

  }, [activeChannel, emoteRefreshTimers, loadChannelEmotes]);

  const refreshCooldownSeconds = useMemo(() => {
      const last = emoteRefreshTimers[activeChannel.id];
      if (!last) return 0;
      const diff = Date.now() - last;
      if (diff >= 3600000) return 0;
      return Math.ceil((3600000 - diff) / 1000);
  }, [emoteRefreshTimers, activeChannel.id]);

  // Ticker
  useEffect(() => {
      if (Object.keys(emoteRefreshTimers).length === 0) return;
      const interval = setInterval(() => {
          setEmoteRefreshTimers(prev => ({...prev})); 
      }, 1000);
      return () => clearInterval(interval);
  }, [emoteRefreshTimers]);

  return {
      globalEmotes,
      channelEmotes,
      checkAndLoadEmotes,
      handleEmoteRefresh,
      refreshCooldownSeconds,
      isEmotesLoading
  };
};
