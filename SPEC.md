# Taysr Discord Bot Spec

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
5. Calls `command.execute(interaction)` with try/catch error handling.

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
- Config commands are role-restricted.
- Task commands are allowed for:
  - Members with configured roles, or
  - The task creator
- Anyone can view tasks via the pinned list or `/list`.

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
  - channel (optional slash command option; defaults to current channel)
- Behavior:
  - Sets the server task list channel.
  - Deletes old pinned message from previous channel if one exists.
  - Creates or updates `ServerConfig` in database.
  - Calls `refreshPinnedTaskList` to create the pinned message in the new channel.
- Requires guild context.
- Component flow:
  - From slash command: uses the `channel` option or defaults to current channel.
  - From command picker: uses the current channel.

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

### /set-goal-channel
- **Status:** Implemented
- Inputs (collected via goal picker + Channel Select):
  - goal selection (required)
  - channel selection or unlink (required)
- Behavior:
  - Shows a String Select of active goals (with "(linked)" label if already linked).
  - If no goals exist, shows an error directing to `/goal`.
  - After selecting a goal, shows a Channel Select and (if currently linked) an "Unlink" button.
  - Linking a new channel: deletes old pinned message if changing channels, sets `channelId`, creates pinned task list.
  - Unlinking: deletes the goal's pinned message, clears `channelId` and `messageId`.
- Requires guild context.
- Component flow:
  - Step 1: Goal picker (String Select of active goals).
  - Step 2: Channel Select to pick a channel, or "Unlink" button if currently linked.

## Planned commands

The following commands are registered in the command registry but **not** deployed as Discord slash commands. They appear as "Coming Soon" in the command picker.

### /edit
- **Status:** Planned
- Inputs:
  - task_id (required)
  - title (optional)
  - due (optional)
  - notes (optional)
  - assignee (optional)
  - goal (optional)
- Behavior:
  - Updates task fields.
  - Goal may be set, changed, or cleared.
  - Reschedules reminders if assignee added/changed or due changes.
  - Updates pinned list message.
- Component flow:
  - Step 1: Task picker (String Select of open tasks).
  - Step 2: Goal picker (String Select of existing goals + "New goal..." + "No goal").
  - Step 3: If "New goal..." selected, modal to enter goal name.
  - Step 4: Modal with editable Title, Due date/time, Notes.
  - Step 5 (optional): User Select to change assignee.

### /delete
- **Status:** Planned
- Inputs:
  - task_id (required)
- Behavior:
  - Deletes task.
  - Cancels future reminders.
  - Updates pinned list message.
- Component flow:
  - Step 1: Task picker (String Select of open tasks).
  - Step 2: Confirm button.

### /list
- **Status:** Planned
- Inputs:
  - status (optional: open, complete, all)
  - assignee (optional: user or "unassigned")
  - goal (optional: existing goal or "uncategorized")
- Behavior:
  - Returns an ephemeral list summary.
  - Pinned list remains the canonical view.
- Component flow:
  - Optional filters via String Select (status, goal) and User Select (assignee).

### /bug-report
- **Status:** Planned
- Inputs (collected via modal):
  - title (required, max 100 chars)
  - description (required, max 1000 chars)
  - severity (optional: low, medium, high, critical — via String Select)
- Behavior:
  - Opens a modal to collect bug details (title, description).
  - Optionally shows a severity picker after the modal.
  - Creates a BugReport in the database with an atomically generated guild-scoped bug ID (B-001, B-002, etc.).
  - Posts a summary in the configured task list channel (or replies ephemerally if no channel is set).
  - Bugs are viewable via `/bugs`.
- Requires guild context.
- Component flow:
  - Step 1: Modal with Title and Description.
  - Step 2 (optional): Severity picker — String Select with Low / Medium / High / Critical.

### /bugs
- **Status:** Planned
- Inputs:
  - status (optional: open, resolved, all)
  - severity (optional: low, medium, high, critical)
  - reporter (optional: User Select)
- Behavior:
  - Shows a paginated, filterable list of bug reports.
  - Uses the reusable task selector pattern with "View" or "Resolve" action buttons.
  - Clicking "Resolve" marks the bug as resolved.
- Requires guild context.
- Component flow:
  - Step 1: Paginated bug list with filters and action buttons.

### /set-timezone
- **Status:** Planned
- Inputs:
  - timezone (required, IANA name)
- Behavior:
  - Sets the server timezone used for due date parsing and scheduling.
- Component flow:
  - Modal text input for timezone name, with an optional String Select of common timezones.

### /set-reminders
- **Status:** Planned
- Inputs:
  - cadence (required; e.g., "7d,3d,1d,4h,1h")
- Behavior:
  - Sets server reminder cadence for all tasks.
- Component flow:
  - Modal text input for cadence.

## Task list behavior
- Single pinned message in the configured channel (main task list).
- Updated on every task change (create, complete, assign, edit, delete).
- Can be fully rebuilt from the database via `/refresh`.
- Shows only open tasks (including unassigned).
- Grouped by goal name, with "Uncategorized" last.
- Sorted by due date within each goal (soonest first).
- Compact format per task: `taskId • title • assignee • due date`.
- Respects Discord’s 40-component limit.
- Each task entry includes:
  - Task ID (guild-scoped, e.g., T-001)
  - Title
  - Assignee (or "Unassigned")
  - Due date/time (Discord timestamp format)
  - Optional notes or short summary
- The pinned message also includes a short "How to use" guide with a `/help` example.

### Goal-specific pinned lists
- Goals can optionally be linked to a specific channel via `/goal` or `/set-goal-channel`.
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
- Reminders are only scheduled when a task has an assignee.
- Reminder schedule is derived from the server cadence.
- Reminders are canceled when a task is completed or deleted.
- Reminders are sent via DM to the assignee.

## Data model

### ServerConfig
- guild_id (string, PK, Discord guild ID)
- task_list_channel_id (string, nullable until set)
- task_list_message_id (string, nullable until set)
- timezone (string, IANA tz)
- reminder_cadence (string or array of durations)
- admin_role_ids (array of string)

### Goal
- goal_id (string, unique short ID)
- guild_id (string, FK to ServerConfig)
- name (string, unique per server, case-insensitive)
- description (string, optional)
- status (enum: active, archived)
- channel_id (string, nullable; linked channel for goal-specific pinned list)
- message_id (string, nullable; pinned message ID in linked channel)
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

### BugReport
- bug_id (string, unique short ID, guild-scoped, e.g., B-001)
- guild_id (string, FK to ServerConfig)
- title (string)
- description (string)
- severity (enum: low, medium, high, critical; default: medium)
- reporter_id (string, Discord user ID)
- status (enum: open, resolved)
- resolved_by (string, nullable, Discord user ID)
- resolved_at (timestamp, nullable)
- created_at (timestamp)
- updated_at (timestamp)

### Reminder
- reminder_id (string, unique)
- task_id (string, FK to Task)
- send_at (timestamp, UTC)
- sent_at (timestamp, nullable)
- channel_id (string, optional if DM-only)
- status (enum: pending, sent, canceled)
