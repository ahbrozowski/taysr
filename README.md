# Taysr - Discord Task Management Bot

**Status: Shipped — all planned features are implemented.** A Discord bot for managing tasks, goals, and reminders within your server. Taysr provides an interactive slash command interface with modals, paginated lists, automatically-updated pinned task boards, and DM reminders driven by a configurable cadence.

## Features

- **Goal System** - Organize tasks under goals; goals can be linked to channels for focused pinned task lists
- **Task Lifecycle** - Create, edit, complete, delete, assign, take, unassign — all through interactive flows
- **Pinned Task Lists** - Automatically-maintained pinned messages, split across multiple messages when content exceeds Discord's 4000-char component limit, with correct pin ordering preserved
- **Silent Updates** - Pinned messages send with `SuppressNotifications` and Discord's auto-generated "X pinned a message" system messages are deleted, so the channel doesn't ding members on every task update
- **DM Reminders** - Configurable cadence (e.g., `7d,3d,1d,4h,1h`) DMs assignees ahead of due dates; reminders auto-cancel on complete/delete/unassign
- **Server Timezone** - Due dates parsed in the configured IANA timezone; `/set-timezone` is load-bearing
- **Permission System** - Per-role command access via `/permissions`, plus a lockdown toggle (deny by default), per-role all-access bypass, and per-role "restrict to assigned tasks" mode
- **Bug Reports** - `/bug-report` captures bug submissions with severity; the bot also posts a public summary to the configured task channel
- **Auto-Generated IDs** - Guild-scoped IDs for tasks (T-001), goals (G-001), and bugs (B-001) via atomic counters
- **Discord Components V2** - Modern interactive buttons, select menus, modals throughout
- **Guild Isolation** - All entities scoped per server
- **MongoDB Persistence** - Mongoose ORM with proper indexes

## Commands

### Implemented Commands

| Command | Icon | Description |
|---------|------|-------------|
| `/taysr` | 📋 | Main branded command - shows interactive command picker |
| `/help` | ❓ | Display help information and command picker |
| `/create` | ➕ | Create a new task - goal picker, modal form (title, due date/time, notes), assignee selection |
| `/complete` | ✅ | Mark a task as complete - shows paginated list with filtering options |
| `/edit` | ✏️ | Edit a task - change goal, title, due date, notes, and assignee |
| `/delete` | 🗑️ | Delete a task with confirmation |
| `/list` | 📃 | Paginated task viewer with status, goal, and assignee filters |
| `/assign` | 👥 | Assign a task to a user via task picker and user select |
| `/take` | ✋ | Self-assign an unassigned task |
| `/unassign` | ❌ | Remove assignee from a task |
| `/goal` | 🎯 | Create a new goal with optional channel linking |
| `/refresh` | 🔄 | Rebuild the pinned task list from database |
| `/bug-report` | 🐛 | Report a bug with title, description, and severity |
| `/settings` | ⚙️ | Manage server settings (admin only) |
| `/permissions` | 🔒 | Manage role-based command access, lockdown, all-access, and restrict-to-assigned (admin only) |
| `/set-manager-role` | 🛡️ | Bulk-grant a role access to the preset manager command list (admin only) |
| `/set-channel` | 📌 | Set a channel for the task list or link a goal to a channel |
| `/set-timezone` | 🌍 | Configure server timezone for due dates |
| `/set-reminders` | ⏰ | Configure reminder cadence for upcoming tasks |

## Tech Stack

- **TypeScript** - Type-safe development
- **discord.js v14** - Discord API interaction
- **MongoDB** - Document database for persistence
- **Mongoose** - MongoDB ODM with schema validation
- **Discord Components V2** - Interactive buttons, select menus, and modals

## Prerequisites

- **Node.js** - Version 20.19.0 or higher
- **MongoDB** - Local instance or MongoDB Atlas cluster
- **Discord Bot Token** - From Discord Developer Portal

## Setup Instructions

### 1. Clone the Repository

```bash
git clone <repository-url>
cd taysr
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Create a Discord Bot

1. Go to the [Discord Developer Portal](https://discord.com/developers/applications)
2. Click "New Application" and give it a name
3. Navigate to the "Bot" tab and click "Add Bot"
4. Under "Privileged Gateway Intents", enable:
   - Server Members Intent
   - Message Content Intent (if reading messages)
5. Copy the bot token from the "Bot" tab
6. Navigate to the "OAuth2" tab and copy your Application ID
7. Generate an invite URL:
   - Scopes: `bot`, `applications.commands`
   - Bot Permissions: `Send Messages`, `Manage Messages`, `Read Message History`, `View Channels`

   **Why these permissions?**
   - **Send Messages**: To post task list updates and command responses
   - **Manage Messages**: To pin and update the task list message
   - **Read Message History**: To fetch and update existing pinned messages
   - **View Channels**: To access channels for task list display

### 4. Set Up MongoDB

**Option A: MongoDB Atlas (Cloud)**
1. Create a free account at [MongoDB Atlas](https://www.mongodb.com/cloud/atlas)
2. Create a new cluster
3. Set up database access (username/password)
4. Whitelist your IP address (or allow access from anywhere for development)
5. Get your connection string (replace `<password>` with your database password)

**Option B: Local MongoDB**
1. Install MongoDB Community Edition
2. Start MongoDB service: `mongod`
3. Use connection string: `mongodb://localhost:27017/taysr`

### 5. Configure Environment Variables

Create a `.env` file in the project root:

```env
# Required
DISCORD_TOKEN=your_bot_token_here
DISCORD_APPLICATION_ID=your_application_id_here
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/taysr?retryWrites=true&w=majority

# Optional - Development
DISCORD_DEV_GUILD_ID=your_test_server_id
DEV_COMMAND_PREFIX=dev_
NODE_ENV=development

# Optional - Database name (typically included in MONGODB_URI)
# MONGODB_DB=taysr
```

**Important Notes:**
- The `MONGODB_URI` environment variable is required for the bot to function. Without it, the bot will not be able to persist tasks or server configurations.
- The database name (e.g., "taysr") should be included in the `MONGODB_URI` connection string itself (as shown above after `.mongodb.net/`).
- `MONGODB_DB` is optional and not currently used by the application - the database name is extracted from the URI.

### 6. Build and Run

**Development Mode:**
```bash
npm run dev
```

**Production Mode:**
```bash
npm run build
npm start
```

### 7. Invite the Bot to Your Server

Use the invite URL generated in step 3, or construct one manually:
```
https://discord.com/api/oauth2/authorize?client_id=YOUR_APPLICATION_ID&permissions=412317273088&scope=bot%20applications.commands
```

**Note:** Slash commands may take up to 1 hour to register globally. For instant registration during development, set `DISCORD_DEV_GUILD_ID` in your `.env` file.

## Project Structure

```
taysr/
├── src/
│   ├── index.ts                 # Bot entry point, scheduler bootstrap, graceful shutdown
│   ├── constants.ts             # Shared constants
│   ├── commands/
│   │   ├── index.ts             # Command registration
│   │   ├── registry.ts          # CommandRegistry singleton + Command interface
│   │   ├── executor.ts          # Routing + permission gate
│   │   └── definitions/
│   │       ├── assign.ts        bug-report.ts  complete.ts   create.ts
│   │       ├── delete.ts        edit.ts        goal.ts       help.ts
│   │       ├── list.ts          permissions.ts planned.ts    refresh.ts
│   │       ├── set-channel.ts   set-manager-role.ts
│   │       ├── set-reminders.ts set-timezone.ts
│   │       ├── settings.ts      take.ts        taysr.ts      unassign.ts
│   ├── models/
│   │   ├── index.ts             # MongoDB connection + model exports
│   │   ├── Bug.ts
│   │   ├── CommandPermission.ts
│   │   ├── Goal.ts
│   │   ├── Reminder.ts
│   │   ├── ServerConfig.ts
│   │   └── Task.ts
│   └── utils/
│       ├── client.ts            # Global Discord client accessor
│       ├── commandName.ts
│       ├── commandPicker.ts     # /help and /taysr picker UI
│       ├── datetime.ts          # Timezone-aware date parse + format (luxon)
│       ├── messages.ts
│       ├── permissions.ts       # Permission rules + role-restriction helpers
│       ├── reminders.ts         # Reminder scheduling, cancellation, tick loop
│       ├── taskId.ts            # Atomic ID generation
│       ├── taskList.ts          # Multi-message pinned list rendering + sync
│       └── taskSelector.ts      # Reusable paginated task picker
├── scripts/
│   ├── reset-task-counter.ts            # Reset T-### counter for a guild
│   ├── seed-tasks.ts                    # Bulk-create test tasks for chunking tests
│   ├── clear-seed-tasks.ts              # Delete the seeded test tasks
│   ├── drop-stale-reminder-index.ts     # One-shot: drop legacy reminderId_1 index
│   └── migrate-pinned-messages.ts       # One-shot: legacy single-msg → array fields
├── .env                         # Environment variables (create this)
├── package.json
└── tsconfig.json
```

## Architecture

### Command Registry Pattern

The bot uses a modular command system with a central registry pattern:

- **Command Interface** ([src/commands/registry.ts](src/commands/registry.ts)) - All commands implement a consistent interface with `metadata`, `build()`, and `execute()` methods
- **CommandRegistry** ([src/commands/registry.ts](src/commands/registry.ts)) - Singleton that manages command registration and lookup
- **Command Executor** ([src/commands/executor.ts](src/commands/executor.ts)) - Handles command execution and error handling
- **Command Definitions** ([src/commands/definitions/](src/commands/definitions/)) - Individual command implementations

### Database Models

**Task Model** ([src/models/Task.ts](src/models/Task.ts))
- `taskId` - Human-readable ID (T-001, T-002, etc.)
- `guildId` - Discord server ID for isolation
- `goalId` - Optional goal association
- `title` - Task title
- `notes` - Additional task details
- `assigneeId` - Assigned user ID
- `creatorId` - User who created the task
- `dueAt` - Due date/time
- `status` - Task status (open, complete)
- `createdAt`, `updatedAt` - Timestamps

**ServerConfig Model** ([src/models/ServerConfig.ts](src/models/ServerConfig.ts))
- `guildId` - Discord server ID
- `taskListChannelId` - Channel for the pinned task list
- `taskListMessageIds` - Array of pinned message IDs (one per page when chunked)
- `timezone` - IANA server timezone, used to parse modal date input
- `reminderCadence` - Array of offset strings (e.g., `['7d','3d','1d']`) controlling reminder DMs
- `lockdownEnabled` - When true, commands without a `CommandPermission` doc deny by default
- `allAccessRoleIds` - Roles flagged to bypass every permission check
- `ownTasksOnlyRoleIds` - Roles whose holders can only act on tasks assigned to themselves (for `/complete`, `/edit`, `/delete`, `/unassign`)

**Goal Model** ([src/models/Goal.ts](src/models/Goal.ts))
- `goalId` - Human-readable ID (G-001, G-002, etc.)
- `guildId` - Discord server ID for isolation
- `name` - Goal name (unique per server, case-insensitive)
- `description` - Optional goal description
- `status` - Goal status (active, archived)
- `channelId` - Optional linked channel for goal-specific pinned list
- `messageIds` - Array of pinned message IDs in the linked channel (chunked when long)
- `createdAt`, `updatedAt` - Timestamps

**CommandPermission Model** ([src/models/CommandPermission.ts](src/models/CommandPermission.ts))
- `guildId` - Discord server ID
- `commandName` - Slash command name (without leading slash)
- `roleIds` - Roles allowed to use this command (compound unique on `guildId + commandName`)

**Bug Model** ([src/models/Bug.ts](src/models/Bug.ts))
- `bugId` - Human-readable ID (B-001, B-002, etc.)
- `guildId` - Discord server ID for isolation
- `title` - Bug title
- `description` - Optional details (steps, expected vs actual)
- `severity` - One of `low`, `medium`, `high`, `critical`
- `reporterId` - Discord user ID of the reporter
- `status` - Bug status (open, resolved)
- `createdAt`, `updatedAt` - Timestamps

**Reminder Model** ([src/models/Reminder.ts](src/models/Reminder.ts))
- `taskId` - Mongo ObjectId of the associated task (string form)
- `guildId` - Discord server ID for isolation
- `assigneeId` - Snapshot of who should be DMed when this fires
- `offset` - Cadence offset string (e.g., `1d`, `4h`, `30m`)
- `sendAt` - When this reminder should fire
- `sentAt` - When it was actually delivered
- `status` - `pending`, `sent`, `canceled`, or `failed`
- Compound unique index on `(taskId, offset)`

### Interactive UI Components

The bot leverages Discord Components V2 (Discord's modern UI framework) for rich interactions:

- **Modals** - Task creation form with text inputs
- **Select Menus** - Command picker, task selection with pagination
- **Buttons** - Navigation controls (Previous/Next page)
- **Ephemeral Responses** - Private messages visible only to the command user

### Atomic ID Generation

The [src/utils/taskId.ts](src/utils/taskId.ts) utility implements atomic counter-based ID generation using MongoDB's `findOneAndUpdate` with proper locking to prevent race conditions. Generates both task IDs (T-001) and goal IDs (G-001).

### Pinned Task List Management

The pinned task list automatically updates when:
- New tasks are created
- Tasks are marked complete, edited, or deleted
- Tasks are assigned, taken, or unassigned
- Goals are linked/unlinked from channels
- The `/refresh` command is executed

**Multi-message chunking:** when a list exceeds Discord's 4000-character per-component limit, it splits across multiple pinned messages labelled "Page X of N". On growth, the bot unpins all and re-pins in reverse so Page 1 ends up at the top of the pin list; on edit-in-place (no count change), no pin churn occurs.

**Silent updates:** new pinned messages use `MessageFlags.SuppressNotifications`, and the auto-generated "X pinned a message" system message is deleted after each pin so the channel doesn't ding on every task change.

Goals can also have their own pinned lists in linked channels, showing only tasks for that goal.

### Permissions and Lockdown

Open `/permissions` to manage who can use what. The model:

- **Discord administrators** always bypass every check.
- **All-access roles** (per-role toggle) bypass too — useful for "manager" roles that should get every command (including ones added later).
- **Role grants** (per-command multi-select): grant specific roles access to specific commands.
- **Lockdown** (server-wide toggle): when on, commands without an explicit grant deny by default. When off, they're public.
- **Restrict to assigned tasks** (per-role toggle): members with only this role can only complete/edit/delete/unassign tasks assigned to them. The picker hides the "Filter by assignee" select for these users since it would be meaningless.
- `/help`, `/taysr`, `/list`, and `/bug-report` are tagged `alwaysPublic` and bypass the permission system entirely.

### Reminders

Configure cadence with `/set-reminders` (presets or a custom comma-separated list of offsets like `7d,3d,1d,4h,1h`). The bot's scheduler ticks every 60 seconds and DMs assignees at each `dueAt - offset`. Reminders are scheduled when a task is created/edited/assigned/taken and cancelled when it's completed, deleted, or unassigned.

### Server Timezone

Due-date input in modals is parsed in the configured server timezone (`/set-timezone`, IANA names like `America/New_York`). Pre-fill in `/edit` formats the existing due date back into the same zone so users see what they originally typed.

## Development

### Running in Development Mode

```bash
npm run dev
```

This uses `tsx` for fast TypeScript execution with hot reloading during development.

### Testing Commands

1. Set `DISCORD_DEV_GUILD_ID` in your `.env` to test commands in a specific server (instant registration)
2. Use `DEV_COMMAND_PREFIX` to prefix command names during development (e.g., `dev_create`)
3. Commands are automatically registered when the bot starts

### Adding New Commands

1. Create a new file in [src/commands/definitions/](src/commands/definitions/)
2. Implement the `Command` interface from [src/commands/registry.ts](src/commands/registry.ts):

```typescript
import { Command } from '../registry';
import { SlashCommandBuilder } from 'discord.js';

export const myCommand: Command = {
  metadata: {
    name: 'mycommand',
    description: 'Description of my command',
    emoji: '🎯',
    implemented: true,
    requiresGuild: true
  },

  build() {
    return new SlashCommandBuilder()
      .setName(this.metadata.name)
      .setDescription(this.metadata.description);
  },

  async execute(interaction) {
    // Implementation
    await interaction.reply({
      content: 'Command executed!',
      ephemeral: true
    });
  }
};
```

3. Register the command in the CommandRegistry ([src/commands/registry.ts](src/commands/registry.ts))
4. The command will be automatically deployed on bot startup

### Database Schema Changes

When modifying Mongoose models:
1. Update the schema in the respective file under [src/models/](src/models/)
2. Restart the bot to apply schema changes
3. For production, consider implementing migrations if needed

## Troubleshooting

### Common Issues

**MongoDB Connection Failures**
- Verify your `MONGODB_URI` is correct in `.env`
- Check that your IP address is whitelisted in MongoDB Atlas
- Ensure MongoDB service is running (for local installations)
- Test connection string with MongoDB Compass

**Slash Commands Not Appearing**
- Global commands can take up to 1 hour to register
- Use `DISCORD_DEV_GUILD_ID` for instant guild-specific registration
- Verify bot has `applications.commands` scope in invite URL
- Try kicking and re-inviting the bot

**Permission Errors**
- Ensure bot has required permissions: Send Messages, Manage Messages, Read Message History, View Channels
- Check channel-specific permission overrides
- Verify bot role is positioned correctly in server role hierarchy

**Task ID Counter Issues**
- Use `npm run reset-counter` to reset the task counter for a guild
- Check MongoDB connection for counter document integrity

**Pinned List Stuck or Old Schema Orphans**
- If upgrading from a single-pinned-message schema, run `npx tsx scripts/migrate-pinned-messages.ts` once
- If the reminder collection has an old `reminderId_1` unique index, run `npx tsx scripts/drop-stale-reminder-index.ts`
- `/refresh` rebuilds the pinned list from the DB

## Dev Helpers

```bash
# Bulk-create tasks to exercise the multi-message chunking
SEED_GUILD_ID=<guild> SEED_COUNT=80 npm run seed-tasks

# Tear them back down
npm run clear-seed-tasks
```

## Roadmap

Possible future direction (not committed):

- Recurring tasks
- Task templates
- Analytics dashboards
- Companion web app (Discord OAuth, sharing the same MongoDB)

## License

[Your License Here]

## Contributing

[Your Contributing Guidelines Here]

## Support

For issues, questions, or contributions, please [open an issue](https://github.com/your-repo/issues).
