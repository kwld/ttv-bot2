






export class VariableResolver {
  
  static getNestedValue(path, context, activeTargets) {
    if (path === undefined || path === null) return null;
    const cleanPath = String(path).trim();
    
    // 1. Direct Iterator Context (Highest Priority)
    if (context.iterator) {
        if (cleanPath === 'index') return context.iterator.index;
        if (cleanPath === 'item') return context.iterator.item;
        if (cleanPath === 'element') return context.iterator.item;
        
        if (cleanPath.startsWith('item.') || cleanPath.startsWith('element.')) {
             const parts = cleanPath.split('.');
             let current = context.iterator.item;
             for (let i = 1; i < parts.length; i++) {
                 if (current && typeof current === 'object' && parts[i] in current) {
                     current = current[parts[i]];
                 } else {
                     return null;
                 }
             }
             return current;
        }
    }

    if (cleanPath.startsWith('server.isBusy.')) {
        const userId = cleanPath.replace('server.isBusy.', '');
        return activeTargets.has(userId) ? 'true' : 'false';
    }

    if (!isNaN(cleanPath) && cleanPath !== '') return Number(cleanPath);
    if (cleanPath === 'true') return true;
    if (cleanPath === 'false') return false;
    if ((cleanPath.startsWith('"') && cleanPath.endsWith('"')) || (cleanPath.startsWith("'") && cleanPath.endsWith("'"))) {
        return cleanPath.slice(1, -1);
    }

    const parts = cleanPath.split('.');
    
    // 2. Build Search Context
    let current = context.variables || {};
    
    if (context.iterator && context.iterator.item) {
        current = { ...current, item: context.iterator.item, element: context.iterator.item }; 
    }
    
    current = { 
        ...current,
        sender: context.sender, 
        args: context.args, 
        static: context.static, 
        channel: context.channel,
        event: context.event // Added Event Context
    };

    // 3. Traverse
    for (const part of parts) {
      if (current !== null && current !== undefined && typeof current === 'object') {
          // Array handling with extended syntax
          if (Array.isArray(current)) {
              // Handle 'all': args.all -> joins with space
              if (part === 'all') {
                  current = current.join(' ');
                  continue;
              }

              // Handle 'last' keyword: args.last
              if (part === 'last') {
                  current = current.length > 0 ? current[current.length - 1] : null;
                  continue;
              }
              // Handle 'last-N': args.last-1
              if (part.startsWith('last-')) {
                  const offset = parseInt(part.split('-')[1]);
                  if (!isNaN(offset)) {
                      const idx = current.length - 1 - offset;
                      current = (idx >= 0) ? current[idx] : null;
                      continue;
                  }
              }

              // Handle Ranges: args.0-2 or args.0-last-1
              if (part.includes('-') && !part.startsWith('last')) {
                  const rangeParts = part.split('-');
                  // Syntax: start-end OR start-last-offset
                  let startIdx = parseInt(rangeParts[0]);
                  
                  // Calculate End Index
                  let endIdx = -1;
                  
                  if (rangeParts[1] === 'last') {
                      // Case: 0-last (or 0-last-1 if 3 parts)
                      const offset = rangeParts.length > 2 ? parseInt(rangeParts[2]) : 0;
                      endIdx = current.length - 1 - offset;
                  } else {
                      // Case: 0-2
                      endIdx = parseInt(rangeParts[1]);
                  }

                  if (!isNaN(startIdx) && !isNaN(endIdx)) {
                      // Normalize bounds
                      startIdx = Math.max(0, startIdx);
                      endIdx = Math.min(current.length - 1, endIdx);
                      
                      if (startIdx <= endIdx) {
                          // Slice is exclusive on end, so +1
                          const slice = current.slice(startIdx, endIdx + 1);
                          // Join logic: if strings, join with space. If objects, return array.
                          if (slice.length > 0 && typeof slice[0] === 'string') {
                              current = slice.join(' ');
                          } else {
                              current = slice;
                          }
                      } else {
                          current = ""; // Invalid range or empty
                      }
                      continue;
                  }
              }

              // Standard Index Access: args.0
              const index = parseInt(part);
              if (!isNaN(index) && index >= 0 && index < current.length) {
                  current = current[index];
              } else if (part === 'length') {
                  current = current.length;
              } else {
                  return null;
              }
          } else if (part in current) {
              current = current[part];
          } else {
              return null;
          }
      } else {
          return null;
      }
    }
    return current;
  }

  static resolve(text, context, activeTargets) {
    if (typeof text !== 'string') return String(text);
    
    let current = text;
    let iterations = 0;
    const MAX_ITERATIONS = 5;

    while (iterations < MAX_ITERATIONS) {
      let changed = false;
      const next = current.replace(/(@?)\{([^{}]+)\}/g, (match, prefix, content) => {
        
        const qIndex = content.indexOf('?');
        if (qIndex > 0) { 
            const conditionRaw = content.substring(0, qIndex).trim();
            const rest = content.substring(qIndex + 1);
            const cIndex = rest.indexOf(':');
            
            let trueVal = rest;
            let falseVal = "";
            
            if (cIndex !== -1) {
                trueVal = rest.substring(0, cIndex);
                falseVal = rest.substring(cIndex + 1);
            }

            const opMatch = conditionRaw.match(/^(.+?)\s*(==|!=|>=|<=|>|<|=)\s*(.+)$/);
            let isMet = false;

            if (opMatch) {
                const leftRaw = opMatch[1].trim();
                const op = opMatch[2];
                const rightRaw = opMatch[3].trim();

                let leftVal = this.getNestedValue(leftRaw, context, activeTargets);
                let rightVal = this.getNestedValue(rightRaw, context, activeTargets);
                
                if (rightVal === null || rightVal === undefined) {
                     if (!isNaN(rightRaw)) rightVal = Number(rightRaw);
                     else if (rightRaw === 'true') rightVal = true;
                     else if (rightRaw === 'false') rightVal = false;
                     else rightVal = rightRaw.replace(/^['"]|['"]$/g, '');
                }

                if (leftVal === null || leftVal === undefined) {
                    leftVal = leftRaw;
                }

                const l = leftVal;
                const r = rightVal;

                if (op === '==' || op === '=') isMet = (l == r);
                else if (op === '!=') isMet = (l != r);
                else if (op === '>') isMet = (Number(l) > Number(r));
                else if (op === '<') isMet = (Number(l) < Number(r));
                else if (op === '>=') isMet = (Number(l) >= Number(r));
                else if (op === '<=') isMet = (Number(l) <= Number(r));

            } else {
                const val = this.getNestedValue(conditionRaw, context, activeTargets);
                isMet = !!val;
            }

            changed = true;
            return isMet ? trueVal : falseVal;
        }

        const path = content.trim(); 

        // --- NEW: Detect .join('separator') syntax ---
        // Regex looks for: something.join('sep') or .join("sep")
        const joinMatch = path.match(/^(.+?)\.join\((['"])(.*?)\2\)$/);
        
        if (joinMatch) {
            const varPath = joinMatch[1];
            const separator = joinMatch[3];
            const val = this.getNestedValue(varPath, context, activeTargets);
            
            if (Array.isArray(val)) {
                changed = true;
                return val.join(separator);
            }
        }
        // ---------------------------------------------

        const val = this.getNestedValue(path, context, activeTargets);
        
        if (val === null || val === undefined) {
            return match;
        }
        
        changed = true;
        if (prefix === '@') {
           if (val && typeof val === 'object' && val.displayName) return `@${val.displayName}`;
           const strVal = String(val);
           return strVal.startsWith('@') ? strVal : `@${strVal}`;
        } else {
           if (Array.isArray(val)) {
               return val.map(v => {
                   if (v && typeof v === 'object' && v.displayName) return v.displayName;
                   return String(v);
               }).join(' '); // Default space join for legacy compat
           }
           return typeof val === 'object' ? (val.displayName || JSON.stringify(val)) : String(val);
        }
      });
      if (!changed) break;
      current = next;
      iterations++;
    }
    return current;
  }

  static resolveUserEntity(input, context, knownUsers, autoCreate = true, registerCallback) {
    if (!input || typeof input !== 'string') return null;
    let clean = input.trim();
    if (clean.startsWith('@')) clean = clean.substring(1);
    
    // SAFETY FIX: If the string looks like an unresolved variable (e.g. "{args.0}"), return null.
    // This prevents creating mock users named "{args.0}" when resolution fails.
    if (!clean || clean === '{}' || clean === '@{}' || (clean.startsWith('{') && clean.endsWith('}'))) return null;
    
    const lowerClean = clean.toLowerCase();
    
    if (context.sender.username.toLowerCase() === lowerClean || context.sender.displayName.toLowerCase() === lowerClean || context.sender.id === clean) return context.sender;
    if (context.variables.targetUser && (context.variables.targetUser.username.toLowerCase() === lowerClean || context.variables.targetUser.displayName.toLowerCase() === lowerClean || context.variables.targetUser.id === clean)) return context.variables.targetUser;
    
    if (knownUsers[lowerClean]) return knownUsers[lowerClean];
    if (knownUsers[clean]) return knownUsers[clean];

    if (clean.length >= 1 && !clean.includes(' ')) {
      // Fallback: If not found in known users, treat the input string as a target username.
      // This allows finding users who are not yet in the DB or are offline.
      const newUser = { id: lowerClean, username: lowerClean, displayName: clean };
      if (autoCreate && registerCallback) registerCallback(newUser);
      return newUser;
    }
    return null;
  }

  static parseSmartNumber(input, contextUserPoints = 0, allowedTypes = []) {
      let str = input.toString().toLowerCase().trim();
      
      const modes = Array.isArray(allowedTypes) ? allowedTypes : [];

      if (str === 'all' || str === 'max' || str === 'wszystko') {
          if (modes.includes('all')) return contextUserPoints;
          return NaN;
      }

      let multiplier = 1;
      let suffixUsed = false;

      if (str.endsWith('kk') || str.endsWith('m')) {
          if (!modes.includes('kk') && !modes.includes('m')) return NaN;
          multiplier = 1000000;
          str = str.replace(/kk$|m$/, '');
          suffixUsed = true;
      } else if (str.endsWith('k')) {
          if (!modes.includes('k')) return NaN;
          multiplier = 1000;
          str = str.replace(/k$/, '');
          suffixUsed = true;
      }

      if (str.endsWith('%')) {
          if (!modes.includes('%')) return NaN;
          const pct = parseFloat(str.replace('%', ''));
          if (isNaN(pct) || pct < 0) return NaN;
          return Math.floor(contextUserPoints * (pct / 100));
      }

      const val = parseFloat(str);
      if (isNaN(val)) return NaN;
      
      if (!suffixUsed && !/^-?\d+(\.\d+)?$/.test(str)) {
          return NaN;
      }

      return Math.floor(val * multiplier);
  }
}