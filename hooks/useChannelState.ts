
import { useState, useEffect } from 'react';
import { Channel } from '../types';

const STORAGE_KEY = 'gemini_bot_channels';
const ACTIVE_ID_KEY = 'gemini_bot_active_id';

const DEFAULT_CHANNELS: Channel[] = [
  { 
      id: 'sim_1', 
      name: 'DevStudio_Mock', 
      provider: 'twitch', 
      currencyName: 'Gemy', 
      currencySymbol: '💎', 
      botClientId: process.env.TWITCH_CLIENT_ID || '', 
      mode: 'testing', 
      color: '#6366f1', 
      textColor: '#ffffff' 
  },
];

export const useChannelState = () => {
  const [channels, setChannels] = useState<Channel[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    let loaded = saved ? JSON.parse(saved) : DEFAULT_CHANNELS;
    
    // Filter out server channels from initial load to prevent stale data
    loaded = loaded.filter((c: Channel) => c.mode !== 'server');
    
    if (loaded.length === 0) loaded = DEFAULT_CHANNELS;

    const envId = process.env.TWITCH_CLIENT_ID;
    if (envId) {
        loaded = loaded.map((c: Channel) => {
            if (c.provider === 'twitch' && !c.botClientId) return { ...c, botClientId: envId };
            return c;
        });
    }
    return loaded;
  });

  const [activeChannelId, setActiveChannelId] = useState<string>(() => 
      localStorage.getItem(ACTIVE_ID_KEY) || (channels[0]?.id || DEFAULT_CHANNELS[0].id)
  );

  useEffect(() => {
      // Only persist non-server channels
      const localChannels = channels.filter(c => c.mode !== 'server');
      localStorage.setItem(STORAGE_KEY, JSON.stringify(localChannels));
  }, [channels]);

  useEffect(() => {
      localStorage.setItem(ACTIVE_ID_KEY, activeChannelId);
  }, [activeChannelId]);

  return { channels, setChannels, activeChannelId, setActiveChannelId };
};
