
import { useState, useEffect } from 'react';
import { Command } from '../types';
import { BUILT_IN_COMMANDS } from '../commands';

const STORAGE_PREFIX = 'gemini_bot_cmds_v8_';

export const useCommandState = (activeChannelId: string, provider: any, mode: string) => {
  const [commands, setCommands] = useState<Command[]>([]);

  useEffect(() => {
    // If we are in server mode, commands should be fetched from the bridge, not local storage
    if (mode === 'server') {
        // Clear local state initially to avoid showing wrong data before sync
        setCommands([]); 
        return;
    }

    const storageKey = `${STORAGE_PREFIX}${activeChannelId}`;
    const rawData = localStorage.getItem(storageKey);
    
    if (rawData) {
        try {
            const parsed = JSON.parse(rawData);
            setCommands(parsed);
        } catch(e) {
            setCommands([]);
        }
    } else {
        const defaults = BUILT_IN_COMMANDS.map(def => ({
            ...def,
            provider: provider,
            channelId: activeChannelId,
            staticVariables: { ...def.staticVariables },
            rootAction: JSON.parse(JSON.stringify(def.rootAction)),
            zones: def.zones || [],
            category: def.category || 'General'
        }));
        setCommands(defaults);
    }
  }, [activeChannelId, provider, mode]);

  useEffect(() => { 
      // Only save to local storage if NOT in server mode
      if (mode !== 'server' && commands.length > 0) { 
          localStorage.setItem(`${STORAGE_PREFIX}${activeChannelId}`, JSON.stringify(commands)); 
      } 
  }, [commands, activeChannelId, mode]);

  return { commands, setCommands };
};
