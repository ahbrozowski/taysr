# Taysr Discord Bot Spec

## Overview
- Purpose: task management for a roller derby team in Discord.
- Interaction model: slash commands only, under `/taysr`.
- Task creation and updates use message components (modals/selects/buttons) to collect inputs after the command is invoked.
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
  - A: Use `/taysr`.
- Q: `set-channel` behavior when no channel provided?
  - A: Default to the channel where the command is run.
- Q: Add a subcommand to self-assign?
  - A: Add `/taysr take` to assign to the sender.
- Q: Add an unassign command?
  - A: Add `/taysr unassign`.
- Q: Add a help command?
  - A: Add `/taysr help` with usage examples.
- Q: Should the pinned list include guidance?
  - A: Include a short "How to use" guide and a `/taysr help` example.
- Q: Should commands use message components and modals for input?
  - A: Yes; collect inputs via modals/selects/buttons, including date/time.

## Roles and permissions
- Config commands are role-restricted.
- Task commands are allowed for:
  - Members with configured roles, or
  - The task creator
- Anyone can view tasks via the pinned list or `/taysr list`.

## Component-driven input
- All `/taysr` commands respond with message components or modals to collect inputs.
- Component types used:
  - Buttons (confirm/continue)
  - String Select (task picker, quick filters, quick date options)
  - String Select (goal picker)
  - User Select (assignee)
  - Channel Select (task list channel)
  - Text Input (freeform fields in modals)
- Date/time entry:
  - Primary: modal text input labeled "Due date/time (server timezone)".
  - Optional quick-pick select with common offsets (e.g., "Tomorrow 6 PM", "In 3 days", "Next week", "Custom...").
  - Selecting "Custom..." opens the modal for exact date/time entry.
  - Accepted format is shown in the modal placeholder (e.g., `YYYY-MM-DD HH:mm`).

## Core commands

### /taysr create
- Inputs:
  - title (required)
  - due (required)
  - goal (optional)
  - assignee (optional)
  - notes (optional)
  - channel (optional override for list channel)
- Behavior:
  - Creates a task; assignee may be empty.
  - If goal is provided and does not exist, it is created.
  - Schedules reminders only if assignee exists.
  - Updates pinned list message.
- Component flow:
  - Step 1: Goal picker (String Select of existing goals + "New goal..." + "No goal").
  - Step 2: If "New goal..." selected, modal to enter goal name.
  - Step 3: Modal with Title, Due date/time, Notes.
  - Step 4 (optional): User Select to assign, or button to leave unassigned.

### /taysr assign
- Inputs:
  - task_id (required)
  - assignee (required)
- Behavior:
  - Assigns task to user.
  - Schedules reminders relative to due date.
  - Updates pinned list message.
- Component flow:
  - Step 1: Task picker (String Select of open tasks).
  - Step 2: User Select for assignee.

### /taysr unassign
- Inputs:
  - task_id (required)
- Behavior:
  - Removes the assignee from the task.
  - Cancels future reminders.
  - Updates pinned list message.
- Component flow:
  - Step 1: Task picker (String Select of open tasks).
  - Step 2: Confirm button.

### /taysr take
- Inputs:
  - task_id (required)
- Behavior:
  - Assigns task to the command sender.
  - Schedules reminders relative to due date.
  - Updates pinned list message.
- Component flow:
  - Step 1: Task picker (String Select of unassigned tasks).
  - Step 2: Confirm button.

### /taysr complete
- Inputs:
  - task_id (required)
- Behavior:
  - Marks task complete.
  - Cancels future reminders.
  - Updates pinned list message.
- Component flow:
  - Step 1: Task picker (String Select of open tasks).
  - Step 2: Confirm button.

### /taysr edit
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

### /taysr delete
- Inputs:
  - task_id (required)
- Behavior:
  - Deletes task.
  - Cancels future reminders.
  - Updates pinned list message.
- Component flow:
  - Step 1: Task picker (String Select of open tasks).
  - Step 2: Confirm button.

### /taysr list
- Inputs:
  - status (optional: open, complete, all)
  - assignee (optional: user or "unassigned")
  - goal (optional: existing goal or "uncategorized")
- Behavior:
  - Returns an ephemeral list summary.
  - Pinned list remains the canonical view.
- Component flow:
  - Optional filters via String Select (status, goal) and User Select (assignee).

### /taysr help
- Inputs:
  - none
- Behavior:
  - Returns an ephemeral help message with usage examples.

## Config commands (role-based)

### /taysr set-channel
- Inputs:
  - channel (optional; defaults to the channel where command is run)
- Behavior:
  - Sets the server task list channel.
  - Creates or updates the pinned message.
- Component flow:
  - Channel Select menu; defaults to the current channel if no selection.

### /taysr set-timezone
- Inputs:
  - timezone (required, IANA name)
- Behavior:
  - Sets the server timezone used for due date parsing and scheduling.
- Component flow:
  - Modal text input for timezone name, with an optional String Select of common timezones.

### /taysr set-reminders
- Inputs:
  - cadence (required; e.g., "7d,3d,1d,4h,1h")
- Behavior:
  - Sets server reminder cadence for all tasks.
- Component flow:
  - Modal text input for cadence.

## Task list behavior
- Single pinned message in the configured channel.
- Updated on every task change.
- Shows only open tasks (including unassigned).
- Grouped by goal name, with "Uncategorized" last.
- Sorted by due date within each goal (soonest first).
- Each task entry includes:
  - Task ID
  - Title
  - Assignee (or "Unassigned")
  - Due date/time (server timezone)
  - Optional notes or short summary
- The pinned message also includes a short "How to use" guide with a `/taysr help` example.

## Example usage (real-life scenario)
Mae (team manager) sets the list channel so everyone knows where tasks live. She runs this in `#ops-tasks`:
`/taysr set-channel`
She picks `#ops-tasks` from the Channel Select and confirms.

Mae needs someone to design a bout flyer but doesn’t know who will take it, so she creates an unassigned task:
`/taysr create`
She picks a goal: `Prepare marketing for this tournament`
She fills the modal:
- Title: `Design May bout flyer`
- Due date/time (server timezone): `2024-05-20 6:00 PM`
- Notes: `Use the teal/black palette`
After submitting, she clicks "Leave unassigned."

The pinned list updates so the team can see it. Dani sees it and claims the task:
`/taysr take`
She selects `T-204` from the task picker and confirms.

Mae later realizes a specific skater should handle ticketing, so she assigns it directly:
`/taysr create`
She picks a goal: `Prepare marketing for this tournament`
She fills the modal:
- Title: `Set up ticket link`
- Due date/time (server timezone): `2024-05-10 12:00 PM`
- Notes: `Use last season's Eventbrite account`
After submitting the modal, she chooses `@Jules` from the User Select.

Jules needs the due date pushed a day and updates the task:
`/taysr edit`
He selects task `T-205` from the picker and updates the Due date/time field in the modal:
- Due date/time (server timezone): `2024-05-11 12:00 PM`

Dani finishes the flyer and marks the task complete:
`/taysr complete`
She selects `T-204` from the task picker and confirms.

Anyone can check usage in the moment:
`/taysr help`

## Example pinned task list
```
Taysr Tasks (Open)
How to use: /taysr help

Goal: Prepare marketing for this tournament
T-205 • Set up ticket link • @Jules • Due May 11, 12:00 PM
Notes: Use last season's Eventbrite account

Uncategorized
T-206 • Post practice schedule • Unassigned • Due May 12, 6:00 PM
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

### Reminder
- reminder_id (string, unique)
- task_id (string, FK to Task)
- send_at (timestamp, UTC)
- sent_at (timestamp, nullable)
- channel_id (string, optional if DM-only)
- status (enum: pending, sent, canceled)
