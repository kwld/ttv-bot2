


export class TwitchIRCClient {
    constructor(options) {
        this.token = options.token;
        this.username = options.username || 'gemini_bot';
        this.channels = new Set(options.channels || []);
        
        // Callbacks
        this.onMessage = options.onMessage || (() => {});
        this.onJoin = options.onJoin || (() => {});
        this.onPart = options.onPart || (() => {});
        this.onUserJoin = options.onUserJoin || (() => {});
        this.onUserPart = options.onUserPart || (() => {});
        this.onUserNotice = options.onUserNotice || (() => {});
        this.onClearChat = options.onClearChat || (() => {});
        this.onAuthFailed = options.onAuthFailed || (() => {});
        this.onConnected = options.onConnected || (() => {});
        this.onDisconnected = options.onDisconnected || (() => {});

        // Environment specific WebSocket
        this.WebSocketConstructor = options.WebSocket || (typeof WebSocket !== 'undefined' ? WebSocket : null);
        
        this.ws = null;
        this.isConnected = false;
        this.reconnectTimer = null;
        this.shouldReconnect = true;
        this.pingTimer = null;

        // Shared Chat Deduplication Tracking
        this.connectedRoomIds = new Set();
        this.channelToId = new Map();

        // Anti-Duplicate Message Tracking
        this.lastSentMessages = new Map(); // channel -> { cleanText: string, modified: boolean }
    }

    connect() {
        if (!this.WebSocketConstructor) {
            console.error('[TwitchIRC] No WebSocket constructor available.');
            return;
        }

        this.shouldReconnect = true;
        if (this.ws) {
            try { this.ws.close(); } catch(e) {}
        }

        const token = this.token.startsWith('oauth:') ? this.token : `oauth:${this.token}`;

        this.ws = new this.WebSocketConstructor('wss://irc-ws.chat.twitch.tv:443');

        this.ws.onopen = () => {
            console.log(`[TwitchIRC] Connecting as ${this.username}...`);
            this.ws.send(`PASS ${token}`);
            this.ws.send(`NICK ${this.username}`);
            this.ws.send('CAP REQ :twitch.tv/membership twitch.tv/tags twitch.tv/commands');
            this.startPing();
        };

        this.ws.onmessage = (event) => {
            const data = event.data;
            const raw = data.toString().trim();
            const lines = raw.split('\r\n');

            lines.forEach(line => {
                if (!line) return;

                if (line.startsWith('PING')) {
                    this.ws.send('PONG :tmi.twitch.tv');
                    return;
                }

                if (line.includes('Login authentication failed')) {
                    console.error('[TwitchIRC] Auth failed.');
                    this.isConnected = false;
                    this.shouldReconnect = false;
                    this.stopPing();
                    this.onAuthFailed();
                    this.ws.close();
                    return;
                }

                if (line.includes(' 001 ')) {
                    console.log('[TwitchIRC] Connected.');
                    this.isConnected = true;
                    this.onConnected();
                    // Re-join channels
                    this.channels.forEach(ch => this.join(ch, true));
                }

                this.parseMessage(line);
            });
        };

        this.ws.onclose = () => {
            this.isConnected = false;
            this.ws = null;
            this.stopPing();
            this.connectedRoomIds.clear();
            this.channelToId.clear();
            this.lastSentMessages.clear();
            this.onDisconnected();

            if (this.shouldReconnect) {
                console.log('[TwitchIRC] Connection closed. Reconnecting in 5s...');
                if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
                this.reconnectTimer = setTimeout(() => this.connect(), 5000);
            }
        };

        this.ws.onerror = (err) => {
            console.error('[TwitchIRC] Socket Error', err.message || err);
        };
    }

    startPing() {
        if (this.pingTimer) clearInterval(this.pingTimer);
        this.pingTimer = setInterval(() => {
            if (this.ws && this.ws.readyState === 1) {
                this.ws.send('PING :tmi.twitch.tv');
            }
        }, 60000); // 1 minute keep-alive
    }

    stopPing() {
        if (this.pingTimer) clearInterval(this.pingTimer);
        this.pingTimer = null;
    }

    disconnect() {
        this.shouldReconnect = false;
        if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
        this.stopPing();
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
        this.connectedRoomIds.clear();
        this.channelToId.clear();
        this.lastSentMessages.clear();
    }

    join(channelName, force = false) {
        const channel = channelName.toLowerCase().replace('#', '');
        if (!force && this.channels.has(channel)) return;

        this.channels.add(channel);
        if (this.isConnected && this.ws && this.ws.readyState === 1) {
            this.ws.send(`JOIN #${channel}`);
        }
    }

    part(channelName) {
        const channel = channelName.toLowerCase().replace('#', '');
        this.channels.delete(channel);
        
        // Remove tracking for Shared Chat
        const roomId = this.channelToId.get(channel);
        if (roomId) {
            this.connectedRoomIds.delete(roomId);
            this.channelToId.delete(channel);
        }
        this.lastSentMessages.delete(channel);

        if (this.isConnected && this.ws && this.ws.readyState === 1) {
            this.ws.send(`PART #${channel}`);
        }
    }

    say(channelName, message, options = {}) {
        if (this.isConnected && this.ws && this.ws.readyState === 1) {
            const target = channelName.toLowerCase().replace('#', '');
            
            // --- Auto-Deduplication Logic ---
            // If the message is identical to the last one sent to this channel,
            // Twitch will silently drop it. We append an invisible char to bypass this.
            let finalMessage = message;
            const lastEntry = this.lastSentMessages.get(target);

            if (lastEntry && lastEntry.cleanText === message) {
                // If we didn't modify it last time, modify it this time to make it unique.
                // If we DID modify it last time, sending raw this time makes it unique again.
                // Essentially toggling between "Text" and "Text + \u{E0000}"
                if (!lastEntry.modified) {
                    finalMessage = message + ' \u{E0000}'; // Tag Space (Invisible)
                }
            }

            let prefix = '';
            if (options.replyToId) {
                prefix = `@reply-parent-msg-id=${options.replyToId} `;
            }

            this.ws.send(`${prefix}PRIVMSG #${target} :${finalMessage}`);
            
            // Update tracker
            this.lastSentMessages.set(target, { 
                cleanText: message, 
                modified: finalMessage !== message 
            });
        }
    }

    parseMessage(raw) {
        const parts = raw.split(' ');
        let tagsRaw = '';
        let offset = 0;

        if (parts[0].startsWith('@')) {
            tagsRaw = parts[0].substring(1);
            offset = 1;
        }

        const tags = {};
        tagsRaw.split(';').forEach(tag => {
            if (!tag) return;
            const [key, val] = tag.split('=');
            tags[key] = val;
        });

        const prefix = parts[offset];
        if (!prefix) return;

        const cleanPrefix = prefix.startsWith(':') ? prefix.substring(1) : prefix;
        const username = cleanPrefix.split('!')[0];

        const command = parts[offset + 1];
        const channelWithHash = parts[offset + 2];
        const channel = channelWithHash ? channelWithHash.replace('#', '') : '';

        // --- Shared Chat Deduplication Logic ---
        const roomId = tags['room-id'];
        const sourceRoomId = tags['source-room-id'];

        // 1. Learn the Room ID for the current channel if available
        if (channel && roomId) {
            if (!this.connectedRoomIds.has(roomId)) {
                this.connectedRoomIds.add(roomId);
                this.channelToId.set(channel.toLowerCase(), roomId);
            }
        }

        // 2. Check if this is a Shared Chat message forwarded from another room
        if (roomId && sourceRoomId && roomId !== sourceRoomId) {
            // If we are already connected to the source room directly,
            // we ignore this "forwarded" copy to prevent duplication.
            if (this.connectedRoomIds.has(sourceRoomId)) {
                return; 
            }
        }
        // ---------------------------------------

        const badges = {};
        if (tags['badges']) {
            tags['badges'].split(',').forEach(pair => {
                const [key, version] = pair.split('/');
                badges[key] = version;
            });
        }

        // Handle subscriber badge logic (tenure)
        if (tags['badge-info']) {
            const badgeInfo = {};
            tags['badge-info'].split(';').forEach(pair => {
                if (!pair) return;
                const [key, version] = pair.split('/');
                badgeInfo[key] = version;
            });
            if (badgeInfo['subscriber']) {
                const tenure = parseInt(badgeInfo['subscriber']);
                if (!isNaN(tenure)) {
                    let mappedVersion = '0';
                    if (tenure >= 3) mappedVersion = '3';
                    if (tenure >= 6) mappedVersion = '6';
                    if (tenure >= 12) mappedVersion = '12';
                    if (tenure >= 24) mappedVersion = '24';
                    badges['subscriber'] = mappedVersion;
                }
            }
        }

        if (command === 'PRIVMSG') {
            const msgRaw = parts.slice(offset + 3).join(' ');
            let message = msgRaw.startsWith(':') ? msgRaw.substring(1) : msgRaw;

            if (message.startsWith('\u0001ACTION ')) {
                message = message.replace('\u0001ACTION ', '').replace('\u0001', '');
            }

            let replyInfo = undefined;
            if (tags['reply-parent-msg-id']) {
                replyInfo = {
                    parentDisplayName: tags['reply-parent-display-name'] || '',
                    parentMessageBody: (tags['reply-parent-msg-body'] || '').replace(/\\s/g, ' '),
                    parentMessageId: tags['reply-parent-msg-id'],
                    parentUserId: tags['reply-parent-user-id'] || '',
                    parentUserLogin: tags['reply-parent-user-login'] || '',
                };
            }

            // REDEMPTION CHECK
            let redemption = undefined;
            if (tags['custom-reward-id']) {
                redemption = {
                    id: tags['custom-reward-id'],
                    title: 'Custom Reward', // IRC doesn't send title/cost, needs PubSub/EventSub
                };
            } else if (tags['msg-id'] === 'highlighted-message') {
                redemption = {
                    id: 'highlighted-message',
                    title: 'Highlight My Message'
                };
            }

            if (username && channel) {
                this.onMessage({
                    channel,
                    message,
                    user: {
                        id: tags['user-id'] || username,
                        username,
                        displayName: tags['display-name'] || username,
                        isMod: tags['mod'] === '1',
                        isSub: badges['subscriber'] !== undefined || badges['founder'] !== undefined,
                        isVip: badges['vip'] !== undefined,
                        isBroadcaster: badges['broadcaster'] === '1' || username === channel.toLowerCase(),
                        badges,
                        color: tags['color']
                    },
                    isFirstMessage: tags['first-msg'] === '1',
                    reply: replyInfo,
                    tags,
                    redemption // Add redemption data if present
                });
            }
        } else if (command === 'USERNOTICE') {
            const systemMsg = (tags['system-msg'] || '').replace(/\\s/g, ' ');
            const userMsgRaw = parts.slice(offset + 3).join(' ');
            const userMsg = userMsgRaw.startsWith(':') ? userMsgRaw.substring(1) : userMsgRaw;
            const message = userMsg || systemMsg;

            this.onUserNotice({ channel, message, tags });
        } else if (command === 'NOTICE') {
            // Handle NOTICE as USERNOTICE for system alerts/errors
            const messageRaw = parts.slice(offset + 3).join(' ');
            const message = messageRaw.startsWith(':') ? messageRaw.substring(1) : messageRaw;
            this.onUserNotice({ channel, message, tags });
        } else if (command === 'CLEARCHAT') {
            const messagePart = parts.slice(offset + 3).join(' ');
            const targetUser = messagePart.startsWith(':') ? messagePart.substring(1) : undefined;
            this.onClearChat(channel, targetUser);
        } else if (command === 'JOIN') {
            if (username === this.username.toLowerCase()) {
                this.onJoin(channel);
            } else {
                this.onUserJoin(channel, username);
            }
        } else if (command === 'PART') {
            if (username === this.username.toLowerCase()) {
                this.onPart(channel);
            } else {
                this.onUserPart(channel, username);
            }
        }
    }
}
