import {
  ChatInputCommandInteraction,
  ButtonInteraction,
  SlashCommandBuilder,
  TextDisplayBuilder,
} from 'discord.js';
import { Command } from '../registry';
import { createTaskSelector } from '../../utils/taskSelector';
import { updatePinnedTaskList, updateGoalPinnedList } from '../../utils/taskList';
import { cancelRemindersForTask } from '../../utils/reminders';
import { Task } from '../../models';

export const deleteCommand: Command = {
  metadata: {
    name: 'delete',
    emoji: '🗑️',
    description: 'Delete a task',
    implemented: true,
    requiresGuild: true,
  },

  build: () => {
    return new SlashCommandBuilder()
      .setName('delete')
      .setDescription('Delete a task');
  },

  execute: async (interaction: ChatInputCommandInteraction | ButtonInteraction) => {
    await createTaskSelector(interaction, {
      actionLabel: 'Delete',
      guildId: interaction.guildId || undefined,
      onSelect: async (task, i) => {
        const taskId = task.taskId;
        const goalId = task.goalId;
        const taskMongoId = task._id.toString();

        await Task.deleteOne({ _id: task._id });

        cancelRemindersForTask(taskMongoId).catch((err: any) => {
          console.error('Failed to cancel reminders:', err);
        });

        updatePinnedTaskList(i.client, i.guildId).catch((err: any) => {
          console.error('Failed to update pinned task list:', err);
        });
        if (goalId) {
          updateGoalPinnedList(i.client, goalId).catch((err: any) => {
            console.error('Failed to update goal pinned list:', err);
          });
        }

        await i.update({
          components: [
            new TextDisplayBuilder().setContent(
              `🗑️ Task **${taskId}** deleted.`
            ),
          ],
        });
      },
    });
  },
};
