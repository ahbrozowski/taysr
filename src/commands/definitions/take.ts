import {
  ChatInputCommandInteraction,
  ButtonInteraction,
  SlashCommandBuilder,
  TextDisplayBuilder,
} from 'discord.js';
import { Command } from '../registry';
import { createTaskSelector } from '../../utils/taskSelector';
import { updatePinnedTaskList, updateGoalPinnedList } from '../../utils/taskList';
import { scheduleRemindersForTask } from '../../utils/reminders';

export const takeCommand: Command = {
  metadata: {
    name: 'take',
    emoji: '✋',
    description: 'Self-assign a task',
    implemented: true,
    requiresGuild: true,
  },

  build: () => {
    return new SlashCommandBuilder()
      .setName('take')
      .setDescription('Self-assign a task');
  },

  execute: async (interaction: ChatInputCommandInteraction | ButtonInteraction) => {
    await createTaskSelector(interaction, {
      actionLabel: 'Take',
      guildId: interaction.guildId || undefined,
      taskFilter: { assigneeId: { $in: [null, undefined] } },
      onSelect: async (task, i) => {
        task.assigneeId = i.user.id;
        await task.save();

        scheduleRemindersForTask(task).catch((err: any) => {
          console.error('Failed to schedule reminders:', err);
        });

        updatePinnedTaskList(i.client, i.guildId).catch((err: any) => {
          console.error('Failed to update pinned task list:', err);
        });
        if (task.goalId) {
          updateGoalPinnedList(i.client, task.goalId).catch((err: any) => {
            console.error('Failed to update goal pinned list:', err);
          });
        }

        await i.update({
          components: [
            new TextDisplayBuilder().setContent(
              `✅ Task **${task.taskId}** assigned to you.`
            ),
          ],
        });
      },
    });
  },
};
