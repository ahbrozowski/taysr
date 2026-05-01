import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  ChatInputCommandInteraction,
  MessageFlags,
  SectionBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  TextDisplayBuilder,
  UserSelectMenuBuilder,
} from 'discord.js';

import { Goal, Task } from '../models';
import { updatePinnedTaskList, updateGoalPinnedList } from './taskList';
import { cancelRemindersForTask } from './reminders';

interface TaskSelectorState {
  page: number;
  goal?: any;
  assigneeId?: string;
}

export interface TaskSelectorOptions {
  /** Button label shown next to each task (e.g., "Complete", "Assign", "Delete") */
  actionLabel: string;
  /** Called when a task action button is clicked. Receives the task document and interaction. */
  onSelect: (task: any, interaction: any) => Promise<void>;
  /** Additional MongoDB filter merged with { status: 'open' } */
  taskFilter?: Record<string, any>;
  /** Whether to show goal/assignee filter selects (default: true) */
  showFilters?: boolean;
  /** Guild ID to scope goal filter */
  guildId?: string;
}

async function showFilters(state: TaskSelectorState, guildId?: string) {
  const components = [];

  const filter: any = {};
  if (guildId) filter.guildId = guildId;

  const goals = await Goal.find({ ...filter, status: 'active' }).lean();

  if (goals.length > 0) {
    const goalSelect = new StringSelectMenuBuilder()
      .setCustomId('sort_by_goal')
      .setPlaceholder('Filter by goal');

    for (const goal of goals) {
      goalSelect.addOptions(
        new StringSelectMenuOptionBuilder()
          .setLabel(goal.name)
          .setValue(goal.goalId)
          .setDescription(goal.goalId)
      );
    }
    components.push(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(goalSelect));
  }

  const userSelect = new UserSelectMenuBuilder()
    .setCustomId('users')
    .setPlaceholder('Filter by assignee')
    .setMaxValues(1);
  components.push(new ActionRowBuilder<UserSelectMenuBuilder>().addComponents(userSelect));

  return components;
}

async function showPaginatedTasks(state: TaskSelectorState, options: TaskSelectorOptions) {
  const components = [];

  const filter: any = { status: 'open', ...options.taskFilter };

  if (state.goal) {
    filter.goalId = state.goal;
  }
  if (state.assigneeId) {
    filter.assigneeId = state.assigneeId;
  }

  const tasks = await Task.find(filter)
    .limit(5)
    .skip(5 * state.page)
    .sort({ dueAt: 1 })
    .exec();

  if (tasks.length === 0 && state.page === 0) {
    components.push(
      new TextDisplayBuilder().setContent('_No tasks found._')
    );
  }

  for (const task of tasks) {
    const assignee = task.assigneeId ? `<@${task.assigneeId}>` : 'Unassigned';
    const dueTimestamp = Math.floor(new Date(task.dueAt).getTime() / 1000);

    components.push(
      new SectionBuilder()
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            `**${task.taskId}** • ${task.title}\n${assignee} • <t:${dueTimestamp}:R>`
          )
        )
        .setButtonAccessory(
          new ButtonBuilder()
            .setCustomId(`cmd:${task._id.toString()}`)
            .setLabel(options.actionLabel)
            .setStyle(ButtonStyle.Primary)
        )
    );
  }

  const previousButton = new ButtonBuilder()
    .setCustomId('previous_page')
    .setLabel('Previous')
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(state.page === 0);

  const nextButton = new ButtonBuilder()
    .setCustomId('next_page')
    .setLabel('Next')
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(tasks.length < 5);

  components.push(new ActionRowBuilder<ButtonBuilder>().addComponents(previousButton, nextButton));

  return components;
}

async function render(state: TaskSelectorState, options: TaskSelectorOptions) {
  const parts = [];

  if (options.showFilters !== false) {
    parts.push(...await showFilters(state, options.guildId));
  }

  parts.push(...await showPaginatedTasks(state, options));

  return parts;
}

/**
 * Creates a paginated, filterable task list with configurable action buttons.
 * This is the core reusable task selector used by complete, assign, take, unassign, delete, etc.
 */
export async function createTaskSelector(
  interaction: ChatInputCommandInteraction | ButtonInteraction,
  options: TaskSelectorOptions
) {
  let state: TaskSelectorState = { page: 0 };

  if (interaction.channel == null || !('send' in interaction.channel)) {
    return;
  }

  const message = await interaction.reply({
    components: await render(state, options),
    fetchReply: true,
    flags: [MessageFlags.IsComponentsV2],
    ephemeral: true,
  });

  const collector = message.createMessageComponentCollector({ time: 120000 });

  collector.on('collect', async (i: any) => {
    if (i.customId === 'sort_by_goal') {
      state.goal = i.values[0];
      state.page = 0;
      await i.update({ components: await render(state, options) });
    } else if (i.customId === 'users') {
      state.assigneeId = i.values[0];
      state.page = 0;
      await i.update({ components: await render(state, options) });
    } else if (i.customId === 'previous_page') {
      state.page = Math.max(0, state.page - 1);
      await i.update({ components: await render(state, options) });
    } else if (i.customId === 'next_page') {
      state.page = state.page + 1;
      await i.update({ components: await render(state, options) });
    } else if (i.customId.startsWith('cmd:')) {
      const taskId = i.customId.split(':')[1];
      const task = await Task.findById(taskId);
      if (task) {
        await options.onSelect(task, i);
      }
    }
  });
}

/**
 * Convenience wrapper: task selector pre-configured for completing tasks.
 * Used by the /complete command.
 */
export async function createTaskListPage(interaction: ChatInputCommandInteraction | ButtonInteraction) {
  await createTaskSelector(interaction, {
    actionLabel: 'Complete',
    guildId: interaction.guildId || undefined,
    onSelect: async (task, i) => {
      task.status = 'complete';
      await task.save();

      cancelRemindersForTask(task._id.toString()).catch((err: any) => {
        console.error('Failed to cancel reminders:', err);
      });

      updatePinnedTaskList(i.client, i.guildId).catch((err: any) => {
        console.error('Failed to update pinned task list:', err);
      });
      if (task.goalId) {
        updateGoalPinnedList(i.client, task.goalId).catch((err: any) => {
          console.error('Failed to update goal pinned list:', err);
        });
      }

      await i.update({
        components: [
          new TextDisplayBuilder().setContent(`✅ Task **${task.taskId}** marked as complete.`)
        ],
      });
    },
  });
}
