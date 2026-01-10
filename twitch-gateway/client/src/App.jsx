
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

const AuthModal = ({ isOpen, onClose }) => {
    const [selectedScopes, setSelectedScopes] = useState([]);

    useEffect(() => {
        if(isOpen) {
            const saved = localStorage.getItem('gateway_scopes');
            if (saved) {
                try {
                    const parsed = JSON.parse(saved);
                    // Ensure valid format and filter out obsolete scopes (e.g. moderator:read:followers)
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
        // STRICT FILTER: Remove any restricted scopes that might have leaked into state
        const safeScopes = selectedScopes.filter(s => s !== 'moderator:read:followers' && s !== 'channel:bot' && s !== 'user:bot');
        
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

const StreamerDashboard = ({ logout }) => {
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

    const handleDeleteAccount = async () => {
        if (!confirm('WARNING: This will remove your account from the bot database and revoke all event subscriptions. The bot will no longer function on your channel. Are you sure?')) return;
        try {
            await fetch('/api/me', { method: 'DELETE' });
            window.location.href = '/'; 
        } catch (e) {
            alert('Failed to delete account');
        }
    };

    if (loading) return <div className="min-h-screen bg-gray-900 flex items-center justify-center text-white">Loading...</div>;
    if (error) return <div className="min-h-screen bg-gray-900 flex items-center justify-center text-red-400">Error: {error}</div>;
    if (!me) return null;

    const grantedScopes = me.scope || [];
    
    return (
        <div className="min-h-screen bg-gray-900 text-white p-4">
            <div className="max-w-3xl mx-auto">
                <header className="flex justify-between items-center border-b border-gray-700 pb-4 mb-6">
                    <h1 className="text-2xl font-bold text-purple-400">Streamer Dashboard</h1>
                    <div className="flex gap-3 items-center">
                        {config?.appUrl && (
                            <a 
                                href={config.appUrl} 
                                target="_blank" 
                                rel="noopener noreferrer" 
                                className="text-sm bg-purple-600 hover:bg-purple-700 text-white px-3 py-1.5 rounded font-bold transition-colors"
                            >
                                Go to App
                            </a>
                        )}
                        <button onClick={logout} className="text-sm text-gray-400 hover:text-white">Logout</button>
                    </div>
                </header>

                <div className="bg-gray-800 rounded-lg p-6 border border-gray-700 shadow-lg mb-8">
                    <div className="flex items-center gap-4 mb-6">
                         {me.avatar ? (
                            <img src={me.avatar} alt={me.login} className="w-16 h-16 rounded-full border-2 border-purple-500" />
                        ) : (
                            <div className="w-16 h-16 rounded-full bg-gray-700 flex items-center justify-center text-2xl font-bold">
                                {me.login.charAt(0)}
                            </div>
                        )}
                        <div>
                            <h2 className="text-xl font-bold">{me.displayName}</h2>
                            <p className="text-gray-400">@{me.login}</p>
                            <p className="text-xs text-gray-500 mt-1">ID: {me.twitchId}</p>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="bg-gray-900 p-4 rounded border border-gray-700">
                             <h3 className="text-sm font-bold text-gray-400 uppercase mb-3">Permissions & Features</h3>
                             
                             <div className="flex flex-wrap gap-1 mb-4">
                                {grantedScopes.map(s => (
                                    <span key={s} className="px-2 py-0.5 bg-green-900/30 text-green-300 text-[10px] rounded border border-green-900">{s.split(':')[0]}</span>
                                ))}
                                {grantedScopes.length === 0 && <span className="text-xs text-gray-500 italic">Basic access only</span>}
                             </div>
                             
                             <div className="flex flex-col gap-2">
                                <button 
                                    onClick={() => setShowAuthModal(true)}
                                    className="text-center px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded text-sm font-medium transition-colors"
                                >
                                    Manage Permissions
                                </button>
                                <button 
                                    onClick={handleDeleteAccount}
                                    className="px-4 py-2 bg-red-900/50 hover:bg-red-900 text-red-200 border border-red-800 rounded text-sm font-medium transition-colors"
                                >
                                    Disconnect & Delete Data
                                </button>
                             </div>
                        </div>
                        <div className="bg-gray-900 p-4 rounded border border-gray-700">
                            <h3 className="text-sm font-bold text-gray-400 uppercase mb-3">Status</h3>
                            <div className="space-y-2 text-sm">
                                <div className="flex justify-between">
                                    <span>Last Auth:</span>
                                    <span className="text-gray-300">{new Date(me.obtainedAt).toLocaleDateString()}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span>Active Subs:</span>
                                    <span className="text-green-400 font-mono">{subs.filter(s => s.status === 'enabled').length}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
                    <div className="p-4 border-b border-gray-700 bg-gray-750">
                        <h3 className="font-bold">Active Webhook Subscriptions</h3>
                    </div>
                    {subs.length === 0 ? (
                        <div className="p-8 text-center text-gray-500">No subscriptions found. Try refreshing permissions.</div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm text-left text-gray-400">
                                <thead className="bg-gray-900 text-xs uppercase">
                                    <tr>
                                        <th className="px-4 py-3">Type</th>
                                        <th className="px-4 py-3">Status</th>
                                        <th className="px-4 py-3">Cost</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {subs.map(sub => (
                                        <tr key={sub.id} className="border-b border-gray-700 last:border-0 hover:bg-gray-750">
                                            <td className="px-4 py-3 text-white">
                                                {sub.type} <span className="text-xs text-gray-500">v{sub.version}</span>
                                            </td>
                                            <td className="px-4 py-3">
                                                <span className={`px-2 py-0.5 rounded text-xs ${
                                                    sub.status === 'enabled' 
                                                        ? 'bg-green-900 text-green-300' 
                                                        : (sub.status === 'webhook_callback_verification_pending' ? 'bg-blue-900 text-blue-300' : 'bg-yellow-900 text-yellow-300')
                                                }`}>
                                                    {sub.status.replace(/_/g, ' ')}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 font-mono">{sub.cost}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </div>

            <AuthModal 
                isOpen={showAuthModal} 
                onClose={() => setShowAuthModal(false)}
            />
        </div>
    );
};

const ProfileHoverCard = ({ anchorRect, streamer }) => {
    const elRef = useRef(null);
    const [style, setStyle] = useState({ opacity: 0 });

    useLayoutEffect(() => {
        if (!anchorRect || !elRef.current) return;

        const { width, height } = elRef.current.getBoundingClientRect();
        const padding = 10;
        
        let left = anchorRect.right + padding;
        let top = anchorRect.top;

        if (left + width > window.innerWidth) {
            left = anchorRect.left - width - padding;
        }
        
        if (left < 0) left = 10;

        if (top + height > window.innerHeight) {
            top = window.innerHeight - height - padding;
        }
        
        if (top < 0) top = 10;

        setStyle({
            position: 'fixed',
            left,
            top,
            opacity: 1,
            zIndex: 9999
        });
    }, [anchorRect]);

    return createPortal(
        <div 
            ref={elRef}
            style={style}
            className="w-72 bg-gray-900 border border-gray-600 rounded-lg shadow-2xl p-4 pointer-events-none transition-opacity duration-200"
        >
            <div className="flex items-center gap-3 mb-3">
                {streamer.avatar ? (
                    <img src={streamer.avatar} alt={streamer.login} className="w-12 h-12 rounded-full border-2 border-purple-500" />
                ) : (
                    <div className="w-12 h-12 rounded-full bg-gray-700 flex items-center justify-center text-xl font-bold">
                        {(streamer.displayName || streamer.login || '?').charAt(0)}
                    </div>
                )}
                <div>
                    <div className="font-bold text-white text-lg leading-tight">{streamer.displayName || streamer.login}</div>
                    <div className="text-gray-400 text-xs">@{streamer.login}</div>
                </div>
            </div>
            <div className="space-y-1 text-xs text-gray-300">
                    <div className="flex justify-between">
                    <span>ID:</span>
                    <span className="font-mono text-gray-500">{streamer.twitchId}</span>
                    </div>
                    {streamer.obtainedAt && (
                        <div className="flex justify-between">
                        <span>Auth:</span>
                        <span>{new Date(streamer.obtainedAt).toLocaleDateString()}</span>
                        </div>
                    )}
                    {streamer.scope && (
                    <div className="mt-2 pt-2 border-t border-gray-700">
                        <div className="text-gray-500 mb-1">Active Scopes:</div>
                        <div className="flex flex-wrap gap-1">
                            {streamer.scope.map(s => (
                                <span key={s} className="px-1.5 py-0.5 bg-gray-800 rounded text-[10px] text-gray-400 border border-gray-700">{s.split(':')[0]}:{s.split(':')[2] || s.split(':')[1]}</span>
                            ))}
                        </div>
                    </div>
                    )}
            </div>
        </div>,
        document.body
    );
};

const SubscriptionsTable = ({ subscriptions, streamers, userInfo }) => {
    const totalCost = subscriptions.reduce((sum, sub) => sum + (sub.cost || 0), 0);
    const maxCost = 10000;
    const usagePercent = (totalCost / maxCost) * 100;

    const [hoverTarget, setHoverTarget] = useState(null); 

    const groupedSubs = useMemo(() => {
        const groups = {};
        
        subscriptions.forEach(sub => {
            const userId = sub.condition.broadcaster_user_id || 'app';
            if (!groups[userId]) {
                let streamerData = streamers.find(s => s.twitchId === userId);
                
                // Fallback to hydrated user info if missing in streamers list
                if (!streamerData && userInfo && userInfo[userId]) {
                    streamerData = userInfo[userId];
                }

                groups[userId] = {
                    userId,
                    streamer: streamerData,
                    subs: [],
                    totalCost: 0
                };
            }
            groups[userId].subs.push(sub);
            groups[userId].totalCost += sub.cost;
        });

        // Also add streamers who might not have subscriptions yet (rare)
        streamers.forEach(s => {
            if (!groups[s.twitchId]) {
                groups[s.twitchId] = {
                    userId: s.twitchId,
                    streamer: s,
                    subs: [],
                    totalCost: 0
                };
            }
        });

        return Object.values(groups).sort((a, b) => {
            if (a.streamer && !b.streamer) return -1;
            if (!a.streamer && b.streamer) return 1;
            return 0;
        });
    }, [subscriptions, streamers, userInfo]);

    const handleMouseEnter = (e, streamer) => {
        if (!streamer) return;
        setHoverTarget({
            rect: e.currentTarget.getBoundingClientRect(),
            streamer
        });
    };

    const handleMouseLeave = () => {
        setHoverTarget(null);
    };

    return (
        <div className="bg-gray-800 rounded-lg shadow-lg border border-gray-700">
            <div className="p-4 bg-gray-800 border-b border-gray-700 rounded-t-lg flex justify-between items-center">
                <h3 className="font-bold text-gray-200">EventSub Subscriptions (Grouped)</h3>
                <div className="text-right text-sm">
                    <span className="text-gray-400 mr-2">Cost:</span>
                    <span className={`font-mono font-bold ${usagePercent > 80 ? 'text-red-400' : 'text-green-400'}`}>
                        {totalCost} / {maxCost}
                    </span>
                </div>
            </div>
            <div className="overflow-x-auto rounded-b-lg">
                <table className="w-full text-sm text-left text-gray-400">
                    <thead className="text-xs text-gray-300 uppercase bg-gray-750 border-b border-gray-700">
                        <tr>
                            <th className="px-4 py-3">Broadcaster</th>
                            <th className="px-4 py-3 w-1/2">Subscriptions</th>
                            <th className="px-4 py-3">Status</th>
                            <th className="px-4 py-3">Total Cost</th>
                        </tr>
                    </thead>
                    <tbody>
                        {groupedSubs.length === 0 ? (
                            <tr><td colSpan="4" className="px-4 py-4 text-center">No subscriptions active.</td></tr>
                        ) : (
                            groupedSubs.map(group => (
                                <tr key={group.userId} className="border-b border-gray-700 hover:bg-gray-750 last:border-0">
                                    <td className="px-4 py-3">
                                        {group.streamer ? (
                                            <div 
                                                className="flex items-center gap-2 cursor-help w-max"
                                                onMouseEnter={(e) => handleMouseEnter(e, group.streamer)}
                                                onMouseLeave={handleMouseLeave}
                                            >
                                                {group.streamer.avatar ? (
                                                     <img src={group.streamer.avatar} alt="" className="w-6 h-6 rounded-full" />
                                                ) : (
                                                     <div className="w-6 h-6 rounded-full bg-gray-600 flex items-center justify-center text-[10px] text-white">
                                                         {(group.streamer.displayName || group.streamer.login || '?').charAt(0)}
                                                     </div>
                                                )}
                                                <span className="font-medium text-purple-400 hover:text-purple-300 transition-colors">
                                                    {group.streamer.displayName || group.streamer.login}
                                                </span>
                                            </div>
                                        ) : (
                                            <span className="font-mono text-xs text-gray-500">
                                                {group.userId === 'app' ? 'App Level' : group.userId}
                                            </span>
                                        )}
                                    </td>
                                    <td className="px-4 py-3">
                                        <div className="flex flex-wrap gap-1.5">
                                            {group.subs.length > 0 ? group.subs.map(sub => (
                                                <span 
                                                    key={sub.id} 
                                                    title={`ID: ${sub.id}\nStatus: ${sub.status}`}
                                                    className={`px-2 py-0.5 rounded text-[10px] border ${
                                                        sub.status === 'enabled' 
                                                            ? 'bg-green-900/30 text-green-300 border-green-900' 
                                                            : 'bg-red-900/30 text-red-300 border-red-900'
                                                    }`}
                                                >
                                                    {sub.type.replace('channel.', '').replace('stream.', '')}
                                                </span>
                                            )) : (
                                                <span className="text-xs text-gray-600 italic">No active subscriptions</span>
                                            )}
                                        </div>
                                    </td>
                                    <td className="px-4 py-3">
                                        {group.subs.some(s => s.status !== 'enabled' && s.status !== 'webhook_callback_verification_pending') ? (
                                             <span className="text-yellow-400 text-xs">Issues Detected</span>
                                        ) : group.subs.length > 0 ? (
                                            <span className="text-green-400 text-xs">Healthy</span>
                                        ) : (
                                            <span className="text-gray-600 text-xs">-</span>
                                        )}
                                    </td>
                                    <td className="px-4 py-3 font-mono">
                                        {group.totalCost}
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
            
            {hoverTarget && (
                <ProfileHoverCard 
                    anchorRect={hoverTarget.rect} 
                    streamer={hoverTarget.streamer} 
                />
            )}
        </div>
    );
};

const ActiveConnectionsPanel = ({ status }) => {
    const channels = status?.channels || [];
    const connected = status?.ircConnected;

    return (
        <div className="bg-gray-800 rounded-lg shadow-lg border border-gray-700 mb-8">
            <div className="p-4 bg-gray-800 border-b border-gray-700 rounded-t-lg flex justify-between items-center">
                <h3 className="font-bold text-gray-200 flex items-center gap-2">
                    Active Chat Connections
                    <span className={`w-2 h-2 rounded-full ${connected ? 'bg-green-500' : 'bg-red-500'}`}></span>
                </h3>
                <div className="text-sm text-gray-400">
                    Count: {channels.length}
                </div>
            </div>
            <div className="p-4">
                {channels.length === 0 ? (
                    <div className="text-gray-500 text-sm italic">No active channels connected.</div>
                ) : (
                    <div className="flex flex-wrap gap-2">
                        {channels.map(channel => (
                            <span key={channel} className="px-3 py-1 bg-gray-750 text-gray-300 rounded border border-gray-600 text-sm flex items-center gap-2">
                                <span className="w-1.5 h-1.5 rounded-full bg-green-500"></span>
                                {channel}
                            </span>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

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
  const [userInfo, setUserInfo] = useState({}); // New State
  const [bot, setBot] = useState(null);
  const [status, setStatus] = useState(null); // Gateway Status (IRC + Channels)
  const [loading, setLoading] = useState(true);

  // Modal State
  const [isAuthModalOpen, setAuthModalOpen] = useState(false);

  const checkAuth = async () => {
    try {
        const res = await fetch('/api/check-auth');
        const data = await res.json();
        setAuthStatus(data);
        
        const params = new URLSearchParams(window.location.search);
        const requestedView = params.get('view');

        if (data.isAdmin) {
             setCurrentView('admin');
        } else if (data.isStreamer) {
             setCurrentView('streamer');
        } else {
             setCurrentView('login');
        }

        if (requestedView === 'streamer' && data.isStreamer) {
             setCurrentView('streamer');
        }

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
      const [botRes, streamersRes, subsRes, statusRes] = await Promise.all([
        fetch('/api/bot'),
        fetch('/api/streamers'),
        fetch('/api/subscriptions'),
        fetch('/api/status')
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
      
      setBot(botData);
      setStreamers(streamersData);
      // Support old and new format for subscriptions response
      if (subsData.data) {
          setSubscriptions(subsData.data);
          setUserInfo(subsData.userInfo || {});
      } else {
          setSubscriptions(subsData);
          setUserInfo({});
      }
      setStatus(statusData);
    } catch (error) {
      console.error("Failed to fetch data", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    checkAuth();
    
    // Check for auto-open query param
    const params = new URLSearchParams(window.location.search);
    if (params.get('connect') === 'true') {
        setAuthModalOpen(true);
        // Clean URL
        const url = new URL(window.location);
        url.searchParams.delete('connect');
        window.history.replaceState({}, '', url);
    }
  }, []);

  useEffect(() => {
    if(currentView === 'admin') {
        fetchData();
        const interval = setInterval(fetchData, 15000);
        return () => clearInterval(interval);
    }
  }, [currentView]);

  const logout = async () => {
      await fetch('/api/logout', { method: 'POST' });
      setAuthStatus({ authenticated: false, isAdmin: false, isStreamer: false });
      setCurrentView('login');
      window.history.replaceState({}, '', '/');
  };

  const deleteStreamer = async (id) => {
    if(!confirm('Are you sure you want to revoke access?')) return;
    await fetch(`/api/streamers/${id}`, { method: 'DELETE' });
    fetchData();
  };

  const refreshStreamerToken = async (id) => {
    try {
        const res = await fetch(`/api/streamers/${id}/refresh`, { method: 'POST' });
        if(res.ok) {
            alert('Token refreshed successfully!');
            fetchData();
        } else {
            alert('Failed to refresh token.');
        }
    } catch (e) {
        console.error(e);
        alert('Error refreshing token.');
    }
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

  const openAddStreamer = () => {
      setAuthModalOpen(true);
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
                  <div className="max-w-5xl mx-auto">
                    <header className="mb-10 flex justify-between items-center border-b border-gray-700 pb-4">
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

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
                        <section>
                        <h2 className="text-xl font-semibold mb-4 text-gray-200">Bot Configuration</h2>
                        <div className="bg-gray-800 rounded-lg p-6 shadow-lg border border-gray-700">
                            {bot ? (
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
                                    <button onClick={openAddStreamer} className="px-3 py-1 bg-purple-600 hover:bg-purple-700 rounded text-xs font-medium transition-colors">
                                    + Add
                                    </button>
                                </div>
                            </div>
                            <div className="bg-gray-800 rounded-lg border border-gray-700 p-4 min-h-[140px] max-h-[300px] overflow-y-auto">
                                {streamers.length === 0 ? (
                                     <div className="text-center text-gray-500 py-8">No streamers connected.</div>
                                ) : (
                                    <ul className="space-y-3">
                                        {streamers.map(s => {
                                            const missing = getMissingScopes(s.scope);
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
                                                        {missing.length > 0 && (
                                                            <div className="absolute -top-1 -right-1 w-3 h-3 bg-orange-500 rounded-full border border-gray-800" title="Missing Scopes"></div>
                                                        )}
                                                    </div>
                                                    <div className="leading-tight">
                                                        <div className="font-bold text-sm flex items-center gap-2">
                                                            {s.displayName || s.login}
                                                            {missing.length > 0 && (
                                                                <span className="text-[10px] bg-orange-900/50 text-orange-200 px-1 rounded border border-orange-800">New Scopes Avail</span>
                                                            )}
                                                        </div>
                                                        <div className="text-[10px] text-gray-500">{s.twitchId}</div>
                                                    </div>
                                                </div>
                                                <div className="flex gap-2">
                                                    <button onClick={() => refreshStreamerToken(s.twitchId)} className="text-blue-400 hover:text-blue-300 text-xs">Ref</button>
                                                    <button onClick={() => openAddStreamer()} className="text-green-400 hover:text-green-300 text-xs">Re-Auth</button>
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
                  </div>
                </div>
            )}
         </>
       )}

      <AuthModal 
        isOpen={isAuthModalOpen} 
        onClose={() => setAuthModalOpen(false)}
      />
    </>
  );
};

export default App;
