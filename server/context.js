
// Shared In-Memory State
export const usersDB = {};
export let commandsDB = [];
export const pointsDB = new Map(); // Key: `${channelId}:${userId}`, Value: Number
export const executors = new Map();
export const userSockets = new Map(); // Key: userId, Value: Set<WebSocket>
export const authWaiters = new Map();
export const participants = new Map();
export const activeWaitings = new Map();
export const channelAttendees = new Map();
export const cachedLiveStreams = new Set();
export const adminSessions = new Set();

// Bot Client Singleton in Context to avoid circular deps
export let botClient = null;
export const setBotClient = (client) => {
    botClient = client;
};

export const setCommandsDB = (newCmds) => {
    // Clear and push to keep reference if used elsewhere, though assignment is safer if imported
    commandsDB.length = 0;
    commandsDB.push(...newCmds);
};

export const getUserIdBySocket = (ws) => {
    for (const [uid, sockets] of userSockets.entries()) {
        if (sockets.has(ws)) return uid;
    }
    return undefined;
};
