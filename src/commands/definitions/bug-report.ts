import {
  ActionRowBuilder,
  ButtonInteraction,
  ChatInputCommandInteraction,
  MessageFlags,
  ModalBuilder,
  ModalSubmitInteraction,
  SeparatorBuilder,
  SeparatorSpacingSize,
  SlashCommandBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  TextDisplayBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import { TextChannel } from 'discord.js';
import { Command } from '../registry';
import { Bug, BugSeverity, ServerConfig } from '../../models';
import { generateBugId } from '../../utils/taskId';
import { getClient } from '../../utils/client';

const COLLECTOR_TIMEOUT = 120000;

const SEVERITY_OPTIONS: { value: BugSeverity; label: string; emoji: string; description: string }[] = [
  { value: 'low', label: 'Low', emoji: '🟢', description: 'Minor inconvenience, not blocking' },
  { value: 'medium', label: 'Medium', emoji: '🟡', description: 'Noticeable issue with workaround' },
  { value: 'high', label: 'High', emoji: '🟠', description: 'Significant problem, affects workflow' },
  { value: 'critical', label: 'Critical', emoji: '🔴', description: 'Broken or blocking, needs urgent fix' },
];

export const bugReportCommand: Command = {
  metadata: {
    name: 'bug-report',
    emoji: '🐛',
    description: 'Report a bug',
    implemented: true,
    requiresGuild: true,
  },

  build: () => {
    return new SlashCommandBuilder()
      .setName('bug-report')
      .setDescription('Report a bug with title, description, and severity');
  },

  execute: async (interaction: ChatInputCommandInteraction | ButtonInteraction) => {
    await showBugModal(interaction);
  },
};

async function showBugModal(interaction: ChatInputCommandInteraction | ButtonInteraction) {
  const modal = new ModalBuilder()
    .setCustomId('bug-report-modal')
    .setTitle('Report a Bug');

  const titleInput = new TextInputBuilder()
    .setCustomId('bug-title')
    .setLabel('Title')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('Brief summary of the bug')
    .setRequired(true)
    .setMaxLength(120);

  const descriptionInput = new TextInputBuilder()
    .setCustomId('bug-description')
    .setLabel('Description (steps, expected vs actual)')
    .setStyle(TextInputStyle.Paragraph)
    .setPlaceholder('What happened? What did you expect?')
    .setRequired(false)
    .setMaxLength(1500);

  modal.addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(titleInput),
    new ActionRowBuilder<TextInputBuilder>().addComponents(descriptionInput),
  );

  await interaction.showModal(modal);

  try {
    const submit = await interaction.awaitModalSubmit({
      filter: (i: ModalSubmitInteraction) =>
        i.customId === 'bug-report-modal' && i.user.id === interaction.user.id,
      time: 300000,
    });

    const title = submit.fields.getTextInputValue('bug-title');
    const description = submit.fields.getTextInputValue('bug-description') || undefined;

    await showSeverityPicker(submit, title, description);
  } catch {
    // Timeout — normal flow
  }
}

async function showSeverityPicker(
  interaction: ModalSubmitInteraction,
  title: string,
  description: string | undefined,
) {
  const select = new StringSelectMenuBuilder()
    .setCustomId('bug-severity')
    .setPlaceholder('Select severity');

  for (const option of SEVERITY_OPTIONS) {
    select.addOptions(
      new StringSelectMenuOptionBuilder()
        .setLabel(option.label)
        .setValue(option.value)
        .setDescription(option.description)
        .setEmoji(option.emoji),
    );
  }

  const components: any[] = [
    new TextDisplayBuilder().setContent(`# 🐛 ${title}`),
    new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small),
    new TextDisplayBuilder().setContent('How severe is this bug?'),
    new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select),
  ];

  const message = await interaction.reply({
    components,
    flags: [MessageFlags.IsComponentsV2],
    ephemeral: true,
    fetchReply: true,
  });

  const collector = message.createMessageComponentCollector({
    filter: (i: any) => i.user.id === interaction.user.id && i.customId === 'bug-severity',
    max: 1,
    time: COLLECTOR_TIMEOUT,
  });

  collector.on('collect', async (i: any) => {
    const severity = i.values[0] as BugSeverity;
    await saveBug(i, title, description, severity);
  });
}

async function saveBug(
  interaction: any,
  title: string,
  description: string | undefined,
  severity: BugSeverity,
) {
  const guildId = interaction.guildId!;
  const reporterId = interaction.user.id;

  const MAX_RETRIES = 5;
  let bugId = await generateBugId(guildId);

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      await Bug.create({
        bugId,
        guildId,
        title,
        description,
        severity,
        reporterId,
      });
      break;
    } catch (error: any) {
      if (error.code === 11000 && attempt < MAX_RETRIES - 1) {
        console.error(`Duplicate bugId ${bugId}, retrying...`);
        bugId = await generateBugId(guildId);
        continue;
      }
      console.error('Error creating bug:', error);
      await interaction.update({
        components: [
          new TextDisplayBuilder().setContent('❌ Failed to file bug. Please try again.'),
        ],
      });
      return;
    }
  }

  const severityOption = SEVERITY_OPTIONS.find(o => o.value === severity)!;

  postBugSummary(guildId, bugId, title, description, severityOption, reporterId).catch((err) => {
    console.error('Failed to post bug summary to task list channel:', err);
  });

  await interaction.update({
    components: [
      new TextDisplayBuilder().setContent('# ✅ Bug Reported'),
      new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small),
      new TextDisplayBuilder().setContent(
        `**${bugId}** • ${title}\nSeverity: ${severityOption.emoji} ${severityOption.label}\n\nUse \`/bugs\` to view all reports.`,
      ),
    ],
  });
}

async function postBugSummary(
  guildId: string,
  bugId: string,
  title: string,
  description: string | undefined,
  severityOption: { emoji: string; label: string },
  reporterId: string,
) {
  const config = await ServerConfig.findOne({ guildId }).lean();
  if (!config?.taskListChannelId) return;

  const client = getClient();
  const channel = await client.channels.fetch(config.taskListChannelId);
  if (!channel || !(channel instanceof TextChannel)) return;

  const lines = [
    `🐛 **${bugId}** — ${title}`,
    `Severity: ${severityOption.emoji} ${severityOption.label} · Reported by <@${reporterId}>`,
  ];
  if (description) lines.push(description);
  lines.push(`Use \`/bugs\` to view all reports.`);

  await channel.send({
    content: lines.join('\n'),
    allowedMentions: { parse: [] },
  });
}
