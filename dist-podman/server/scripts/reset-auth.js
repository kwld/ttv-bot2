
// scripts/reset-auth.js
// Run this to clear the Main Bot credentials and force a re-auth flow on next server start.

require('dotenv').config();
const mongoose = require('mongoose');

const reset = async () => {
    if (!process.env.MONGO_URI) {
        console.error("❌ MONGO_URI not found in .env");
        process.exit(1);
    }

    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log("✅ Connected to DB");

        // Define a temporary schema to access the collection
        const AuthModel = mongoose.model('Auth', new mongoose.Schema({}, { strict: false }));

        // Delete the entry marked as isBot: true
        const result = await AuthModel.deleteMany({ isBot: true });
        
        if (result.deletedCount > 0) {
            console.log(`✅ Successfully deleted ${result.deletedCount} bot credential(s).`);
            console.log("👉 Restart the server ('npm start') to re-initialize the Bot Auth Flow.");
        } else {
            console.log("ℹ️ No bot credentials found to delete.");
        }

    } catch (e) {
        console.error("❌ Error:", e);
    } finally {
        await mongoose.disconnect();
        process.exit(0);
    }
};

reset();
