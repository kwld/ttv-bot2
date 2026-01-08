
import React from 'react';
import { User } from '../types';

interface ChatUserTabsProps {
  users: User[];
  selectedUser: User;
  onSelectUser: (user: User) => void;
  connectedUser?: User | null;
  isTwitchConnected: boolean;
  placement: 'left' | 'right';
  badgeMap: Record<string, string>;
  docked?: boolean;
}

const localBadgeStyles: Record<string, { letter?: string; icon?: string; title: string; classes: string }> = {
    broadcaster: { letter: 'B', title: 'Broadcaster', classes: 'bg-rose-600' },
    moderator: { letter: 'M', title: 'Moderator', classes: 'bg-emerald-500' },
    vip: { letter: 'V', title: 'VIP', classes: 'bg-pink-500' },
    subscriber: { letter: 'S', title: 'Subscriber', classes: 'bg-purple-600' },
    founder: { letter: 'F', title: 'Founder', classes: 'bg-purple-800' },
    partner: { icon: 'fa-check', title: 'Verified Partner', classes: 'bg-purple-600' },
    turbo: { icon: 'fa-bolt', title: 'Turbo', classes: 'bg-indigo-500' },
    premium: { icon: 'fa-crown', title: 'Premium', classes: 'bg-yellow-500' },
};

const ChatUserTabs: React.FC<ChatUserTabsProps> = ({
  users,
  selectedUser,
  onSelectUser,
  connectedUser,
  isTwitchConnected,
  placement,
  badgeMap,
  docked = false
}) => {
  const isLeft = placement === 'left';

  // --- Dynamic Width Calculation ---
  // 1. Find the maximum number of badges any user has (for expanded state)
  const maxBadges = Math.max(0, ...users.map(u => Object.keys(u.badges || {}).length));
  
  // 2. Find the maximum name length (for expanded state)
  const maxNameLen = Math.max(0, ...users.map(u => u.displayName.length));

  // 3. Constants for pixel math
  const BADGE_WIDTH = 18; // Width of one badge including gap
  const INITIALS_WIDTH = 24; // Width of initials box
  const PADDING_FIXED = 24; // Left + Right padding + internal gaps
  const CHAR_WIDTH = 8; // Approx width of uppercase bold font at 10px

  // 4. Calculate Widths
  // Collapsed: Fixed width just for Initials + minimal padding
  const collapsedPx = 44; 
  // Expanded: Full width for Badges + Initials + Name
  const expandedPx = PADDING_FIXED + INITIALS_WIDTH + (maxBadges * BADGE_WIDTH) + (maxNameLen * CHAR_WIDTH) + 16; 

  // --- Layout Classes ---
  let positionClass = "";
  let borderClassBase = "";
  let flexAlign = "";
  let originClass = "";
  let flexDirection = "";

  if (docked) {
      if (isLeft) { 
          positionClass = "left-0 ml-[-1px]";
          borderClassBase = "rounded-r-lg border-l-0 border-y border-r";
          flexAlign = "items-start";
          originClass = "origin-left";
          flexDirection = "flex-row";
      } else { 
          positionClass = "right-0 mr-[-1px]";
          borderClassBase = "rounded-l-lg border-r-0 border-y border-l";
          flexAlign = "items-end";
          originClass = "origin-right";
          flexDirection = "flex-row-reverse justify-end";
      }
  } else {
      // Legacy "Sticking Out" behavior
      if (isLeft) { 
          positionClass = "right-full mr-[-1px]";
          borderClassBase = "rounded-l-lg border-r-0 border-y border-l";
          flexAlign = "items-end";
          originClass = "origin-right";
          flexDirection = "flex-row-reverse justify-end";
      } else {
          positionClass = "left-full ml-[-1px]";
          borderClassBase = "rounded-r-lg border-l-0 border-y border-r";
          flexAlign = "items-start";
          originClass = "origin-left";
          flexDirection = "flex-row";
      }
  }

  // Padding Logic based on side
  let paddingClass = "";
  if (docked) {
      paddingClass = isLeft ? 'pr-2 pl-2' : 'pl-2 pr-2';
  } else {
      paddingClass = (placement === 'left') ? 'pl-2 pr-2' : 'pr-2 pl-2';
  }

  return (
    <div 
        className={`absolute bottom-[72px] flex flex-col gap-1 z-30 pointer-events-none ${positionClass} ${flexAlign}`}
        style={{
            '--w-col': `${collapsedPx}px`,
            '--w-exp': `${expandedPx}px`
        } as React.CSSProperties}
    >
        {users.map((u, index) => {
            const isActive = selectedUser.id === u.id;
            const isReal = isTwitchConnected && connectedUser && u.id === connectedUser.id;
            const initials = u.displayName.substring(0, 2).toUpperCase();

            const badgePriority = ['broadcaster', 'admin', 'staff', 'moderator', 'vip', 'subscriber', 'partner', 'glhf-pledge', 'turbo', 'premium'];
            const userBadges = Object.entries(u.badges || {})
            .map(([name, version]) => ({ name, version }))
            .sort((a, b) => {
                const indexA = badgePriority.indexOf(a.name);
                const indexB = badgePriority.indexOf(b.name);
                if (indexA === -1 && indexB === -1) return a.name.localeCompare(b.name);
                if (indexA === -1) return 1;
                if (indexB === -1) return -1;
                return indexA - indexB;
            });

            let bgClass, borderClass, textClass;
            
            if (isActive) {
                if (isReal) { 
                    bgClass = "bg-emerald-600";
                    borderClass = "border-emerald-500";
                    textClass = "text-white";
                } else { 
                    bgClass = "bg-indigo-600";
                    borderClass = "border-indigo-500";
                    textClass = "text-white";
                }
            } else { 
                if (isReal) { 
                    bgClass = "bg-emerald-800/30 hover:bg-emerald-700/50";
                    borderClass = "border-emerald-700/40";
                    textClass = "text-emerald-400";
                } else { 
                    bgClass = "bg-slate-800";
                    borderClass = "border-slate-700";
                    textClass = "text-slate-500";
                }
            }

            return (
            <button
                key={u.id}
                onClick={() => onSelectUser(u)}
                className={`
                group relative h-9 flex items-center gap-2 transition-all duration-300 ease-out shadow-md overflow-hidden pointer-events-auto
                ${borderClassBase} ${bgClass} ${borderClass} ${originClass} ${paddingClass}
                ${isActive ? 'opacity-100 shadow-lg' : 'opacity-80 hover:opacity-100'}
                w-[var(--w-col)] hover:w-[var(--w-exp)]
                `}
                style={{ 
                    zIndex: users.length - index,
                    width: isActive ? 'var(--w-exp)' : undefined
                }}
                title={u.displayName}
            >
                <div className={`flex items-center gap-2 w-full ${flexDirection}`}>
                    
                    {/* Badge Container - Hidden when collapsed, visible on hover/active */}
                    {userBadges.length > 0 && (
                        <div className={`
                            flex items-center gap-0.5 shrink-0 overflow-hidden transition-all duration-300
                            ${isActive ? 'w-auto opacity-100' : 'w-0 opacity-0 group-hover:w-auto group-hover:opacity-100'}
                        `}>
                            {userBadges.map(({ name, version }) => {
                                const style = localBadgeStyles[name];
                                if (style) {
                                    return (
                                        <div key={name} title={style.title} className={`w-4 h-4 ${style.classes} rounded-sm flex items-center justify-center text-white shrink-0 shadow-sm`}>
                                            {style.icon ? <i className={`fas ${style.icon} text-[8px]`}></i> : <span className="text-[9px] font-black">{style.letter}</span>}
                                        </div>
                                    );
                                }

                                const badgeKey = `${name}/${version}`;
                                const badgeUrl = badgeMap[badgeKey];
                                
                                if (badgeUrl) {
                                    return <img key={badgeKey} src={badgeUrl} alt={name} className="w-4 h-4 object-contain" />;
                                }

                                return null;
                            })}
                        </div>
                    )}

                    {/* Initials (Always Visible) */}
                    <div className={`
                        h-5 w-[22px] flex items-center justify-center rounded shrink-0 bg-black/20
                        ${isActive ? 'text-white' : 'text-slate-300'}
                        shrink-0
                    `}>
                        <span className="text-[9px] font-black">{initials}</span>
                    </div>
                    
                    {/* Full Name (Hidden when inactive, reveals on hover) */}
                    <div className={`
                        text-[10px] font-bold uppercase tracking-wide whitespace-nowrap overflow-hidden
                        ${isActive ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}
                        transition-opacity duration-300 delay-75
                        ${textClass}
                    `}>
                        {u.displayName}
                    </div>
                    
                    {isActive && isReal && <div className="w-1.5 h-1.5 rounded-full bg-white animate-pulse shrink-0 ml-auto"></div>}
                </div>
            </button>
            );
        })}
    </div>
  );
};

export default ChatUserTabs;
