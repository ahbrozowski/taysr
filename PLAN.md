# Development Plan

## Goals
- Deliver a Discord bot that matches SPEC.md and uses component-driven flows for all `/taysr` commands.
- Provide a reliable pinned task list, reminders, and role-based permissions per server.
- Keep interactions clear, low-friction, and resilient to partial input or errors.

## Non-goals (for initial build)
- External integrations (calendar, Notion, Google Sheets).
- Advanced analytics beyond basic task counts.
- Multi-server shared task boards.

## Phases

### Phase 0: Project audit and decisions
- Review existing bot scaffolding, libraries, and deployment flow.
- Decide storage engine (SQLite, Postgres, or JSON file) based on current repo constraints.
- Decide scheduler approach (interval tick vs job queue).
- Decide component strategy (standard components vs components v2 flag usage for pinned message).

### Phase 1: Data layer foundation
- Implement `ServerConfig`, `Task`, `Reminder` storage.
- Provide CRUD helpers and ID generation (`T-###` or similar).
- Add indices or lookup helpers for open tasks and due reminders.
- Add basic migrations or schema bootstrap.

### Phase 2: Command registration and routing
- Define `/taysr` command tree with subcommands.
- Build a router for interactions: slash commands, button clicks, select menus, and modal submissions.
- Normalize interaction context (server, user, channel).

### Phase 3: Component-driven command flows
- Implement component flows for each command:
  - Create/edit modals with date/time input.
  - Task pickers for open/unassigned tasks.
  - User select for assignment.
  - Confirm buttons for destructive actions.
- Ensure every flow handles cancel/timeout gracefully.

### Phase 4: Pinned task list
- Create or locate the pinned message in the configured channel.
- Render a stable, readable list with task IDs and a help snippet.
- Update on every task mutation.

### Phase 5: Reminders and scheduling
- Parse server cadence (e.g., "7d,3d,1d,4h,1h") into offsets.
- Schedule reminders on create/assign, and cancel on complete/delete/unassign.
- Send reminders via DM; handle blocked DMs gracefully.

### Phase 6: Permissions, validation, and error handling
- Enforce role-based access for config commands and task mutations.
- Validate inputs (date/time format, cadence format, timezone).
- Provide clear error responses and recovery paths.

### Phase 7: Testing and release readiness
- Manual smoke tests in a test server.
- Edge case checks: missing permissions, invalid inputs, missing pinned message.
- Update docs and DEPLOYMENT checklist if needed.

## Issue List (detailed)

### ISSUE-1: Project audit and baseline wiring
- Tasks:
  - Review current bot setup, libs, and env configuration.
  - Confirm slash command registration approach.
  - Decide storage engine and scheduler strategy.
- Acceptance criteria:
  - Clear notes on chosen storage and scheduler.
  - `/taysr` command scaffold registered in a dev server.

### ISSUE-2: Storage schema and access layer
- Tasks:
  - Define schema for `ServerConfig`, `Task`, `Reminder`.
  - Implement CRUD helpers with basic validation.
  - Add ID generator and helper queries (open tasks, due reminders).
- Acceptance criteria:
  - All entities persist across restarts.
  - Queries return correct open tasks and reminders.

### ISSUE-3: Interaction router and component helpers
- Tasks:
  - Central router for interaction types (command, button, select, modal).
  - Helpers to build modals/selects/buttons consistently.
  - Correlate component `custom_id` with state (task ID, action).
- Acceptance criteria:
  - Interactions routed correctly with no collisions.
  - Component IDs map to expected actions reliably.

### ISSUE-4: Create task flow (component-driven)
- Tasks:
  - Modal for title, due date/time, notes.
  - Optional user select for assignee, or "Leave unassigned" button.
  - Validate and parse date/time using server timezone.
- Acceptance criteria:
  - Tasks can be created with or without assignee.
  - Invalid dates prompt a friendly error.

### ISSUE-5: Edit task flow (component-driven)
- Tasks:
  - Task picker select for open tasks.
  - Modal for editable fields.
  - Optional reassignment via user select.
- Acceptance criteria:
  - Edits update task and pinned list.
  - Due date changes reschedule reminders.

### ISSUE-6: Assign, take, unassign flows
- Tasks:
  - Task picker select for assign/take/unassign.
  - User select for assign; confirm button for take/unassign.
  - Reminder scheduling and cancelation logic.
- Acceptance criteria:
  - Assign/take/unassign work end-to-end.
  - Reminders only exist when a task has an assignee.

### ISSUE-7: Complete and delete flows
- Tasks:
  - Task picker select for open tasks.
  - Confirm button for destructive actions.
  - Cancel reminders and update list.
- Acceptance criteria:
  - Completed tasks disappear from pinned list.
  - Deleted tasks are removed and reminders canceled.

### ISSUE-8: Pinned list rendering and lifecycle
- Tasks:
  - Find or create pinned message in configured channel.
  - Render list with help snippet and consistent ordering.
  - Handle missing permissions or pin limits.
- Acceptance criteria:
  - Pinned list stays updated after all task mutations.
  - Errors are handled with user-facing guidance.

### ISSUE-9: Reminders and scheduler
- Tasks:
  - Parse cadence string into reminder offsets.
  - Build scheduler loop or queue worker.
  - DM reminders and mark sent/canceled.
- Acceptance criteria:
  - Reminders fire at expected times.
  - Canceling a task stops pending reminders.

### ISSUE-10: Config commands and permissions
- Tasks:
  - `/taysr set-channel`, `/taysr set-timezone`, `/taysr set-reminders`.
  - Role checks and helpful error messages.
  - Default channel selection when not provided.
- Acceptance criteria:
  - Only authorized roles can change config.
  - Defaults behave as specified in SPEC.md.

### ISSUE-11: List and help commands
- Tasks:
  - `/taysr list` with filters via components.
  - `/taysr help` content and examples.
- Acceptance criteria:
  - Help output matches SPEC.md examples.
  - List output is readable and accurate.

### ISSUE-12: Validation, logging, and reliability
- Tasks:
  - Centralized input validation and error formatting.
  - Logging for interaction failures and reminder send errors.
  - Graceful handling of missing permissions or blocked DMs.
- Acceptance criteria:
  - Errors are actionable for users and admins.
  - No unhandled exceptions in common flows.

### ISSUE-13: Testing and release checklist
- Tasks:
  - Manual test checklist and sample scenarios.
  - Verify against SPEC.md examples.
  - Update DEPLOYMENT docs if needed.
- Acceptance criteria:
  - All checklist items pass in a test server.
  - Documentation reflects final behavior.
