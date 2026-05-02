import {
  ChatInputCommandInteraction,
  ButtonInteraction,
  SlashCommandBuilder,
} from 'discord.js';
import { Command } from '../registry';
import { createTaskListPage } from '../../utils/taskSelector';
import { isRestrictedToOwnTasks } from '../../utils/permissions';


export const completeCommand: Command = {
  metadata: {
    name: 'complete',
    emoji: '✅',
    description: 'Complete a task',
    implemented: true,
    requiresGuild: false,
  },

  build: () => {
    return new SlashCommandBuilder()
      .setName('complete')
      .setDescription('Complete a task')
  },

  execute: async (interaction: ChatInputCommandInteraction | ButtonInteraction) => {
    const taskFilter = (await isRestrictedToOwnTasks(interaction, 'complete'))
      ? { assigneeId: interaction.user.id }
      : undefined;
    await createTaskListPage(interaction, taskFilter);
  },
};
