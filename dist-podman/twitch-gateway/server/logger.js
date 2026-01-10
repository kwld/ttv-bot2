
export const logs = [];
const RETENTION_MS = 60 * 60 * 1000; // 1 Hour

export const addLog = (level, message, error = null) => {
    const timestamp = new Date();
    
    let traceback = null;
    let errorMessage = message;

    if (error) {
        if (typeof error === 'object') {
            traceback = error.stack || null;
            errorMessage = `${message}: ${error.message || JSON.stringify(error)}`;
        } else {
            errorMessage = `${message}: ${String(error)}`;
        }
    }

    const entry = {
        id: crypto.randomUUID(),
        timestamp,
        level: level.toUpperCase(), // INFO, WARN, ERROR
        message: errorMessage,
        traceback
    };

    logs.unshift(entry); // Add to top

    // Cleanup old logs
    const cutoff = Date.now() - RETENTION_MS;
    // Optimization: Only filter if array gets too big or periodically
    if (logs.length > 5000 || (logs.length > 0 && logs[logs.length-1].timestamp.getTime() < cutoff)) {
        let i = logs.length;
        while (i--) {
            if (logs[i].timestamp.getTime() < cutoff) {
                logs.pop();
            } else {
                break; // Ordered by time desc, so we can stop
            }
        }
    }
};

// Periodic cleanup every 10 minutes
setInterval(() => {
    const cutoff = Date.now() - RETENTION_MS;
    let i = logs.length;
    while (i--) {
        if (logs[i].timestamp.getTime() < cutoff) {
            logs.pop();
        } else {
            break;
        }
    }
}, 10 * 60 * 1000);

import crypto from 'crypto';
