
# Twitch Bot Gateway

A robust, multi-tenant Twitch EventSub and Chat gateway designed to sit between Twitch and your custom application. It handles OAuth, EventSub subscriptions, and Chat, exposing a unified Internal WebSocket API for your application to consume.

## Features

- **Multi-Tenant**: Manage multiple streamer accounts (Scopes, Tokens, Subscriptions).
- **Auto-Refresh**: Automatically handles OAuth token refreshing.
- **EventSub**: Automatically subscribes to events (Follows, Subs, Redemptions, **Chat**, **Shared Chat**) and forwards them via WS.
- **Chat Bot**: Centralized bot account that can join/speak in multiple channels.
- **Dashboard**: React-based admin UI to manage connections.
- **Security**: Internal WebSocket protected via auto-generated tokens.

## Setup

1. **Copy Environment File**:
   ```bash
   cp .env.example .env
   # Fill in TWITCH_CLIENT_ID, SECRET, and BASE_URL (https required)
   ```

2. **Build and Start with Docker**:
   You can build the Docker image using the provided npm script which generates the Dockerfile and builds the image:
   ```bash
   npm run build:docker
   ```
   Then start using compose:
   ```bash
   docker-compose up
   ```

3. **Access Dashboard**:
   - Open `http://localhost:3000`
   - Login with password defined in `.env` (Default: `admin`)
   - Authenticate the "Bot" account.
   - Add "Streamer" accounts.

## Internal WebSocket API

Your application should connect to the Internal Gateway to receive events and control the bot.

**Connection Details:**
- **URL**: `ws://localhost:8080`
- **Auth**: Required. On first start, the app generates a token in `config/gateway-token.json`.
- **Method**: Pass token via Query Param (`?token=XYZ`) or Authorization Header (`Bearer XYZ`).

### Incoming Events (Gateway -> App)

The Gateway forwards the **full Twitch EventSub payload**.
The root object always follows this structure:

```json
{
  "type": "channel.chat.message", // Matches the EventSub subscription type
  "timestamp": "2023-11-20T10:00:00.000Z", // Time of processing by Gateway
  "subscription": { 
      "id": "uuid",
      "type": "channel.chat.message",
      "version": "1",
      "status": "enabled",
      "condition": { ... },
      "transport": { ... },
      "created_at": "..."
  },
  "event": { ... } // The actual event data (See Reference Below)
}
```

### Event Data Reference

Below are the structures of the `event` object for the supported subscription types.

#### 1. Chat Message
**Type**: `channel.chat.message` (v1)

```json
{
  "broadcaster_user_id": "1971641",
  "broadcaster_user_login": "streamer",
  "broadcaster_user_name": "streamer",
  "chatter_user_id": "4145994",
  "chatter_user_login": "viewer32",
  "chatter_user_name": "viewer32",
  "message_id": "cc106a89-1814-919d-454c-f4f2f970aae7",
  "message": {
    "text": "Hi chat Kappa",
    "fragments": [
      {
        "type": "text",
        "text": "Hi chat ",
        "cheermote": null,
        "emote": null,
        "mention": null
      },
      {
        "type": "emote",
        "text": "Kappa",
        "cheermote": null,
        "emote": {
          "id": "25",
          "emote_set_id": "0",
          "owner_id": "twitch",
          "format": ["static"]
        },
        "mention": null
      }
    ]
  },
  "color": "#00FF7F",
  "badges": [
    { "set_id": "moderator", "id": "1", "info": "" },
    { "set_id": "subscriber", "id": "12", "info": "16" }
  ],
  "message_type": "text", // text, channel_points_highlighted, channel_points_sub_only, user_intro
  "cheer": null, // Contains bits info if this is a cheer
  "reply": null,
  "channel_points_custom_reward_id": null
}
```

#### 2. Channel Points (Custom)
**Type**: `channel.channel_points_custom_reward_redemption.add` (v1)

```json
{
  "id": "17fa2df1-ad76-4804-bfa5-a40ef63efe63",
  "broadcaster_user_id": "1337",
  "broadcaster_user_login": "cool_streamer",
  "broadcaster_user_name": "Cool_Streamer",
  "user_id": "9001",
  "user_login": "fan_one",
  "user_name": "Fan_One",
  "user_input": "Hydrate!", // User text input (if required by reward)
  "status": "unfulfilled",
  "reward": {
    "id": "92af127c-7326-4483-a52b-b0da0be61c01",
    "title": "Drink Water",
    "cost": 100,
    "prompt": "Tell me to drink water"
  },
  "redeemed_at": "2023-07-15T18:16:11.17106713Z"
}
```

#### 3. Channel Points (Automatic)
**Type**: `channel.channel_points_automatic_reward_redemption.add` (v2)
*Includes: Highlight Message, Send in Sub-only Mode, Gigantify Emote, etc.*

```json
{
  "broadcaster_user_id": "1337",
  "broadcaster_user_login": "cool_streamer",
  "broadcaster_user_name": "Cool_Streamer",
  "user_id": "9001",
  "user_login": "fan_one",
  "user_name": "Fan_One",
  "id": "uuid-string",
  "reward": {
    "type": "send_highlighted_message", 
    "cost": 100,
    "unlocked_emote": null
  },
  "message": {
    "text": "Look at me!",
    "emotes": null
  },
  "user_input": "", // Usually empty for auto rewards, message is in 'message' object
  "redeemed_at": "2023-07-15T18:16:11.17106713Z"
}
```

#### 4. Stream Online
**Type**: `stream.online` (v1)

```json
{
  "id": "9001",
  "broadcaster_user_id": "1337",
  "broadcaster_user_login": "cool_streamer",
  "broadcaster_user_name": "Cool_Streamer",
  "type": "live",
  "started_at": "2023-07-15T18:16:11.17106713Z"
}
```

#### 5. Stream Offline
**Type**: `stream.offline` (v1)

```json
{
  "broadcaster_user_id": "1337",
  "broadcaster_user_login": "cool_streamer",
  "broadcaster_user_name": "Cool_Streamer"
}
```

#### 6. Follow
**Type**: `channel.follow` (v2)
*Note: Requires moderator permissions.*

```json
{
  "user_id": "1234",
  "user_login": "new_follower",
  "user_name": "New_Follower",
  "broadcaster_user_id": "1337",
  "broadcaster_user_login": "cool_streamer",
  "broadcaster_user_name": "Cool_Streamer",
  "followed_at": "2023-07-15T18:16:11.17106713Z"
}
```

#### 7. Subscription
**Type**: `channel.subscribe` (v1)

```json
{
  "user_id": "1234",
  "user_login": "cool_user",
  "user_name": "Cool_User",
  "broadcaster_user_id": "1337",
  "broadcaster_user_login": "cool_streamer",
  "broadcaster_user_name": "Cool_Streamer",
  "tier": "1000", // 1000, 2000, 3000
  "is_gift": false
}
```

#### 8. Cheer (Bits)
**Type**: `channel.cheer` (v1)

```json
{
  "is_anonymous": false,
  "user_id": "1234",
  "user_login": "cool_user",
  "user_name": "Cool_User",
  "broadcaster_user_id": "1337",
  "broadcaster_user_login": "cool_streamer",
  "broadcaster_user_name": "Cool_Streamer",
  "message": "cheer100 I love this stream!",
  "bits": 100
}
```

#### 9. Shared Chat Begin
**Type**: `channel.shared_chat.begin` (v1)

```json
{
  "session_id": "uuid",
  "broadcaster_user_id": "1337",
  "host_broadcaster_user_id": "1337",
  "participants": [
    {
      "broadcaster_user_id": "1337",
      "broadcaster_user_name": "Cool_Streamer",
      "broadcaster_user_login": "cool_streamer"
    }
  ]
}
```

#### 10. Shared Chat Update
**Type**: `channel.shared_chat.update` (v1)
*Payload similar to begin.*

#### 11. Shared Chat End
**Type**: `channel.shared_chat.end` (v1)

```json
{
  "session_id": "uuid",
  "broadcaster_user_id": "1337",
  "host_broadcaster_user_id": "1337"
}
```

#### 12. Bits Use (General)
**Type**: `channel.bits.use` (v1)
*Triggers on cheers, power-ups, etc.*

```json
{
  "user_id": "1234",
  "user_login": "cool_user",
  "user_name": "Cool_User",
  "broadcaster_user_id": "1337",
  "broadcaster_user_login": "cooler_user",
  "broadcaster_user_name": "Cooler_User",
  "bits": 2,
  "type": "cheer", // or 'power_up'
  "power_up": null,
  "message": {
    "text": "cheer1 hi cheer1",
    "fragments": [ ... ]
  }
}
```

### Outgoing Commands (App -> Gateway)

Send JSON string to Gateway to perform actions.

#### 1. Speak in Chat
```json
{
  "command": "SAY",
  "channel": "ninja",
  "message": "Hello from the bot!"
}
```

#### 2. Join Channel
```json
{
  "command": "JOIN",
  "channel": "shroud"
}
```

#### 3. Leave Channel
```json
{
  "command": "PART",
  "channel": "shroud"
}
```

## CLI Tool

A simple CLI is provided to test the connection.
```bash
npm run cli
```
*Note: This requires `config/gateway-token.json` to exist (run server once).*
