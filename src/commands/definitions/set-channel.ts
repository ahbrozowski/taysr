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
import { ServerConfig } from '../../models';
import { refreshPinnedTaskList } from '../../utils/taskList';
import { getClient } from '../../utils/client';

export const setChannelCommand: Command = {
  metadata: {
    name: 'set-channel',
    emoji: '📌',
    description: 'Set the task list channel',
    implemented: true,
    requiresGuild: true,
  },

  build: () => {
    return new SlashCommandBuilder()
      .setName('set-channel')
      .setDescription('Set the channel for the task list')
      .addChannelOption((option) =>
        option
          .setName('channel')
          .setDescription('Channel for task list (defaults to current channel)')
          .addChannelTypes(ChannelType.GuildText)
          .setRequired(false)
      );
  },

  execute: async (interaction: ChatInputCommandInteraction | ButtonInteraction) => {
    // Determine the target channel
    let targetChannel: { id: string } | null = null;

    if (interaction instanceof ChatInputCommandInteraction) {
      // From slash command: use the option or default to current channel
      const channelOption = interaction.options.getChannel('channel');
      targetChannel = channelOption || interaction.channel;
    } else {
      // From button interaction (picker): use current channel
      targetChannel = interaction.channel;
    }

    if (!targetChannel) {
      const errorComponents = [
        new TextDisplayBuilder().setContent('❌ Could not determine the target channel.')
      ];

      if (interaction instanceof ButtonInteraction) {
        await interaction.update({ components: errorComponents });
      } else {
        await interaction.reply({
          components: errorComponents,
          flags: [MessageFlags.IsComponentsV2, MessageFlags.Ephemeral],
        });
      }
      return;
    }

    try {
      // Find or create server config
      let config = await ServerConfig.findOne({ guildId: interaction.guildId! });

      // Remove old pinned messages if config exists
      if (config && config.taskListChannelId && config.taskListMessageId) {
        try {
          const client = getClient();
          const oldChannel = await client.channels.fetch(config.taskListChannelId);
          if (oldChannel && oldChannel.isTextBased() && oldChannel instanceof TextChannel) {
            const oldMessage = await oldChannel.messages.fetch(config.taskListMessageId);
            await oldMessage.delete();
            console.log('🗑️ Deleted old task list message from previous channel');
          }
        } catch (error) {
          console.log('Could not delete old pinned message:', error);
          // Continue anyway - we still want to set the new channel
        }
      }

      if (!config) {
        config = new ServerConfig({
          guildId: interaction.guildId!,
          taskListChannelId: targetChannel.id,
        });
      } else {
        config.taskListChannelId = targetChannel.id;
        // Clear the old message ID since we're changing channels
        config.taskListMessageId = undefined;
      }

      await config.save();

      // Show loading message while refreshing
      const loadingComponents = [
        new TextDisplayBuilder().setContent('# ✅ Channel Set'),
        new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small),
        new TextDisplayBuilder().setContent(`Task list channel set to <#${targetChannel.id}>\n\n🔄 Refreshing task list...`)
      ];

      if (interaction instanceof ButtonInteraction) {
        await interaction.update({ components: loadingComponents });
      } else {
        await interaction.reply({
          components: loadingComponents,
          flags: [MessageFlags.IsComponentsV2, MessageFlags.Ephemeral],
        });
      }

      // Refresh the task list in the new channel
      const client = getClient();
      await refreshPinnedTaskList(client, interaction.guildId!);

      // Update with success message
      const successComponents = [
        new TextDisplayBuilder().setContent('# ✅ Channel Set'),
        new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small),
        new TextDisplayBuilder().setContent(`Task list channel set to <#${targetChannel.id}>\n\n✅ Task list has been refreshed in the new channel.`)
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
      console.error('Error setting channel:', error);
      const errorComponents = [
        new TextDisplayBuilder().setContent('❌ Failed to set channel. Please try again.')
      ];

      if (interaction instanceof ButtonInteraction) {
        await interaction.update({ components: errorComponents });
      } else {
        await interaction.reply({
          components: errorComponents,
          flags: [MessageFlags.IsComponentsV2, MessageFlags.Ephemeral],
        });
      }
    }
  },
};
