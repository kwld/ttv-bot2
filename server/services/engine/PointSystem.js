
export class RegistryPointSystem {
  constructor(container, channelId, onUpdate) {
    this.container = container; // Can be Map<string, number> (Server) or Object<string, User> (Browser)
    this.channelId = channelId;
    this.onUpdate = onUpdate;
    this.isMap = (container instanceof Map);
  }

  getPoints(userId) {
    if (this.isMap) {
        return this.container.get(`${this.channelId}:${userId}`) || 0;
    } else {
        // Browser Mode: container is userRegistry object
        const user = this.container[userId];
        return user ? (user.points || 0) : 0;
    }
  }

  modifyPoints(userId, amount, operation) {
    const current = this.getPoints(userId);
    let newVal = current;
    
    if (operation === 'add') newVal = current + amount;
    else if (operation === 'remove') newVal = Math.max(0, current - amount);
    else if (operation === 'set') newVal = amount;
    
    if (this.isMap) {
        this.container.set(`${this.channelId}:${userId}`, newVal);
    } else {
        // Browser Mode
        const user = this.container[userId];
        if (user) {
            user.points = newVal;
        }
    }
    
    if (this.onUpdate) {
        this.onUpdate(userId, newVal);
    }
    
    return newVal;
  }

  getLeaderboard(limit, sortBy = 'points') {
      let users = [];
      
      if (this.isMap) {
          // Server Mode: Combine points from Map with User metadata from Registry
          if (!this.registry) return [];
          const uniqueMap = new Map();
          
          for (const [key, val] of this.container.entries()) {
              if (key.startsWith(`${this.channelId}:`)) {
                  const uid = key.split(':')[1];
                  if (this.registry[uid]) {
                      uniqueMap.set(uid, { ...this.registry[uid], points: val });
                  }
              }
          }
          users = Array.from(uniqueMap.values());
      } else {
          // Browser Mode: Container IS the registry
          users = Object.values(this.container);
      }
      
      let sorted;
      if (sortBy === 'messages') {
          sorted = users.sort((a, b) => (b.messageCount || 0) - (a.messageCount || 0));
      } else if (sortBy === 'online') {
          sorted = users.sort((a, b) => (b.onlineMinutes || 0) - (a.onlineMinutes || 0));
      } else {
          sorted = users.sort((a, b) => (b.points || 0) - (a.points || 0));
      }

      return sorted.slice(0, limit).map(u => ({
          ...u,
          points: u.points || 0,
          messageCount: u.messageCount || 0,
          onlineMinutes: u.onlineMinutes || 0
      }));
  }

  getAllPoints() {
    const res = {};
    if (this.isMap) {
        for (const [key, val] of this.container.entries()) {
            if (key.startsWith(`${this.channelId}:`)) {
                const uid = key.split(':')[1];
                res[uid] = val;
            }
        }
    } else {
        for (const [uid, user] of Object.entries(this.container)) {
            res[uid] = user.points || 0;
        }
    }
    return res;
  }

  persist() {
     // Triggered via onUpdate usually
  }
}

// Helper to inject registry for leaderboards (Server Mode)
RegistryPointSystem.prototype.setRegistry = function(registry) {
    this.registry = registry;
};

export class MemoryPointSystem {
  constructor(initialPoints = {}) {
    this.points = initialPoints;
  }

  getPoints(userId) {
    return this.points[userId] || 0;
  }

  modifyPoints(userId, amount, operation) {
    const current = this.points[userId] || 0;
    let newVal = current;
    
    if (operation === 'add') newVal = current + amount;
    else if (operation === 'remove') newVal = Math.max(0, current - amount);
    else if (operation === 'set') newVal = amount;
    
    this.points[userId] = newVal;
    this.persist();
    return newVal;
  }

  getLeaderboard(limit, sortBy = 'points') {
      return Object.entries(this.points)
          .map(([id, points]) => ({ 
              id, 
              points, 
              displayName: id, 
              username: id,
              messageCount: 0,
              onlineMinutes: 0 
          }))
          .sort((a, b) => b.points - a.points)
          .slice(0, limit);
  }

  getAllPoints() {
    return { ...this.points };
  }

  persist() {
    // No-op
  }
}