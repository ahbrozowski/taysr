# AGENTS.md

## Project overview

TypeScript Discord bot using `discord.js` v14 with Components V2.
Independent top-level slash commands (`/create`, `/complete`, `/assign`, etc.) — NOT subcommands under `/taysr`.
Mongoose ORM for MongoDB. Modular command system with registry, executor, and interactive command picker.

## ⚠️ CRITICAL: Design Philosophy — READ BEFORE WRITING ANY CODE

The project owner hand-wrote `src/utils/taskSelector.ts` as the **gold standard reference**.
Every interactive command MUST follow its patterns exactly. No exceptions, no "alternative approaches."

If your code doesn't match `taskSelector.ts`, it is wrong. Period.

### The Rules

**1. Collector-based interaction — ALWAYS**
```typescript
// ✅ CORRECT — collector on the message
const message = await interaction.reply({
  components: await render(state, options),
  fetchReply: true,
  flags: [MessageFlags.IsComponentsV2],
  ephemeral: true,
});
const collector = message.createMessageComponentCollector({ time: 120000 });
collector.on('collect', async (i) => { /* handle interaction */ });

// ❌ WRONG — one-shot await on channel
const i = await interaction.channel?.awaitMessageComponent({ ... });
```

`awaitMessageComponent` is banned for component interactions. It listens on the CHANNEL (not the message),
is one-shot, and doesn't compose. Use `createMessageComponentCollector` on the **message itself**.

The ONLY exception is `awaitModalSubmit` — Discord.js has no collector API for modals.

**2. State + render pattern**
```typescript
// State object holds all UI state
let state: SomeState = { page: 0 };

// Pure render function builds components from state
async function render(state: SomeState) { return [...components]; }

// Collector updates state and re-renders
collector.on('collect', async (i) => {
  state.page++;
  await i.update({ components: await render(state) });
});
```

**3. Ephemeral flags — separate param**
```typescript
// ✅ CORRECT
await interaction.reply({
  flags: [MessageFlags.IsComponentsV2],
  ephemeral: true,
});

// ❌ WRONG — Ephemeral in flags array
await interaction.reply({
  flags: [MessageFlags.IsComponentsV2, MessageFlags.Ephemeral],
});
```

**4. Logging — errors only**
```typescript
// ✅ CORRECT — only log errors
console.error('Failed to update pinned task list:', err);

// ❌ WRONG — logging normal flow
console.log('[CREATE] Creating task in database:', data);
console.log('[CREATE] Task created successfully');
console.log('Modal timed out');
```

No `console.log` on normal code paths. Timeouts are normal — don't log them.
Only use `console.error` for actual errors.

**5. `.lean()` on read-only queries**
```typescript
// ✅ CORRECT — read-only, use lean
const goals = await Goal.find({ guildId, status: 'active' }).lean();

// ❌ WRONG — full Mongoose document for a read
const goals = await Goal.find({ guildId, status: 'active' });
```

If you're not calling `.save()` on the result, use `.lean()`.

**6. Button styles**
- `ButtonStyle.Primary` — action buttons (Complete, Assign, Run, etc.)
- `ButtonStyle.Secondary` — navigation/passive (Previous, Next, Skip, Coming Soon)
- `ButtonStyle.Danger` — destructive only (Delete, Unlink)

**7. Component building — SectionBuilder pattern**
```typescript
new SectionBuilder()
  .addTextDisplayComponents(
    new TextDisplayBuilder().setContent(`**${task.taskId}** • ${task.title}`)
  )
  .setButtonAccessory(
    new ButtonBuilder()
      .setCustomId(`cmd:${task._id.toString()}`)
      .setLabel('Complete')
      .setStyle(ButtonStyle.Primary)
  )
```

**8. No code duplication**
If you're copy-pasting a function and changing one parameter, you're doing it wrong.
Extract it. Parameterize it. The owner hates duplicate code.

## Architecture

### Command system
- **Registry** (`src/commands/registry.ts`): singleton Map, `getImplemented()` / `getPlanned()` methods
- **Executor** (`src/commands/executor.ts`): central routing from `ButtonInteraction` → command
- **Command interface**: `{ metadata, build(), execute() }`
- **Command picker** (`src/utils/commandPicker.ts`): interactive UI listing all commands
- **Task selector** (`src/utils/taskSelector.ts`): reusable paginated task list with filters

### Data models (Mongoose)
- `Task` — taskId (T-001), title, dueAt, goalId, assigneeId, guildId, status
- `Goal` — goalId (G-001), name, guildId, channelId, messageIds[], status
- `Bug` — bugId (B-001), title, description, severity, reporterId, guildId, status, resolvedBy, resolvedAt
- `Reminder` — taskId, guildId, assigneeId, offset, sendAt, status (compound unique on taskId+offset)
- `Counter` — atomic guild-scoped ID generation
- `ServerConfig` — guild settings: taskListChannelId, taskListMessageIds[], timezone, reminderCadence[], lockdownEnabled, allAccessRoleIds[], ownTasksOnlyRoleIds[]
- `CommandPermission` — role-based command access (per guild + command)

### Reminder scheduler (`src/utils/reminders.ts`)
- `scheduleRemindersForTask(task)` — call after any mutation that affects assignee/dueAt/status; idempotent upsert
- `cancelRemindersForTask(taskMongoId)` — call after complete/delete/unassign
- `processDueReminders(client)` — DMs assignees, marks sent/failed; runs every 60s via `startReminderScheduler`

### Permissions (`src/utils/permissions.ts`)
- `checkCommandPermission(interaction, metadata)` — order: alwaysPublic → admin → all-access role → role grant → lockdown deny / public allow
- `getAccessibleCommands(member, guildId, names)` — same logic batched for the picker
- `isRestrictedToOwnTasks(interaction, commandName)` — true when user has only ownTasksOnly role(s) granting this command; merge `{ assigneeId: userId }` into the taskFilter

### Pinned task list (`src/utils/taskList.ts`)
- Multi-message: chunks content under 4000 chars per Components V2 message, labels each "Page X of N"
- Pin order: edit-in-place when chunk count unchanged; on grow, unpin all and re-pin in reverse so Page 1 ends up at top
- Notifications suppressed: `MessageFlags.SuppressNotifications` on send + delete the auto-generated `ChannelPinnedMessage` system notification

### Datetime (`src/utils/datetime.ts`)
- luxon-based parser: `parseDateTimeInZone(input, timezone)` interprets `YYYY-MM-DD HH:mm` in the configured server timezone and rejects past instants
- `formatDateTimeInZone(date, timezone)` for `/edit` modal pre-fill

### ID generation
- `generateTaskId(guildId)` → `T-001`, `T-002`, ...
- `generateGoalId(guildId)` → `G-001`, `G-002`, ...
- `generateBugId(guildId)` → `B-001`, `B-002`, ...
- Uses atomic `Counter.findOneAndUpdate` with `$inc`

## Local setup
- Node.js 20+, npm
- `npm install`
- Env: `DISCORD_TOKEN`, `DISCORD_APPLICATION_ID`, `MONGODB_URI`
- Dev-only: `DISCORD_DEV_GUILD_ID` (guild-scoped registration), `DEV_COMMAND_PREFIX`

## Run / build
- Dev: `npm run dev`
- Build: `npm run build`
- Start: `npm start`

## Implemented commands
`/taysr`, `/help`, `/create`, `/complete`, `/edit`, `/delete`, `/list`,
`/assign`, `/take`, `/unassign`, `/goal`, `/refresh`,
`/bug-report`,
`/settings`, `/permissions`, `/set-manager-role`,
`/set-channel`, `/set-timezone`, `/set-reminders`

## Planned commands
_All previously planned commands have shipped — `planned.ts` exports an empty list._

## Project status
Stable. Future ideas live in the project memory under "Web translation idea" — not committed work, just an option.
