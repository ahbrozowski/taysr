import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalSubmitInteraction,
  ButtonInteraction,
  UserSelectMenuBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  MessageFlags,
  TextDisplayBuilder,
  SectionBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
} from 'discord.js';
import { Command } from '../registry';
import { Goal, Task } from '../../models';
import { generateTaskId, generateGoalId } from '../../utils/taskId';
import { updatePinnedTaskList, updateGoalPinnedList } from '../../utils/taskList';
import { getClient } from '../../utils/client';

/**
 * Data structure for task creation
 */
interface TaskCreationData {
  taskId: string;
  guildId: string;
  goalId?: string;
  title: string;
  dueAt: Date;
  notes?: string;
  creatorId: string;
  status: 'open' | 'complete';
  assigneeId?: string;
}

export const createCommand: Command = {
  metadata: {
    name: 'create',
    emoji: '➕',
    description: 'Create a new task',
    implemented: true,
    requiresGuild: true,
  },

  build: () => {
    return new SlashCommandBuilder()
      .setName('create')
      .setDescription('Create a new task');
  },

  execute: async (interaction: ChatInputCommandInteraction | ButtonInteraction) => {
    const guildId = interaction.guildId!;
    const goals = await Goal.find({ guildId, status: 'active' }).lean();

    // If there are goals, show goal picker first
    if (goals.length > 0) {
      const goalSelect = new StringSelectMenuBuilder()
        .setCustomId('create-goal-picker')
        .setPlaceholder('Select a goal for this task');

      for (const goal of goals) {
        goalSelect.addOptions(
          new StringSelectMenuOptionBuilder()
            .setLabel(goal.name)
            .setValue(goal.goalId)
            .setDescription(goal.goalId)
        );
      }
      goalSelect.addOptions(
        new StringSelectMenuOptionBuilder()
          .setLabel('New goal...')
          .setValue('__new_goal__')
          .setDescription('Create a new goal'),
        new StringSelectMenuOptionBuilder()
          .setLabel('No goal')
          .setValue('__no_goal__')
          .setDescription('Task without a goal')
      );

      const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(goalSelect);

      const components = [
        new TextDisplayBuilder().setContent('# ➕ Create Task'),
        new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small),
        new TextDisplayBuilder().setContent('Select a goal for this task:'),
        row,
      ];

      const message = await interaction.reply({
        components,
        flags: [MessageFlags.IsComponentsV2],
        ephemeral: true,
        fetchReply: true,
      });

      const collector = message.createMessageComponentCollector({ time: 60000 });

      collector.on('collect', async (i: any) => {
        if (i.customId === 'create-goal-picker') {
          collector.stop();
          const selected = i.values[0];

          if (selected === '__new_goal__') {
            await handleNewGoalThenTask(i, guildId);
          } else {
            const goalId = selected === '__no_goal__' ? undefined : selected;
            await showTaskModal(i, guildId, goalId);
          }
        }
      });
    } else {
      // No goals exist — go straight to task modal (with option to create goal inline)
      await showTaskModal(interaction, guildId);
    }
  },
};

/**
 * Shows a modal to create a new goal, then continues to the task modal.
 */
async function handleNewGoalThenTask(interaction: any, guildId: string) {
  const modal = new ModalBuilder()
    .setCustomId('create-inline-goal-modal')
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
        i.customId === 'create-inline-goal-modal' && i.user.id === interaction.user.id,
      time: 300000,
    });

    const goalName = goalModal.fields.getTextInputValue('goal-name');

    // Check for duplicate
    const existing = await Goal.findOne({ guildId, name: goalName }).collation({ locale: 'en', strength: 2 }).lean();
    if (existing) {
      // Use existing goal instead of failing
      await showTaskModal(goalModal, guildId, existing.goalId);
      return;
    }

    const goalId = await generateGoalId(guildId);
    await Goal.create({ goalId, guildId, name: goalName, status: 'active' });

    await showTaskModal(goalModal, guildId, goalId);
  } catch (error) {
    // Timeout — normal flow
  }
}

/**
 * Shows the task creation modal. Called after goal selection.
 */
async function showTaskModal(interaction: any, guildId: string, goalId?: string) {
  const modal = new ModalBuilder()
    .setCustomId('create-task-modal')
    .setTitle('Create New Task');

  const titleInput = new TextInputBuilder()
    .setCustomId('task-title')
    .setLabel('Task Title')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('e.g., Design bout flyer')
    .setRequired(true)
    .setMaxLength(100);

  const datetimeInput = new TextInputBuilder()
    .setCustomId('task-datetime')
    .setLabel('Due Date & Time (YYYY-MM-DD HH:mm)')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('2026-05-15 18:00')
    .setRequired(true);

  const notesInput = new TextInputBuilder()
    .setCustomId('task-notes')
    .setLabel('Notes (optional)')
    .setStyle(TextInputStyle.Paragraph)
    .setPlaceholder('Additional details or context')
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
        i.customId === 'create-task-modal' && i.user.id === interaction.user.id,
      time: 300000,
    });

    await handleTaskModalSubmit(modalSubmit, guildId, goalId);
  } catch (error) {
    // Timeout — normal flow
  }
}


async function handleTaskModalSubmit(interaction: ModalSubmitInteraction, guildId: string, goalId?: string) {
  if (!guildId) return;

  const title = interaction.fields.getTextInputValue('task-title');
  const datetimeStr = interaction.fields.getTextInputValue('task-datetime');
  const notes = interaction.fields.getTextInputValue('task-notes') || undefined;

  // Parse and validate datetime
  const dueDate = parseDateTime(datetimeStr);
  if (!dueDate) {
    await interaction.reply({
      components: [
        new TextDisplayBuilder().setContent('❌ Invalid date/time. Please use YYYY-MM-DD HH:mm format with a future date (e.g., 2026-05-15 18:00)')
      ],
      flags: [MessageFlags.IsComponentsV2],
      ephemeral: true,
    });
    return;
  }

  const taskId = await generateTaskId(guildId);

  const taskData: TaskCreationData = {
    taskId,
    guildId,
    goalId,
    title,
    dueAt: dueDate,
    notes,
    creatorId: interaction.user.id,
    status: 'open' as const,
  };

  // Show assignment options
  const components = [
    new TextDisplayBuilder().setContent(`# Task Created: ${title}`),
    new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small),
    new TextDisplayBuilder().setContent(`**Due:** <t:${Math.floor(dueDate.getTime() / 1000)}:f>`),
    new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small),
    new TextDisplayBuilder().setContent('**Who should be assigned to this task?**'),
    new SectionBuilder()
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent('Assign to a specific person')
      )
      .setButtonAccessory(
        new ButtonBuilder()
          .setCustomId(`assign-task:${taskId}`)
          .setLabel('Assign')
          .setStyle(ButtonStyle.Primary)
      ),
    new SectionBuilder()
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent('Leave task unassigned for now')
      )
      .setButtonAccessory(
        new ButtonBuilder()
          .setCustomId(`leave-unassigned:${taskId}`)
          .setLabel('Unassigned')
          .setStyle(ButtonStyle.Secondary)
      ),
  ];

  const assignMessage = await interaction.reply({
    components,
    flags: [MessageFlags.IsComponentsV2],
    ephemeral: true,
    fetchReply: true,
  });

  const assignCollector = assignMessage.createMessageComponentCollector({ time: 60000 });

  assignCollector.on('collect', async (i: any) => {
    assignCollector.stop();
    if (i.customId.startsWith('assign-task:')) {
      await handleAssignTask(i, taskData);
    } else if (i.customId.startsWith('leave-unassigned:')) {
      await handleLeaveUnassigned(i, taskData);
    }
  });

  assignCollector.on('end', async (collected) => {
    if (collected.size === 0) {
      const ok = await createTask(taskData, guildId);
      await interaction.editReply({
        components: [
          new TextDisplayBuilder().setContent(
            ok ? `✅ Task **${taskId}** created (unassigned due to timeout).` : '❌ Failed to create task. Please try again.'
          )
        ],
      });
    }
  });
}

async function handleAssignTask(
  interaction: ButtonInteraction,
  taskData: TaskCreationData
) {
  // Show user select menu with Components V2
  const userSelect = new UserSelectMenuBuilder()
    .setCustomId(`select-assignee:${taskData.taskId}`)
    .setPlaceholder('Select a user to assign')
    .setMinValues(1)
    .setMaxValues(1);

  const row = new ActionRowBuilder<UserSelectMenuBuilder>().addComponents(userSelect);

  const components = [
    new TextDisplayBuilder().setContent('# Select User to Assign'),
    new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small),
    new TextDisplayBuilder().setContent('Choose a team member to assign this task to:'),
  ];

  await interaction.update({
    components: [...components, row],
  });

  const selectMessage = await interaction.fetchReply();
  const selectCollector = selectMessage.createMessageComponentCollector({ time: 60000 });

  selectCollector.on('collect', async (i: any) => {
    selectCollector.stop();
    const assigneeId = i.values[0];
    taskData.assigneeId = assigneeId;

    const ok = await createTask(taskData, interaction.guildId!);

    await i.update({
      components: ok
        ? [
            new TextDisplayBuilder().setContent(`# ✅ Task Created`),
            new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small),
            new TextDisplayBuilder().setContent(`Task **${taskData.taskId}** has been created and assigned to <@${assigneeId}>!`),
          ]
        : [new TextDisplayBuilder().setContent('❌ Failed to create task. Please try again.')],
    });
  });

  selectCollector.on('end', async (collected) => {
    if (collected.size === 0) {
      const ok = await createTask(taskData, interaction.guildId!);
      await interaction.editReply({
        components: [
          new TextDisplayBuilder().setContent(
            ok ? `✅ Task **${taskData.taskId}** created (unassigned due to timeout).` : '❌ Failed to create task. Please try again.'
          )
        ],
      });
    }
  });
}

async function handleLeaveUnassigned(
  interaction: ButtonInteraction,
  taskData: TaskCreationData
) {
  const ok = await createTask(taskData, interaction.guildId!);

  await interaction.update({
    components: ok
      ? [
          new TextDisplayBuilder().setContent(`# ✅ Task Created`),
          new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small),
          new TextDisplayBuilder().setContent(`Task **${taskData.taskId}** has been created (unassigned).`),
        ]
      : [new TextDisplayBuilder().setContent('❌ Failed to create task. Please try again.')],
  });
}

async function createTask(taskData: TaskCreationData, guildId: string): Promise<boolean> {
  const MAX_RETRIES = 5;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      await Task.create(taskData);

      const client = getClient();
      await updatePinnedTaskList(client, guildId);

      if (taskData.goalId) {
        await updateGoalPinnedList(client, taskData.goalId);
      }
      return true;
    } catch (error: any) {
      if (error.code === 11000 && attempt < MAX_RETRIES - 1) {
        // Counter out of sync — generate a fresh ID and retry
        console.error(`Duplicate taskId ${taskData.taskId}, retrying with new ID...`);
        taskData.taskId = await generateTaskId(guildId);
        continue;
      }
      console.error('Error creating task:', error);
      return false;
    }
  }
  return false;
}

function parseDateTime(datetimeStr: string): Date | null {
  // Expected format: YYYY-MM-DD HH:mm
  const match = datetimeStr.match(/^(\d{4})-(\d{1,2})-(\d{1,2})\s+(\d{1,2}):(\d{2})$/);
  if (!match) {
    return null;
  }

  const [, yearStr, monthStr, dayStr, hourStr, minuteStr] = match;

  const year = parseInt(yearStr);
  const month = parseInt(monthStr);
  const day = parseInt(dayStr);
  const hour = parseInt(hourStr);
  const minute = parseInt(minuteStr);

  // Validate ranges
  if (year < 2000 || year > 2100) return null;
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > 31) return null;
  if (hour < 0 || hour > 23) return null;
  if (minute < 0 || minute > 59) return null;

  const date = new Date(year, month - 1, day, hour, minute);

  if (isNaN(date.getTime())) {
    return null;
  }

  // Check if date is in the past
  if (date.getTime() < Date.now()) {
    return null;
  }

  return date;
}
