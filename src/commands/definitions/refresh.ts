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
import { refreshPinnedTaskList } from '../../utils/taskList';
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

    if (interaction instanceof ButtonInteraction) {
      await interaction.update({ components: loadingComponents });
    } else {
      await interaction.reply({
        components: loadingComponents,
        flags: [MessageFlags.IsComponentsV2, MessageFlags.Ephemeral],
      });
    }

    try {
      const client = getClient();
      await refreshPinnedTaskList(client, interaction.guildId!);

      const successComponents = [
        new TextDisplayBuilder().setContent('# ✅ Task List Refreshed'),
        new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small),
        new TextDisplayBuilder().setContent('The pinned task list has been completely rebuilt from the database.')
      ];

      if (interaction instanceof ButtonInteraction) {
        await interaction.editReply({ components: successComponents });
      } else {
        await interaction.editReply({
          components: successComponents,
          flags: [MessageFlags.IsComponentsV2]
        });
      }
    } catch (error) {
      console.error('Error refreshing task list:', error);
      const errorComponents = [
        new TextDisplayBuilder().setContent('❌ Failed to refresh task list. Check the logs for details.')
      ];

      if (interaction instanceof ButtonInteraction) {
        await interaction.editReply({ components: errorComponents });
      } else {
        await interaction.editReply({
          components: errorComponents,
          flags: [MessageFlags.IsComponentsV2]
        });
      }
    }
  },
};
