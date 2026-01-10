
import dotenv from 'dotenv';
dotenv.config();

import http from 'http';
import fs from 'fs';
import path from 'path';
import express from 'express';
import cors from 'cors';
import { WebSocketServer } from 'ws';
import { connectDB, UserModel, CommandModel, AuthModel, PointModel, isDBConnected } from './db.js';
import { router as apiRouter } from './routes.js';
import { handleConnection } from './socket.js';
import { initBot } from './bot.js';
import { usersDB, setCommandsDB, pointsDB } from './context.js';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = parseInt(process.env.PORT || '3001');
const app = express();

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Startup Check
if (!process.env.SUPER_USER_TWITCH_ID || !process.env.SUPER_USER_PASSWORD) {
    console.warn("⚠️  WARNING: SUPER_USER_TWITCH_ID or SUPER_USER_PASSWORD not set in .env.");
    console.warn("   You will not be able to log in to the /admin panel.");
} else {
    console.log("✅ Admin Credentials Loaded from .env");
}

const init = async () => {
    await connectDB();
    
    if (!isDBConnected) {
        console.warn("⚠️ Database is offline. Skipping initial state load. Server running in limited mode.");
        return;
    }

    try {
        // Load State from DB
        const users = await UserModel.find({}).lean();
        users.forEach(u => {
            usersDB[u.id] = u;
            if (u.username) usersDB[u.username.toLowerCase()] = u;
        });

        // Load Points
        try {
            const allPoints = await PointModel.find({}).lean();
            allPoints.forEach(p => {
                pointsDB.set(`${p.channelId}:${p.userId}`, p.amount);
            });
            console.log(`✅ Loaded ${allPoints.length} point records into memory.`);
        } catch (e) {
            console.warn("⚠️ Could not load points (First run?):", e.message);
        }

        const auths = await AuthModel.find({ isBot: false }).lean();
        auths.forEach(a => {
            if (!usersDB[a.userId]) {
                usersDB[a.userId] = { id: a.userId, username: a.username, displayName: a.username, points: 0 };
                usersDB[a.username.toLowerCase()] = usersDB[a.userId];
            } else {
                if (!usersDB[a.username.toLowerCase()]) usersDB[a.username.toLowerCase()] = usersDB[a.userId];
            }
        });

        const cmds = await CommandModel.find({}).lean();
        setCommandsDB(cmds);

        // Init Gateway Connection
        console.log('✅ Initializing Gateway Connection...');
        initBot({}); // No specific auth object needed for Gateway, uses ENV

    } catch (e) { console.error("❌ Startup Error", e); }
};

// Use Express Router
app.use(apiRouter);

if (process.env.NODE_ENV === 'production') {
    app.use(express.static(path.join(__dirname, '../public')));
    // Fix for Express 5: Use regex instead of '*' string for catch-all
    app.get(/(.*)/, (req, res, next) => {
        if (req.path.startsWith('/api') || req.path.startsWith('/auth') || req.path.startsWith('/webhooks')) return next();
        res.sendFile(path.join(__dirname, '../public/index.html'));
    });
}

const httpServer = http.createServer(app);
const wss = new WebSocketServer({ server: httpServer });

wss.on('connection', handleConnection);

httpServer.listen(PORT, () => {
    console.log(`🚀 GEMINI BOT FLOW SERVER STARTED on Port ${PORT}`);
    init();
});
