import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  ChatInputCommandInteraction,
  MessageFlags,
  SectionBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  SlashCommandBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  TextDisplayBuilder,
} from 'discord.js';
import { Command } from '../registry';
import { Bug, BugSeverity } from '../../models';

const PAGE_SIZE = 5;
const COLLECTOR_TIMEOUT = 120000;

type StatusFilter = 'open' | 'resolved' | 'all';

interface BugsState {
  page: number;
  status: StatusFilter;
  severity?: BugSeverity;
}

const SEVERITY_META: Record<BugSeverity, { emoji: string; label: string; rank: number }> = {
  critical: { emoji: '🔴', label: 'Critical', rank: 0 },
  high: { emoji: '🟠', label: 'High', rank: 1 },
  medium: { emoji: '🟡', label: 'Medium', rank: 2 },
  low: { emoji: '🟢', label: 'Low', rank: 3 },
};

export const bugsCommand: Command = {
  metadata: {
    name: 'bugs',
    emoji: '🪲',
    description: 'View bug reports',
    implemented: true,
    requiresGuild: true,
  },

  build: () => {
    return new SlashCommandBuilder()
      .setName('bugs')
      .setDescription('View and manage bug reports');
  },

  execute: async (interaction: ChatInputCommandInteraction | ButtonInteraction) => {
    const guildId = interaction.guildId!;
    const state: BugsState = { page: 0, status: 'open' };

    const message = await interaction.reply({
      components: await render(state, guildId),
      fetchReply: true,
      flags: [MessageFlags.IsComponentsV2],
      ephemeral: true,
    });

    const collector = message.createMessageComponentCollector({ time: COLLECTOR_TIMEOUT });

    collector.on('collect', async (i: any) => {
      if (i.customId === 'bugs-status') {
        state.status = i.values[0] as StatusFilter;
        state.page = 0;
        await i.update({ components: await render(state, guildId) });
      } else if (i.customId === 'bugs-severity') {
        state.severity = i.values[0] === '__all__' ? undefined : (i.values[0] as BugSeverity);
        state.page = 0;
        await i.update({ components: await render(state, guildId) });
      } else if (i.customId === 'bugs-prev') {
        state.page = Math.max(0, state.page - 1);
        await i.update({ components: await render(state, guildId) });
      } else if (i.customId === 'bugs-next') {
        state.page += 1;
        await i.update({ components: await render(state, guildId) });
      } else if (i.customId.startsWith('bugs-resolve:')) {
        const bugId = i.customId.split(':')[1];
        await Bug.findOneAndUpdate(
          { _id: bugId },
          { $set: { status: 'resolved', resolvedBy: i.user.id, resolvedAt: new Date() } },
        );
        await i.update({ components: await render(state, guildId) });
      } else if (i.customId.startsWith('bugs-reopen:')) {
        const bugId = i.customId.split(':')[1];
        await Bug.findOneAndUpdate(
          { _id: bugId },
          { $set: { status: 'open' }, $unset: { resolvedBy: '', resolvedAt: '' } },
        );
        await i.update({ components: await render(state, guildId) });
      }
    });
  },
};

async function render(state: BugsState, guildId: string) {
  const components: any[] = [];

  components.push(
    new TextDisplayBuilder().setContent('# 🪲 Bug Reports'),
    new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small),
  );

  components.push(...buildFilters(state));
  components.push(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small));
  components.push(...await buildBugList(state, guildId));

  return components;
}

function buildFilters(state: BugsState) {
  const components: any[] = [];

  const statusSelect = new StringSelectMenuBuilder()
    .setCustomId('bugs-status')
    .setPlaceholder('Filter by status')
    .addOptions(
      new StringSelectMenuOptionBuilder()
        .setLabel('Open')
        .setValue('open')
        .setDefault(state.status === 'open'),
      new StringSelectMenuOptionBuilder()
        .setLabel('Resolved')
        .setValue('resolved')
        .setDefault(state.status === 'resolved'),
      new StringSelectMenuOptionBuilder()
        .setLabel('All')
        .setValue('all')
        .setDefault(state.status === 'all'),
    );
  components.push(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(statusSelect));

  const severitySelect = new StringSelectMenuBuilder()
    .setCustomId('bugs-severity')
    .setPlaceholder('Filter by severity');

  severitySelect.addOptions(
    new StringSelectMenuOptionBuilder()
      .setLabel('All severities')
      .setValue('__all__')
      .setDefault(!state.severity),
  );

  for (const [value, meta] of Object.entries(SEVERITY_META)) {
    severitySelect.addOptions(
      new StringSelectMenuOptionBuilder()
        .setLabel(meta.label)
        .setValue(value)
        .setEmoji(meta.emoji)
        .setDefault(state.severity === value),
    );
  }
  components.push(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(severitySelect));

  return components;
}

async function buildBugList(state: BugsState, guildId: string) {
  const components: any[] = [];

  const filter: any = { guildId };
  if (state.status !== 'all') filter.status = state.status;
  if (state.severity) filter.severity = state.severity;

  const total = await Bug.countDocuments(filter);
  const bugs = await Bug.find(filter)
    .sort({ status: 1, createdAt: -1 })
    .skip(state.page * PAGE_SIZE)
    .limit(PAGE_SIZE)
    .lean();

  // Sort within page by severity rank for open bugs
  bugs.sort((a, b) => {
    if (a.status !== b.status) return a.status === 'open' ? -1 : 1;
    return SEVERITY_META[a.severity].rank - SEVERITY_META[b.severity].rank;
  });

  const summaryParts: string[] = [];
  if (state.severity) summaryParts.push(`severity: ${SEVERITY_META[state.severity].label}`);
  summaryParts.push(`status: ${state.status}`);
  components.push(
    new TextDisplayBuilder().setContent(
      `**${total}** bug${total === 1 ? '' : 's'} · ${summaryParts.join(' · ')}`,
    ),
  );

  if (bugs.length === 0) {
    components.push(new TextDisplayBuilder().setContent('_No bugs match these filters._'));
  } else {
    for (const bug of bugs) {
      const meta = SEVERITY_META[bug.severity];
      const statusIcon = bug.status === 'resolved' ? '✅' : meta.emoji;
      const reporter = `<@${bug.reporterId}>`;
      const reportedAt = Math.floor(new Date(bug.createdAt).getTime() / 1000);

      const lines = [
        `${statusIcon} **${bug.bugId}** • ${bug.title}`,
        `${meta.label} • Reported by ${reporter} • <t:${reportedAt}:R>`,
      ];
      if (bug.status === 'resolved' && bug.resolvedBy && bug.resolvedAt) {
        const resolvedTs = Math.floor(new Date(bug.resolvedAt).getTime() / 1000);
        lines.push(`Resolved by <@${bug.resolvedBy}> <t:${resolvedTs}:R>`);
      }
      if (bug.description) lines.push(`_${truncate(bug.description, 200)}_`);

      const button = bug.status === 'open'
        ? new ButtonBuilder()
            .setCustomId(`bugs-resolve:${bug._id}`)
            .setLabel('Resolve')
            .setStyle(ButtonStyle.Primary)
        : new ButtonBuilder()
            .setCustomId(`bugs-reopen:${bug._id}`)
            .setLabel('Reopen')
            .setStyle(ButtonStyle.Secondary);

      components.push(
        new SectionBuilder()
          .addTextDisplayComponents(new TextDisplayBuilder().setContent(lines.join('\n')))
          .setButtonAccessory(button),
      );
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const navButtons: ButtonBuilder[] = [
    new ButtonBuilder()
      .setCustomId('bugs-prev')
      .setLabel('Previous')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(state.page === 0),
    new ButtonBuilder()
      .setCustomId('bugs-next')
      .setLabel('Next')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(state.page >= totalPages - 1),
  ];

  components.push(new ActionRowBuilder<ButtonBuilder>().addComponents(navButtons));
  components.push(
    new TextDisplayBuilder().setContent(`_Page ${state.page + 1} of ${totalPages}_`),
  );

  return components;
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}
