import { Client, TextChannel, MessageFlags, TextDisplayBuilder, SeparatorBuilder, SeparatorSpacingSize } from 'discord.js';
import { ServerConfig, Task, Goal } from '../models';

/**
 * Creates a compact TextDisplay component for a task
 */
function createTaskDisplay(task: any): TextDisplayBuilder {
  const assignee = task.assigneeId ? `<@${task.assigneeId}>` : 'Unassigned';
  const dueDate = new Date(task.dueAt);
  const timestamp = Math.floor(dueDate.getTime() / 1000);

  const content = `**${task.taskId}** • ${task.title}\n${assignee} • <t:${timestamp}:R>`;

  return new TextDisplayBuilder().setContent(content);
}

/**
 * Groups tasks by goalId and returns them in order:
 * goals first (sorted by name), then uncategorized last.
 */
async function groupTasksByGoal(tasks: any[], guildId: string): Promise<{ name: string; tasks: any[] }[]> {
  // Collect unique goalIds
  const goalIds = [...new Set(tasks.filter(t => t.goalId).map(t => t.goalId))];

  // Fetch goal names
  const goals = goalIds.length > 0
    ? await Goal.find({ goalId: { $in: goalIds }, guildId }).lean()
    : [];

  const goalMap = new Map(goals.map(g => [g.goalId, g.name]));

  // Group tasks
  const grouped = new Map<string | null, any[]>();
  for (const task of tasks) {
    const key = task.goalId || null;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(task);
  }

  // Build ordered result: named goals first, uncategorized last
  const result: { name: string; tasks: any[] }[] = [];

  for (const [goalId, goalTasks] of grouped) {
    if (goalId) {
      const goalName = goalMap.get(goalId) || goalId;
      result.push({ name: goalName, tasks: goalTasks });
    }
  }

  // Sort goal groups alphabetically
  result.sort((a, b) => a.name.localeCompare(b.name));

  // Add uncategorized last
  const uncategorized = grouped.get(null);
  if (uncategorized) {
    result.push({ name: 'Uncategorized', tasks: uncategorized });
  }

  return result;
}

/**
 * Builds the components array for the main task list (all tasks, grouped by goal)
 */
async function buildTaskListComponents(tasks: any[], guildId: string): Promise<any[]> {
  const components = [];
  const commandName = process.env.DISCORD_COMMAND_PREFIX || 'taysr';

  // Header
  components.push(
    new TextDisplayBuilder().setContent('# 📋 Taysr Tasks\nOpen tasks for the team')
  );

  components.push(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Large));

  if (tasks.length === 0) {
    components.push(
      new TextDisplayBuilder().setContent(`No open tasks. Use \`/${commandName}\` to create a new task!`)
    );
  } else {
    const groups = await groupTasksByGoal(tasks, guildId);

    for (const group of groups) {
      // Goal heading
      if (group.name === 'Uncategorized') {
        components.push(new TextDisplayBuilder().setContent('## Uncategorized'));
      } else {
        components.push(new TextDisplayBuilder().setContent(`## 🎯 ${group.name}`));
      }

      for (const task of group.tasks) {
        components.push(createTaskDisplay(task));
        components.push(new SeparatorBuilder().setDivider(false).setSpacing(SeparatorSpacingSize.Small));

        if (components.length >= 36) {
          components.push(new TextDisplayBuilder().setContent('_...and more tasks. Some tasks are hidden due to message limits._'));
          break;
        }
      }

      if (components.length >= 36) break;
    }
  }

  // Footer with how-to-use guide
  components.push(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small));
  components.push(
    new TextDisplayBuilder().setContent(
      `**How to use:** \`/${commandName}\` to get started\n` +
      `_Last updated: <t:${Math.floor(Date.now() / 1000)}:R>_`
    )
  );

  return components;
}

/**
 * Builds the components array for a goal-specific pinned list
 */
function buildGoalTaskListComponents(tasks: any[], goalName: string): any[] {
  const components = [];
  const commandName = process.env.DISCORD_COMMAND_PREFIX || 'taysr';

  components.push(
    new TextDisplayBuilder().setContent(`# 🎯 ${goalName}\nOpen tasks for this goal`)
  );

  components.push(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Large));

  if (tasks.length === 0) {
    components.push(
      new TextDisplayBuilder().setContent(`No open tasks for this goal. Use \`/${commandName}\` to create a new task!`)
    );
  } else {
    for (const task of tasks) {
      components.push(createTaskDisplay(task));
      components.push(new SeparatorBuilder().setDivider(false).setSpacing(SeparatorSpacingSize.Small));

      if (components.length >= 36) {
        components.push(new TextDisplayBuilder().setContent('_...and more tasks. Some tasks are hidden due to message limits._'));
        break;
      }
    }
  }

  components.push(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small));
  components.push(
    new TextDisplayBuilder().setContent(
      `_Last updated: <t:${Math.floor(Date.now() / 1000)}:R>_`
    )
  );

  return components;
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
    } catch (error) {
      console.log('Could not edit existing message, will create new one');
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
      console.log(`No task list channel configured for guild ${guildId}`);
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

    console.log(`✅ Updated task list for guild ${guildId}`);
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

    console.log(`✅ Updated goal task list for ${goal.name} (${goalId})`);
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
      console.log(`No task list channel configured for guild ${guildId}`);
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
        console.log('Could not delete old message:', error);
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

    console.log(`✅ Refreshed task list for guild ${guildId}`);
  } catch (error) {
    console.error('Error refreshing pinned task list:', error);
    throw error;
  }
}
