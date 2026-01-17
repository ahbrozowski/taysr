# Discord Bot - TypeScript

A basic Discord bot written in TypeScript with discord.js.

## Features

- Responds to basic commands:
  - `!ping` - Responds with Pong!
  - `!hello` - Greets the user
  - `!help` - Shows available commands
- Registers a `/taysr` slash command (WIP)

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Create Discord Bot

1. Go to the [Discord Developer Portal](https://discord.com/developers/applications)
2. Click "New Application" and give it a name
3. Go to the "Bot" section and click "Add Bot"
4. Under "Privileged Gateway Intents", enable:
   - MESSAGE CONTENT INTENT
   - SERVER MEMBERS INTENT (optional)
5. Click "Reset Token" to get your bot token

### 3. Configure Environment Variables

1. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```
2. Add your Discord bot token to `.env`:
   ```
   DISCORD_TOKEN=your_actual_token_here
   ```
3. Add your application and dev guild IDs:
   ```
   DISCORD_APPLICATION_ID=your_app_id_here
   DISCORD_DEV_GUILD_ID=your_dev_server_id_here
   ```
   - `DISCORD_APPLICATION_ID` is on the Discord Developer Portal app page.
   - `DISCORD_DEV_GUILD_ID` is only required for development. Enable Developer Mode in Discord, then right-click your server and copy ID.
4. Optional (dev only): override the slash command name:
   ```
   DEV_COMMAND_PREFIX=maysr
   ```
   - Must be lowercase, 1-32 chars, and match `^[a-z0-9-]{1,32}$`.
   - Production always uses `/taysr` regardless of this value.

### 4. Invite Bot to Server

1. In the Discord Developer Portal, go to "OAuth2" → "URL Generator"
2. Select scopes: `bot`
   - For slash commands, also add `applications.commands`
3. Select bot permissions:
   - Read Messages/View Channels
   - Send Messages
   - Read Message History
4. Copy the generated URL and open it in your browser to invite the bot

## Running the Bot

### Development Mode (with auto-reload)
```bash
npm run dev
```

### Production Mode
```bash
npm run build
npm start
```

## Project Structure

```
taysr/
├── src/
│   └── index.ts      # Main bot code
├── dist/             # Compiled JavaScript (generated)
├── .env              # Environment variables (create this)
├── .env.example      # Environment template
├── .gitignore
├── package.json
├── tsconfig.json     # TypeScript configuration
└── README.md
```

## Commands

- `!ping` - Check if the bot is responsive
- `!hello` - Get a greeting from the bot
- `!help` - Display all available commands
- `/taysr help` - Slash command (WIP)

## Extending the Bot

To add new commands, edit [src/index.ts](src/index.ts):
- Message commands are handled in the `MessageCreate` event handler.
- Slash command definitions live in `commandData`.

```typescript
if (message.content === '!yourcommand') {
  await message.reply('Your response');
}
```
