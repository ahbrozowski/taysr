# AGENTS.md

## Project overview
- TypeScript Discord bot using `discord.js` v14.
- Current runtime behavior is prefix commands in `src/index.ts`.
- `SPEC.md` and `PLAN.md` describe a larger slash-command task system that is not implemented yet.

## Local setup
- Prereqs: Node.js 20+ and npm.
- Install: `npm install`.
- Env: copy `.env.example` to `.env`.
  - Required: `DISCORD_TOKEN`, `DISCORD_APPLICATION_ID`
  - Dev-only: `DISCORD_DEV_GUILD_ID` (fast slash command registration)
  - Dev-only: `DEV_COMMAND_PREFIX` (override slash command name, default `taysr`)
  - Optional (needed for `!task`): `MONGODB_URI`, `MONGODB_DB`

## Run / build
- Dev (auto-reload): `npm run dev`
- Build: `npm run build`
- Run built app: `npm start`
- Tests: none configured

## Current commands
- `!ping`, `!hello`, `!time`, `!days`, `!help`, `!task`
- `!task` reads from MongoDB `tasks` collection and prints a summary.
- `/taysr help` is registered as a slash command (WIP).

## Deployment
- PM2 (preferred):
  - Start: `pm2 start ecosystem.config.js` (or `pm2 start dist/index.js --name taysr`)
  - Logs: `pm2 logs taysr`
  - Restart: `pm2 restart taysr`
- Systemd:
  - Update placeholders in `taysr.service`
  - Install to `/etc/systemd/system/taysr.service`
  - `sudo systemctl daemon-reload && sudo systemctl enable --now taysr`
  - Logs: `sudo journalctl -u taysr -f`
- Full GCP walkthrough: `DEPLOYMENT.md`
- Update helper: `deploy.sh` (assumes repo at `~/taysr` and PM2 app name `taysr`)

## Fixing / extending
- All bot logic lives in `src/index.ts`.
- To align with `SPEC.md`, replace message-content commands with slash commands + interaction handlers.
  - When moving to slash commands, you can drop `GatewayIntentBits.MessageContent` if not needed.
- Slash commands register to a dev guild when `NODE_ENV` is not `production`; production registers globally.
  - `DEV_COMMAND_PREFIX` only applies in dev; production always uses `/taysr`.
- If you keep MongoDB, define a clear schema for `tasks` and add server scoping.
- Consider splitting into modules (`commands/`, `db/`, `scheduler/`) as the feature set grows.

## Troubleshooting
- Bot fails to start: check `DISCORD_TOKEN`, `DISCORD_APPLICATION_ID`, and Discord portal intents.
- Slash commands not appearing in dev: confirm `DISCORD_DEV_GUILD_ID` and that the bot is in that server.
- Slash command name invalid: `DEV_COMMAND_PREFIX` must be lowercase, 1-32 chars, and match `^[a-z0-9-]{1,32}$`.
- `!task` fails: verify `MONGODB_URI` connectivity and `tasks` collection data.
- No output: check PM2 or systemd logs.
