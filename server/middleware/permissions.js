
import { AuthManager } from '../authManager.js';
import { ChannelSettingsModel } from '../db.js';

const authManager = new AuthManager();

/**
 * Express Middleware to ensure the requester is logged in.
 * Does NOT check for channel ownership/editor rights.
 */
export const requireAuth = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader) {
            return res.status(401).json({ error: 'Authentication Required' });
        }

        const token = authHeader.replace('Bearer ', '');
        const session = await authManager.getSession(token);

        if (!session) {
            return res.status(401).json({ error: 'Invalid or Expired Session' });
        }

        req.user = session; // Attach user to request
        next();
    } catch (e) {
        console.error("[Middleware] Auth Check Error:", e);
        return res.status(500).json({ error: 'Internal Auth Error' });
    }
};

/**
 * Express Middleware to ensure the requester has edit rights for the target channel.
 * Allows: Channel Owner, Assigned Editors, Super Admin (optional).
 */
export const requireChannelAccess = async (req, res, next) => {
    try {
        // 1. Authenticate Request
        const authHeader = req.headers.authorization;
        if (!authHeader) {
            return res.status(401).json({ error: 'Authentication Required' });
        }

        const token = authHeader.replace('Bearer ', '');
        const session = await authManager.getSession(token);

        if (!session) {
            return res.status(401).json({ error: 'Invalid or Expired Session' });
        }

        req.user = session; // Attach user to request

        // 2. Identify Target Channel
        const body = req.body || {};
        // Logic: channelId can be in body (POST/PUT) or query/params (GET/DELETE)
        let targetChannelId = body.channelId || req.query.channelId || req.params.channelId;

        // If dealing with a command object, it might be nested
        if (!targetChannelId && body.command) {
            targetChannelId = body.command.channelId;
        }
        
        // Special case for AI Builder which passes currentCommand
        if (!targetChannelId && body.currentCommand) {
            targetChannelId = body.currentCommand.channelId;
        }

        // If no channel specified, default to the user's own channel (Self-Edit)
        if (!targetChannelId) {
            targetChannelId = session.userId;
        }

        // 3. Verify Permissions
        const userId = session.userId;

        // A. Local/Simulation Channel Bypass
        // Allows AI generation for local channels (sim_*, ch_*) without DB checks
        if (typeof targetChannelId === 'string' && (targetChannelId.startsWith('sim_') || targetChannelId.startsWith('ch_'))) {
            return next();
        }

        // B. Is Owner?
        if (targetChannelId === userId) {
            return next();
        }

        // C. Is Editor?
        const settings = await ChannelSettingsModel.findOne({ channelId: targetChannelId });
        if (settings && settings.editors) {
            const isEditor = settings.editors.some(e => 
                (typeof e === 'string' && e === userId) || 
                (typeof e === 'object' && e.id === userId)
            );
            
            if (isEditor) {
                return next();
            }
        }

        // D. Deny Access
        console.warn(`[Security] Unauthorized access attempt by ${session.username} to channel ${targetChannelId}`);
        return res.status(403).json({ error: 'Permission Denied: You are not an editor of this channel.' });

    } catch (e) {
        console.error("[Middleware] Permission Check Error:", e);
        return res.status(500).json({ error: 'Internal Security Error' });
    }
};
