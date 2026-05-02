# Taysr Discord Bot Spec

> **Status: shipped.** Every command listed under "Planned commands" historically has been implemented; that section is now empty. Schema sections describe the current data model.

## Overview
- Purpose: task management for a roller derby team in Discord.
- Interaction model: independent top-level slash commands (e.g., `/create`, `/complete`, `/set-channel`), each registered separately with Discord.
- A branded command (`/taysr` in production, configurable via `DEV_COMMAND_PREFIX` in dev) and `/help` both open an interactive command picker showing all available and planned commands.
- Task creation and updates use Discord Components V2 (modals/selects/buttons) to collect inputs after the command is invoked.
- Tasks can be created unassigned, then assigned later.
- Tasks can be grouped under an optional goal/project name to provide context.
- A single pinned message in a configured channel is the canonical list of open tasks.
- Reminder cadence is configurable per server.

## Original questions and answers
- Q: How should tasks be created (slash commands vs free-text)?
  - A: Slash commands.
- Q: Where should the list live (one tasks channel, pinned embed, or DMs)?
  - A: A user-configured channel; pinned message updated by the bot.
- Q: What reminder cadence would be ideal?
  - A: Configurable.
- Q: Scope of configuration: per-server default cadence, or per-task?
  - A: Per server.
- Q: Timezone default: server setting, task creator’s timezone, or assignee’s?
  - A: Server setting.
- Q: Permissions: who can set the task list channel and cadence?
  - A: Role-based.
- Q: Task visibility: should anyone be able to view all tasks, or only assignees?
  - A: Anyone can view.
- Q: Command set: minimal core set or more advanced?
  - A: Start with core set.
- Q: Task limits: any cap on number of open tasks or length of description?
  - A: No limit.
- Q: Should tasks be creatable before assignment?
  - A: Yes, allow unassigned tasks.
- Q: Command namespace `/task` or something else?
  - A: Originally `/taysr` as a subcommand namespace. Now uses independent top-level commands with `/taysr` as a branded command picker.
- Q: `set-channel` behavior when no channel provided?
  - A: Default to the channel where the command is run.
- Q: Add a subcommand to self-assign?
  - A: Add `/take` to assign to the sender.
- Q: Add an unassign command?
  - A: Add `/unassign`.
- Q: Add a help command?
  - A: `/help` and `/taysr` both show the interactive command picker.
- Q: Should the pinned list include guidance?
  - A: Include a short "How to use" guide and a `/help` example.
- Q: Should commands use message components and modals for input?
  - A: Yes; collect inputs via modals/selects/buttons, including date/time.

## Command architecture

### Command interface
Every command implements the `Command` interface:
- `metadata` — name, emoji, description, `implemented` flag, `requiresGuild` flag.
- `build()` — returns a `SlashCommandBuilder` for Discord registration.
- `execute(interaction)` — handles both `ChatInputCommandInteraction` (slash commands) and `ButtonInteraction` (command picker buttons).

### Command registry
A singleton `CommandRegistry` stores all commands in a `Map<name, Command>`:
- `register(command)` — adds a command.
- `get(name)` — retrieves by name.
- `getImplemented()` / `getPlanned()` — filters by the `implemented` flag.
- `getMetadataMap()` — returns metadata for UI rendering.

### Command executor
`executeCommand(name, interaction)` is the central routing layer:
1. Looks up the command in the registry.
2. If not found → shows execution error.
3. If not implemented and triggered via button → shows "under construction" message.
4. Validates guild context if `requiresGuild` is true.
5. Checks permissions via `checkCommandPermission()` — denies with ephemeral message if the user lacks access.
6. Calls `command.execute(interaction)` with try/catch error handling.

### Command picker
`/taysr` and `/help` both open an interactive command picker (Components V2):
- Lists **implemented** commands with "Run" buttons.
- Lists **planned** commands with "Coming Soon" buttons.
- Button clicks route back through the executor via `cmd:{commandName}` custom IDs.
- Selection times out after 60 seconds and falls back to a static text view.

### Reusable task selector
`createTaskSelector(interaction, options)` is a shared utility for any command that needs the user to pick a task from a paginated list:
- `actionLabel` — button text per task (e.g., "Complete", "Assign", "Take", "Unassign").
- `onSelect(task, interaction)` — callback when a task button is clicked.
- `taskFilter` — optional extra MongoDB filter (e.g., `{ assigneeId: null }` for `/take`).
- `showFilters` — whether to show goal/assignee filter selects (default: true).
- `guildId` — scopes goal filter to the guild.
- Paginated (5 per page) with Previous/Next buttons, 120-second collector timeout.
- Used by `/complete`, `/assign`, `/take`, and `/unassign`.

### ID generation
Atomic MongoDB counters (`findOneAndUpdate` with `$inc`) generate guild-scoped IDs:
- Task IDs: `T-001`, `T-002`, etc. (counter key: `{guildId}:task`).
- Goal IDs: `G-001`, `G-002`, etc. (counter key: `{guildId}:goal`).

### Registration flow
On startup:
1. Branded command name is resolved (production: `taysr`, dev: `DEV_COMMAND_PREFIX` or `taysr`).
2. `initializeCommands(name)` registers all commands (implemented + planned) in the registry.
3. Only **implemented** commands are deployed as Discord slash commands.
4. Commands are registered guild-scoped in dev (when `DISCORD_DEV_GUILD_ID` is set), globally in production.

## Roles and permissions
- **Fully customizable per-command role system** — any Discord role (including `@everyone`) can be granted access to any command via `/permissions`.
- **Always-public commands** (`/help`, `/taysr`, `/list`, `/bug-report`) are tagged `alwaysPublic: true` and bypass every permission check.
- **Discord admins always bypass** the rest of the chain.
- **All-access roles** (`ServerConfig.allAccessRoleIds`) — per-role toggle in `/permissions`. Members with any all-access role bypass all per-command checks, including ones added later.
- **Lockdown** (`ServerConfig.lockdownEnabled`) — server-wide toggle in `/permissions`. When on, commands without an explicit `CommandPermission` doc deny by default. When off, they default to public.
- **Restrict to assigned tasks** (`ServerConfig.ownTasksOnlyRoleIds`) — per-role toggle. Members whose only access path to a command goes through ownTasksOnly roles can only act on tasks assigned to themselves (`/complete`, `/edit`, `/delete`, `/unassign`); the picker hides the assignee filter for them.
- **`CommandPermission` collection** — `(guildId, commandName)` compound key with allowed `roleIds[]`.
- `/permissions` allows admins to manage all of the above in one UI.
- `/set-manager-role` is a convenience shortcut that bulk-grants a role access to a preset list of manager commands.
- The **command picker** filters out commands the user doesn't have access to via `getAccessibleCommands` (same logic as `checkCommandPermission`).
- The **executor** checks permissions before every command execution.

### Permission check order
1. `metadata.alwaysPublic` → allow
2. Discord `Administrator` permission → allow
3. Member has any role in `ServerConfig.allAccessRoleIds` → allow
4. `CommandPermission` doc exists for this command with non-empty `roleIds`:
   - Member has any matching role → allow
   - Otherwise → deny (with the list of required roles in the reason)
5. No doc + lockdown ON → deny
6. No doc + lockdown OFF → allow

`isRestrictedToOwnTasks` runs after the allow decision: if the user has any `ownTasksOnly` role and no other unrestricted access path for this command, the caller merges `{ assigneeId: userId }` into the task filter.

## Component-driven input
- All commands respond with Discord Components V2 (`TextDisplayBuilder`, `SectionBuilder`, `SeparatorBuilder`, buttons, modals).
- All ephemeral replies use the `MessageFlags.IsComponentsV2` and `MessageFlags.Ephemeral` flags.
- Component types used:
  - Buttons (confirm/continue/run command)
  - String Select (task picker, goal picker, quick filters)
  - User Select (assignee)
  - Channel Select (task list channel)
  - Text Input (freeform fields in modals)
- Date/time entry:
  - Modal text input labeled "Due Date & Time (YYYY-MM-DD HH:mm)".
  - Format validated on submission; must be a future date.
  - Accepted format shown in the modal placeholder (e.g., `2025-02-15 18:00`).

## Implemented commands

### /taysr (branded command)
- **Status:** Implemented
- Inputs: none
- Behavior:
  - Opens the interactive command picker.
  - Name is `taysr` in production; configurable via `DEV_COMMAND_PREFIX` in development.
- Does not require guild context.

### /help
- **Status:** Implemented
- Inputs: none
- Behavior:
  - Opens the interactive command picker (same as `/taysr`).
- Does not require guild context.

### /create
- **Status:** Implemented
- Inputs (collected via goal picker + modal):
  - goal (optional, selected or created inline)
  - title (required, max 100 chars)
  - due date/time (required, `YYYY-MM-DD HH:mm`, must be future)
  - notes (optional, max 500 chars)
  - assignee (optional, via User Select)
- Behavior:
  - If goals exist in the guild, shows a goal picker first (existing goals + "New goal..." + "No goal").
  - If "New goal..." is selected, opens a modal to name the new goal, then creates it.
  - If no goals exist, goes straight to the task modal.
  - After goal selection, opens a modal to collect task details (title, due date/time, notes).
  - After modal submission, shows assignment options: "Assign" button or "Unassigned" button.
  - If "Assign" is chosen, shows a User Select to pick the assignee.
  - Creates task in database with an atomically generated guild-scoped task ID (T-001, T-002, etc.).
  - Updates pinned task list and goal-specific pinned list (if task has a goal).
  - If selection times out, creates the task as unassigned.
- Requires guild context.
- Component flow:
  - Step 1 (if goals exist): Goal picker — String Select of existing goals + "New goal..." + "No goal".
  - Step 1a (if "New goal..."): Modal to enter goal name; creates goal inline.
  - Step 2: Modal with Title, Due date/time, Notes.
  - Step 3: Assignment choice — "Assign" or "Unassigned" buttons.
  - Step 4 (if assigning): User Select for assignee.

### /complete
- **Status:** Implemented
- Inputs (collected via task selector):
  - task selection (required)
- Behavior:
  - Uses the reusable task selector with action label "Complete".
  - Shows a paginated list of open tasks with "Complete" buttons.
  - Optional filters: goal (String Select) and assignee (User Select).
  - Pagination with Previous/Next buttons (5 tasks per page).
  - Clicking "Complete" on a task marks it as complete and updates the pinned task list and goal-specific pinned list.
- Does not require guild context (filters by guild internally).
- Component flow:
  - Step 1: Paginated task selector with filters and "Complete" buttons per task.

### /set-channel
- **Status:** Implemented
- Inputs:
  - channel (optional; target text channel, defaults to current channel)
  - goal (optional; goal name or ID to link to the channel)
- Behavior:
  - **No args**: Shows an interactive scope chooser ("Server Task List" / "Goal Channel") — same UI as the command picker entry point.
  - **Channel only** (`/set-channel #ops-tasks`): Sets the server task list channel directly. Deletes old pinned message if one exists. Creates or updates `ServerConfig`. Calls `refreshPinnedTaskList`.
  - **Channel + goal** (`/set-channel #marketing Bout Prep`): Directly links the goal to the channel. Looks up the goal by ID or name (case-insensitive). Deletes old pinned message if changing channels. Sets `Goal.channelId` and creates a pinned task list via `updateGoalPinnedList`.
  - **Goal scope (interactive)**: From the scope chooser, shows a goal picker (String Select of active goals with "(linked)" suffix). After selecting a goal, shows a Channel Select and (if currently linked) an "Unlink" button. Linking sets `Goal.channelId` and creates a pinned task list. Unlinking deletes the pinned message and clears `Goal.channelId`/`messageId`.
- Requires guild context.
- Component flow:
  - From slash command with channel only: sets server task list directly using the channel option.
  - From slash command with channel + goal: links goal to channel directly (no UI).
  - From slash command with no args or from command picker: scope chooser → "Server Task List" or "Goal Channel" → appropriate flow.

### /refresh
- **Status:** Implemented
- Inputs: none
- Behavior:
  - Completely rebuilds the pinned task list from the database.
  - Shows loading indicator, then success/error message.
- Requires guild context.

### /assign
- **Status:** Implemented
- Inputs (collected via task selector + User Select):
  - task selection (required)
  - assignee (required)
- Behavior:
  - Uses the reusable task selector with action label "Assign".
  - After selecting a task, shows a User Select to pick the assignee.
  - Sets the assignee on the task.
  - Updates pinned task list and goal-specific pinned list.
- Requires guild context.
- Component flow:
  - Step 1: Paginated task selector with "Assign" buttons per task.
  - Step 2: User Select for assignee.

### /take
- **Status:** Implemented
- Inputs (collected via task selector):
  - task selection (required)
- Behavior:
  - Uses the reusable task selector with action label "Take".
  - Only shows unassigned tasks (filters by `assigneeId: null`).
  - Clicking "Take" assigns the task to the command sender.
  - Updates pinned task list and goal-specific pinned list.
- Requires guild context.
- Component flow:
  - Step 1: Paginated task selector (unassigned tasks only) with "Take" buttons per task.

### /unassign
- **Status:** Implemented
- Inputs (collected via task selector):
  - task selection (required)
- Behavior:
  - Uses the reusable task selector with action label "Unassign".
  - Only shows assigned tasks (filters by `assigneeId: { $ne: null }`).
  - Clicking "Unassign" removes the assignee from the task.
  - Updates pinned task list and goal-specific pinned list.
- Requires guild context.
- Component flow:
  - Step 1: Paginated task selector (assigned tasks only) with "Unassign" buttons per task.

### /goal
- **Status:** Implemented
- Inputs (collected via modal):
  - name (required, max 100 chars)
  - description (optional, max 500 chars)
- Behavior:
  - Opens a modal to collect goal name and description.
  - Checks for duplicate goal names (case-insensitive).
  - After modal submission, asks whether to link a channel: "Link Channel" or "Skip" buttons.
  - If linking, shows a Channel Select to pick a text channel.
  - Creates the goal in the database with an atomically generated guild-scoped goal ID (G-001, G-002, etc.).
  - If a channel is linked, creates a pinned task list in that channel showing only tasks for this goal.
  - If selection times out, creates the goal without a channel link.
- Requires guild context.
- Component flow:
  - Step 1: Modal with Goal Name and Description.
  - Step 2: "Link Channel" or "Skip" buttons.
  - Step 3 (if linking): Channel Select to pick a text channel.

### /settings
- **Status:** Implemented
- Inputs:
  - channel (optional; target text channel)
  - goal (optional; goal name or ID to link)
- Behavior:
  - **No args**: Shows an interactive settings menu with three sections:
    - **Channels** — set server task list channel or link goals to channels (same logic as `/set-channel`).
    - **Permissions** — per-command role management. Shows a paginated list of all guild commands with their current permission state ("Public" or role names). Each command has a "Configure" button to add/remove roles or make it public.
    - **Timezone & Reminders** — placeholder for future features.
  - **Channel only** (`/settings #channel`): Sets the server task list channel directly.
  - **Channel + goal** (`/settings #channel GoalName`): Links a goal to a channel.
  - Uses `.setDefaultMemberPermissions(PermissionFlagsBits.Administrator)` to hide from non-admins in Discord UI (but actual enforcement is via the permission system).
- Requires guild context.

### /set-manager-role
- **Status:** Implemented
- Inputs: none (role selected via Role Select menu)
- Behavior:
  - Shows a Role Select menu to pick a role.
  - On selection, restricts a preset list of manager commands (`refresh`, `assign`, `unassign`, `delete`, `edit`, `goal`) to that role.
  - Additive — running multiple times with different roles gives all selected roles access.
  - Uses `.setDefaultMemberPermissions(PermissionFlagsBits.Administrator)` to hide from non-admins in Discord UI.
  - Shows confirmation with list of restricted commands and a note about `/settings` for fine-tuning.
- Requires guild context.

### /edit
- **Status:** Implemented
- Inputs (collected via task picker + goal picker + modal):
  - task selection (required)
  - goal (optional, can change/set/clear/create new)
  - title, due date/time, notes (modal, pre-filled with current values)
  - assignee (optional, change/keep/remove)
- Behavior:
  - Reuses `createTaskSelector` for task selection.
  - Goal picker offers existing goals + "New goal..." + "No goal".
  - Modal pre-fills the existing due date in the configured server timezone.
  - Reschedules reminders on save (cancels stale ones, creates new ones for the new due/assignee).
  - Updates main and goal-specific pinned task lists.
- Requires guild context.

### /delete
- **Status:** Implemented
- Inputs (via task picker):
  - task selection (required)
- Behavior:
  - Reuses `createTaskSelector` with the "Delete" action label.
  - Deletes the task, cancels its pending reminders, updates pinned lists.
- Requires guild context.

### /list
- **Status:** Implemented
- Inputs (via component-driven filters):
  - status (open / complete / all — String Select)
  - goal (String Select of active goals)
  - assignee (User Select)
- Behavior:
  - Read-only paginated viewer; the pinned list remains the canonical board.
  - Status defaults to "open"; navigation via Previous/Next buttons.
  - Tagged `alwaysPublic` so anyone in the guild can read.
- Requires guild context.

### /bug-report
- **Status:** Implemented
- Inputs (collected via modal):
  - title (required, max 120 chars)
  - description (optional, max 1500 chars)
  - severity (selected after modal: low / medium / high / critical)
- Behavior:
  - Modal collects title + description, then a severity String Select.
  - Creates a Bug document with a guild-scoped ID (B-001, B-002, ...).
  - Posts a public summary in the configured task list channel (no-op if no channel is configured).
  - Tagged `alwaysPublic`.
- Requires guild context.

### /set-timezone
- **Status:** Implemented
- Inputs:
  - common-timezone select (preset IANA names)
  - custom IANA name via modal
- Behavior:
  - Validates IANA names with `Intl.DateTimeFormat`.
  - Writes to `ServerConfig.timezone`. Used when parsing due-date input in `/create` and `/edit` modals via luxon.
- Requires guild context.

### /set-reminders
- **Status:** Implemented
- Inputs:
  - preset cadence select (off / 1d / 1d-1h / 3d-1d-1h / 7d-3d-1d-4h-1h)
  - custom comma-separated offsets via modal (e.g., `7d,3d,1d,4h,1h`)
- Behavior:
  - Parses and normalizes offsets supporting `d`, `h`, `m` units.
  - Writes to `ServerConfig.reminderCadence`. The reminder scheduler uses this when scheduling reminders for tasks.
- Requires guild context.

### /set-manager-role
- **Status:** Implemented
- Inputs (Role Select):
  - role (required)
- Behavior:
  - Bulk-grants the chosen role access to a preset list of manager commands: `refresh`, `assign`, `unassign`, `delete`, `edit`, `goal`.
  - Additive — running with a different role grants both roles access.
  - `setDefaultMemberPermissions(Administrator)` hides it from non-admins in the Discord UI.
- Requires guild context.

## Planned commands

_All previously planned commands have shipped. `planned.ts` exports an empty array._

## Task list behavior
- Pinned messages in the configured channel (main task list).
- Updated on every task mutation (create, complete, assign, edit, delete, take, unassign).
- Can be fully rebuilt from the database via `/refresh`.
- Shows only open tasks (including unassigned).
- Grouped by goal name, with "Uncategorized" last.
- Sorted by due date within each goal (soonest first).
- Compact format per task: `**title** · assignee · <relative timestamp>`.
- **Multi-message chunking** — when content exceeds Discord's 4000-char Components V2 cap, the list splits across multiple pinned messages labelled "Page X of N". `ServerConfig.taskListMessageIds` and `Goal.messageIds` are arrays.
- **Pin ordering** — when chunk count grows, the bot unpins all pinned messages and re-pins them in reverse so Page 1 ends up most-recently pinned (top of the pin list). Edit-in-place when count is unchanged; delete excess on shrink (no re-pin needed).
- **Notification suppression** — new pinned messages send with `MessageFlags.SuppressNotifications`, and Discord's auto-generated `ChannelPinnedMessage` notification is fetched and deleted after each pin.
- Each task entry includes:
  - Title
  - Assignee (or "Unassigned")
  - Due date/time (Discord timestamp format, relative)
- The last page also includes a short "How to use" footer.

### Goal-specific pinned lists
- Goals can optionally be linked to a specific channel via `/goal` or `/set-channel #channel GoalName`.
- When linked, the channel gets its own pinned message showing only open tasks for that goal.
- Goal-specific pinned lists are updated alongside the main list on every task change affecting that goal.
- Unlinking a goal from a channel deletes the goal’s pinned message from that channel.

## Example usage (real-life scenario)
Mae (team manager) sets the list channel so everyone knows where tasks live. She runs this in `#ops-tasks`:
`/set-channel`
She picks `#ops-tasks` from the Channel Select and confirms.

Mae needs someone to design a bout flyer but doesn’t know who will take it, so she creates an unassigned task:
`/create`
She selects the goal "Prepare marketing for this tournament" from the goal picker.
She fills the modal:
- Title: `Design May bout flyer`
- Due Date & Time: `2024-05-20 18:00`
- Notes: `Use the teal/black palette`
After submitting, she clicks "Unassigned."

The pinned list updates so the team can see it. Dani sees it and claims the task:
`/take`
She selects `T-001` from the task picker and confirms.

Mae later realizes a specific skater should handle ticketing, so she assigns it directly:
`/create`
She selects the same goal from the picker.
She fills the modal:
- Title: `Set up ticket link`
- Due Date & Time: `2024-05-10 12:00`
- Notes: `Use last season’s Eventbrite account`
After submitting the modal, she clicks "Assign" and chooses `@Jules` from the User Select.

Jules needs the due date pushed a day and updates the task:
`/edit`
He selects task `T-002` from the picker and updates the Due Date & Time field in the modal:
- Due Date & Time: `2024-05-11 12:00`

Dani finishes the flyer and marks the task complete:
`/complete`
She finds `T-001` in the paginated task list and clicks the "complete" button.

Anyone can browse available commands:
`/help` or `/taysr`

## Example pinned task list
```
Taysr Tasks (Open)
How to use: /help

Goal: Prepare marketing for this tournament
T-002 • Set up ticket link • @Jules • Due May 11, 12:00 PM
Notes: Use last season’s Eventbrite account

Uncategorized
T-003 • Post practice schedule • Unassigned • Due May 12, 6:00 PM
Notes: Confirm with coaches before posting
```

## Reminder behavior
- Reminders are only scheduled when a task has an assignee, a future `dueAt`, and `status === 'open'`.
- Cadence comes from `ServerConfig.reminderCadence`. Each offset string (`d`, `h`, `m`) becomes a `Reminder` document with `sendAt = dueAt - offset` and a snapshot of `assigneeId` at schedule time.
- Reminders dedupe on `(taskId, offset)` via a compound unique index — re-scheduling a task safely upserts.
- Reminders are cancelled (status → `canceled`) when the task is completed, deleted, unassigned, or its cadence is changed such that an offset is no longer valid.
- The scheduler ticks every 60 seconds: it queries pending reminders with `sendAt <= now`, re-validates against the live task (still open, same assignee), DMs the assignee, and marks the reminder `sent` (or `failed` if the DM bounces).
- Failed deliveries log an error to the console; they do not retry automatically.
- Implementation: `src/utils/reminders.ts` (`scheduleRemindersForTask`, `cancelRemindersForTask`, `processDueReminders`, `startReminderScheduler`).

## Data model

### ServerConfig
- guild_id (string, PK, Discord guild ID)
- task_list_channel_id (string, nullable until set)
- task_list_message_ids (array of strings, one per pinned page; empty until set)
- timezone (string, IANA name; default `UTC`)
- reminder_cadence (array of offset strings, e.g., `['7d','3d','1d','4h','1h']`)
- lockdown_enabled (boolean; default false)
- all_access_role_ids (array of role IDs; bypass every permission check)
- own_tasks_only_role_ids (array of role IDs; restrict members to tasks assigned to themselves)

### CommandPermission
- guild_id (string, part of compound PK)
- command_name (string, part of compound PK)
- role_ids (array of string, Discord role IDs allowed to use this command)
- Compound unique index: { guild_id, command_name }
- If no document exists for a command, or role_ids is empty, the command is public

### Goal
- goal_id (string, unique short ID, e.g., G-001)
- guild_id (string, FK to ServerConfig)
- name (string, unique per server, case-insensitive)
- description (string, optional)
- status (enum: active, archived)
- channel_id (string, nullable; linked channel for goal-specific pinned list)
- message_ids (array of strings; pinned message IDs in linked channel — chunked when long)
- created_at (timestamp)
- updated_at (timestamp)

### Task
- task_id (string, unique short ID)
- guild_id (string, FK to ServerConfig)
- goal_id (string, nullable, FK to Goal)
- title (string)
- notes (string, optional)
- assignee_id (string, nullable)
- creator_id (string)
- due_at (timestamp, UTC)
- status (enum: open, complete)
- created_at (timestamp)
- updated_at (timestamp)

### Bug
- bug_id (string, unique short ID, guild-scoped, e.g., B-001)
- guild_id (string, FK to ServerConfig)
- title (string)
- description (string, optional)
- severity (enum: low, medium, high, critical; default: medium)
- reporter_id (string, Discord user ID)
- status (enum: open, resolved)
- resolved_by (string, nullable, Discord user ID)
- resolved_at (timestamp, nullable)
- created_at (timestamp)
- updated_at (timestamp)

### Reminder
- task_id (string, Mongo ObjectId of the related Task in string form)
- guild_id (string, FK to ServerConfig)
- assignee_id (string, snapshot of who to DM when this fires)
- offset (string, the cadence offset that scheduled this, e.g., `1d`)
- send_at (timestamp, UTC; equal to `task.dueAt - offset`)
- sent_at (timestamp, nullable)
- status (enum: pending, sent, canceled, failed)
- created_at (timestamp)
- updated_at (timestamp)
- Compound unique index on `(task_id, offset)` so rescheduling is idempotent.
