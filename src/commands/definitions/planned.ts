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
      name: 'take',
      emoji: '✋',
      description: 'Self-assign a task',
      implemented: false,
      requiresGuild: true,
    },
    build: () => new SlashCommandBuilder().setName('take').setDescription('Self-assign a task'),
    execute: notImplementedExecute,
  },
  {
    metadata: {
      name: 'complete',
      emoji: '✅',
      description: 'Mark a task complete',
      implemented: false,
      requiresGuild: true,
    },
    build: () => new SlashCommandBuilder().setName('complete').setDescription('Mark a task complete'),
    execute: notImplementedExecute,
  },
  {
    metadata: {
      name: 'assign',
      emoji: '👥',
      description: 'Assign a task to someone',
      implemented: false,
      requiresGuild: true,
    },
    build: () => new SlashCommandBuilder().setName('assign').setDescription('Assign a task to someone'),
    execute: notImplementedExecute,
  },
  {
    metadata: {
      name: 'unassign',
      emoji: '❌',
      description: 'Remove assignee',
      implemented: false,
      requiresGuild: true,
    },
    build: () => new SlashCommandBuilder().setName('unassign').setDescription('Remove assignee from a task'),
    execute: notImplementedExecute,
  },
  {
    metadata: {
      name: 'edit',
      emoji: '✏️',
      description: 'Edit an existing task',
      implemented: false,
      requiresGuild: true,
    },
    build: () => new SlashCommandBuilder().setName('edit').setDescription('Edit an existing task'),
    execute: notImplementedExecute,
  },
  {
    metadata: {
      name: 'delete',
      emoji: '🗑️',
      description: 'Delete a task',
      implemented: false,
      requiresGuild: true,
    },
    build: () => new SlashCommandBuilder().setName('delete').setDescription('Delete a task'),
    execute: notImplementedExecute,
  },
  {
    metadata: {
      name: 'list',
      emoji: '📋',
      description: 'List all tasks',
      implemented: false,
      requiresGuild: true,
    },
    build: () => new SlashCommandBuilder().setName('list').setDescription('List all tasks in the server'),
    execute: notImplementedExecute,
  },
  {
    metadata: {
      name: 'set-timezone',
      emoji: '🌍',
      description: 'Set server timezone',
      implemented: false,
      requiresGuild: true,
    },
    build: () => new SlashCommandBuilder().setName('set-timezone').setDescription('Set the server timezone'),
    execute: notImplementedExecute,
  },
  {
    metadata: {
      name: 'set-reminders',
      emoji: '⏰',
      description: 'Configure reminders',
      implemented: false,
      requiresGuild: true,
    },
    build: () => new SlashCommandBuilder().setName('set-reminders').setDescription('Configure task reminders'),
    execute: notImplementedExecute,
  },
];
