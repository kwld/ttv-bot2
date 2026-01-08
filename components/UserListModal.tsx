
import React, { useState, useMemo } from 'react';
import { UserEntity } from '../types';
import { MOCK_USERS } from '../mockUsers';
import { useTranslation } from 'react-i18next';

interface UserListModalProps {
  isOpen: boolean;
  onClose: () => void;
  users: UserEntity[];
  points: Record<string, number>;
  currencySymbol: string;
  onClearDatabase?: () => void;
}

const UserListModal: React.FC<UserListModalProps> = ({ isOpen, onClose, users, points, currencySymbol, onClearDatabase }) => {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');

  const { realUsers, testUsers } = useMemo(() => {
    // Filter out invalid users to prevent key errors
    const validUsers = users.filter(u => u && u.id);
    
    let filtered = validUsers;
    if (search) {
        const lower = search.toLowerCase();
        filtered = validUsers.filter(u => 
          (u.displayName || '').toLowerCase().includes(lower) || 
          (u.username || '').toLowerCase().includes(lower) || 
          (u.id || '').includes(lower)
        );
    }

    const testIds = new Set(MOCK_USERS.map(m => m.id));
    
    return {
        realUsers: filtered.filter(u => !testIds.has(u.id)),
        testUsers: filtered.filter(u => testIds.has(u.id))
    };
  }, [users, search]);

  if (!isOpen) return null;

  const handleClear = () => {
      if (confirm(t('dialogs.clear_db_msg'))) {
          if (onClearDatabase) {
              onClearDatabase();
          }
      }
  };

  const renderRow = (user: UserEntity) => {
      const balance = points[user.id] !== undefined ? points[user.id] : (user.points || 0);
      const u = user as any; 

      let rankBadge = { label: 'Regular', color: 'text-slate-400 bg-slate-500/10 border-slate-500/20' };
    
      if (u.isBroadcaster || u.rank === 0) rankBadge = { label: 'Broadcaster', color: 'text-rose-400 bg-rose-500/10 border-rose-500/20' };
      else if (u.isModerator || u.rank === 1) rankBadge = { label: 'Moderator', color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' };
      else if (u.isVip || u.rank === 2) rankBadge = { label: 'VIP', color: 'text-pink-400 bg-pink-500/10 border-pink-500/20' };
      
      const isSub = u.isSubscriber || (u.badges && (u.badges.subscriber || u.badges.founder));
      // Property added by Server socket for editors
      const isEditor = u.isEditor;

      return (
         <tr key={user.id} className="hover:bg-slate-800/30 transition-colors group">
            <td className="px-6 py-3">
               <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-slate-700 flex items-center justify-center font-bold text-xs text-slate-300 overflow-hidden">
                     {u.profileImageUrl ? (
                         <img src={u.profileImageUrl} alt="" className="w-full h-full object-cover" />
                     ) : (
                         (user.displayName || user.username || '?').substring(0,2).toUpperCase()
                     )}
                  </div>
                  <div className="flex flex-col">
                     <span className="text-xs font-bold text-slate-200 group-hover:text-purple-400 transition-colors">{user.displayName}</span>
                     <span className="text-[10px] text-slate-500">{user.username}</span>
                  </div>
               </div>
            </td>
            <td className="px-6 py-3">
               <span className="text-[10px] font-mono text-slate-600">{user.id}</span>
            </td>
            <td className="px-6 py-3">
               <div className="flex gap-1 flex-wrap">
                   <span className={`text-[9px] font-black uppercase px-2 py-1 rounded border ${rankBadge.color}`}>
                      {rankBadge.label}
                   </span>
                   {isSub && (
                       <span className="text-[9px] font-black uppercase px-2 py-1 rounded border text-purple-400 bg-purple-500/10 border-purple-500/20" title="Subscriber">
                           SUB
                       </span>
                   )}
                   {isEditor && (
                       <span className="text-[9px] font-black uppercase px-2 py-1 rounded border text-indigo-400 bg-indigo-500/10 border-indigo-500/20" title="Editor">
                           EDITOR
                       </span>
                   )}
               </div>
            </td>
            <td className="px-6 py-3 text-right">
               <span className="text-xs font-bold text-emerald-400 bg-emerald-500/10 px-2 py-1 rounded border border-emerald-500/20">
                  {balance} {currencySymbol}
               </span>
            </td>
            <td className="px-6 py-3 text-right text-[10px] text-slate-500 font-mono">
                {user.lastUpdated ? new Date(user.lastUpdated).toLocaleString() : '-'}
            </td>
         </tr>
      );
  };

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center bg-[#0f111a]/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-[#1a1f29] border border-slate-700 w-full max-w-5xl rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="p-6 border-b border-slate-700 bg-slate-900/50 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-600/20 border border-purple-600/30 flex items-center justify-center">
              <i className="fas fa-users text-purple-400"></i>
            </div>
            <div>
              <h2 className="text-xl font-black text-white italic">{t('user_list.title')}</h2>
              <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">
                {t('user_list.subtitle', { count: users.length })}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
              {onClearDatabase && (
                  <button 
                    onClick={handleClear}
                    className="px-3 py-1.5 bg-red-500/10 hover:bg-red-500 text-red-500 hover:text-white rounded-lg text-[9px] font-black uppercase tracking-widest transition-all border border-red-500/30"
                  >
                      <i className="fas fa-trash-alt mr-1.5"></i> {t('user_list.clear_db')}
                  </button>
              )}
              <button onClick={onClose} className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-400 transition-colors flex items-center justify-center">
                <i className="fas fa-times"></i>
              </button>
          </div>
        </div>

        {/* Search */}
        <div className="px-6 py-4 border-b border-slate-700/50 bg-[#161b22]">
           <div className="relative">
              <input 
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('user_list.search_placeholder')}
                className="w-full bg-[#0d1117] border border-slate-700 rounded-xl px-10 py-3 text-sm text-slate-200 focus:outline-none focus:border-purple-500 transition-colors placeholder:text-slate-600"
              />
              <i className="fas fa-search absolute left-4 top-1/2 -translate-y-1/2 text-slate-600"></i>
           </div>
        </div>

        {/* Table */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-0">
           <table className="w-full text-left border-collapse">
              <thead className="bg-slate-800/50 sticky top-0 backdrop-blur-md z-10">
                 <tr>
                    <th className="px-6 py-3 text-[9px] font-black text-slate-500 uppercase tracking-widest border-b border-slate-700/50">{t('user_list.col_user')}</th>
                    <th className="px-6 py-3 text-[9px] font-black text-slate-500 uppercase tracking-widest border-b border-slate-700/50">{t('user_list.col_id')}</th>
                    <th className="px-6 py-3 text-[9px] font-black text-slate-500 uppercase tracking-widest border-b border-slate-700/50">{t('user_list.col_rank')}</th>
                    <th className="px-6 py-3 text-[9px] font-black text-slate-500 uppercase tracking-widest border-b border-slate-700/50 text-right">{t('user_list.col_balance')}</th>
                    <th className="px-6 py-3 text-[9px] font-black text-slate-500 uppercase tracking-widest border-b border-slate-700/50 text-right">{t('user_list.col_last_seen')}</th>
                 </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/30">
                 {/* Real Users Section */}
                 {realUsers.length > 0 && (
                     <>
                        <tr>
                            <td colSpan={5} className="px-6 py-2 bg-slate-800/80 text-[10px] font-black text-emerald-400 uppercase tracking-widest border-y border-slate-700">
                                <i className="fas fa-satellite-dish mr-2"></i> {t('user_list.section_real')}
                            </td>
                        </tr>
                        {realUsers.map(renderRow)}
                     </>
                 )}

                 {/* Test Users Section */}
                 {testUsers.length > 0 && (
                     <>
                        <tr>
                            <td colSpan={5} className="px-6 py-2 bg-slate-800/80 text-[10px] font-black text-indigo-400 uppercase tracking-widest border-y border-slate-700">
                                <i className="fas fa-flask mr-2"></i> {t('user_list.section_sim')}
                            </td>
                        </tr>
                        {testUsers.map(renderRow)}
                     </>
                 )}

                 {realUsers.length === 0 && testUsers.length === 0 && (
                    <tr>
                       <td colSpan={5} className="px-6 py-8 text-center text-xs text-slate-500 italic">
                          {t('user_list.no_results', { query: search })}
                       </td>
                    </tr>
                 )}
              </tbody>
           </table>
        </div>
        
        <div className="p-4 bg-slate-900/50 border-t border-slate-700 text-center">
           <span className="text-[10px] text-slate-600 font-bold uppercase tracking-widest">
              {t('user_list.total_size', { count: users.length })}
           </span>
        </div>
      </div>
    </div>
  );
};

export default UserListModal;
