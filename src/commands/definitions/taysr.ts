import { ChatInputCommandInteraction, ButtonInteraction, SlashCommandBuilder } from 'discord.js';
import { Command } from '../registry';
import { showCommandPicker } from '../../utils/commandPicker';

/**
 * Creates the branded taysr command with a configurable name.
 * In production, uses 'taysr'. In development, can be customized via DEV_COMMAND_PREFIX env var.
 */
export function createTaysrCommand(commandName: string): Command {
  return {
    metadata: {
      name: commandName,
      emoji: '📋',
      description: 'Show help and available commands',
      implemented: true,
      requiresGuild: false,
    },

    build: () => {
      return new SlashCommandBuilder()
        .setName(commandName)
        .setDescription('Show help and available commands');
    },

    execute: async (interaction: ChatInputCommandInteraction | ButtonInteraction) => {
      await showCommandPicker(interaction);
    },
  };
}
