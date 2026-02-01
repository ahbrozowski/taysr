import {
  ChatInputCommandInteraction,
  ButtonInteraction,
  SlashCommandBuilder,
  ChannelType,
  MessageFlags,
  TextDisplayBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  TextChannel,
} from 'discord.js';
import { Command } from '../registry';
import { showCommandPicker } from '../../utils/commandPicker';
import { createTaskListPage } from '../../utils/taskSelector';


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
    await createTaskListPage(interaction);
  },
};
