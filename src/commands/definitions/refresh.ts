import {
  ChatInputCommandInteraction,
  ButtonInteraction,
  SlashCommandBuilder,
  MessageFlags,
  TextDisplayBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
} from 'discord.js';
import { Command } from '../registry';
import { refreshPinnedTaskList, refreshAllGoalPinnedLists } from '../../utils/taskList';
import { getClient } from '../../utils/client';

export const refreshCommand: Command = {
  metadata: {
    name: 'refresh',
    emoji: '🔄',
    description: 'Rebuild the task list',
    implemented: true,
    requiresGuild: true,
  },

  build: () => {
    return new SlashCommandBuilder()
      .setName('refresh')
      .setDescription('Completely rebuild the pinned task list from scratch');
  },

  execute: async (interaction: ChatInputCommandInteraction | ButtonInteraction) => {
    // Show loading message
    const loadingComponents = [
      new TextDisplayBuilder().setContent('# 🔄 Refreshing Task List'),
      new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small),
      new TextDisplayBuilder().setContent('Rebuilding the task list from scratch...')
    ];

    await interaction.reply({
      components: loadingComponents,
      flags: [MessageFlags.IsComponentsV2],
      ephemeral: true,
    });

    try {
      const client = getClient();
      await refreshPinnedTaskList(client, interaction.guildId!);
      await refreshAllGoalPinnedLists(client, interaction.guildId!);

      await interaction.editReply({
        components: [
          new TextDisplayBuilder().setContent('# ✅ Task List Refreshed'),
          new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small),
          new TextDisplayBuilder().setContent('The pinned task list has been completely rebuilt from the database.')
        ],
      });
    } catch (error) {
      console.error('Error refreshing task list:', error);
      await interaction.editReply({
        components: [
          new TextDisplayBuilder().setContent('❌ Failed to refresh task list. Check the logs for details.')
        ],
      });
    }
  },
};
