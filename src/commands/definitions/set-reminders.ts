import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  ChatInputCommandInteraction,
  MessageFlags,
  ModalBuilder,
  ModalSubmitInteraction,
  SectionBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  SlashCommandBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  TextDisplayBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import { Command } from '../registry';
import { ServerConfig } from '../../models';

const COLLECTOR_TIMEOUT = 120000;

const PRESETS: { label: string; value: string; cadence: string[] }[] = [
  { label: 'Off (no reminders)', value: 'off', cadence: [] },
  { label: '1 day before', value: '1d', cadence: ['1d'] },
  { label: '1 day, 1 hour before', value: '1d-1h', cadence: ['1d', '1h'] },
  { label: '3 days, 1 day, 1 hour before', value: '3d-1d-1h', cadence: ['3d', '1d', '1h'] },
  { label: '7 days, 3 days, 1 day, 4 hours, 1 hour before', value: '7d-3d-1d-4h-1h', cadence: ['7d', '3d', '1d', '4h', '1h'] },
];

export const setRemindersCommand: Command = {
  metadata: {
    name: 'set-reminders',
    emoji: '⏰',
    description: 'Configure reminder cadence',
    implemented: true,
    requiresGuild: true,
    category: 'settings',
  },

  build: () => {
    return new SlashCommandBuilder()
      .setName('set-reminders')
      .setDescription('Configure how far in advance reminders fire before a task is due');
  },

  execute: async (interaction: ChatInputCommandInteraction | ButtonInteraction) => {
    const guildId = interaction.guildId!;
    const config = await ServerConfig.findOne({ guildId }).lean();
    const current = config?.reminderCadence ?? [];
    const currentLabel = current.length === 0 ? '_off_' : current.join(', ');

    const matchedPreset = PRESETS.find(p => arraysEqual(p.cadence, current));

    const select = new StringSelectMenuBuilder()
      .setCustomId('rem-pick')
      .setPlaceholder('Choose a preset');

    for (const preset of PRESETS) {
      select.addOptions(
        new StringSelectMenuOptionBuilder()
          .setLabel(preset.label)
          .setValue(preset.value)
          .setDefault(matchedPreset?.value === preset.value),
      );
    }

    const components: any[] = [
      new TextDisplayBuilder().setContent('# ⏰ Reminder Cadence'),
      new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small),
      new TextDisplayBuilder().setContent(
        `Current cadence: **${currentLabel}**\n\nReminders fire at each offset before a task is due. Use a preset or enter a custom list.`,
      ),
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select),
      new SectionBuilder()
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent('Enter custom offsets (e.g. `7d,3d,1d,4h,1h`)'),
        )
        .setButtonAccessory(
          new ButtonBuilder()
            .setCustomId('rem-custom')
            .setLabel('Custom...')
            .setStyle(ButtonStyle.Secondary),
        ),
    ];

    const message = await interaction.reply({
      components,
      flags: [MessageFlags.IsComponentsV2],
      ephemeral: true,
      fetchReply: true,
    });

    const collector = message.createMessageComponentCollector({
      filter: (i: any) => i.user.id === interaction.user.id,
      time: COLLECTOR_TIMEOUT,
    });

    collector.on('collect', async (i: any) => {
      if (i.customId === 'rem-pick') {
        const preset = PRESETS.find(p => p.value === i.values[0]);
        if (preset) {
          await saveCadence(i, guildId, preset.cadence);
          collector.stop();
        }
      } else if (i.customId === 'rem-custom') {
        await handleCustomCadence(i, guildId);
        collector.stop();
      }
    });
  },
};

async function handleCustomCadence(interaction: ButtonInteraction, guildId: string) {
  const modal = new ModalBuilder()
    .setCustomId('rem-custom-modal')
    .setTitle('Custom Reminder Cadence');

  const input = new TextInputBuilder()
    .setCustomId('rem-input')
    .setLabel('Offsets (comma-separated)')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('e.g., 7d,3d,1d,4h,1h')
    .setRequired(true)
    .setMaxLength(120);

  modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input));

  await interaction.showModal(modal);

  try {
    const submit = await interaction.awaitModalSubmit({
      filter: (i: ModalSubmitInteraction) =>
        i.customId === 'rem-custom-modal' && i.user.id === interaction.user.id,
      time: 300000,
    });

    const raw = submit.fields.getTextInputValue('rem-input').trim();
    const parsed = parseCadence(raw);

    if (parsed === null) {
      await submit.reply({
        components: [
          new TextDisplayBuilder().setContent(
            `❌ Invalid cadence. Use comma-separated offsets like \`7d,3d,1d,4h,1h\`. Allowed units: \`d\` (days), \`h\` (hours), \`m\` (minutes).`,
          ),
        ],
        flags: [MessageFlags.IsComponentsV2],
        ephemeral: true,
      });
      return;
    }

    await saveCadence(submit, guildId, parsed);
  } catch {
    // Timeout — normal flow
  }
}

async function saveCadence(interaction: any, guildId: string, cadence: string[]) {
  await ServerConfig.findOneAndUpdate(
    { guildId },
    { $set: { reminderCadence: cadence } },
    { upsert: true, new: true },
  );

  const summary = cadence.length === 0 ? '_off_' : cadence.join(', ');
  const components = [
    new TextDisplayBuilder().setContent('# ✅ Reminders Updated'),
    new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small),
    new TextDisplayBuilder().setContent(`Reminder cadence is now **${summary}**.`),
  ];

  if (interaction.isModalSubmit?.()) {
    await interaction.reply({
      components,
      flags: [MessageFlags.IsComponentsV2],
      ephemeral: true,
    });
  } else {
    await interaction.update({ components });
  }
}

/**
 * Parses a cadence string like "7d,3d,1d,4h,1h" into a normalized string array.
 * Returns null if the input is malformed or contains zero/negative offsets.
 */
function parseCadence(raw: string): string[] | null {
  if (!raw) return [];
  const parts = raw.split(',').map(s => s.trim()).filter(Boolean);
  const normalized: string[] = [];

  for (const part of parts) {
    const match = part.match(/^(\d+)([dhm])$/i);
    if (!match) return null;

    const amount = parseInt(match[1], 10);
    if (amount <= 0) return null;

    normalized.push(`${amount}${match[2].toLowerCase()}`);
  }

  return normalized;
}

function arraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((v, i) => v === b[i]);
}
