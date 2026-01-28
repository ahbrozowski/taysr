import { ChatInputCommandInteraction, ButtonInteraction, SlashCommandBuilder } from 'discord.js';
import { Command } from '../registry';
import { showCommandPicker } from '../../utils/commandPicker';

export const helpCommand: Command = {
  metadata: {
    name: 'help',
    emoji: '❓',
    description: 'Show help and available commands',
    implemented: true,
    requiresGuild: false,
  },

  build: () => {
    return new SlashCommandBuilder()
      .setName('help')
      .setDescription('Show help and available commands');
  },

  execute: async (interaction: ChatInputCommandInteraction | ButtonInteraction) => {
    await showCommandPicker(interaction);
  },
};
