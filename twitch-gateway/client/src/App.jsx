
import React, { useEffect, useState, useMemo, useRef, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';

const SCOPE_DEFINITIONS = [
  { id: 'channel:read:redemptions', label: 'Channel Points', description: 'Read custom and automatic reward redemptions.', required: true },
  { id: 'bits:read', label: 'Bits', description: 'Read bit cheer events.', required: true },
  { id: 'channel:read:subscriptions', label: 'Subscriptions', description: 'Read subscription events.', required: true }
];
const DEFAULT_SCOPES = SCOPE_DEFINITIONS.filter(s => s.required).map(s => s.id);

const AuthModal = ({ isOpen, onClose }) => {
    const [selectedScopes, setSelectedScopes] = useState([]);
    useEffect(() => {
        if(isOpen) {
            const saved = localStorage.getItem('gateway_scopes');
            if (saved) {
                try {
                    const parsed = JSON.parse(saved);
                    if (Array.isArray(parsed)) setSelectedScopes(parsed);
                    else setSelectedScopes(DEFAULT_SCOPES);
                } catch(e) { setSelectedScopes(DEFAULT_SCOPES); }
            } else setSelectedScopes(DEFAULT_SCOPES);
        }
    }, [isOpen]);
    if (!isOpen) return null;
    const toggleScope = (id) => selectedScopes.includes(id) ? setSelectedScopes(selectedScopes.filter(s => s !== id)) : setSelectedScopes([...selectedScopes, id]);
    const handleConnect = () => {
        const safeScopes = selectedScopes.filter(s => s !== 'channel:bot' && s !== 'user:bot' && s !== 'moderator:read:followers');
        localStorage.setItem('gateway_scopes', JSON.stringify(safeScopes));
        window.location.href = `/auth/login/streamer?portal=true&scopes=${encodeURIComponent(safeScopes.join(','))}`;
    };
    return (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
            <div className="bg-gray-800 rounded-lg shadow-2xl border border-gray-700 w-full max-w-lg overflow-hidden">
                <div className="bg-gray-750 p-4 border-b border-gray-700 flex justify-between items-center">
                    <h3 className="text-lg font-bold text-white">Manage Permissions</h3>
                    <button onClick={onClose} className="text-gray-400 hover:text-white">&times;</button>
                </div>
                <div className="p-6">
                    <div className="space-y-3 max-h-[300px] overflow-y-auto mb-6">
                        {SCOPE_DEFINITIONS.map(scope => (
                            <label key={scope.id} className="flex items-start gap-3 p-2 rounded hover:bg-gray-750 cursor-pointer border border-transparent hover:border-gray-700">
                                <input type="checkbox" checked={selectedScopes.includes(scope.id)} onChange={() => toggleScope(scope.id)} className="mt-1 w-4 h-4 rounded border-gray-600 bg-gray-700 text-purple-600" />
                                <div><div className="flex items-center gap-2"><span className="font-medium text-gray-200">{scope.label}</span></div><div className="text-xs text-gray-500">{scope.description}</div></div>
                            </label>
                        ))}
                    </div>
                    <div className="flex justify-end gap-3">
                        <button onClick={onClose} className="px-4 py-2 text-gray-300 hover:text-white text-sm">Cancel</button>
                        <button onClick={handleConnect} className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded font-bold text-sm">Connect</button>
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
    e.preventDefault(); setError('');
    try {
      const res = await fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password }) });
      if (res.ok) onLogin(); else setError('Invalid password');
    } catch (e) { setError('Login failed'); }
  };
  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4 text-white">
      <div className="bg-gray-800 p-8 rounded-lg shadow-xl w-full max-w-md border border-gray-700">
        <h1 className="text-2xl font-bold text-purple-400 mb-6 text-center">Bot Gateway Admin</h1>
        <form onSubmit={handleSubmit} className="space-y-4 mb-6">
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full bg-gray-900 border border-gray-600 rounded p-2 text-white" placeholder="Enter password..." />
          {error && <p className="text-red-400 text-sm text-center">{error}</p>}
          <button type="submit" className="w-full bg-purple-600 hover:bg-purple-700 text-white font-bold py-2 px-4 rounded">Login</button>
        </form>
        <div className="border-t border-gray-700 pt-6 text-center">
            <button onClick={onOpenStreamerAuth} className="inline-block w-full bg-gray-700 hover:bg-gray-600 text-white font-medium py-2 px-4 rounded">Connect Streamer Account</button>
        </div>
      </div>
    </div>
  );
};

const StreamerDashboard = ({ logout }) => {
    const [me, setMe] = useState(null);
    const [subs, setSubs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showAuthModal, setShowAuthModal] = useState(false);

    useEffect(() => {
        const fetchData = async () => {
            setLoading(true);
            try {
                const [meRes, subsRes] = await Promise.all([fetch('/api/me'), fetch('/api/me/subscriptions')]);
                if (!meRes.ok) { logout(); return; }
                setMe(await meRes.json());
                setSubs(await subsRes.json());
            } catch (e) { console.error(e); } finally { setLoading(false); }
        };
        fetchData();
    }, []);

    const handleDeleteAccount = async () => { if (confirm('WARNING: Remove account?')) { await fetch('/api/me', { method: 'DELETE' }); window.location.href = '/'; } };

    if (loading) return <div className="min-h-screen bg-gray-900 flex items-center justify-center text-white">Loading...</div>;
    if (!me) return null;

    return (
        <div className="min-h-screen bg-gray-900 text-white p-4">
            <div className="max-w-3xl mx-auto">
                <header className="flex justify-between items-center border-b border-gray-700 pb-4 mb-6">
                    <h1 className="text-2xl font-bold text-purple-400">Streamer Dashboard</h1>
                    <button onClick={logout} className="text-sm text-gray-400 hover:text-white">Logout</button>
                </header>
                <div className="bg-gray-800 rounded-lg p-6 border border-gray-700 shadow-lg mb-8">
                    <h2 className="text-xl font-bold mb-4">{me.displayName}</h2>
                    <button onClick={handleDeleteAccount} className="px-4 py-2 bg-red-900/50 hover:bg-red-900 text-red-200 border border-red-800 rounded text-sm font-medium">Disconnect</button>
                </div>
            </div>
            <AuthModal isOpen={showAuthModal} onClose={() => setShowAuthModal(false)} />
        </div>
    );
};

const LogViewer = () => {
    const [logs, setLogs] = useState([]);
    const [loading, setLoading] = useState(false);
    const fetchLogs = async () => { setLoading(true); try { const res = await fetch('/api/logs'); if (res.ok) setLogs(await res.json()); } catch (e) {} finally { setLoading(false); } };
    useEffect(() => { fetchLogs(); const interval = setInterval(fetchLogs, 5000); return () => clearInterval(interval); }, []);
    return (
        <div className="bg-gray-800 rounded-lg shadow-lg border border-gray-700 h-[600px] flex flex-col">
            <div className="p-4 border-b border-gray-700 flex justify-between items-center shrink-0">
                <h3 className="font-bold text-gray-200">System Logs</h3>
                <button onClick={fetchLogs} className="text-sm text-purple-400 hover:text-white">Refresh</button>
            </div>
            <div className="flex-1 overflow-auto p-0">
                <table className="w-full text-xs text-left text-gray-400 font-mono">
                    <tbody className="divide-y divide-gray-700/50">
                        {logs.map(log => (
                            <tr key={log.id} className="hover:bg-gray-700/30">
                                <td className="px-4 py-1 whitespace-nowrap text-gray-500">{new Date(log.timestamp).toLocaleTimeString()}</td>
                                <td className="px-4 py-1 font-bold">{log.level}</td>
                                <td className="px-4 py-1 text-gray-300 break-all">{log.message}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

const App = () => {
  const [authStatus, setAuthStatus] = useState({ authenticated: false, isAdmin: false });
  const [authChecked, setAuthChecked] = useState(false);
  const [currentView, setCurrentView] = useState('login');
  const [activeTab, setActiveTab] = useState('overview'); 
  const [streamers, setStreamers] = useState([]);
  const [bot, setBot] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isAuthModalOpen, setAuthModalOpen] = useState(false);
  const [isManualAddOpen, setIsManualAddOpen] = useState(false);

  const checkAuth = async () => {
    try {
        const res = await fetch('/api/check-auth');
        const data = await res.json();
        setAuthStatus(data);
        if (data.isAdmin) setCurrentView('admin');
        else if (data.isStreamer) setCurrentView('streamer');
        else setCurrentView('login');
    } catch { setAuthStatus({ authenticated: false }); setCurrentView('login'); } finally { setAuthChecked(true); }
  };

  const fetchData = async () => {
    if(currentView !== 'admin') return; 
    setLoading(true);
    try {
      const [botRes, streamersRes] = await Promise.all([fetch('/api/bot'), fetch('/api/streamers')]);
      if(botRes.status === 401) { setAuthStatus(prev => ({ ...prev, isAdmin: false })); setCurrentView('login'); return; }
      setBot(await botRes.json());
      setStreamers(await streamersRes.json());
    } catch (error) {} finally { setLoading(false); }
  };

  useEffect(() => { checkAuth(); }, []);
  useEffect(() => { if(currentView === 'admin') { fetchData(); const i = setInterval(fetchData, 15000); return () => clearInterval(i); } }, [currentView]);

  const logout = async () => { await fetch('/api/logout', { method: 'POST' }); setAuthStatus({ authenticated: false }); setCurrentView('login'); window.history.replaceState({}, '', '/'); };
  const deleteStreamer = async (id) => { if(confirm('Revoke access?')) { await fetch(`/api/streamers/${id}`, { method: 'DELETE' }); fetchData(); } };
  const refreshStreamerToken = async (id) => { await fetch(`/api/streamers/${id}/refresh`, { method: 'POST' }); fetchData(); };
  const deleteBot = async () => { if(confirm('Disconnect bot?')) { await fetch('/api/bot', { method: 'DELETE' }); fetchData(); } };
  const resetBotSubs = async () => { if(confirm('Reset all bot subscriptions?')) { await fetch('/api/bot/reset-subs', { method: 'POST' }); fetchData(); } };
  
  // NEW: Force Bot Subs
  const forceBotSubs = async (id) => {
      if(!confirm('Force retry subscriptions using Bot Token?')) return;
      try {
          const res = await fetch(`/api/streamers/${id}/force-bot-subs`, { method: 'POST' });
          if (res.ok) { alert('Retried!'); fetchData(); }
          else alert('Failed.');
      } catch(e) { alert('Error'); }
  };

  const handleManualAdd = async (username) => {
      const res = await fetch('/api/streamers/manual', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username }) });
      if (res.ok) { setIsManualAddOpen(false); fetchData(); } else alert('Failed');
  };

  return (
    <>
       {!authChecked ? <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">Loading...</div> : (
         <>
            {currentView === 'streamer' && <StreamerDashboard logout={logout} />}
            {currentView === 'login' && <Login onLogin={checkAuth} onOpenStreamerAuth={() => setAuthModalOpen(true)} />}
            {currentView === 'admin' && (
                <div className="min-h-screen bg-gray-900 text-white p-8">
                  <div className="max-w-5xl mx-auto">
                    <header className="mb-6 flex justify-between items-center border-b border-gray-700 pb-4">
                      <h1 className="text-3xl font-bold text-purple-400">Twitch Bot Gateway</h1>
                      <div className="flex items-center gap-4">
                         <span className="font-mono text-sm">{bot ? `Bot: ${bot.login}` : 'Bot Offline'}</span>
                         <button onClick={logout} className="text-xs text-gray-400 hover:text-white underline">Logout</button>
                      </div>
                    </header>
                    <div className="flex gap-4 mb-6 border-b border-gray-700">
                        <button onClick={() => setActiveTab('overview')} className={`pb-2 px-4 text-sm font-bold border-b-2 transition-colors ${activeTab === 'overview' ? 'border-purple-500 text-white' : 'border-transparent text-gray-400'}`}>Overview</button>
                        <button onClick={() => setActiveTab('logs')} className={`pb-2 px-4 text-sm font-bold border-b-2 transition-colors ${activeTab === 'logs' ? 'border-purple-500 text-white' : 'border-transparent text-gray-400'}`}>System Logs</button>
                    </div>
                    {activeTab === 'overview' && (
                        <>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
                            <section>
                            <h2 className="text-xl font-semibold mb-4 text-gray-200">Bot Configuration</h2>
                            <div className="bg-gray-800 rounded-lg p-6 shadow-lg border border-gray-700">
                                {bot ? (
                                <div className="flex flex-col gap-4">
                                    <div className="flex items-center justify-between">
                                        <div><p className="font-bold text-lg">{bot.login}</p><p className="text-xs text-gray-500">ID: {bot.twitchId}</p></div>
                                        <button onClick={deleteBot} className="px-4 py-2 bg-red-900/50 hover:bg-red-900 text-red-200 rounded text-sm">Disconnect</button>
                                    </div>
                                    <div className="border-t border-gray-700 pt-3 flex gap-2">
                                        <button onClick={resetBotSubs} className="flex-1 py-1.5 bg-yellow-900/30 text-yellow-500 rounded text-xs font-bold uppercase">Reset Subs</button>
                                    </div>
                                </div>
                                ) : (
                                <div className="text-center py-6"><a href="/auth/login/bot" className="px-6 py-2 bg-purple-600 rounded font-medium">Connect Bot Account</a></div>
                                )}
                            </div>
                            </section>
                            <section>
                                <div className="flex justify-between items-center mb-4">
                                    <h2 className="text-xl font-semibold text-gray-200">Connected Streamers</h2>
                                    <div className="flex gap-2">
                                        <button onClick={fetchData} className="px-2 py-1 bg-gray-700 rounded text-xs">Refresh</button>
                                        <button onClick={() => setIsManualAddOpen(true)} className="px-2 py-1 bg-blue-600 rounded text-xs font-medium">+ Manual</button>
                                        <button onClick={() => setAuthModalOpen(true)} className="px-3 py-1 bg-purple-600 rounded text-xs font-medium">+ Auth</button>
                                    </div>
                                </div>
                                <div className="bg-gray-800 rounded-lg border border-gray-700 p-4 min-h-[140px] max-h-[300px] overflow-y-auto">
                                    <ul className="space-y-3">
                                        {streamers.map(s => (
                                        <li key={s.twitchId} className="flex justify-between items-center bg-gray-750 p-2 rounded">
                                            <div className="flex items-center gap-3">
                                                <div className="font-bold text-sm">{s.displayName} {s.isManual && <span className="text-xs bg-blue-900 text-blue-200 px-1 rounded">MANUAL</span>}</div>
                                            </div>
                                            <div className="flex gap-2">
                                                <button onClick={() => forceBotSubs(s.twitchId)} className="text-yellow-400 text-xs hover:text-yellow-300 font-bold" title="Retry with Bot Token">Force Bot Subs</button>
                                                {!s.isManual && <button onClick={() => refreshStreamerToken(s.twitchId)} className="text-blue-400 text-xs">Ref</button>}
                                                <button onClick={() => deleteStreamer(s.twitchId)} className="text-red-400 text-xs">Del</button>
                                            </div>
                                        </li>
                                        ))}
                                    </ul>
                                </div>
                            </section>
                        </div>
                        </>
                    )}
                    {activeTab === 'logs' && <LogViewer />}
                  </div>
                </div>
            )}
         </>
       )}
      <AuthModal isOpen={isAuthModalOpen} onClose={() => setAuthModalOpen(false)} />
      {isManualAddOpen && (
          <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
              <div className="bg-gray-800 border border-gray-700 p-6 rounded-lg shadow-xl w-full max-w-sm">
                  <h3 className="text-lg font-bold text-white mb-4">Add Manual Streamer</h3>
                  <form onSubmit={(e) => { e.preventDefault(); handleManualAdd(e.target.elements.username.value); }}>
                      <input name="username" className="w-full bg-gray-900 border border-gray-600 rounded p-2 text-white mb-4" placeholder="Twitch Username" autoFocus />
                      <div className="flex justify-end gap-2">
                          <button type="button" onClick={() => setIsManualAddOpen(false)} className="px-3 py-1.5 text-gray-300">Cancel</button>
                          <button type="submit" className="px-3 py-1.5 bg-blue-600 text-white rounded font-bold">Add</button>
                      </div>
                  </form>
              </div>
          </div>
      )}
    </>
  );
};

export default App;
