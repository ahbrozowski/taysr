# Taysr - Discord Task Management Bot

A sophisticated Discord bot for managing tasks and goals within your server. Taysr provides an intuitive slash command interface with interactive modals, paginated lists, and automatically-updated pinned task boards.

## Features

- **Goal System** - Organize tasks under goals/projects; goals can be linked to channels for focused pinned task lists
- **Task Creation** - Create tasks with titles, due dates, notes, and optional assignees through interactive modal forms
- **Goal Picker** - Select an existing goal, create a new one, or skip when creating tasks
- **Task Completion** - Mark tasks complete with paginated selection lists and filtering by goal/assignee
- **Pinned Task Lists** - Automatically-maintained pinned messages showing all active tasks grouped by goal
- **Goal-Specific Channels** - Link goals to channels for focused pinned lists that auto-update
- **Auto-Generated IDs** - Guild-scoped task IDs (T-001) and goal IDs (G-001) with atomic counters
- **Interactive UI** - Modern Discord Components V2 (buttons, select menus, modals) for seamless interaction
- **Guild Isolation** - Tasks, goals, and configurations are scoped per Discord server
- **Task Assignment** - Assign tasks to specific users during creation
- **Flexible Configuration** - Set which channel displays the pinned task list
- **MongoDB Persistence** - Reliable database storage with Mongoose ORM

## Commands

### Implemented Commands (8)

| Command | Icon | Description |
|---------|------|-------------|
| `/taysr` | 📋 | Main branded command - shows interactive command picker |
| `/help` | ❓ | Display help information and command picker |
| `/create` | ➕ | Create a new task - goal picker, modal form (title, due date/time, notes), assignee selection |
| `/complete` | ✅ | Mark a task as complete - shows paginated list with filtering options |
| `/goal` | 🎯 | Create a new goal with optional channel linking |
| `/set-channel` | 📌 | Configure which channel displays the pinned task list |
| `/set-goal-channel` | 🔗 | Link or unlink a goal to/from a channel for a focused task list |
| `/refresh` | 🔄 | Rebuild the pinned task list from database |

### Planned Commands (8)

- `/take` - Take ownership of an unassigned task
- `/assign` - Assign a task to a user
- `/unassign` - Remove assignment from a task
- `/edit` - Edit an existing task
- `/delete` - Delete a task
- `/list` - View all tasks with filtering options
- `/set-timezone` - Configure server timezone for due dates
- `/set-reminders` - Configure reminder cadence for upcoming tasks

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
│   ├── index.ts                 # Bot entry point and event handlers
│   ├── constants.ts             # Shared constants and configuration
│   ├── commands/
│   │   ├── index.ts             # Command module exports
│   │   ├── types.ts             # Command handler type definitions
│   │   ├── registry.ts          # CommandRegistry singleton and Command interface
│   │   ├── executor.ts          # Command execution logic
│   │   └── definitions/         # Individual command implementations
│   │       ├── complete.ts
│   │       ├── create.ts
│   │       ├── goal.ts
│   │       ├── help.ts
│   │       ├── planned.ts       # Planned command definitions
│   │       ├── refresh.ts
│   │       ├── set-channel.ts
│   │       ├── set-goal-channel.ts
│   │       └── taysr.ts
│   ├── models/
│   │   ├── index.ts             # MongoDB connection and initialization
│   │   ├── Task.ts              # Task schema and model
│   │   ├── Goal.ts              # Goal schema (for task grouping)
│   │   ├── Reminder.ts          # Reminder schema (infrastructure)
│   │   └── ServerConfig.ts      # Server configuration schema
│   └── utils/
│       ├── client.ts            # Global Discord client instance
│       ├── commandName.ts       # Command name utilities
│       ├── commandPicker.ts     # Interactive command selection UI
│       ├── messages.ts          # Message formatting utilities
│       ├── taskId.ts            # Atomic task ID generation
│       ├── taskList.ts          # Pinned task list management
│       └── taskSelector.ts      # Paginated task selection UI
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
- `taskListChannelId` - Channel for pinned task list
- `taskListMessageId` - Message ID of pinned list
- `timezone` - Server timezone (planned)
- `reminderCadence` - Reminder frequency (planned)
- `adminRoleIds` - Admin role configuration (planned)

**Goal Model** ([src/models/Goal.ts](src/models/Goal.ts))
- `goalId` - Human-readable ID (G-001, G-002, etc.)
- `guildId` - Discord server ID for isolation
- `name` - Goal name (unique per server, case-insensitive)
- `description` - Optional goal description
- `status` - Goal status (active, archived)
- `channelId` - Optional linked channel for goal-specific pinned list
- `messageId` - Pinned message ID in linked channel
- `createdAt`, `updatedAt` - Timestamps

**Reminder Model** ([src/models/Reminder.ts](src/models/Reminder.ts))
- Infrastructure for task reminders (planned feature)

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
- Tasks are marked complete
- Goals are linked/unlinked from channels
- The `/refresh` command is executed

The main list is stored as a pinned message in the configured channel, grouped by goal with "Uncategorized" last. Goals can also have their own pinned lists in linked channels, showing only tasks for that goal.

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

## Roadmap

### Upcoming Features

- **Task Assignment System** - `/take`, `/assign`, `/unassign` commands
- **Task Management** - `/edit` and `/delete` commands
- **Advanced Listing** - `/list` command with filtering and sorting
- **Timezone Support** - Server-specific timezone configuration
- **Task Reminders** - Automated reminders for upcoming due dates
- **Recurring Tasks** - Support for repeating tasks
- **Task Templates** - Pre-defined task templates
- **Analytics** - Task completion statistics and reports
- **Role-Based Permissions** - Admin and member role configurations

### Infrastructure Improvements

- Migration system for database schema changes
- Comprehensive error logging
- Unit and integration tests
- Command usage analytics
- Performance monitoring

## License

[Your License Here]

## Contributing

[Your Contributing Guidelines Here]

## Support

For issues, questions, or contributions, please [open an issue](https://github.com/your-repo/issues).
