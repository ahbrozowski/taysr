import {
  ChatInputCommandInteraction,
  ButtonInteraction,
  SlashCommandBuilder,
  ActionRowBuilder,
  UserSelectMenuBuilder,
  MessageFlags,
  TextDisplayBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
} from 'discord.js';
import { Command } from '../registry';
import { createTaskSelector } from '../../utils/taskSelector';
import { updatePinnedTaskList, updateGoalPinnedList } from '../../utils/taskList';
import { scheduleRemindersForTask } from '../../utils/reminders';

export const assignCommand: Command = {
  metadata: {
    name: 'assign',
    emoji: '👥',
    description: 'Assign a task to someone',
    implemented: true,
    requiresGuild: true,
  },

  build: () => {
    return new SlashCommandBuilder()
      .setName('assign')
      .setDescription('Assign a task to someone');
  },

  execute: async (interaction: ChatInputCommandInteraction | ButtonInteraction) => {
    await createTaskSelector(interaction, {
      actionLabel: 'Assign',
      guildId: interaction.guildId || undefined,
      onSelect: async (task, i) => {
        // Show user select for assignee
        const userSelect = new UserSelectMenuBuilder()
          .setCustomId(`assign-user:${task._id}`)
          .setPlaceholder('Select a user to assign')
          .setMinValues(1)
          .setMaxValues(1);

        const row = new ActionRowBuilder<UserSelectMenuBuilder>().addComponents(userSelect);

        await i.update({
          components: [
            new TextDisplayBuilder().setContent(`# 👥 Assign: ${task.title}`),
            new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small),
            new TextDisplayBuilder().setContent('Select a user to assign this task to:'),
            row,
          ],
          flags: [MessageFlags.IsComponentsV2],
        });

        const message = await i.fetchReply();
        const collector = message.createMessageComponentCollector({
          filter: (si: any) => si.user.id === i.user.id && si.customId === `assign-user:${task._id}`,
          time: 60000,
          max: 1,
        });

        collector.on('collect', async (selectInteraction: any) => {
          const assigneeId = selectInteraction.values[0];
          task.assigneeId = assigneeId;
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

          await selectInteraction.update({
            components: [
              new TextDisplayBuilder().setContent(
                `✅ Task **${task.taskId}** assigned to <@${assigneeId}>.`
              ),
            ],
          });
        });
      },
    });
  },
};
