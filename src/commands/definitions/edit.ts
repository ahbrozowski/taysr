import {
  ChatInputCommandInteraction,
  ButtonInteraction,
  SlashCommandBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalSubmitInteraction,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  UserSelectMenuBuilder,
  MessageFlags,
  TextDisplayBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
} from 'discord.js';
import { Command } from '../registry';
import { Goal } from '../../models';
import { generateGoalId } from '../../utils/taskId';
import { createTaskSelector } from '../../utils/taskSelector';
import { updatePinnedTaskList, updateGoalPinnedList } from '../../utils/taskList';
import { getClient } from '../../utils/client';

export const editCommand: Command = {
  metadata: {
    name: 'edit',
    emoji: '✏️',
    description: 'Edit an existing task',
    implemented: true,
    requiresGuild: true,
  },

  build: () => {
    return new SlashCommandBuilder()
      .setName('edit')
      .setDescription('Edit an existing task');
  },

  execute: async (interaction: ChatInputCommandInteraction | ButtonInteraction) => {
    await createTaskSelector(interaction, {
      actionLabel: 'Edit',
      guildId: interaction.guildId || undefined,
      onSelect: async (task, i) => {
        const guildId = i.guildId!;
        await showGoalPicker(task, i, guildId);
      },
    });
  },
};

async function showGoalPicker(task: any, interaction: any, guildId: string) {
  const goals = await Goal.find({ guildId, status: 'active' }).lean();

  // If no goals exist and task has no goal, skip to edit modal
  if (goals.length === 0 && !task.goalId) {
    await showEditModal(interaction, task, undefined);
    return;
  }

  const goalSelect = new StringSelectMenuBuilder()
    .setCustomId('edit-goal-picker')
    .setPlaceholder('Select a goal');

  for (const goal of goals) {
    const isCurrent = task.goalId === goal.goalId;
    goalSelect.addOptions(
      new StringSelectMenuOptionBuilder()
        .setLabel(isCurrent ? `${goal.name} (current)` : goal.name)
        .setValue(goal.goalId)
        .setDescription(goal.goalId)
        .setDefault(isCurrent)
    );
  }

  goalSelect.addOptions(
    new StringSelectMenuOptionBuilder()
      .setLabel('New goal...')
      .setValue('__new_goal__')
      .setDescription('Create a new goal'),
    new StringSelectMenuOptionBuilder()
      .setLabel(task.goalId ? 'No goal' : 'No goal (current)')
      .setValue('__no_goal__')
      .setDescription('Remove goal from task')
      .setDefault(!task.goalId)
  );

  const message = await interaction.update({
    components: [
      new TextDisplayBuilder().setContent(`# ✏️ Edit: ${task.title}`),
      new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small),
      new TextDisplayBuilder().setContent('Select a goal for this task:'),
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(goalSelect),
    ],
    fetchReply: true,
  });

  const collector = message.createMessageComponentCollector({ max: 1, time: 60000 });

  collector.on('collect', async (i: any) => {
    const selected = i.values[0];

    if (selected === '__new_goal__') {
      await handleNewGoalThenEdit(i, task, guildId);
    } else {
      const newGoalId = selected === '__no_goal__' ? undefined : selected;
      await showEditModal(i, task, newGoalId);
    }
  });
}

async function handleNewGoalThenEdit(interaction: any, task: any, guildId: string) {
  const modal = new ModalBuilder()
    .setCustomId('edit-new-goal-modal')
    .setTitle('New Goal');

  const nameInput = new TextInputBuilder()
    .setCustomId('goal-name')
    .setLabel('Goal Name')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('e.g., Prepare marketing for this tournament')
    .setRequired(true)
    .setMaxLength(100);

  modal.addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(nameInput)
  );

  await interaction.showModal(modal);

  try {
    const goalModal = await interaction.awaitModalSubmit({
      filter: (i: ModalSubmitInteraction) =>
        i.customId === 'edit-new-goal-modal' && i.user.id === interaction.user.id,
      time: 300000,
    });

    const goalName = goalModal.fields.getTextInputValue('goal-name');

    // Check for duplicate — use existing if found
    const existing = await Goal.findOne({ guildId, name: goalName }).collation({ locale: 'en', strength: 2 }).lean();
    if (existing) {
      await showEditModal(goalModal, task, existing.goalId);
      return;
    }

    const goalId = await generateGoalId(guildId);
    await Goal.create({ goalId, guildId, name: goalName, status: 'active' });

    await showEditModal(goalModal, task, goalId);
  } catch (error) {
    // Timeout
  }
}

async function showEditModal(interaction: any, task: any, goalId: string | undefined) {
  const currentDue = new Date(task.dueAt);
  const dueStr = [
    currentDue.getFullYear(),
    '-',
    String(currentDue.getMonth() + 1).padStart(2, '0'),
    '-',
    String(currentDue.getDate()).padStart(2, '0'),
    ' ',
    String(currentDue.getHours()).padStart(2, '0'),
    ':',
    String(currentDue.getMinutes()).padStart(2, '0'),
  ].join('');

  const modal = new ModalBuilder()
    .setCustomId('edit-task-modal')
    .setTitle('Edit Task');

  const titleInput = new TextInputBuilder()
    .setCustomId('task-title')
    .setLabel('Task Title')
    .setStyle(TextInputStyle.Short)
    .setValue(task.title)
    .setRequired(true)
    .setMaxLength(100);

  const datetimeInput = new TextInputBuilder()
    .setCustomId('task-datetime')
    .setLabel('Due Date & Time (YYYY-MM-DD HH:mm)')
    .setStyle(TextInputStyle.Short)
    .setValue(dueStr)
    .setRequired(true);

  const notesInput = new TextInputBuilder()
    .setCustomId('task-notes')
    .setLabel('Notes (optional)')
    .setStyle(TextInputStyle.Paragraph)
    .setValue(task.notes || '')
    .setRequired(false)
    .setMaxLength(500);

  modal.addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(titleInput),
    new ActionRowBuilder<TextInputBuilder>().addComponents(datetimeInput),
    new ActionRowBuilder<TextInputBuilder>().addComponents(notesInput)
  );

  await interaction.showModal(modal);

  try {
    const modalSubmit = await interaction.awaitModalSubmit({
      filter: (i: ModalSubmitInteraction) =>
        i.customId === 'edit-task-modal' && i.user.id === interaction.user.id,
      time: 300000,
    });

    await handleEditModalSubmit(modalSubmit, task, goalId);
  } catch (error) {
    // Timeout
  }
}

async function handleEditModalSubmit(interaction: ModalSubmitInteraction, task: any, goalId: string | undefined) {
  const title = interaction.fields.getTextInputValue('task-title');
  const datetimeStr = interaction.fields.getTextInputValue('task-datetime');
  const notes = interaction.fields.getTextInputValue('task-notes') || undefined;

  const dueDate = parseDateTime(datetimeStr);
  if (!dueDate) {
    await interaction.reply({
      components: [
        new TextDisplayBuilder().setContent(
          '❌ Invalid date/time format. Please use YYYY-MM-DD HH:mm (e.g., 2026-05-15 18:00)'
        ),
      ],
      flags: [MessageFlags.IsComponentsV2],
      ephemeral: true,
    });
    return;
  }

  const oldGoalId = task.goalId;

  // Update task fields (don't save yet — assignee step pending)
  task.title = title;
  task.dueAt = dueDate;
  task.notes = notes || null;
  task.goalId = goalId || null;

  // Show assignee options
  const assigneeText = task.assigneeId
    ? `Currently assigned to <@${task.assigneeId}>`
    : 'Currently unassigned';

  const buttons: ButtonBuilder[] = [];
  if (task.assigneeId) {
    buttons.push(
      new ButtonBuilder()
        .setCustomId('edit-change-assignee')
        .setLabel('Change Assignee')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId('edit-remove-assignee')
        .setLabel('Remove Assignee')
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId('edit-keep-assignee')
        .setLabel('Keep Current')
        .setStyle(ButtonStyle.Secondary)
    );
  } else {
    buttons.push(
      new ButtonBuilder()
        .setCustomId('edit-change-assignee')
        .setLabel('Assign')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId('edit-keep-assignee')
        .setLabel('Keep Unassigned')
        .setStyle(ButtonStyle.Secondary)
    );
  }

  const message = await interaction.reply({
    components: [
      new TextDisplayBuilder().setContent(`# ✏️ Edit: ${title}`),
      new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small),
      new TextDisplayBuilder().setContent(`${assigneeText}\n\nWould you like to change the assignee?`),
      new ActionRowBuilder<ButtonBuilder>().addComponents(...buttons),
    ],
    flags: [MessageFlags.IsComponentsV2],
    ephemeral: true,
    fetchReply: true,
  });

  const collector = message.createMessageComponentCollector({ max: 1, time: 60000 });

  collector.on('collect', async (i: any) => {
    if (i.customId === 'edit-change-assignee') {
      await handleEditAssignee(i, task, oldGoalId);
    } else if (i.customId === 'edit-remove-assignee') {
      task.assigneeId = null;
      await saveTask(task, oldGoalId);
      await i.update({
        components: [
          new TextDisplayBuilder().setContent(`✅ Task **${task.taskId}** updated. Assignee removed.`),
        ],
      });
    } else {
      // Keep current assignee
      await saveTask(task, oldGoalId);
      await i.update({
        components: [
          new TextDisplayBuilder().setContent(`✅ Task **${task.taskId}** updated.`),
        ],
      });
    }
  });

  collector.on('end', async (collected: any) => {
    if (collected.size === 0) {
      await saveTask(task, oldGoalId);
    }
  });
}

async function handleEditAssignee(interaction: any, task: any, oldGoalId: string | null) {
  const userSelect = new UserSelectMenuBuilder()
    .setCustomId('edit-select-assignee')
    .setPlaceholder('Select a user to assign')
    .setMinValues(1)
    .setMaxValues(1);

  const message = await interaction.update({
    components: [
      new TextDisplayBuilder().setContent(`# ✏️ Edit: ${task.title}`),
      new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small),
      new TextDisplayBuilder().setContent('Select a user to assign:'),
      new ActionRowBuilder<UserSelectMenuBuilder>().addComponents(userSelect),
    ],
    fetchReply: true,
  });

  const collector = message.createMessageComponentCollector({ max: 1, time: 60000 });

  collector.on('collect', async (i: any) => {
    task.assigneeId = i.values[0];
    await saveTask(task, oldGoalId);

    await i.update({
      components: [
        new TextDisplayBuilder().setContent(
          `✅ Task **${task.taskId}** updated and assigned to <@${task.assigneeId}>.`
        ),
      ],
    });
  });

  collector.on('end', async (collected: any) => {
    if (collected.size === 0) {
      await saveTask(task, oldGoalId);
    }
  });
}

async function saveTask(task: any, oldGoalId: string | null) {
  await task.save();

  const client = getClient();
  const guildId = task.guildId;

  updatePinnedTaskList(client, guildId).catch((err: any) => {
    console.error('Failed to update pinned task list:', err);
  });

  if (task.goalId) {
    updateGoalPinnedList(client, task.goalId).catch((err: any) => {
      console.error('Failed to update goal pinned list:', err);
    });
  }

  // Update old goal's pinned list if goal changed
  if (oldGoalId && oldGoalId !== task.goalId) {
    updateGoalPinnedList(client, oldGoalId).catch((err: any) => {
      console.error('Failed to update old goal pinned list:', err);
    });
  }
}

function parseDateTime(datetimeStr: string): Date | null {
  const match = datetimeStr.match(/^(\d{4})-(\d{1,2})-(\d{1,2})\s+(\d{1,2}):(\d{2})$/);
  if (!match) return null;

  const [, yearStr, monthStr, dayStr, hourStr, minuteStr] = match;
  const year = parseInt(yearStr);
  const month = parseInt(monthStr);
  const day = parseInt(dayStr);
  const hour = parseInt(hourStr);
  const minute = parseInt(minuteStr);

  if (year < 2000 || year > 2100) return null;
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > 31) return null;
  if (hour < 0 || hour > 23) return null;
  if (minute < 0 || minute > 59) return null;

  const date = new Date(year, month - 1, day, hour, minute);
  if (isNaN(date.getTime())) return null;

  return date;
}
