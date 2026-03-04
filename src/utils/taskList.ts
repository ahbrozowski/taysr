import { Client, TextChannel, MessageFlags, TextDisplayBuilder } from 'discord.js';
import { ServerConfig, Task, Goal } from '../models';

/**
 * Formats a single task as a one-line string
 */
function formatTaskLine(task: any): string {
  const assignee = task.assigneeId ? `<@${task.assigneeId}>` : 'Unassigned';
  const timestamp = Math.floor(new Date(task.dueAt).getTime() / 1000);
  return `**${task.title}** · ${assignee} · <t:${timestamp}:R>`;
}

/**
 * Groups tasks by goalId and returns them in order:
 * goals first (sorted by name), then uncategorized last.
 */
async function groupTasksByGoal(tasks: any[], guildId: string): Promise<{ name: string; tasks: any[] }[]> {
  const goalIds = [...new Set(tasks.filter(t => t.goalId).map(t => t.goalId))];

  const goals = goalIds.length > 0
    ? await Goal.find({ goalId: { $in: goalIds }, guildId }).lean()
    : [];

  const goalMap = new Map(goals.map(g => [g.goalId, g.name]));

  const grouped = new Map<string | null, any[]>();
  for (const task of tasks) {
    const key = task.goalId || null;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(task);
  }

  const result: { name: string; tasks: any[] }[] = [];

  for (const [goalId, goalTasks] of grouped) {
    if (goalId) {
      const goalName = goalMap.get(goalId) || goalId;
      result.push({ name: goalName, tasks: goalTasks });
    }
  }

  result.sort((a, b) => a.name.localeCompare(b.name));

  const uncategorized = grouped.get(null);
  if (uncategorized) {
    result.push({ name: 'Uncategorized', tasks: uncategorized });
  }

  return result;
}

/**
 * Builds a single TextDisplayBuilder containing the entire main task list
 */
async function buildTaskListComponents(tasks: any[], guildId: string): Promise<any[]> {
  const commandName = process.env.DISCORD_COMMAND_PREFIX || 'taysr';
  const lines: string[] = [];

  lines.push('# 📋 Taysr Tasks');
  lines.push('Open tasks for the team');
  lines.push('');

  if (tasks.length === 0) {
    lines.push(`No open tasks. Use \`/${commandName}\` to create a new task!`);
  } else {
    const groups = await groupTasksByGoal(tasks, guildId);

    for (const group of groups) {
      const heading = group.name === 'Uncategorized' ? '## Uncategorized' : `## 🎯 ${group.name}`;
      lines.push(heading);

      for (const task of group.tasks) {
        lines.push(formatTaskLine(task));
      }
    }
  }

  lines.push(`**How to use:** \`/${commandName}\` to get started`);
  lines.push(`_Last updated: <t:${Math.floor(Date.now() / 1000)}:R>_`);

  return [new TextDisplayBuilder().setContent(lines.join('\n'))];
}

/**
 * Builds a single TextDisplayBuilder for a goal-specific pinned list
 */
function buildGoalTaskListComponents(tasks: any[], goalName: string): any[] {
  const commandName = process.env.DISCORD_COMMAND_PREFIX || 'taysr';
  const lines: string[] = [];

  lines.push(`# 🎯 ${goalName}`);
  lines.push('Open tasks for this goal');
  lines.push('');

  if (tasks.length === 0) {
    lines.push(`No open tasks for this goal. Use \`/${commandName}\` to create a new task!`);
  } else {
    for (const task of tasks) {
      lines.push(formatTaskLine(task));
    }
  }

  lines.push(`_Last updated: <t:${Math.floor(Date.now() / 1000)}:R>_`);

  return [new TextDisplayBuilder().setContent(lines.join('\n'))];
}

/**
 * Sends or edits a pinned message in a channel.
 * Returns the message ID of the pinned message.
 */
async function upsertPinnedMessage(
  channel: TextChannel,
  existingMessageId: string | undefined,
  components: any[]
): Promise<string> {
  // Try to edit existing message
  if (existingMessageId) {
    try {
      const message = await channel.messages.fetch(existingMessageId);
      await message.edit({ components });
      return message.id;
    } catch {
      // Could not edit existing message, will create new one
    }
  }

  // Create new message
  const message = await channel.send({
    components,
    flags: [MessageFlags.IsComponentsV2],
    allowedMentions: { parse: [] },
  });

  try {
    await message.pin();
  } catch (error) {
    console.error('Failed to pin message:', error);
  }

  return message.id;
}

/**
 * Updates or creates the main pinned task list message (all tasks, grouped by goal)
 */
export async function updatePinnedTaskList(client: Client, guildId: string): Promise<void> {
  try {
    const config = await ServerConfig.findOne({ guildId });

    if (!config || !config.taskListChannelId) {
      return;
    }

    const channel = await client.channels.fetch(config.taskListChannelId);
    if (!channel || !channel.isTextBased() || !(channel instanceof TextChannel)) {
      console.error(`Channel ${config.taskListChannelId} is not a text channel`);
      return;
    }

    const tasks = await Task.find({ guildId, status: 'open' })
      .sort({ dueAt: 1 })
      .lean();

    const components = await buildTaskListComponents(tasks, guildId);
    const messageId = await upsertPinnedMessage(channel, config.taskListMessageId, components);

    if (messageId !== config.taskListMessageId) {
      config.taskListMessageId = messageId;
      await config.save();
    }
  } catch (error) {
    console.error('Error updating pinned task list:', error);
    throw error;
  }
}

/**
 * Updates or creates a goal-specific pinned task list in the goal's linked channel.
 * Only does anything if the goal has a channelId set.
 */
export async function updateGoalPinnedList(client: Client, goalId: string): Promise<void> {
  try {
    const goal = await Goal.findOne({ goalId });
    if (!goal || !goal.channelId) return;

    const channel = await client.channels.fetch(goal.channelId);
    if (!channel || !channel.isTextBased() || !(channel instanceof TextChannel)) {
      console.error(`Goal channel ${goal.channelId} is not a text channel`);
      return;
    }

    const tasks = await Task.find({ goalId, status: 'open' })
      .sort({ dueAt: 1 })
      .lean();

    const components = buildGoalTaskListComponents(tasks, goal.name);
    const messageId = await upsertPinnedMessage(channel, goal.messageId, components);

    if (messageId !== goal.messageId) {
      goal.messageId = messageId;
      await goal.save();
    }

  } catch (error) {
    console.error(`Error updating goal pinned list for ${goalId}:`, error);
    throw error;
  }
}

/**
 * Completely rebuilds the pinned task list from scratch.
 * Deletes the old message and creates a new one.
 */
export async function refreshPinnedTaskList(client: Client, guildId: string): Promise<void> {
  try {
    const config = await ServerConfig.findOne({ guildId });

    if (!config || !config.taskListChannelId) {
      return;
    }

    const channel = await client.channels.fetch(config.taskListChannelId);
    if (!channel || !channel.isTextBased() || !(channel instanceof TextChannel)) {
      console.error(`Channel ${config.taskListChannelId} is not a text channel`);
      return;
    }

    // Delete old message
    if (config.taskListMessageId) {
      try {
        const oldMessage = await channel.messages.fetch(config.taskListMessageId);
        await oldMessage.delete();
      } catch (error) {
        console.error('Could not delete old message:', error);
      }
    }

    const tasks = await Task.find({ guildId, status: 'open' })
      .sort({ dueAt: 1 })
      .lean();

    const components = await buildTaskListComponents(tasks, guildId);

    const message = await channel.send({
      components,
      flags: [MessageFlags.IsComponentsV2],
      allowedMentions: { parse: [] },
    });

    try {
      await message.pin();
    } catch (error) {
      console.error('Failed to pin message:', error);
    }

    config.taskListMessageId = message.id;
    await config.save();

  } catch (error) {
    console.error('Error refreshing pinned task list:', error);
    throw error;
  }
}

/**
 * Refreshes all goal-specific pinned lists for a guild.
 */
export async function refreshAllGoalPinnedLists(client: Client, guildId: string): Promise<void> {
  const goals = await Goal.find({ guildId, channelId: { $exists: true, $ne: null } }).lean();

  for (const goal of goals) {
    await updateGoalPinnedList(client, goal.goalId);
  }
}
