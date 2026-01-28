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
  UserSelectMenuInteraction,
  ComponentType,
  MessageFlags,
  TextDisplayBuilder,
  SectionBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
} from 'discord.js';
import { Command } from '../registry';
import { Task } from '../../models';
import { generateTaskId } from '../../utils/taskId';
import { updatePinnedTaskList } from '../../utils/taskList';
import { getClient } from '../../utils/client';

/**
 * Data structure for task creation
 */
interface TaskCreationData {
  taskId: string;
  guildId: string;
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
    // Create and show modal
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
      .setPlaceholder('2025-02-15 18:00')
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

    // Wait for modal submission
    try {
      const modalSubmit = await interaction.awaitModalSubmit({
        filter: (i: ModalSubmitInteraction) =>
          i.customId === 'create-task-modal' && i.user.id === interaction.user.id,
        time: 300000, // 5 minutes
      });

      await handleModalSubmit(modalSubmit, interaction.guildId!);
    } catch (error) {
      // Modal submission timed out or was cancelled
      // handleModalSubmit handles its own timeouts, so this is only for modal submission itself
      console.log('Modal submission timed out or was cancelled');
    }
  },
};

async function handleModalSubmit(interaction: ModalSubmitInteraction, guildId: string) {
  if (!guildId) return;

  const title = interaction.fields.getTextInputValue('task-title');
  const datetimeStr = interaction.fields.getTextInputValue('task-datetime');
  const notes = interaction.fields.getTextInputValue('task-notes') || undefined;

  console.log('[CREATE] Modal data received:', {
    title,
    datetimeStr,
    notes: notes || '(none)',
    guildId,
    userId: interaction.user.id
  });

  // Parse and validate datetime
  const dueDate = parseDateTime(datetimeStr);
  console.log('[CREATE] Parsed date:', dueDate);
  if (!dueDate) {
    await interaction.reply({
      components: [
        new TextDisplayBuilder().setContent('❌ Invalid date/time. Please use YYYY-MM-DD HH:mm format with a future date (e.g., 2026-02-15 18:00)')
      ],
      flags: [MessageFlags.IsComponentsV2, MessageFlags.Ephemeral],
    });
    return;
  }

  // Generate task ID
  const taskId = await generateTaskId(guildId);

  // Store task data temporarily (we'll create it after assignment decision)
  const taskData = {
    taskId,
    guildId,
    title,
    dueAt: dueDate,
    notes,
    creatorId: interaction.user.id,
    status: 'open' as const,
  };

  // Show assignment options with Components V2
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

  await interaction.reply({
    components: components,
    flags: [MessageFlags.IsComponentsV2, MessageFlags.Ephemeral],
  });

  // Wait for button interaction
  try {
    const buttonInteraction = await interaction.channel?.awaitMessageComponent({
      filter: (i) =>
        i.user.id === interaction.user.id &&
        (i.customId.startsWith('assign-task:') || i.customId.startsWith('leave-unassigned:')),
      componentType: ComponentType.Button,
      time: 60000,
    }) as ButtonInteraction;

    if (buttonInteraction.customId.startsWith('assign-task:')) {
      await handleAssignTask(buttonInteraction, taskData);
    } else {
      await handleLeaveUnassigned(buttonInteraction, taskData);
    }
  } catch (error) {
    // Timeout - create unassigned task anyway
    await createTask(taskData, guildId);
    await interaction.editReply({
      components: [
        new TextDisplayBuilder().setContent(`✅ Task **${taskId}** created (unassigned due to timeout).`)
      ],
    });
  }
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

  // Wait for user selection
  try {
    const selectInteraction = await interaction.channel?.awaitMessageComponent({
      filter: (i) =>
        i.user.id === interaction.user.id &&
        i.customId.startsWith('select-assignee:'),
      componentType: ComponentType.UserSelect,
      time: 60000,
    }) as UserSelectMenuInteraction;

    const assigneeId = selectInteraction.values[0];
    taskData.assigneeId = assigneeId;

    await createTask(taskData, interaction.guildId!);

    await selectInteraction.update({
      components: [
        new TextDisplayBuilder().setContent(`# ✅ Task Created`),
        new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small),
        new TextDisplayBuilder().setContent(`Task **${taskData.taskId}** has been created and assigned to <@${assigneeId}>!`),
      ],
    });
  } catch (error) {
    // Timeout - create unassigned
    await createTask(taskData, interaction.guildId!);
    await interaction.editReply({
      components: [
        new TextDisplayBuilder().setContent(`✅ Task **${taskData.taskId}** created (unassigned due to timeout).`)
      ],
    });
  }
}

async function handleLeaveUnassigned(
  interaction: ButtonInteraction,
  taskData: TaskCreationData
) {
  await createTask(taskData, interaction.guildId!);

  await interaction.update({
    components: [
      new TextDisplayBuilder().setContent(`# ✅ Task Created`),
      new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small),
      new TextDisplayBuilder().setContent(`Task **${taskData.taskId}** has been created (unassigned).`),
    ],
  });
}

async function createTask(taskData: TaskCreationData, guildId: string) {
  console.log('[CREATE] Creating task in database:', JSON.stringify(taskData, null, 2));

  try {
    // Create the task in the database
    const createdTask = await Task.create(taskData);
    console.log('[CREATE] Task created successfully, ID:', createdTask._id);

    // Update the pinned task list
    const client = getClient();
    await updatePinnedTaskList(client, guildId);
    console.log('[CREATE] Pinned task list updated');
  } catch (error: any) {
    console.error('[CREATE] ERROR creating task:');
    console.error('  Error name:', error.name);
    console.error('  Error code:', error.code);
    console.error('  Error message:', error.message);
    if (error.code === 11000) {
      console.error('  Duplicate key error! TaskId already exists:', taskData.taskId);
      console.error('  This means the task counter is out of sync with the database');
    }
    throw error;
  }
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
