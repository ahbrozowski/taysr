import { Client } from 'discord.js';
import { Reminder, ServerConfig, Task } from '../models';
import type { ITask } from '../models/Task';

const TICK_INTERVAL_MS = 60 * 1000;

/**
 * Parses an offset string like "7d", "4h", or "30m" into milliseconds.
 * Returns null for malformed input.
 */
export function parseOffsetMs(offset: string): number | null {
  const match = offset.match(/^(\d+)([dhm])$/i);
  if (!match) return null;

  const amount = parseInt(match[1], 10);
  if (amount <= 0) return null;

  const unit = match[2].toLowerCase();
  switch (unit) {
    case 'd': return amount * 24 * 60 * 60 * 1000;
    case 'h': return amount * 60 * 60 * 1000;
    case 'm': return amount * 60 * 1000;
    default: return null;
  }
}

/**
 * (Re)schedules reminders for a task. Cancels any pending reminders whose
 * offset is no longer in the cadence (or whose sendAt is now in the past),
 * and upserts a pending reminder for each valid (taskId, offset) pair.
 *
 * No-op if the task has no assignee, no due date, or status !== 'open'.
 */
export async function scheduleRemindersForTask(task: ITask): Promise<void> {
  const taskKey = (task._id as any).toString();

  if (task.status !== 'open' || !task.assigneeId || !task.dueAt) {
    await cancelRemindersForTask(taskKey);
    return;
  }

  const config = await ServerConfig.findOne({ guildId: task.guildId }).lean();
  const cadence = config?.reminderCadence ?? [];

  if (cadence.length === 0) {
    await cancelRemindersForTask(taskKey);
    return;
  }

  const now = Date.now();
  const dueMs = new Date(task.dueAt).getTime();
  const validOffsets = new Set<string>();

  for (const offset of cadence) {
    const offsetMs = parseOffsetMs(offset);
    if (offsetMs === null) continue;

    const sendAt = new Date(dueMs - offsetMs);
    if (sendAt.getTime() <= now) continue;

    validOffsets.add(offset);

    await Reminder.findOneAndUpdate(
      { taskId: taskKey, offset },
      {
        $set: {
          guildId: task.guildId,
          assigneeId: task.assigneeId,
          sendAt,
          status: 'pending',
          sentAt: null,
        },
      },
      { upsert: true, new: true },
    );
  }

  // Cancel reminders for offsets that are no longer valid
  await Reminder.updateMany(
    {
      taskId: taskKey,
      status: 'pending',
      offset: { $nin: Array.from(validOffsets) },
    },
    { $set: { status: 'canceled' } },
  );
}

/**
 * Cancels all pending reminders for a task. Used when a task is completed,
 * deleted, or unassigned.
 */
export async function cancelRemindersForTask(taskMongoId: string): Promise<void> {
  await Reminder.updateMany(
    { taskId: taskMongoId, status: 'pending' },
    { $set: { status: 'canceled' } },
  );
}

/**
 * Processes any reminders whose sendAt has passed. DMs the assignee and marks
 * the reminder sent (or failed if the DM couldn't be delivered). Re-validates
 * the underlying task before sending; cancels stale reminders silently.
 */
export async function processDueReminders(client: Client): Promise<void> {
  const due = await Reminder.find({
    status: 'pending',
    sendAt: { $lte: new Date() },
  }).lean();

  for (const reminder of due) {
    try {
      const task = await Task.findById(reminder.taskId).lean();

      if (
        !task ||
        task.status !== 'open' ||
        task.assigneeId !== reminder.assigneeId
      ) {
        await Reminder.updateOne(
          { _id: reminder._id },
          { $set: { status: 'canceled' } },
        );
        continue;
      }

      const user = await client.users.fetch(reminder.assigneeId);
      const dueTimestamp = Math.floor(new Date(task.dueAt).getTime() / 1000);

      await user.send({
        content:
          `⏰ Reminder: **${task.taskId} — ${task.title}**\n` +
          `Due <t:${dueTimestamp}:R> (<t:${dueTimestamp}:f>)` +
          (task.notes ? `\n\n${task.notes}` : ''),
      });

      await Reminder.updateOne(
        { _id: reminder._id },
        { $set: { status: 'sent', sentAt: new Date() } },
      );
    } catch (error) {
      console.error(`Failed to send reminder ${reminder._id}:`, error);
      await Reminder.updateOne(
        { _id: reminder._id },
        { $set: { status: 'failed' } },
      );
    }
  }
}

/**
 * Starts a periodic tick that processes due reminders. Returns a stop function
 * for graceful shutdown.
 */
export function startReminderScheduler(client: Client): () => void {
  const tick = async () => {
    try {
      await processDueReminders(client);
    } catch (error) {
      console.error('Reminder tick failed:', error);
    }
  };

  const handle = setInterval(tick, TICK_INTERVAL_MS);
  // Fire once on startup so the first batch doesn't have to wait a full minute.
  tick();

  return () => clearInterval(handle);
}
