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
  MessageFlags,
  TextDisplayBuilder,
  SectionBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  TextChannel,
} from 'discord.js';
import { Command } from '../registry';
import { Goal, ServerConfig } from '../../models';
import { refreshPinnedTaskList, updateGoalPinnedList } from '../../utils/taskList';
import { getClient } from '../../utils/client';

export const setChannelCommand: Command = {
  metadata: {
    name: 'set-channel',
    emoji: '📌',
    description: 'Set a channel for the task list or a goal',
    implemented: true,
    requiresGuild: true,
  },

  build: () => {
    return new SlashCommandBuilder()
      .setName('set-channel')
      .setDescription('Set a channel for the task list or link a goal')
      .addChannelOption((option) =>
        option
          .setName('channel')
          .setDescription('Target channel (defaults to current)')
          .addChannelTypes(ChannelType.GuildText)
          .setRequired(false)
      )
      .addStringOption((option) =>
        option
          .setName('goal')
          .setDescription('Goal name or ID to link (omit for server task list)')
          .setRequired(false)
      );
  },

  execute: async (interaction: ChatInputCommandInteraction | ButtonInteraction) => {
    if (interaction instanceof ButtonInteraction) {
      await showScopeChooser(interaction);
      return;
    }

    const channelOption = interaction.options.getChannel('channel');
    const goalOption = interaction.options.getString('goal');

    // No args → interactive UI
    if (!channelOption && !goalOption) {
      await showScopeChooser(interaction);
      return;
    }

    const targetChannel = channelOption || interaction.channel;
    if (!targetChannel) {
      await interaction.reply({
        components: [
          new TextDisplayBuilder().setContent('❌ Could not determine the target channel.')
        ],
        flags: [MessageFlags.IsComponentsV2],
        ephemeral: true,
      });
      return;
    }

    if (goalOption) {
      // Channel + goal → directly link goal to channel
      await directLinkGoal(interaction, targetChannel.id, goalOption);
    } else {
      // Channel only → set server task list
      await handleServerScope(interaction);
    }
  },
};

// ── Direct Goal Link (slash command shortcut) ─────────────────────────

async function directLinkGoal(
  interaction: ChatInputCommandInteraction,
  channelId: string,
  goalQuery: string
) {
  const guildId = interaction.guildId!;

  // Look up goal by ID or name (case-insensitive)
  const goal = await Goal.findOne({
    guildId,
    status: 'active',
    $or: [
      { goalId: goalQuery },
      { name: goalQuery },
    ],
  }).collation({ locale: 'en', strength: 2 });

  if (!goal) {
    await interaction.reply({
      components: [
        new TextDisplayBuilder().setContent(`❌ No active goal found matching **${goalQuery}**.`)
      ],
      flags: [MessageFlags.IsComponentsV2],
      ephemeral: true,
    });
    return;
  }

  // Delete old pinned message if changing channels
  if (goal.channelId && goal.channelId !== channelId) {
    await deleteGoalPinnedMessage(goal);
  }

  goal.channelId = channelId;
  goal.messageId = undefined;
  await goal.save();

  const client = getClient();
  await updateGoalPinnedList(client, goal.goalId);

  await interaction.reply({
    components: [
      new TextDisplayBuilder().setContent(`# ✅ Goal Linked`),
      new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small),
      new TextDisplayBuilder().setContent(
        `**${goal.name}** is now linked to <#${channelId}>.\n` +
        `A pinned task list will be maintained there.`
      ),
    ],
    flags: [MessageFlags.IsComponentsV2],
    ephemeral: true,
  });
}

// ── Scope Chooser (interactive UI) ───────────────────────────────────

async function showScopeChooser(interaction: ChatInputCommandInteraction | ButtonInteraction) {
  const components = [
    new TextDisplayBuilder().setContent('# 📌 Set Channel'),
    new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small),
    new TextDisplayBuilder().setContent('What would you like to configure?'),
    new SectionBuilder()
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent('Set the server-wide task list channel')
      )
      .setButtonAccessory(
        new ButtonBuilder()
          .setCustomId('set-channel-scope:server')
          .setLabel('Server Task List')
          .setStyle(ButtonStyle.Primary)
      ),
    new SectionBuilder()
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent('Link or unlink a goal to a channel')
      )
      .setButtonAccessory(
        new ButtonBuilder()
          .setCustomId('set-channel-scope:goal')
          .setLabel('Goal Channel')
          .setStyle(ButtonStyle.Primary)
      ),
  ];

  const message = await interaction.reply({
    components,
    fetchReply: true,
    flags: [MessageFlags.IsComponentsV2],
    ephemeral: true,
  });

  const collector = message.createMessageComponentCollector({
    filter: (i: any) => i.user.id === interaction.user.id && i.customId.startsWith('set-channel-scope:'),
    max: 1,
    time: 60000,
  });

  collector.on('collect', async (i: any) => {
    if (i.customId === 'set-channel-scope:server') {
      await handleServerScope(i);
    } else {
      await handleGoalScope(i);
    }
  });
}

// ── Server Scope ──────────────────────────────────────────────────────

async function handleServerScope(interaction: ChatInputCommandInteraction | ButtonInteraction) {
  let targetChannel: { id: string } | null = null;

  if (interaction instanceof ChatInputCommandInteraction) {
    const channelOption = interaction.options.getChannel('channel');
    targetChannel = channelOption || interaction.channel;
  } else {
    targetChannel = interaction.channel;
  }

  if (!targetChannel) {
    await respond(interaction, [new TextDisplayBuilder().setContent('❌ Could not determine the target channel.')]);
    return;
  }

  try {
    let config = await ServerConfig.findOne({ guildId: interaction.guildId! });

    // Remove old pinned message if config exists
    if (config && config.taskListChannelId && config.taskListMessageId) {
      try {
        const client = getClient();
        const oldChannel = await client.channels.fetch(config.taskListChannelId);
        if (oldChannel && oldChannel.isTextBased() && oldChannel instanceof TextChannel) {
          const oldMessage = await oldChannel.messages.fetch(config.taskListMessageId);
          await oldMessage.delete();
        }
      } catch (error) {
        console.error('Could not delete old pinned message:', error);
      }
    }

    if (!config) {
      config = new ServerConfig({
        guildId: interaction.guildId!,
        taskListChannelId: targetChannel.id,
      });
    } else {
      config.taskListChannelId = targetChannel.id;
      config.taskListMessageId = undefined;
    }

    await config.save();

    const loadingComponents = [
      new TextDisplayBuilder().setContent('# ✅ Channel Set'),
      new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small),
      new TextDisplayBuilder().setContent(`Task list channel set to <#${targetChannel.id}>\n\n🔄 Refreshing task list...`)
    ];

    await respond(interaction, loadingComponents);

    const client = getClient();
    await refreshPinnedTaskList(client, interaction.guildId!);

    const successComponents = [
      new TextDisplayBuilder().setContent('# ✅ Channel Set'),
      new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small),
      new TextDisplayBuilder().setContent(`Task list channel set to <#${targetChannel.id}>\n\n✅ Task list has been refreshed in the new channel.`)
    ];

    await interaction.editReply({ components: successComponents });
  } catch (error) {
    console.error('Error setting channel:', error);
    await respond(interaction, [new TextDisplayBuilder().setContent('❌ Failed to set channel. Please try again.')]);
  }
}

// ── Goal Scope (interactive picker) ──────────────────────────────────

async function handleGoalScope(interaction: ChatInputCommandInteraction | ButtonInteraction) {
  const guildId = interaction.guildId!;
  const goals = await Goal.find({ guildId, status: 'active' }).lean();

  if (goals.length === 0) {
    await respond(interaction, [new TextDisplayBuilder().setContent('❌ No goals exist yet. Create one first with `/goal`.')]);
    return;
  }

  const goalSelect = new StringSelectMenuBuilder()
    .setCustomId('set-channel-goal-picker')
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

  const message = await respond(interaction, components, { fetchReply: true });

  const collector = message!.createMessageComponentCollector({
    filter: (i: any) => i.user.id === interaction.user.id && i.customId === 'set-channel-goal-picker',
    max: 1,
    time: 60000,
  });

  collector.on('collect', async (i: any) => {
    const selectedGoalId = i.values[0];
    const goal = await Goal.findOne({ goalId: selectedGoalId });
    if (!goal) return;

    await showChannelOptions(i, goal);
  });
}

async function showChannelOptions(interaction: any, goal: any) {
  const channelSelect = new ChannelSelectMenuBuilder()
    .setCustomId(`set-channel-goal-ch:${goal.goalId}`)
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

  if (goal.channelId) {
    components.push(
      new SectionBuilder()
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent('Remove channel link')
        )
        .setButtonAccessory(
          new ButtonBuilder()
            .setCustomId(`set-channel-goal-unlink:${goal.goalId}`)
            .setLabel('Unlink')
            .setStyle(ButtonStyle.Danger)
        )
    );
  }

  await interaction.update({ components });
  const message = await interaction.fetchReply();

  const collector = message.createMessageComponentCollector({
    filter: (i: any) =>
      i.user.id === interaction.user.id &&
      (i.customId === `set-channel-goal-ch:${goal.goalId}` || i.customId === `set-channel-goal-unlink:${goal.goalId}`),
    max: 1,
    time: 60000,
  });

  collector.on('collect', async (i: any) => {
    if (i.customId === `set-channel-goal-unlink:${goal.goalId}`) {
      await deleteGoalPinnedMessage(goal);

      goal.channelId = undefined;
      goal.messageId = undefined;
      await goal.save();

      await i.update({
        components: [
          new TextDisplayBuilder().setContent(`# ✅ Goal Unlinked`),
          new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small),
          new TextDisplayBuilder().setContent(`**${goal.name}** is no longer linked to a channel.`),
        ],
      });
    } else {
      const channelId = i.values[0];

      if (goal.channelId && goal.channelId !== channelId) {
        await deleteGoalPinnedMessage(goal);
      }

      goal.channelId = channelId;
      goal.messageId = undefined;
      await goal.save();

      const client = getClient();
      await updateGoalPinnedList(client, goal.goalId);

      await i.update({
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
  });
}

// ── Helpers ───────────────────────────────────────────────────────────

async function respond(
  interaction: ChatInputCommandInteraction | ButtonInteraction,
  components: any[],
  options?: { fetchReply?: boolean }
) {
  if (interaction instanceof ButtonInteraction) {
    await interaction.update({ components });
    return options?.fetchReply ? interaction.fetchReply() : undefined;
  }
  return interaction.reply({
    components,
    fetchReply: options?.fetchReply,
    flags: [MessageFlags.IsComponentsV2],
    ephemeral: true,
  });
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
    console.error('Could not delete old goal pinned message:', error);
  }
}
