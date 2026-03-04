import {
  ChatInputCommandInteraction,
  ButtonInteraction,
  SlashCommandBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ChannelSelectMenuBuilder,
  ChannelType,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  MessageFlags,
  TextDisplayBuilder,
  SectionBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  TextChannel,
} from 'discord.js';
import { Command } from '../registry';
import { Goal } from '../../models';
import { updateGoalPinnedList } from '../../utils/taskList';
import { getClient } from '../../utils/client';

export const setGoalChannelCommand: Command = {
  metadata: {
    name: 'set-goal-channel',
    emoji: '🔗',
    description: 'Link a goal to a channel',
    implemented: true,
    requiresGuild: true,
  },

  build: () => {
    return new SlashCommandBuilder()
      .setName('set-goal-channel')
      .setDescription('Link a goal to a channel for a focused task list');
  },

  execute: async (interaction: ChatInputCommandInteraction | ButtonInteraction) => {
    const guildId = interaction.guildId!;
    const goals = await Goal.find({ guildId, status: 'active' }).lean();

    if (goals.length === 0) {
      const components = [
        new TextDisplayBuilder().setContent('❌ No goals exist yet. Create one first with `/goal`.')
      ];
      if (interaction instanceof ButtonInteraction) {
        await interaction.update({ components });
      } else {
        await interaction.reply({
          components,
          flags: [MessageFlags.IsComponentsV2, MessageFlags.Ephemeral],
        });
      }
      return;
    }

    // Step 1: Goal picker
    const goalSelect = new StringSelectMenuBuilder()
      .setCustomId('set-goal-channel-picker')
      .setPlaceholder('Select a goal');

    for (const goal of goals) {
      const label = goal.channelId
        ? `${goal.name} (linked)`
        : goal.name;
      goalSelect.addOptions(
        new StringSelectMenuOptionBuilder()
          .setLabel(label)
          .setValue(goal.goalId)
          .setDescription(goal.goalId)
      );
    }

    const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(goalSelect);

    const components = [
      new TextDisplayBuilder().setContent('# 🔗 Link Goal to Channel'),
      new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small),
      new TextDisplayBuilder().setContent('Select a goal to link or unlink from a channel:'),
      row,
    ];

    if (interaction instanceof ButtonInteraction) {
      await interaction.update({ components });
    } else {
      await interaction.reply({
        components,
        flags: [MessageFlags.IsComponentsV2, MessageFlags.Ephemeral],
      });
    }

    // Wait for goal selection
    try {
      const goalInteraction = await interaction.channel?.awaitMessageComponent({
        filter: (i) =>
          i.user.id === interaction.user.id &&
          i.customId === 'set-goal-channel-picker',
        componentType: ComponentType.StringSelect,
        time: 60000,
      });

      if (!goalInteraction) return;

      const selectedGoalId = goalInteraction.values[0];
      const goal = await Goal.findOne({ goalId: selectedGoalId });
      if (!goal) return;

      await showChannelOptions(goalInteraction, goal);
    } catch (error) {
      // Timeout
    }
  },
};

async function showChannelOptions(interaction: any, goal: any) {
  const channelSelect = new ChannelSelectMenuBuilder()
    .setCustomId(`goal-ch-select:${goal.goalId}`)
    .setPlaceholder('Select a channel')
    .addChannelTypes(ChannelType.GuildText);

  const row = new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(channelSelect);

  const currentLink = goal.channelId
    ? `Currently linked to <#${goal.channelId}>.`
    : 'Not currently linked to any channel.';

  const components: any[] = [
    new TextDisplayBuilder().setContent(`# 🔗 ${goal.name}`),
    new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small),
    new TextDisplayBuilder().setContent(`${currentLink}\n\nSelect a new channel or unlink:`),
    row,
  ];

  // Add unlink button if currently linked
  if (goal.channelId) {
    components.push(
      new SectionBuilder()
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent('Remove channel link')
        )
        .setButtonAccessory(
          new ButtonBuilder()
            .setCustomId(`goal-unlink:${goal.goalId}`)
            .setLabel('Unlink')
            .setStyle(ButtonStyle.Danger)
        )
    );
  }

  await interaction.update({ components });

  // Wait for channel select or unlink button
  try {
    const response = await interaction.channel?.awaitMessageComponent({
      filter: (i: any) =>
        i.user.id === interaction.user.id &&
        (i.customId === `goal-ch-select:${goal.goalId}` || i.customId === `goal-unlink:${goal.goalId}`),
      time: 60000,
    });

    if (!response) return;

    if (response.customId === `goal-unlink:${goal.goalId}`) {
      // Delete old pinned message if it exists
      await deleteGoalPinnedMessage(goal);

      goal.channelId = undefined;
      goal.messageId = undefined;
      await goal.save();

      await response.update({
        components: [
          new TextDisplayBuilder().setContent(`# ✅ Goal Unlinked`),
          new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small),
          new TextDisplayBuilder().setContent(`**${goal.name}** is no longer linked to a channel.`),
        ],
      });
    } else {
      const channelId = response.values[0];

      // Delete old pinned message if changing channels
      if (goal.channelId && goal.channelId !== channelId) {
        await deleteGoalPinnedMessage(goal);
      }

      goal.channelId = channelId;
      goal.messageId = undefined;
      await goal.save();

      // Create pinned list in the new channel
      const client = getClient();
      await updateGoalPinnedList(client, goal.goalId);

      await response.update({
        components: [
          new TextDisplayBuilder().setContent(`# ✅ Goal Linked`),
          new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small),
          new TextDisplayBuilder().setContent(
            `**${goal.name}** is now linked to <#${channelId}>.\n` +
            `A pinned task list will be maintained there.`
          ),
        ],
      });
    }
  } catch (error) {
    // Timeout
  }
}

async function deleteGoalPinnedMessage(goal: any) {
  if (!goal.channelId || !goal.messageId) return;

  try {
    const client = getClient();
    const channel = await client.channels.fetch(goal.channelId);
    if (channel && channel.isTextBased() && channel instanceof TextChannel) {
      const message = await channel.messages.fetch(goal.messageId);
      await message.delete();
    }
  } catch (error) {
    console.log('Could not delete old goal pinned message:', error);
  }
}
