import {
  ChatInputCommandInteraction,
  ButtonInteraction,
  SlashCommandBuilder,
  TextDisplayBuilder,
} from 'discord.js';
import { Command } from '../registry';
import { createTaskSelector } from '../../utils/taskSelector';
import { updatePinnedTaskList, updateGoalPinnedList } from '../../utils/taskList';

export const unassignCommand: Command = {
  metadata: {
    name: 'unassign',
    emoji: '❌',
    description: 'Remove assignee from a task',
    implemented: true,
    requiresGuild: true,
  },

  build: () => {
    return new SlashCommandBuilder()
      .setName('unassign')
      .setDescription('Remove assignee from a task');
  },

  execute: async (interaction: ChatInputCommandInteraction | ButtonInteraction) => {
    await createTaskSelector(interaction, {
      actionLabel: 'Unassign',
      guildId: interaction.guildId || undefined,
      taskFilter: { assigneeId: { $ne: null } },
      onSelect: async (task, i) => {
        const previousAssignee = task.assigneeId;
        task.assigneeId = null;
        await task.save();

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
              `✅ Task **${task.taskId}** unassigned (was <@${previousAssignee}>).`
            ),
          ],
        });
      },
    });
  },
};
