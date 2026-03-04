import {
  ChatInputCommandInteraction,
  ButtonInteraction,
  SlashCommandBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
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
  ModalSubmitInteraction,
} from 'discord.js';
import { Command } from '../registry';
import { Goal } from '../../models';
import { generateGoalId } from '../../utils/taskId';
import { updateGoalPinnedList } from '../../utils/taskList';
import { getClient } from '../../utils/client';

export const goalCommand: Command = {
  metadata: {
    name: 'goal',
    emoji: '🎯',
    description: 'Create a new goal',
    implemented: true,
    requiresGuild: true,
  },

  build: () => {
    return new SlashCommandBuilder()
      .setName('goal')
      .setDescription('Create a new goal');
  },

  execute: async (interaction: ChatInputCommandInteraction | ButtonInteraction) => {
    const modal = new ModalBuilder()
      .setCustomId('create-goal-modal')
      .setTitle('Create New Goal');

    const nameInput = new TextInputBuilder()
      .setCustomId('goal-name')
      .setLabel('Goal Name')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('e.g., Prepare marketing for this tournament')
      .setRequired(true)
      .setMaxLength(100);

    const descriptionInput = new TextInputBuilder()
      .setCustomId('goal-description')
      .setLabel('Description (optional)')
      .setStyle(TextInputStyle.Paragraph)
      .setPlaceholder('What is this goal about?')
      .setRequired(false)
      .setMaxLength(500);

    modal.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(nameInput),
      new ActionRowBuilder<TextInputBuilder>().addComponents(descriptionInput)
    );

    await interaction.showModal(modal);

    try {
      const modalSubmit = await interaction.awaitModalSubmit({
        filter: (i: ModalSubmitInteraction) =>
          i.customId === 'create-goal-modal' && i.user.id === interaction.user.id,
        time: 300000,
      });

      await handleGoalModalSubmit(modalSubmit, interaction.guildId!);
    } catch (error) {
      console.log('Goal modal submission timed out or was cancelled');
    }
  },
};

async function handleGoalModalSubmit(interaction: ModalSubmitInteraction, guildId: string) {
  const name = interaction.fields.getTextInputValue('goal-name');
  const description = interaction.fields.getTextInputValue('goal-description') || undefined;

  // Check for duplicate goal name
  const existing = await Goal.findOne({ guildId, name }).collation({ locale: 'en', strength: 2 });
  if (existing) {
    await interaction.reply({
      components: [
        new TextDisplayBuilder().setContent(`❌ A goal named **${name}** already exists.`)
      ],
      flags: [MessageFlags.IsComponentsV2, MessageFlags.Ephemeral],
    });
    return;
  }

  const goalId = await generateGoalId(guildId);

  // Ask if they want to link a channel
  const components = [
    new TextDisplayBuilder().setContent(`# 🎯 Goal: ${name}`),
    new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small),
    new TextDisplayBuilder().setContent(
      'Would you like to link this goal to a channel?\n' +
      'A linked channel will display a pinned task list showing only tasks for this goal.'
    ),
    new SectionBuilder()
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent('Link to a channel')
      )
      .setButtonAccessory(
        new ButtonBuilder()
          .setCustomId(`goal-link-channel:${goalId}`)
          .setLabel('Link Channel')
          .setStyle(ButtonStyle.Primary)
      ),
    new SectionBuilder()
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent('Skip for now')
      )
      .setButtonAccessory(
        new ButtonBuilder()
          .setCustomId(`goal-skip-channel:${goalId}`)
          .setLabel('Skip')
          .setStyle(ButtonStyle.Secondary)
      ),
  ];

  await interaction.reply({
    components,
    flags: [MessageFlags.IsComponentsV2, MessageFlags.Ephemeral],
  });

  try {
    const buttonInteraction = await interaction.channel?.awaitMessageComponent({
      filter: (i) =>
        i.user.id === interaction.user.id &&
        (i.customId === `goal-link-channel:${goalId}` || i.customId === `goal-skip-channel:${goalId}`),
      componentType: ComponentType.Button,
      time: 60000,
    }) as ButtonInteraction;

    if (buttonInteraction.customId.startsWith('goal-link-channel:')) {
      await handleLinkChannel(buttonInteraction, { goalId, guildId, name, description });
    } else {
      await createGoal({ goalId, guildId, name, description });
      await buttonInteraction.update({
        components: [
          new TextDisplayBuilder().setContent(`# ✅ Goal Created`),
          new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small),
          new TextDisplayBuilder().setContent(`Goal **${goalId}** — **${name}** has been created.`),
        ],
      });
    }
  } catch (error) {
    // Timeout — create without channel link
    await createGoal({ goalId, guildId, name, description });
    await interaction.editReply({
      components: [
        new TextDisplayBuilder().setContent(`✅ Goal **${goalId}** — **${name}** created (no channel linked due to timeout).`)
      ],
    });
  }
}

async function handleLinkChannel(
  interaction: ButtonInteraction,
  goalData: { goalId: string; guildId: string; name: string; description?: string }
) {
  const channelSelect = new ChannelSelectMenuBuilder()
    .setCustomId(`goal-channel-select:${goalData.goalId}`)
    .setPlaceholder('Select a channel for this goal')
    .addChannelTypes(ChannelType.GuildText);

  const row = new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(channelSelect);

  await interaction.update({
    components: [
      new TextDisplayBuilder().setContent(`# 🎯 Link Channel for: ${goalData.name}`),
      new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small),
      new TextDisplayBuilder().setContent('Select a channel to display this goal\'s task list:'),
      row,
    ],
  });

  try {
    const selectInteraction = await interaction.channel?.awaitMessageComponent({
      filter: (i) =>
        i.user.id === interaction.user.id &&
        i.customId === `goal-channel-select:${goalData.goalId}`,
      componentType: ComponentType.ChannelSelect,
      time: 60000,
    });

    if (!selectInteraction) return;

    const channelId = selectInteraction.values[0];
    await createGoal({ ...goalData, channelId });

    // Create the goal-specific pinned list in the linked channel
    const client = getClient();
    await updateGoalPinnedList(client, goalData.goalId);

    await selectInteraction.update({
      components: [
        new TextDisplayBuilder().setContent(`# ✅ Goal Created`),
        new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small),
        new TextDisplayBuilder().setContent(
          `Goal **${goalData.goalId}** — **${goalData.name}** has been created.\n` +
          `Linked to <#${channelId}> — a pinned task list will be maintained there.`
        ),
      ],
    });
  } catch (error) {
    // Timeout — create without channel
    await createGoal(goalData);
    await interaction.editReply({
      components: [
        new TextDisplayBuilder().setContent(`✅ Goal **${goalData.goalId}** — **${goalData.name}** created (no channel linked due to timeout).`)
      ],
    });
  }
}

async function createGoal(data: {
  goalId: string;
  guildId: string;
  name: string;
  description?: string;
  channelId?: string;
}) {
  await Goal.create({
    goalId: data.goalId,
    guildId: data.guildId,
    name: data.name,
    description: data.description,
    channelId: data.channelId || undefined,
    messageId: undefined,
    status: 'active',
  });
}
