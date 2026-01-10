
import React, { useEffect, useState, useMemo, useRef, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';

// --- Configuration ---

const SCOPE_DEFINITIONS = [
  { 
    id: 'channel:read:redemptions', 
    label: 'Channel Points', 
    description: 'Read custom and automatic reward redemptions.',
    required: true
  },
  { 
    id: 'bits:read', 
    label: 'Bits', 
    description: 'Read bit cheer events.',
    required: true
  },
  { 
    id: 'channel:read:subscriptions', 
    label: 'Subscriptions', 
    description: 'Read subscription events.',
    required: true
  }
];

const DEFAULT_SCOPES = SCOPE_DEFINITIONS.filter(s => s.required).map(s => s.id);

// --- Components ---

const LogsPanel = ({ logs }) => {
    const [search, setSearch] = useState('');
    const [levelFilter, setLevelFilter] = useState('ALL');
    const [expandedLogId, setExpandedLogId] = useState(null);

    const filteredLogs = useMemo(() => {
        let result = logs || [];
        if (search) {
            const lower = search.toLowerCase();
            result = result.filter(l => 
                l.message.toLowerCase().includes(lower) || 
                l.context.toLowerCase().includes(lower)
            );
        }
        if (levelFilter !== 'ALL') {
            result = result.filter(l => l.level === levelFilter);
        }
        return result;
    }, [logs, search, levelFilter]);

    return (
        <div className="bg-gray-800 rounded-lg shadow-lg border border-gray-700 h-[600px] flex flex-col">
            <div className="p-4 border-b border-gray-700 bg-gray-750 flex justify-between items-center">
                <h3 className="font-bold text-gray-200">System Logs ({filteredLogs.length})</h3>
                <div className="flex gap-2">
                    <input 
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder="Search logs..."
                        className="bg-gray-900 border border-gray-600 rounded px-3 py-1 text-sm text-white focus:outline-none focus:border-purple-500"
                    />
                    <select 
                        value={levelFilter}
                        onChange={e => setLevelFilter(e.target.value)}
                        className="bg-gray-900 border border-gray-600 rounded px-2 py-1 text-sm text-white"
                    >
                        <option value="ALL">All Levels</option>
                        <option value="info">Info</option>
                        <option value="warn">Warn</option>
                        <option value="error">Error</option>
                    </select>
                </div>
            </div>
            <div className="flex-1 overflow-y-auto custom-scrollbar p-0">
                <table className="w-full text-left text-sm text-gray-400">
                    <thead className="text-xs uppercase bg-gray-900 text-gray-500 sticky top-0">
                        <tr>
                            <th className="px-4 py-2 w-32">Time</th>
                            <th className="px-4 py-2 w-20">Level</th>
                            <th className="px-4 py-2 w-32">Context</th>
                            <th className="px-4 py-2">Message</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-700">
                        {filteredLogs.map(log => {
                            const isError = log.level === 'error';
                            const isWarn = log.level === 'warn';
                            const rowClass = isError ? 'bg-red-900/10 hover:bg-red-900/20' : isWarn ? 'bg-yellow-900/10 hover:bg-yellow-900/20' : 'hover:bg-gray-750';
                            const textClass = isError ? 'text-red-400' : isWarn ? 'text-yellow-400' : 'text-gray-300';
                            
                            return (
                                <React.Fragment key={log.id}>
                                    <tr 
                                        className={`cursor-pointer transition-colors ${rowClass}`}
                                        onClick={() => setExpandedLogId(expandedLogId === log.id ? null : log.id)}
                                    >
                                        <td className="px-4 py-2 font-mono text-xs">{new Date(log.timestamp).toLocaleTimeString()}</td>
                                        <td className={`px-4 py-2 font-bold uppercase text-xs ${textClass}`}>{log.level}</td>
                                        <td className="px-4 py-2 font-mono text-xs text-gray-500">{log.context}</td>
                                        <td className={`px-4 py-2 ${textClass} truncate max-w-lg`}>{log.message}</td>
                                    </tr>
                                    {expandedLogId === log.id && (log.stack || log.detail) && (
                                        <tr className="bg-gray-900/50">
                                            <td colSpan="4" className="px-4 py-3">
                                                <div className="bg-black/30 p-3 rounded border border-gray-700 font-mono text-xs text-gray-400 overflow-x-auto">
                                                    {log.detail && <div className="mb-2 whitespace-pre-wrap text-yellow-200">{log.detail}</div>}
                                                    {log.stack && <div className="whitespace-pre-wrap text-red-300">{log.stack}</div>}
                                                </div>
                                            </td>
                                        </tr>
                                    )}
                                </React.Fragment>
                            );
                        })}
                        {filteredLogs.length === 0 && (
                            <tr>
                                <td colSpan="4" className="px-4 py-8 text-center text-gray-600 italic">No logs found.</td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

const AuthModal = ({ isOpen, onClose }) => {
    const [selectedScopes, setSelectedScopes] = useState([]);

    useEffect(() => {
        if(isOpen) {
            const saved = localStorage.getItem('gateway_scopes');
            if (saved) {
                try {
                    const parsed = JSON.parse(saved);
                    // Ensure valid format and filter out obsolete scopes
                    if (Array.isArray(parsed)) {
                        const validIds = new Set(SCOPE_DEFINITIONS.map(s => s.id));
                        const filtered = parsed.filter(id => validIds.has(id));
                        
                        if (filtered.length > 0) {
                            setSelectedScopes(filtered);
                        } else {
                            setSelectedScopes(DEFAULT_SCOPES);
                        }
                    } else {
                        setSelectedScopes(DEFAULT_SCOPES);
                    }
                } catch(e) {
                    setSelectedScopes(DEFAULT_SCOPES);
                }
            } else {
                setSelectedScopes(DEFAULT_SCOPES);
            }
        }
    }, [isOpen]);

    if (!isOpen) return null;

    const toggleScope = (id) => {
        if (selectedScopes.includes(id)) {
            setSelectedScopes(selectedScopes.filter(s => s !== id));
        } else {
            setSelectedScopes([...selectedScopes, id]);
        }
    };

    const handleConnect = () => {
        // STRICT FILTER: Remove extremely sensitive bot scopes
        const safeScopes = selectedScopes.filter(s => s !== 'channel:bot' && s !== 'user:bot' && s !== 'moderator:read:followers');
        
        localStorage.setItem('gateway_scopes', JSON.stringify(safeScopes));
        const scopeString = safeScopes.join(',');
        window.location.href = `/auth/login/streamer?portal=true&scopes=${encodeURIComponent(scopeString)}`;
    };

    return (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
            <div className="bg-gray-800 rounded-lg shadow-2xl border border-gray-700 w-full max-w-lg overflow-hidden">
                <div className="bg-gray-750 p-4 border-b border-gray-700 flex justify-between items-center">
                    <h3 className="text-lg font-bold text-white">Manage Permissions</h3>
                    <button onClick={onClose} className="text-gray-400 hover:text-white">&times;</button>
                </div>
                <div className="p-6">
                    <p className="text-sm text-gray-400 mb-4">
                        Select features to enable. This will redirect you to Twitch for authorization.
                    </p>
                    <div className="space-y-3 max-h-[300px] overflow-y-auto mb-6">
                        {SCOPE_DEFINITIONS.map(scope => (
                            <label key={scope.id} className="flex items-start gap-3 p-2 rounded hover:bg-gray-750 cursor-pointer border border-transparent hover:border-gray-700">
                                <input 
                                    type="checkbox" 
                                    checked={selectedScopes.includes(scope.id)}
                                    onChange={() => toggleScope(scope.id)}
                                    className="mt-1 w-4 h-4 rounded border-gray-600 bg-gray-700 text-purple-600 focus:ring-purple-500 focus:ring-offset-gray-800"
                                />
                                <div>
                                    <div className="flex items-center gap-2">
                                        <span className="font-medium text-gray-200">{scope.label}</span>
                                    </div>
                                    <div className="text-xs text-gray-500">{scope.description}</div>
                                    <div className="text-[10px] font-mono text-gray-600 mt-0.5">{scope.id}</div>
                                </div>
                            </label>
                        ))}
                    </div>
                    <div className="flex justify-end gap-3">
                        <button onClick={onClose} className="px-4 py-2 text-gray-300 hover:text-white text-sm">Cancel</button>
                        <button onClick={handleConnect} className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded font-bold text-sm">
                            Connect & Authorize
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

const Login = ({ onLogin, onOpenStreamerAuth }) => {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password })
      });
      if (res.ok) {
        onLogin();
      } else {
        setError('Invalid password');
      }
    } catch (e) {
      setError('Login failed');
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4 text-white">
      <div className="bg-gray-800 p-8 rounded-lg shadow-xl w-full max-w-md border border-gray-700">
        <h1 className="text-2xl font-bold text-purple-400 mb-6 text-center">Bot Gateway Admin</h1>
        <form onSubmit={handleSubmit} className="space-y-4 mb-6">
          <div>
            <label className="block text-sm text-gray-400 mb-1">Admin Password</label>
            <input 
              type="password" 
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-gray-900 border border-gray-600 rounded p-2 text-white focus:border-purple-500 focus:outline-none"
              placeholder="Enter password..."
            />
          </div>
          {error && <p className="text-red-400 text-sm text-center">{error}</p>}
          <button type="submit" className="w-full bg-purple-600 hover:bg-purple-700 text-white font-bold py-2 px-4 rounded transition-colors">
            Login
          </button>
        </form>
        
        <div className="border-t border-gray-700 pt-6 text-center">
            <p className="text-gray-400 text-sm mb-3">Are you a streamer?</p>
            <button 
                onClick={onOpenStreamerAuth}
                className="inline-block w-full bg-gray-700 hover:bg-gray-600 text-white font-medium py-2 px-4 rounded transition-colors"
            >
                Connect Streamer Account
            </button>
        </div>
      </div>
    </div>
  );
};

// ... StreamerDashboard and other components are similar, omitted for brevity but Log Panel integration is below ...

const StreamerDashboard = ({ logout }) => {
    // ... existing StreamerDashboard logic ...
    const [me, setMe] = useState(null);
    const [subs, setSubs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [config, setConfig] = useState(null); 
    const [showAuthModal, setShowAuthModal] = useState(false);

    const fetchData = async () => {
        setLoading(true);
        try {
            const [meRes, subsRes, configRes] = await Promise.all([
                fetch('/api/me'),
                fetch('/api/me/subscriptions'),
                fetch('/api/config')
            ]);
            
            if (!meRes.ok) {
                logout(); 
                return;
            }

            const meData = await meRes.json();
            const subsData = await subsRes.json();
            const configData = await configRes.json();
            
            setMe(meData);
            setSubs(subsData);
            setConfig(configData);
        } catch (e) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    if (loading) return <div className="min-h-screen bg-gray-900 flex items-center justify-center text-white">Loading...</div>;
    if (error) return <div className="min-h-screen bg-gray-900 flex items-center justify-center text-red-400">Error: {error}</div>;
    if (!me) return null;
    
    // ... render implementation for StreamerDashboard ...
    return <div className="min-h-screen bg-gray-900 text-white p-4">Streamer Dashboard (Simplified for brevity)</div>;
};

// ... ProfileHoverCard, SubscriptionsTable, ActiveConnectionsPanel ...
const ProfileHoverCard = ({ anchorRect, streamer }) => {
    const elRef = useRef(null);
    const [style, setStyle] = useState({ opacity: 0 });

    useLayoutEffect(() => {
        if (!anchorRect || !elRef.current) return;
        const { width, height } = elRef.current.getBoundingClientRect();
        const padding = 10;
        let left = anchorRect.right + padding;
        let top = anchorRect.top;
        if (left + width > window.innerWidth) left = anchorRect.left - width - padding;
        if (left < 0) left = 10;
        if (top + height > window.innerHeight) top = window.innerHeight - height - padding;
        if (top < 0) top = 10;

        setStyle({ position: 'fixed', left, top, opacity: 1, zIndex: 9999 });
    }, [anchorRect]);

    return createPortal(
        <div ref={elRef} style={style} className="w-72 bg-gray-900 border border-gray-600 rounded-lg shadow-2xl p-4 pointer-events-none transition-opacity duration-200">
            <div className="flex items-center gap-3 mb-3">
                <div className="font-bold text-white text-lg leading-tight">{streamer.displayName || streamer.login}</div>
            </div>
            <div className="space-y-1 text-xs text-gray-300">
                <div className="flex justify-between"><span>ID:</span><span className="font-mono text-gray-500">{streamer.twitchId}</span></div>
            </div>
        </div>,
        document.body
    );
};

const SubscriptionsTable = ({ subscriptions, streamers, userInfo }) => {
    return <div className="p-4 text-white">Subscriptions Table Placeholder</div>;
};

const ActiveConnectionsPanel = ({ status }) => {
    const channels = status?.channels || [];
    const connected = status?.ircConnected;
    return (
        <div className="bg-gray-800 rounded-lg shadow-lg border border-gray-700 mb-8">
            <div className="p-4 bg-gray-800 border-b border-gray-700 rounded-t-lg flex justify-between items-center">
                <h3 className="font-bold text-gray-200 flex items-center gap-2">
                    Monitored Channels <span className={`w-2 h-2 rounded-full ${connected ? 'bg-green-500' : 'bg-red-500'}`}></span>
                </h3>
            </div>
            <div className="p-4">
                <div className="flex flex-wrap gap-2">
                    {channels.map(channel => (
                        <span key={channel} className="px-3 py-1 bg-gray-750 text-gray-300 rounded border border-gray-600 text-sm flex items-center gap-2">
                            <span className="w-1.5 h-1.5 rounded-full bg-green-500"></span>{channel}
                        </span>
                    ))}
                </div>
            </div>
        </div>
    );
};

// MAIN APP COMPONENT
const App = () => {
  const [authStatus, setAuthStatus] = useState({ 
      authenticated: false, 
      isAdmin: false, 
      isStreamer: false 
  });
  const [authChecked, setAuthChecked] = useState(false);
  const [currentView, setCurrentView] = useState('login');
  
  const [streamers, setStreamers] = useState([]);
  const [subscriptions, setSubscriptions] = useState([]);
  const [userInfo, setUserInfo] = useState({}); 
  const [bot, setBot] = useState(null);
  const [status, setStatus] = useState(null); 
  const [logs, setLogs] = useState([]); // LOGS STATE
  const [loading, setLoading] = useState(true);

  // Tab State for Admin
  const [adminTab, setAdminTab] = useState('overview'); // 'overview' | 'logs'

  // Modal State
  const [isAuthModalOpen, setAuthModalOpen] = useState(false);
  const [isManualAddOpen, setIsManualAddOpen] = useState(false); 

  const checkAuth = async () => {
    try {
        const res = await fetch('/api/check-auth');
        const data = await res.json();
        setAuthStatus(data);
        const params = new URLSearchParams(window.location.search);
        const requestedView = params.get('view');
        if (data.isAdmin) setCurrentView('admin');
        else if (data.isStreamer) setCurrentView('streamer');
        else setCurrentView('login');
        if (requestedView === 'streamer' && data.isStreamer) setCurrentView('streamer');
    } catch {
        setAuthStatus({ authenticated: false, isAdmin: false, isStreamer: false });
        setCurrentView('login');
    } finally {
        setAuthChecked(true);
    }
  };

  const fetchData = async () => {
    if(currentView !== 'admin') return; 
    setLoading(true);
    try {
      const [botRes, streamersRes, subsRes, statusRes, logsRes] = await Promise.all([
        fetch('/api/bot'),
        fetch('/api/streamers'),
        fetch('/api/subscriptions'),
        fetch('/api/status'),
        fetch('/api/logs') // Fetch logs
      ]);
      
      if(botRes.status === 401) {
          setAuthStatus(prev => ({ ...prev, isAdmin: false }));
          setCurrentView('login');
          return;
      }

      const botData = await botRes.json();
      const streamersData = await streamersRes.json();
      const subsData = await subsRes.json();
      const statusData = await statusRes.json();
      const logsData = await logsRes.json();
      
      setBot(botData);
      setStreamers(streamersData);
      if (subsData.data) {
          setSubscriptions(subsData.data);
          setUserInfo(subsData.userInfo || {});
      } else {
          setSubscriptions(subsData);
          setUserInfo({});
      }
      setStatus(statusData);
      setLogs(logsData);
    } catch (error) {
      console.error("Failed to fetch data", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    checkAuth();
    const params = new URLSearchParams(window.location.search);
    if (params.get('connect') === 'true') {
        setAuthModalOpen(true);
        const url = new URL(window.location);
        url.searchParams.delete('connect');
        window.history.replaceState({}, '', url);
    }
  }, []);

  useEffect(() => {
    if(currentView === 'admin') {
        fetchData();
        const interval = setInterval(fetchData, 5000); // Poll logs/status faster
        return () => clearInterval(interval);
    }
  }, [currentView]);

  const logout = async () => {
      await fetch('/api/logout', { method: 'POST' });
      setAuthStatus({ authenticated: false, isAdmin: false, isStreamer: false });
      setCurrentView('login');
      window.history.replaceState({}, '', '/');
  };
  
  const deleteBot = async () => {
    if(!confirm('Are you sure you want to disconnect and remove the bot account?')) return;
    try {
        await fetch('/api/bot', { method: 'DELETE' });
        fetchData();
    } catch (e) {
        console.error(e);
        alert('Error removing bot.');
    }
  };
  
  const resetBotSubs = async () => {
      if(!confirm('Are you sure you want to reset all bot-related subscriptions?')) return;
      try {
          const res = await fetch('/api/bot/reset-subs', { method: 'POST' });
          if(res.ok) { alert('Subscriptions reset!'); fetchData(); } else { alert('Failed to reset subscriptions.'); }
      } catch (e) { alert('Network Error'); }
  };
  
  const deleteStreamer = async (id) => {
    if(!confirm('Are you sure you want to revoke access?')) return;
    await fetch(`/api/streamers/${id}`, { method: 'DELETE' });
    fetchData();
  };

  const refreshStreamerToken = async (id) => {
    try {
        const res = await fetch(`/api/streamers/${id}/refresh`, { method: 'POST' });
        if(res.ok) { alert('Token refreshed successfully!'); fetchData(); } else { alert('Failed to refresh token.'); }
    } catch (e) { alert('Error refreshing token.'); }
  };

  const openAddStreamer = () => setAuthModalOpen(true);
  
  const handleManualAdd = async (username) => {
      try {
          const res = await fetch('/api/streamers/manual', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ username })
          });
          if (!res.ok) {
              const err = await res.json();
              alert('Error: ' + (err.error || 'Failed to add manual streamer'));
          } else {
              setIsManualAddOpen(false);
              fetchData();
          }
      } catch (e) {
          alert('Network Error');
      }
  };
  
  const getMissingScopes = (currentScopes) => {
      if (!currentScopes) return DEFAULT_SCOPES;
      return DEFAULT_SCOPES.filter(req => !currentScopes.includes(req));
  };

  return (
    <>
       {!authChecked ? (
          <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">Loading...</div>
       ) : (
         <>
            {currentView === 'streamer' && <StreamerDashboard logout={logout} />}
            {currentView === 'login' && <Login onLogin={checkAuth} onOpenStreamerAuth={openAddStreamer} />}
            
            {currentView === 'admin' && (
                <div className="min-h-screen bg-gray-900 text-white p-8">
                  <div className="max-w-6xl mx-auto">
                    <header className="mb-6 flex justify-between items-center border-b border-gray-700 pb-4">
                      <div>
                        <h1 className="text-3xl font-bold text-purple-400">Twitch Bot Gateway</h1>
                        <p className="text-gray-400 text-sm mt-1">Manage connections and EventSub status</p>
                      </div>
                      <div className="text-right flex items-center gap-4">
                         <div className="flex items-center gap-2">
                            <div className={`w-3 h-3 rounded-full ${bot ? 'bg-green-500' : 'bg-red-500'}`}></div>
                            <span className="font-mono text-sm">{bot ? `Bot: ${bot.login}` : 'Bot Offline'}</span>
                         </div>
                         <button onClick={logout} className="text-xs text-gray-400 hover:text-white underline">Logout</button>
                      </div>
                    </header>

                    {/* Tabs Navigation */}
                    <div className="flex gap-4 mb-6 border-b border-gray-700">
                        <button 
                            onClick={() => setAdminTab('overview')} 
                            className={`pb-2 px-4 font-bold text-sm transition-colors border-b-2 ${adminTab === 'overview' ? 'border-purple-500 text-white' : 'border-transparent text-gray-400 hover:text-gray-200'}`}
                        >
                            Overview
                        </button>
                        <button 
                            onClick={() => setAdminTab('logs')} 
                            className={`pb-2 px-4 font-bold text-sm transition-colors border-b-2 ${adminTab === 'logs' ? 'border-purple-500 text-white' : 'border-transparent text-gray-400 hover:text-gray-200'}`}
                        >
                            System Logs
                        </button>
                    </div>

                    {adminTab === 'overview' && (
                        <>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
                                <section>
                                <h2 className="text-xl font-semibold mb-4 text-gray-200">Bot Configuration</h2>
                                <div className="bg-gray-800 rounded-lg p-6 shadow-lg border border-gray-700">
                                    {bot ? (
                                    <div className="flex flex-col gap-4">
                                        <div className="flex items-center justify-between">
                                            <div>
                                            <p className="font-bold text-lg">{bot.login}</p>
                                            <p className="text-xs text-gray-500">ID: {bot.twitchId}</p>
                                            </div>
                                            <div className="flex gap-3">
                                                <button onClick={deleteBot} className="px-4 py-2 bg-red-900/50 hover:bg-red-900 text-red-200 rounded text-sm transition-colors border border-red-800">
                                                    Disconnect
                                                </button>
                                                <a href="/auth/login/bot" className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded text-sm transition-colors">
                                                    Re-Auth
                                                </a>
                                            </div>
                                        </div>
                                        <div className="border-t border-gray-700 pt-3">
                                            <button 
                                                onClick={resetBotSubs}
                                                className="w-full py-1.5 bg-yellow-900/30 hover:bg-yellow-900/50 text-yellow-500 rounded text-xs font-bold uppercase border border-yellow-900/50 transition-colors"
                                            >
                                                <i className="fas fa-sync mr-2"></i> Reset Subs
                                            </button>
                                        </div>
                                    </div>
                                    ) : (
                                    <div className="text-center py-6">
                                        <p className="mb-4 text-gray-400">No bot account connected.</p>
                                        <a href="/auth/login/bot" className="px-6 py-2 bg-purple-600 hover:bg-purple-700 rounded font-medium transition-colors">
                                        Connect Bot Account
                                        </a>
                                    </div>
                                    )}
                                </div>
                                </section>
                                
                                <section>
                                    <div className="flex justify-between items-center mb-4">
                                        <h2 className="text-xl font-semibold text-gray-200">Connected Streamers</h2>
                                        <div className="flex gap-2">
                                            <button onClick={fetchData} className="px-2 py-1 bg-gray-700 hover:bg-gray-600 rounded text-xs transition-colors">
                                                Refresh
                                            </button>
                                            <button onClick={() => setIsManualAddOpen(true)} className="px-2 py-1 bg-blue-600 hover:bg-blue-700 rounded text-xs font-medium transition-colors" title="Add Manually via ID">
                                                + Manual
                                            </button>
                                            <button onClick={openAddStreamer} className="px-3 py-1 bg-purple-600 hover:bg-purple-700 rounded text-xs font-medium transition-colors">
                                            + Auth
                                            </button>
                                        </div>
                                    </div>
                                    <div className="bg-gray-800 rounded-lg border border-gray-700 p-4 min-h-[140px] max-h-[300px] overflow-y-auto custom-scrollbar">
                                        {streamers.length === 0 ? (
                                            <div className="text-center text-gray-500 py-8">No streamers connected.</div>
                                        ) : (
                                            <ul className="space-y-3">
                                                {streamers.map(s => {
                                                    const missing = getMissingScopes(s.scope);
                                                    const isManual = s.isManual;
                                                    
                                                    return (
                                                    <li key={s.twitchId} className="flex justify-between items-center bg-gray-750 p-2 rounded group">
                                                        <div className="flex items-center gap-3">
                                                            <div className="relative">
                                                                <div className="w-8 h-8 bg-purple-900 rounded-full flex items-center justify-center font-bold text-xs">
                                                                {s.avatar ? 
                                                                    <img src={s.avatar} alt={s.login} className="w-full h-full rounded-full" /> : 
                                                                    s.login.charAt(0).toUpperCase()
                                                                }
                                                                </div>
                                                                {missing.length > 0 && !isManual && (
                                                                    <div className="absolute -top-1 -right-1 w-3 h-3 bg-orange-500 rounded-full border border-gray-800" title="Missing Scopes"></div>
                                                                )}
                                                            </div>
                                                            <div className="leading-tight">
                                                                <div className="font-bold text-sm flex items-center gap-2">
                                                                    {s.displayName || s.login}
                                                                    {isManual ? (
                                                                        <span className="text-[9px] bg-blue-900/50 text-blue-200 px-1 rounded border border-blue-800 font-black uppercase">MANUAL</span>
                                                                    ) : (
                                                                        missing.length > 0 && (
                                                                            <span className="text-[10px] bg-orange-900/50 text-orange-200 px-1 rounded border border-orange-800">SCOPE?</span>
                                                                        )
                                                                    )}
                                                                </div>
                                                                <div className="text-[10px] text-gray-500">{s.twitchId}</div>
                                                            </div>
                                                        </div>
                                                        <div className="flex gap-2">
                                                            {!isManual && <button onClick={() => refreshStreamerToken(s.twitchId)} className="text-blue-400 hover:text-blue-300 text-xs">Ref</button>}
                                                            {!isManual && <button onClick={() => openAddStreamer()} className="text-green-400 hover:text-green-300 text-xs">Auth</button>}
                                                            <button onClick={() => deleteStreamer(s.twitchId)} className="text-red-400 hover:text-red-300 text-xs">Del</button>
                                                        </div>
                                                    </li>
                                                )})}
                                            </ul>
                                        )}
                                    </div>
                                </section>
                            </div>

                            <ActiveConnectionsPanel status={status} />

                            <section className="mb-8">
                                <SubscriptionsTable subscriptions={subscriptions} streamers={streamers} userInfo={userInfo} />
                            </section>
                        </>
                    )}

                    {adminTab === 'logs' && (
                        <LogsPanel logs={logs} />
                    )}
                  </div>
                </div>
            )}
         </>
       )}

      <AuthModal 
        isOpen={isAuthModalOpen} 
        onClose={() => setAuthModalOpen(false)}
      />

      {isManualAddOpen && (
          <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
              <div className="bg-gray-800 border border-gray-700 p-6 rounded-lg shadow-xl w-full max-w-sm">
                  <h3 className="text-lg font-bold text-white mb-4">Add Manual Streamer</h3>
                  <p className="text-xs text-gray-400 mb-4">This will add a channel for public event tracking (Online/Offline) and Bot Chat. Redemptions will not work until they authenticate.</p>
                  <form onSubmit={(e) => {
                      e.preventDefault();
                      const val = e.target.elements.username.value;
                      if(val) handleManualAdd(val);
                  }}>
                      <input name="username" className="w-full bg-gray-900 border border-gray-600 rounded p-2 text-white mb-4" placeholder="Twitch Username" autoFocus />
                      <div className="flex justify-end gap-2">
                          <button type="button" onClick={() => setIsManualAddOpen(false)} className="px-3 py-1.5 text-gray-300 hover:text-white">Cancel</button>
                          <button type="submit" className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded font-bold">Add</button>
                      </div>
                  </form>
              </div>
          </div>
      )}
    </>
  );
};

export default App;
