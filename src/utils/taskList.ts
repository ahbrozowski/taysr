import { Client, TextChannel, MessageFlags, TextDisplayBuilder, SeparatorBuilder, SeparatorSpacingSize } from 'discord.js';
import { ServerConfig, Task } from '../models';

/**
 * Creates a compact TextDisplay component for a task
 */
function createTaskDisplay(task: any): TextDisplayBuilder {
  const assignee = task.assigneeId ? `<@${task.assigneeId}>` : 'Unassigned';
  const dueDate = new Date(task.dueAt);
  const timestamp = Math.floor(dueDate.getTime() / 1000);

  // Compact format: taskId • title • assignee • due date (no notes in list view)
  const content = `**${task.taskId}** • ${task.title}\n${assignee} • <t:${timestamp}:R>`;

  return new TextDisplayBuilder().setContent(content);
}

/**
 * Builds the components array for the task list
 */
function buildTaskListComponents(tasks: any[]): any[] {
  const components = [];

  // Get command name from environment or use default
  const commandName = process.env.DISCORD_COMMAND_PREFIX || 'taysr';

  // Header
  components.push(
    new TextDisplayBuilder().setContent('# 📋 Taysr Tasks\nOpen tasks for the team')
  );

  components.push(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Large));

  if (tasks.length === 0) {
    components.push(
      new TextDisplayBuilder().setContent(`No open tasks. Use \`/${commandName} create\` to create a new task!`)
    );
  } else {
    // Add each task as a text display with separator
    for (const task of tasks) {
      components.push(createTaskDisplay(task));
      components.push(new SeparatorBuilder().setDivider(false).setSpacing(SeparatorSpacingSize.Small));

      // Respect Discord's 40 component limit
      if (components.length >= 38) {
        components.push(new TextDisplayBuilder().setContent('_...and more tasks. Some tasks are hidden due to message limits._'));
        break;
      }
    }
  }

  // Footer
  components.push(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small));
  components.push(
    new TextDisplayBuilder().setContent(`_Last updated: <t:${Math.floor(Date.now() / 1000)}:R> • Use \`/${commandName} help\` for more information_`)
  );

  return components;
}

/**
 * Updates or creates the pinned task list message
 */
export async function updatePinnedTaskList(client: Client, guildId: string): Promise<void> {
  try {
    // Get server config
    const config = await ServerConfig.findOne({ guildId });

    if (!config || !config.taskListChannelId) {
      console.log(`No task list channel configured for guild ${guildId}`);
      return;
    }

    // Get the channel
    const channel = await client.channels.fetch(config.taskListChannelId);
    if (!channel || !channel.isTextBased() || !(channel instanceof TextChannel)) {
      console.error(`Channel ${config.taskListChannelId} is not a text channel`);
      return;
    }

    // Get all open tasks for this guild
    const tasks = await Task.find({
      guildId,
      status: 'open'
    })
      .sort({ dueAt: 1 }) // Sort by due date ascending
      .lean();

    // Build the components
    const components = buildTaskListComponents(tasks);

    let message = null;

    // Try to fetch and edit existing message
    if (config.taskListMessageId) {
      try {
        message = await channel.messages.fetch(config.taskListMessageId);
        await message.edit({ components: components });
        console.log('✅ Updated existing task list');
      } catch (error) {
        console.log('Could not edit existing message, will create new one');
        message = null;
      }
    }

    // Create new message if editing failed or no message existed
    if (!message) {
      message = await channel.send({
        components: components,
        flags: [MessageFlags.IsComponentsV2],
        allowedMentions: { parse: [] } // Don't ping anyone
      });

      // Pin the new message
      try {
        await message.pin();
        console.log('✅ Created and pinned new task list');
      } catch (error) {
        console.error('Failed to pin message:', error);
      }

      // Save the new message ID
      config.taskListMessageId = message.id;
      await config.save();
    }

    console.log(`✅ Updated task list for guild ${guildId}`);
  } catch (error) {
    console.error('Error updating pinned task list:', error);
    throw error;
  }
}

/**
 * Completely rebuilds the pinned task list from scratch.
 * Deletes the old message and creates a new one.
 * Use this when the old message is corrupted or in the wrong format.
 */
export async function refreshPinnedTaskList(client: Client, guildId: string): Promise<void> {
  try {
    // Get server config
    const config = await ServerConfig.findOne({ guildId });

    if (!config || !config.taskListChannelId) {
      console.log(`No task list channel configured for guild ${guildId}`);
      return;
    }

    // Get the channel
    const channel = await client.channels.fetch(config.taskListChannelId);
    if (!channel || !channel.isTextBased() || !(channel instanceof TextChannel)) {
      console.error(`Channel ${config.taskListChannelId} is not a text channel`);
      return;
    }

    // Delete old message if it exists
    if (config.taskListMessageId) {
      try {
        const oldMessage = await channel.messages.fetch(config.taskListMessageId);
        await oldMessage.delete();
        console.log('🗑️ Deleted old task list message');
      } catch (error) {
        console.log('Could not delete old message:', error);
      }
    }

    // Get all open tasks
    const tasks = await Task.find({
      guildId,
      status: 'open'
    })
      .sort({ dueAt: 1 })
      .lean();

    // Build the components
    const components = buildTaskListComponents(tasks);

    // Create new message
    const message = await channel.send({
      components: components,
      flags: [MessageFlags.IsComponentsV2],
      allowedMentions: { parse: [] } // Don't ping anyone
    });

    // Pin the new message
    try {
      await message.pin();
      console.log('📌 Created and pinned new task list');
    } catch (error) {
      console.error('Failed to pin message:', error);
    }

    // Save the new message ID
    config.taskListMessageId = message.id;
    await config.save();

    console.log(`✅ Refreshed task list for guild ${guildId}`);
  } catch (error) {
    console.error('Error refreshing pinned task list:', error);
    throw error;
  }
}
