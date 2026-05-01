import { SlashCommandBuilder } from 'discord.js';
import { Command } from '../registry';

/**
 * Placeholder execute function for planned commands
 * This should never be called since planned commands aren't registered as slash commands
 */
const notImplementedExecute = async () => {
  throw new Error('This command is not yet implemented');
};

/**
 * Planned commands that are not yet implemented
 */
export const plannedCommands: Command[] = [
  {
    metadata: {
      name: 'bug-report',
      emoji: '🐛',
      description: 'Report a bug',
      implemented: false,
      requiresGuild: true,
    },
    build: () => new SlashCommandBuilder().setName('bug-report').setDescription('Report a bug'),
    execute: notImplementedExecute,
  },
  {
    metadata: {
      name: 'bugs',
      emoji: '🪲',
      description: 'View bug reports',
      implemented: false,
      requiresGuild: true,
    },
    build: () => new SlashCommandBuilder().setName('bugs').setDescription('View and manage bug reports'),
    execute: notImplementedExecute,
  },
];
