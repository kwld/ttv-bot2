
import path from 'path';
import fs from 'fs';
import WebSocket from 'ws';
import readline from 'readline';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });

const WS_PORT = process.env.WS_PORT || 8080;
const CONFIG_FILE = path.join(__dirname, '../config/gateway-token.json');

// Try to load token
let token = '';
try {
    if (fs.existsSync(CONFIG_FILE)) {
        const data = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
        token = data.token;
        console.log(`[CLI] Loaded auth token from config.`);
    } else {
        console.error('Error: Token file not found (config/gateway-token.json).');
        console.error('Please run the server once to generate the token.');
        process.exit(1);
    }
} catch (e) {
    console.error('Error reading token file:', e.message);
    process.exit(1);
}

const ws = new WebSocket(`ws://localhost:${WS_PORT}?token=${token}`);

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

ws.on('open', () => {
  console.log('\n--- Connected to Twitch Gateway! ---');
  console.log('You are now listening to real-time events from the bot.');
  console.log('Available Commands:');
  console.log('  channel:message   -> Send Chat Message (e.g. ninja:hello)');
  console.log('  /join <channel>   -> Bot Joins Channel');
  console.log('  /part <channel>   -> Bot Leaves Channel');
  console.log('----------------------------------------\n');
  process.stdout.write('> ');
});

ws.on('message', (raw) => {
  const payload = JSON.parse(raw);
  
  // Clear current line to prevent overlapping with prompt
  readline.clearLine(process.stdout, 0);
  readline.cursorTo(process.stdout, 0);
  
  // payload.type is now the EventSub type (e.g. channel.chat.message)
  console.log(`[EVENT] ${payload.type} | ${payload.timestamp}`);

  // Check if it's a full EventSub payload (has subscription and event)
  if (payload.event && payload.subscription) {
      const e = payload.event;
      // Chat Message Notification
      if (payload.type === 'channel.chat.message') {
          const user = e.chatter_user_name || e.chatter_user_login;
          const msg = e.message?.text || '';
          const channel = e.broadcaster_user_name || e.broadcaster_user_login;
          console.log(`  [Chat] #${channel} ${user}: ${msg}`);
      }
      // Stream Online
      else if (payload.type === 'stream.online') {
          console.log(`  [Stream] ${e.broadcaster_user_name} is now LIVE at ${e.started_at}!`);
      }
      // Custom Redemption
      else if (payload.type === 'channel.channel_points_custom_reward_redemption.add') {
          console.log(`  [Redeem] ${e.user_name} redeemed ${e.reward?.title}`);
          if (e.user_input) console.log(`           Input: ${e.user_input}`);
      }
      // Automatic Redemption
      else if (payload.type === 'channel.channel_points_automatic_reward_redemption.add') {
          console.log(`  [Auto-Redeem] ${e.user_name} redeemed ${e.reward?.type}`);
          if (e.message?.text) console.log(`                Message: ${e.message.text}`);
      }
      // Bits Use
      else if (payload.type === 'channel.bits.use') {
          console.log(`  [Bits] ${e.user_name} used ${e.bits} bits via ${e.type}`);
          if (e.message?.text) console.log(`         Message: ${e.message.text}`);
          if (e.power_up) console.log(`         Power-up: ${e.power_up.type}`);
      }
      // Shared Chat Begin
      else if (payload.type === 'channel.shared_chat.begin') {
          console.log(`  [SharedChat] Session STARTED`);
          console.log(`               Host: ${e.host_broadcaster_user_name}`);
          if (e.participants) {
            console.log(`               Participants: ${e.participants.map(p => p.broadcaster_user_name).join(', ')}`);
          }
      }
      // Shared Chat Update
      else if (payload.type === 'channel.shared_chat.update') {
          console.log(`  [SharedChat] Session UPDATED`);
          console.log(`               Host: ${e.host_broadcaster_user_name}`);
          if (e.participants) {
            console.log(`               Participants: ${e.participants.map(p => p.broadcaster_user_name).join(', ')}`);
          }
      }
      // Shared Chat End
      else if (payload.type === 'channel.shared_chat.end') {
          console.log(`  [SharedChat] Session ENDED`);
          console.log(`               Host: ${e.host_broadcaster_user_name}`);
      }
      else {
          // Fallback log
          console.log(JSON.stringify(e, null, 2));
      }
  } else if (payload.message) {
      // System messages (WELCOME, etc)
      console.log(`  ${payload.message}`);
  } else {
      console.log(JSON.stringify(payload, null, 2));
  }
  
  console.log('');
  process.stdout.write('> ');
});

ws.on('close', (code, reason) => {
    console.log(`\nDisconnected from Gateway (Code: ${code}). Reason: ${reason}`);
    process.exit(0);
});

ws.on('error', (err) => {
    console.log('\nConnection Error:', err.message);
    process.exit(1);
});

rl.on('line', (line) => {
  line = line.trim();
  if (!line) return;

  if (line.startsWith('/join ')) {
      const channel = line.split(' ')[1];
      ws.send(JSON.stringify({ command: 'JOIN', channel }));
      console.log(`[CMD] Sent JOIN for ${channel}`);
  } else if (line.startsWith('/part ')) {
      const channel = line.split(' ')[1];
      ws.send(JSON.stringify({ command: 'PART', channel }));
      console.log(`[CMD] Sent PART for ${channel}`);
  } else if (line.includes(':')) {
      const parts = line.split(':');
      if (parts.length >= 2) {
        const channel = parts[0];
        const message = parts.slice(1).join(':');
        
        ws.send(JSON.stringify({
          command: 'SAY',
          channel: channel,
          message: message
        }));
        console.log(`[CMD] Sending to ${channel}: ${message}`);
      }
  } else {
    console.log('Invalid format. Use "channel:message" or "/join <channel>"');
  }
  process.stdout.write('> ');
});
