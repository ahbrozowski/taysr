import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  ChatInputCommandInteraction,
  MessageFlags,
  SeparatorBuilder,
  SeparatorSpacingSize,
  SlashCommandBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  TextDisplayBuilder,
  UserSelectMenuBuilder,
} from 'discord.js';
import { Command } from '../registry';
import { Goal, Task } from '../../models';

const PAGE_SIZE = 5;
const COLLECTOR_TIMEOUT = 120000;

type StatusFilter = 'open' | 'complete' | 'all';

interface ListState {
  page: number;
  goal?: string;
  assigneeId?: string;
  status: StatusFilter;
}

export const listCommand: Command = {
  metadata: {
    name: 'list',
    emoji: '📋',
    description: 'List tasks with filters',
    implemented: true,
    requiresGuild: true,
  },

  build: () => {
    return new SlashCommandBuilder()
      .setName('list')
      .setDescription('List tasks with filters by goal, assignee, or status');
  },

  execute: async (interaction: ChatInputCommandInteraction | ButtonInteraction) => {
    const guildId = interaction.guildId!;
    const state: ListState = { page: 0, status: 'open' };

    const message = await interaction.reply({
      components: await render(state, guildId),
      fetchReply: true,
      flags: [MessageFlags.IsComponentsV2],
      ephemeral: true,
    });

    const collector = message.createMessageComponentCollector({ time: COLLECTOR_TIMEOUT });

    collector.on('collect', async (i: any) => {
      if (i.customId === 'list-status') {
        state.status = i.values[0] as StatusFilter;
        state.page = 0;
      } else if (i.customId === 'list-goal') {
        state.goal = i.values[0] === '__all__' ? undefined : i.values[0];
        state.page = 0;
      } else if (i.customId === 'list-user') {
        state.assigneeId = i.values[0];
        state.page = 0;
      } else if (i.customId === 'list-clear-user') {
        state.assigneeId = undefined;
        state.page = 0;
      } else if (i.customId === 'list-prev') {
        state.page = Math.max(0, state.page - 1);
      } else if (i.customId === 'list-next') {
        state.page += 1;
      }

      await i.update({ components: await render(state, guildId) });
    });
  },
};

async function render(state: ListState, guildId: string) {
  const components: any[] = [];

  components.push(
    new TextDisplayBuilder().setContent('# 📋 Tasks'),
    new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small),
  );

  components.push(...await buildFilters(state, guildId));
  components.push(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small));
  components.push(...await buildTaskList(state, guildId));

  return components;
}

async function buildFilters(state: ListState, guildId: string) {
  const components: any[] = [];

  const statusSelect = new StringSelectMenuBuilder()
    .setCustomId('list-status')
    .setPlaceholder('Filter by status')
    .addOptions(
      new StringSelectMenuOptionBuilder()
        .setLabel('Open')
        .setValue('open')
        .setDefault(state.status === 'open'),
      new StringSelectMenuOptionBuilder()
        .setLabel('Complete')
        .setValue('complete')
        .setDefault(state.status === 'complete'),
      new StringSelectMenuOptionBuilder()
        .setLabel('All')
        .setValue('all')
        .setDefault(state.status === 'all'),
    );
  components.push(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(statusSelect));

  const goals = await Goal.find({ guildId, status: 'active' }).lean();
  if (goals.length > 0) {
    const goalSelect = new StringSelectMenuBuilder()
      .setCustomId('list-goal')
      .setPlaceholder('Filter by goal');

    goalSelect.addOptions(
      new StringSelectMenuOptionBuilder()
        .setLabel('All goals')
        .setValue('__all__')
        .setDefault(!state.goal),
    );

    for (const goal of goals) {
      goalSelect.addOptions(
        new StringSelectMenuOptionBuilder()
          .setLabel(goal.name)
          .setValue(goal.goalId)
          .setDescription(goal.goalId)
          .setDefault(state.goal === goal.goalId),
      );
    }
    components.push(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(goalSelect));
  }

  const userSelect = new UserSelectMenuBuilder()
    .setCustomId('list-user')
    .setPlaceholder('Filter by assignee')
    .setMinValues(1)
    .setMaxValues(1);
  components.push(new ActionRowBuilder<UserSelectMenuBuilder>().addComponents(userSelect));

  return components;
}

async function buildTaskList(state: ListState, guildId: string) {
  const components: any[] = [];

  const filter: any = { guildId };
  if (state.status !== 'all') filter.status = state.status;
  if (state.goal) filter.goalId = state.goal;
  if (state.assigneeId) filter.assigneeId = state.assigneeId;

  const total = await Task.countDocuments(filter);
  const tasks = await Task.find(filter)
    .sort({ status: 1, dueAt: 1 })
    .skip(state.page * PAGE_SIZE)
    .limit(PAGE_SIZE)
    .lean();

  const summaryParts: string[] = [];
  if (state.assigneeId) summaryParts.push(`assignee <@${state.assigneeId}>`);
  if (state.goal) summaryParts.push(`goal ${state.goal}`);
  summaryParts.push(`status: ${state.status}`);
  components.push(
    new TextDisplayBuilder().setContent(
      `**${total}** task${total === 1 ? '' : 's'} · ${summaryParts.join(' · ')}`,
    ),
  );

  if (tasks.length === 0) {
    components.push(new TextDisplayBuilder().setContent('_No tasks match these filters._'));
  } else {
    const goalIds = [...new Set(tasks.filter(t => t.goalId).map(t => t.goalId as string))];
    const goals = goalIds.length > 0
      ? await Goal.find({ guildId, goalId: { $in: goalIds } }).lean()
      : [];
    const goalNames = new Map(goals.map(g => [g.goalId, g.name]));

    for (const task of tasks) {
      const assignee = task.assigneeId ? `<@${task.assigneeId}>` : 'Unassigned';
      const dueTimestamp = Math.floor(new Date(task.dueAt).getTime() / 1000);
      const goalLabel = task.goalId ? `🎯 ${goalNames.get(task.goalId) ?? task.goalId}` : '';
      const statusIcon = task.status === 'complete' ? '✅' : '🔵';

      const lines = [
        `${statusIcon} **${task.taskId}** • ${task.title}`,
        `${assignee} • <t:${dueTimestamp}:R>${goalLabel ? ` • ${goalLabel}` : ''}`,
      ];
      if (task.notes) lines.push(`_${task.notes}_`);

      components.push(new TextDisplayBuilder().setContent(lines.join('\n')));
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const buttons: ButtonBuilder[] = [
    new ButtonBuilder()
      .setCustomId('list-prev')
      .setLabel('Previous')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(state.page === 0),
    new ButtonBuilder()
      .setCustomId('list-next')
      .setLabel('Next')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(state.page >= totalPages - 1),
  ];

  if (state.assigneeId) {
    buttons.push(
      new ButtonBuilder()
        .setCustomId('list-clear-user')
        .setLabel('Clear assignee')
        .setStyle(ButtonStyle.Secondary),
    );
  }

  components.push(new ActionRowBuilder<ButtonBuilder>().addComponents(buttons));
  components.push(
    new TextDisplayBuilder().setContent(`_Page ${state.page + 1} of ${totalPages}_`),
  );

  return components;
}
