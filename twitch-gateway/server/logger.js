
export class LoggerService {
    constructor() {
        this.logs = [];
        // Clean up old logs every minute
        setInterval(() => this.cleanup(), 60000);
    }

    /**
     * Adds a log entry.
     * @param {string} level - 'info', 'warn', 'error'
     * @param {string} message - Short description
     * @param {Error|any} error - The error object (optional) for traceback
     * @param {string} context - Where the error happened (e.g. "EventSub", "Gateway")
     */
    addLog(level, message, error = null, context = 'System') {
        const timestamp = new Date();
        
        let stack = null;
        let detail = null;

        if (error) {
            if (error instanceof Error) {
                stack = error.stack;
                detail = error.message;
            } else if (typeof error === 'object') {
                try {
                    detail = JSON.stringify(error, null, 2);
                } catch (e) {
                    detail = String(error);
                }
            } else {
                detail = String(error);
            }
        }

        const entry = {
            id: crypto.randomUUID(),
            timestamp,
            level,
            context,
            message,
            detail,
            stack
        };

        // Add to beginning of array
        this.logs.unshift(entry);
        
        // Safety limit to prevent memory overflow if spamming errors
        if (this.logs.length > 2000) {
            this.logs = this.logs.slice(0, 2000);
        }

        // Console echo for Docker logs
        if (level === 'error') {
            console.error(`[${context}] ${message}`, error);
        } else if (process.env.DEV === 'true') {
            console.log(`[${context}] ${message}`);
        }
    }

    getLogs() {
        return this.logs;
    }

    cleanup() {
        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
        // Keep logs newer than 1 hour
        this.logs = this.logs.filter(log => log.timestamp > oneHourAgo);
    }
}

// Singleton instance
export const logger = new LoggerService();
