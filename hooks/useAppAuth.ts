
import { useState, useEffect } from 'react';
import { User } from '../types';
import { fetchTwitchUserProfile } from '../services/twitchService';
import { MOCK_USERS } from '../mockUsers';

export const useAppAuth = (activeChannelMode: string) => {
  const [botToken, setBotToken] = useState<string | null>(() => localStorage.getItem('gemini_bot_token'));
  const [serverUrl, setServerUrl] = useState(() => localStorage.getItem('GEMINI_SERVER_URL') || 'http://localhost:3001');
  const [serverToken, setServerToken] = useState(() => localStorage.getItem('gemini_server_token'));
  const [globalClientId, setGlobalClientId] = useState(() => localStorage.getItem('gemini_bot_global_client_id') || '');
  const [geminiApiKey, setGeminiApiKey] = useState(() => localStorage.getItem('gemini_bot_gemini_api_key') || '');
  const [isChatEnabled, setIsChatEnabled] = useState(() => localStorage.getItem('gemini_bot_auto_chat_login') !== 'false');
  const [isReadOnly, setIsReadOnly] = useState(() => localStorage.getItem('gemini_bot_readonly') === 'true');
  
  const [authenticatedUser, setAuthenticatedUser] = useState<User | null>(null);
  const [selectedUser, setSelectedUser] = useState<User>(MOCK_USERS[0]);
  const [showMockUsers, setShowMockUsers] = useState(true);

  // Persist Global Settings
  useEffect(() => { localStorage.setItem('gemini_bot_global_client_id', globalClientId); }, [globalClientId]);
  useEffect(() => { localStorage.setItem('gemini_bot_gemini_api_key', geminiApiKey); }, [geminiApiKey]);
  useEffect(() => { localStorage.setItem('GEMINI_SERVER_URL', serverUrl); }, [serverUrl]);

  // Auth Hash Parser
  useEffect(() => {
      const hash = window.location.hash;
      if (hash && (hash.includes('access_token') || hash.includes('server_token'))) {
          const params = new URLSearchParams(hash.replace('#', ''));
          const accessToken = params.get('access_token');
          const sToken = params.get('server_token');
          const sUrl = params.get('server_url');

          const shouldAutoLogin = localStorage.getItem('gemini_bot_auto_chat_login') !== 'false';

          if (accessToken && shouldAutoLogin) {
              setBotToken(accessToken);
              localStorage.setItem('gemini_bot_token', accessToken);
          }
          
          if (sToken) {
              setServerToken(sToken);
              localStorage.setItem('gemini_server_token', sToken);
          }

          if (sUrl) {
              const url = decodeURIComponent(sUrl);
              setServerUrl(url);
              // Already handled by the new useEffect, but keeping for immediate sync if needed
              localStorage.setItem('GEMINI_SERVER_URL', url);
          }

          if (window.location.pathname.includes('/auth/callback')) {
              window.history.replaceState(null, '', '/');
          } else {
              window.history.replaceState(null, '', ' ');
          }
      }
  }, []);

  // Client-side User Resolution
  useEffect(() => {
      const resolveUser = async () => {
          if (botToken && !authenticatedUser) {
              const effectiveClientId = globalClientId || process.env.TWITCH_CLIENT_ID || '';
              if (!effectiveClientId) return;

              try {
                  const profile = await fetchTwitchUserProfile(botToken, effectiveClientId);
                  if (profile) {
                      setAuthenticatedUser(profile);
                      if (activeChannelMode !== 'testing') {
                          setSelectedUser(profile);
                          setShowMockUsers(false);
                      }
                  }
              } catch (e) {
                  console.error("Failed to resolve Twitch profile:", e);
              }
          }
      };
      resolveUser();
  }, [botToken, globalClientId, authenticatedUser, activeChannelMode]);

  // Watch storage for changes to Chat Enabled preference
  useEffect(() => {
      const interval = setInterval(() => {
          const stored = localStorage.getItem('gemini_bot_auto_chat_login') !== 'false';
          if (stored !== isChatEnabled) setIsChatEnabled(stored);
      }, 1000);
      return () => clearInterval(interval);
  }, [isChatEnabled]);

  return {
      botToken, setBotToken,
      serverUrl, setServerUrl,
      serverToken, setServerToken,
      globalClientId, setGlobalClientId,
      geminiApiKey, setGeminiApiKey,
      isChatEnabled, setIsChatEnabled,
      isReadOnly, setIsReadOnly,
      authenticatedUser, setAuthenticatedUser,
      selectedUser, setSelectedUser,
      showMockUsers, setShowMockUsers
  };
};
