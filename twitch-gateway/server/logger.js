
import crypto from 'crypto';

class LoggerService {
    constructor() {
        this.logs = [];
        // Clean up logs older than 1 hour every 5 minutes
        setInterval(() => this.cleanup(), 5 * 60 * 1000);
    }

    /**
     * Adds a log entry.
     * @param {string} level - 'info', 'warn', 'error', 'debug'
     * @param {string} message - Brief description
     * @param {Error|null} error - Optional error object for traceback
     * @param {Object|null} context - Additional metadata
     */
    add(level, message, error = null, context = null) {
        const timestamp = new Date();
        const entry = {
            id: crypto.randomUUID(),
            timestamp: timestamp.toISOString(),
            level,
            message,
            trace: error ? (error.stack || error.message) : null,
            context: context ? JSON.stringify(context, null, 2) : null
        };

        this.logs.unshift(entry);
        
        // Keep logs manageable in memory (max 1000 entries safety cap)
        if (this.logs.length > 1000) {
            this.logs = this.logs.slice(0, 1000);
        }

        // Console output for Docker logs
        const prefix = `[${level.toUpperCase()}]`;
        if (level === 'error') {
            console.error(prefix, message, error || '');
        } else {
            // Only log non-errors to console if in dev or explicit info
            if (process.env.DEV === 'true' || level === 'info') {
                console.log(prefix, message);
            }
        }
    }

    /**
     * Helper for adding error logs
     */
    error(message, error, context = null) {
        this.add('error', message, error, context);
    }

    /**
     * Helper for adding info logs
     */
    info(message, context = null) {
        this.add('info', message, null, context);
    }

    getLogs() {
        return this.logs;
    }

    cleanup() {
        const oneHourAgo = Date.now() - (60 * 60 * 1000);
        const initialCount = this.logs.length;
        this.logs = this.logs.filter(log => new Date(log.timestamp).getTime() > oneHourAgo);
        
        if (initialCount !== this.logs.length && process.env.DEV === 'true') {
            console.log(`[Logger] Cleaned up ${initialCount - this.logs.length} old logs.`);
        }
    }
}

export const Logger = new LoggerService();
