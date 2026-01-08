
import { AuthModel, UserModel } from './db.js';
import crypto from 'crypto';

const MINIMAL_SCOPES = 'user:read:email';

// Scopes for Chat interaction
const CHAT_SCOPES = 'chat:read chat:edit clips:edit';

// Scopes for Broadcaster Events (Read-only, no chat write)
const BROADCASTER_EVENTS_SCOPES = 'channel:read:redemptions moderator:read:followers';

// Scopes SPECIFICALLY for the Bot Account (Admin Panel Setup)
const BOT_SCOPES = 'chat:read chat:edit user:read:email clips:edit channel:read:redemptions moderator:read:followers user:read:chat user:bot channel:bot';

// Module-level cache for App Token
let _appToken = null;
let _appExpires = 0;
let _fetchPromise = null; // Cache the active promise to prevent duplicate requests

export class AuthManager {
    get clientId() { return process.env.TWITCH_CLIENT_ID; }
    get clientSecret() { return process.env.TWITCH_CLIENT_SECRET; }
    get redirectUri() { return process.env.REDIRECT_URI || 'http://localhost:3001/auth/callback'; }

    /**
     * Gets an App Access Token (Client Credentials Flow)
     * Required for EventSub Webhook creation.
     */
    async getAppAccessToken() {
        if (_appToken && Date.now() < _appExpires) {
            return _appToken;
        }
        if (_fetchPromise) {
            return _fetchPromise;
        }

        _fetchPromise = (async () => {
            try {
                console.log("🔄 Fetching new App Access Token...");
                const params = new URLSearchParams({
                    client_id: this.clientId,
                    client_secret: this.clientSecret,
                    grant_type: 'client_credentials'
                });

                const res = await fetch('https://id.twitch.tv/oauth2/token', {
                    method: 'POST',
                    body: params
                });

                const data = await res.json();
                if (!res.ok) throw new Error(JSON.stringify(data));

                _appToken = data.access_token;
                _appExpires = Date.now() + (data.expires_in * 1000) - 60000;
                
                return _appToken;
            } catch (e) {
                console.error("❌ Failed to get App Access Token:", e);
                return null;
            } finally {
                _fetchPromise = null;
            }
        })();

        return _fetchPromise;
    }

    getAuthUrl(state, options = { chat: true, events: false }) {
        const encodedRedirect = encodeURIComponent(this.redirectUri);
        
        // CASE 1: Bot Setup (Triggered from Admin Panel) -> Full Scopes
        if (state === 'BOT_SETUP') {
            const encodedScopes = encodeURIComponent(BOT_SCOPES);
            return `https://id.twitch.tv/oauth2/authorize?client_id=${this.clientId}&redirect_uri=${encodedRedirect}&response_type=code&scope=${encodedScopes}&state=${state}`;
        }

        // CASE 2: User Login -> Build scopes based on selection
        let scopesList = MINIMAL_SCOPES;
        
        if (options.chat) {
            scopesList += ' ' + CHAT_SCOPES;
        }
        if (options.events) {
            scopesList += ' ' + BROADCASTER_EVENTS_SCOPES;
        }

        const encodedScopes = encodeURIComponent(scopesList);
        
        let url = `https://id.twitch.tv/oauth2/authorize?client_id=${this.clientId}&redirect_uri=${encodedRedirect}&response_type=code&scope=${encodedScopes}`;
        if (state) {
            url += `&state=${state}`;
        }
        return url;
    }

    async getSession(sessionToken) {
        return await AuthModel.findOne({ sessionToken });
    }

    async refreshUserToken(userId) {
        const auth = await AuthModel.findOne({ userId });
        if (!auth || !auth.refreshToken) return null;

        try {
            console.log(`🔄 Refreshing token for user ${auth.username}...`);
            const params = new URLSearchParams({
                client_id: this.clientId,
                client_secret: this.clientSecret,
                grant_type: 'refresh_token',
                refresh_token: auth.refreshToken
            });

            const res = await fetch('https://id.twitch.tv/oauth2/token', {
                method: 'POST',
                body: params
            });

            const data = await res.json();

            if (!res.ok) {
                console.error("❌ Failed to refresh token:", data);
                return null;
            }

            const expiresAt = Date.now() + (data.expires_in * 1000);

            await AuthModel.updateOne(
                { userId },
                { 
                    accessToken: data.access_token, 
                    refreshToken: data.refresh_token, 
                    expiresAt: expiresAt 
                }
            );
            
            return {
                accessToken: data.access_token,
                refreshToken: data.refresh_token,
                expiresAt: expiresAt
            };
        } catch (e) {
            console.error("❌ Refresh error", e);
            return null;
        }
    }

    async exchangeCode(code, isBot = false) {
        try {
            console.log("🔄 Exchanging code for tokens...");
            const params = new URLSearchParams({
                client_id: this.clientId,
                client_secret: this.clientSecret,
                code: code,
                grant_type: 'authorization_code',
                redirect_uri: this.redirectUri
            });

            const res = await fetch('https://id.twitch.tv/oauth2/token', {
                method: 'POST',
                body: params
            });

            const data = await res.json();
            if (!res.ok) throw new Error(JSON.stringify(data));

            const userRes = await fetch('https://api.twitch.tv/helix/users', {
                headers: {
                    'Authorization': `Bearer ${data.access_token}`,
                    'Client-Id': this.clientId
                }
            });
            const userData = await userRes.json();
            if (!userData.data || userData.data.length === 0) throw new Error('Failed to fetch user profile');
            
            const twitchUser = userData.data[0];
            const sessionToken = crypto.randomUUID();

            const authUpdate = {
                userId: twitchUser.id,
                username: twitchUser.login,
                sessionToken: sessionToken,
                accessToken: data.access_token,
                refreshToken: data.refresh_token,
                expiresAt: Date.now() + (data.expires_in * 1000),
                scope: data.scope // Store scopes to know what we have access to
            };

            if (isBot) {
                authUpdate.isBot = true;
            }

            // Update Authentication Data
            await AuthModel.findOneAndUpdate(
                { userId: twitchUser.id },
                authUpdate,
                { upsert: true, new: true }
            );

            // Update User Profile Data
            await UserModel.findOneAndUpdate(
                { id: twitchUser.id },
                { 
                    $set: {
                        username: twitchUser.login,
                        displayName: twitchUser.display_name,
                        profileImageUrl: twitchUser.profile_image_url,
                        lastUpdated: Date.now()
                    }
                },
                { upsert: true, new: true }
            );
            
            console.log(`✅ Authenticated ${twitchUser.login} (ID: ${twitchUser.id}) [Bot: ${isBot}] [Scopes: ${data.scope}]`);

            return {
                sessionToken,
                user: {
                    userId: twitchUser.id,
                    username: twitchUser.login,
                    accessToken: data.access_token,
                    refreshToken: data.refresh_token,
                    expiresIn: data.expires_in
                }
            };
        } catch (e) {
            console.error("❌ Failed to exchange code", e);
            return null;
        }
    }
}
