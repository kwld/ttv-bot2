
import React, { useEffect, useState, useMemo, useRef, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';

const SCOPE_DEFINITIONS = [
  { id: 'channel:read:redemptions', label: 'Channel Points', description: 'Read custom and automatic reward redemptions.', required: true },
  { id: 'bits:read', label: 'Bits', description: 'Read bit cheer events.', required: true },
  { id: 'channel:read:subscriptions', label: 'Subscriptions', description: 'Read subscription events.', required: true }
];

const DEFAULT_SCOPES = SCOPE_DEFINITIONS.filter(s => s.required).map(s => s.id);

// --- Logs Component ---
const LogsPanel = () => {
    const [logs, setLogs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [expandedLogId, setExpandedLogId] = useState(null);

    const fetchLogs = async () => {
        try {
            const res = await fetch('/api/logs');
            if (res.ok) {
                const data = await res.json();
                setLogs(data);
            }
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchLogs();
        const interval = setInterval(fetchLogs, 5000); // Auto-refresh every 5s
        return () => clearInterval(interval);
    }, []);

    const toggleExpand = (id) => {
        setExpandedLogId(expandedLogId === id ? null : id);
    };

    const getLevelColor = (level) => {
        if (level === 'error') return 'text-red-400 bg-red-900/30 border-red-800';
        if (level === 'warn') return 'text-yellow-400 bg-yellow-900/30 border-yellow-800';
        if (level === 'debug') return 'text-blue-400 bg-blue-900/30 border-blue-800';
        return 'text-gray-400 bg-gray-800 border-gray-700';
    };

    return (
        <div className="bg-gray-800 rounded-lg shadow-lg border border-gray-700 h-full flex flex-col">
            <div className="p-4 border-b border-gray-700 flex justify-between items-center bg-gray-750">
                <h3 className="font-bold text-gray-200">System Logs (Last 1h)</h3>
                <button onClick={fetchLogs} className="text-xs text-blue-400 hover:text-blue-300">Refresh</button>
            </div>
            <div className="flex-1 overflow-y-auto p-0 custom-scrollbar">
                {logs.length === 0 ? (
                    <div className="p-8 text-center text-gray-500 italic">No logs found.</div>
                ) : (
                    <table className="w-full text-left text-xs">
                        <thead className="bg-gray-900 text-gray-400 uppercase font-bold sticky top-0">
                            <tr>
                                <th className="px-4 py-2 w-24">Time</th>
                                <th className="px-4 py-2 w-20">Level</th>
                                <th className="px-4 py-2">Message</th>
                                <th className="px-4 py-2 w-16 text-right">Details</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-700">
                            {logs.map(log => (
                                <React.Fragment key={log.id}>
                                    <tr className={`hover:bg-gray-750 ${log.level === 'error' ? 'bg-red-900/10' : ''}`}>
                                        <td className="px-4 py-2 text-gray-400 font-mono whitespace-nowrap">
                                            {new Date(log.timestamp).toLocaleTimeString()}
                                        </td>
                                        <td className="px-4 py-2">
                                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-black uppercase border ${getLevelColor(log.level)}`}>
                                                {log.level}
                                            </span>
                                        </td>
                                        <td className="px-4 py-2 text-gray-300 truncate max-w-xs" title={log.message}>
                                            {log.message}
                                        </td>
                                        <td className="px-4 py-2 text-right">
                                            {(log.trace || log.context) && (
                                                <button onClick={() => toggleExpand(log.id)} className="text-gray-400 hover:text-white">
                                                    {expandedLogId === log.id ? 'Hide' : 'Show'}
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                    {expandedLogId === log.id && (
                                        <tr className="bg-gray-900/50">
                                            <td colspan="4" className="px-4 py-3">
                                                <div className="bg-black/50 p-2 rounded border border-gray-700 font-mono text-[10px] text-gray-400 whitespace-pre-wrap overflow-x-auto">
                                                    {log.trace && <div className="text-red-300 mb-2">{log.trace}</div>}
                                                    {log.context && <div className="text-blue-300">{log.context}</div>}
                                                </div>
                                            </td>
                                        </tr>
                                    )}
                                </React.Fragment>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
};

// ... existing AuthModal component ...
const AuthModal = ({ isOpen, onClose }) => {
    const [selectedScopes, setSelectedScopes] = useState([]);
    useEffect(() => {
        if(isOpen) setSelectedScopes(DEFAULT_SCOPES);
    }, [isOpen]);
    if (!isOpen) return null;
    const toggleScope = (id) => {
        if (selectedScopes.includes(id)) setSelectedScopes(selectedScopes.filter(s => s !== id));
        else setSelectedScopes([...selectedScopes, id]);
    };
    const handleConnect = () => {
        const safeScopes = selectedScopes.filter(s => s !== 'channel:bot' && s !== 'user:bot');
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
                    <div className="space-y-3 max-h-[300px] overflow-y-auto mb-6">
                        {SCOPE_DEFINITIONS.map(scope => (
                            <label key={scope.id} className="flex items-start gap-3 p-2 rounded hover:bg-gray-750 cursor-pointer border border-transparent hover:border-gray-700">
                                <input type="checkbox" checked={selectedScopes.includes(scope.id)} onChange={() => toggleScope(scope.id)} className="mt-1 w-4 h-4 rounded border-gray-600 bg-gray-700 text-purple-600" />
                                <div>
                                    <div className="font-medium text-gray-200">{scope.label}</div>
                                    <div className="text-xs text-gray-500">{scope.description}</div>
                                </div>
                            </label>
                        ))}
                    </div>
                    <div className="flex justify-end gap-3">
                        <button onClick={onClose} className="px-4 py-2 text-gray-300 hover:text-white text-sm">Cancel</button>
                        <button onClick={handleConnect} className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded font-bold text-sm">Connect & Authorize</button>
                    </div>
                </div>
            </div>
        </div>
    );
};

// ... Login component ...
const Login = ({ onLogin }) => {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password }) });
      if (res.ok) onLogin(); else setError('Invalid password');
    } catch { setError('Login failed'); }
  };
  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4 text-white">
      <div className="bg-gray-800 p-8 rounded-lg shadow-xl w-full max-w-md border border-gray-700">
        <h1 className="text-2xl font-bold text-purple-400 mb-6 text-center">Bot Gateway Admin</h1>
        <form onSubmit={handleSubmit} className="space-y-4">
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full bg-gray-900 border border-gray-600 rounded p-2 text-white" placeholder="Enter password..." />
          {error && <p className="text-red-400 text-sm text-center">{error}</p>}
          <button type="submit" className="w-full bg-purple-600 hover:bg-purple-700 text-white font-bold py-2 rounded">Login</button>
        </form>
      </div>
    </div>
  );
};

// ... Main App ...
const App = () => {
    const [authStatus, setAuthStatus] = useState({ authenticated: false, isAdmin: false });
    const [authChecked, setAuthChecked] = useState(false);
    const [currentTab, setCurrentTab] = useState('dashboard');
    const [streamers, setStreamers] = useState([]);
    const [bot, setBot] = useState(null);
    const [status, setStatus] = useState(null);
    const [isAuthModalOpen, setAuthModalOpen] = useState(false);

    const checkAuth = async () => {
        try {
            const res = await fetch('/api/check-auth');
            const data = await res.json();
            setAuthStatus(data);
        } catch {
            setAuthStatus({ authenticated: false, isAdmin: false });
        } finally {
            setAuthChecked(true);
        }
    };

    const fetchData = async () => {
        if (!authStatus.isAdmin) return;
        try {
            const [botRes, streamersRes, statusRes] = await Promise.all([
                fetch('/api/bot'),
                fetch('/api/streamers'),
                fetch('/api/status')
            ]);
            setBot(await botRes.json());
            setStreamers(await streamersRes.json());
            setStatus(await statusRes.json());
        } catch (e) { console.error(e); }
    };

    useEffect(() => { checkAuth(); }, []);
    useEffect(() => { 
        if (authStatus.isAdmin) {
            fetchData();
            const timer = setInterval(fetchData, 10000);
            return () => clearInterval(timer);
        }
    }, [authStatus.isAdmin]);

    const logout = async () => {
        await fetch('/api/logout', { method: 'POST' });
        checkAuth();
    };

    const deleteStreamer = async (id) => {
        if (confirm('Revoke access?')) {
            await fetch(`/api/streamers/${id}`, { method: 'DELETE' });
            fetchData();
        }
    };
    
    const refreshStreamer = async (id) => {
        await fetch(`/api/streamers/${id}/refresh`, { method: 'POST' });
        fetchData();
    };

    if (!authChecked) return <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">Loading...</div>;
    if (!authStatus.isAdmin) return <Login onLogin={checkAuth} />;

    return (
        <div className="min-h-screen bg-gray-900 text-white flex">
             <aside className="w-64 bg-gray-800 border-r border-gray-700 flex flex-col">
                <div className="p-6 border-b border-gray-700">
                    <h1 className="text-xl font-bold text-purple-400">Gateway Admin</h1>
                </div>
                <nav className="flex-1 p-4 space-y-2">
                    <button onClick={() => setCurrentTab('dashboard')} className={`w-full text-left px-4 py-3 rounded transition-colors ${currentTab === 'dashboard' ? 'bg-gray-700 text-white' : 'text-gray-400 hover:bg-gray-700 hover:text-white'}`}>
                        Dashboard
                    </button>
                    <button onClick={() => setCurrentTab('logs')} className={`w-full text-left px-4 py-3 rounded transition-colors ${currentTab === 'logs' ? 'bg-gray-700 text-white' : 'text-gray-400 hover:bg-gray-700 hover:text-white'}`}>
                        System Logs
                    </button>
                </nav>
                <div className="p-4 border-t border-gray-700">
                    <button onClick={logout} className="w-full px-4 py-2 bg-red-900/50 hover:bg-red-900 text-red-200 rounded text-sm transition-colors border border-red-800">
                        Logout
                    </button>
                </div>
             </aside>

             <main className="flex-1 p-8 overflow-hidden h-screen flex flex-col">
                {currentTab === 'logs' ? (
                    <LogsPanel />
                ) : (
                    <div className="max-w-5xl mx-auto w-full space-y-8 overflow-y-auto custom-scrollbar pr-2">
                        {/* Bot Status */}
                        <div className="bg-gray-800 rounded-lg p-6 shadow-lg border border-gray-700">
                             <div className="flex justify-between items-center mb-4">
                                <h2 className="text-xl font-bold text-gray-200">Bot Status</h2>
                                <div className={`px-3 py-1 rounded-full text-xs font-bold ${status?.ircConnected ? 'bg-green-900 text-green-300' : 'bg-red-900 text-red-300'}`}>
                                    {status?.ircConnected ? 'IRC CONNECTED' : 'IRC DISCONNECTED'}
                                </div>
                             </div>
                             <div className="flex items-center gap-4">
                                 <div className="w-12 h-12 rounded-full bg-gray-700 flex items-center justify-center font-bold text-xl">
                                     {bot ? bot.login.charAt(0).toUpperCase() : '?'}
                                 </div>
                                 <div>
                                     <div className="font-bold text-lg">{bot ? bot.login : 'No Bot Authenticated'}</div>
                                     <div className="text-xs text-gray-500">{bot ? bot.twitchId : ''}</div>
                                 </div>
                                 <div className="ml-auto">
                                     <a href="/auth/login/bot" className="px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded text-sm font-bold transition-colors">
                                         {bot ? 'Re-Authenticate Bot' : 'Connect Bot'}
                                     </a>
                                 </div>
                             </div>
                        </div>

                        {/* Streamers */}
                        <div className="bg-gray-800 rounded-lg shadow-lg border border-gray-700 overflow-hidden">
                            <div className="p-4 bg-gray-750 border-b border-gray-700 flex justify-between items-center">
                                <h2 className="text-lg font-bold text-gray-200">Connected Streamers</h2>
                                <button onClick={() => setAuthModalOpen(true)} className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 rounded text-xs font-bold transition-colors">
                                    + Add Streamer
                                </button>
                            </div>
                            {streamers.length === 0 ? (
                                <div className="p-8 text-center text-gray-500">No streamers connected.</div>
                            ) : (
                                <table className="w-full text-left text-sm text-gray-400">
                                    <thead className="bg-gray-900 text-xs uppercase">
                                        <tr>
                                            <th className="px-4 py-3">User</th>
                                            <th className="px-4 py-3">Type</th>
                                            <th className="px-4 py-3">Auth Date</th>
                                            <th className="px-4 py-3 text-right">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-700">
                                        {streamers.map(s => (
                                            <tr key={s.twitchId} className="hover:bg-gray-750">
                                                <td className="px-4 py-3 flex items-center gap-3">
                                                    {s.avatar ? <img src={s.avatar} className="w-8 h-8 rounded-full" /> : <div className="w-8 h-8 bg-gray-600 rounded-full"></div>}
                                                    <div>
                                                        <div className="font-bold text-white">{s.displayName}</div>
                                                        <div className="text-xs">{s.login}</div>
                                                    </div>
                                                </td>
                                                <td className="px-4 py-3">
                                                    {s.isManual ? <span className="text-blue-400 text-xs font-bold border border-blue-900 bg-blue-900/20 px-2 py-0.5 rounded">MANUAL</span> : <span className="text-green-400 text-xs font-bold border border-green-900 bg-green-900/20 px-2 py-0.5 rounded">OAUTH</span>}
                                                </td>
                                                <td className="px-4 py-3">{new Date(s.obtainedAt).toLocaleDateString()}</td>
                                                <td className="px-4 py-3 text-right flex justify-end gap-2">
                                                    {!s.isManual && <button onClick={() => refreshStreamer(s.twitchId)} className="text-blue-400 hover:text-white">Ref</button>}
                                                    <button onClick={() => deleteStreamer(s.twitchId)} className="text-red-400 hover:text-white">Del</button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </div>
                    </div>
                )}
             </main>

             <AuthModal isOpen={isAuthModalOpen} onClose={() => setAuthModalOpen(false)} />
        </div>
    );
};

export default App;
