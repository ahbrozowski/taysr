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

const COMMON_TIMEZONES = [
  'UTC',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Phoenix',
  'America/Anchorage',
  'Pacific/Honolulu',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Europe/Athens',
  'Asia/Tokyo',
  'Asia/Shanghai',
  'Asia/Kolkata',
  'Australia/Sydney',
];

export const setTimezoneCommand: Command = {
  metadata: {
    name: 'set-timezone',
    emoji: '🌍',
    description: 'Set server timezone',
    implemented: true,
    requiresGuild: true,
    category: 'settings',
  },

  build: () => {
    return new SlashCommandBuilder()
      .setName('set-timezone')
      .setDescription('Set the server timezone for due dates and reminders');
  },

  execute: async (interaction: ChatInputCommandInteraction | ButtonInteraction) => {
    const guildId = interaction.guildId!;
    const config = await ServerConfig.findOne({ guildId }).lean();
    const current = config?.timezone || 'UTC';

    const tzSelect = new StringSelectMenuBuilder()
      .setCustomId('tz-pick')
      .setPlaceholder('Choose a common timezone');

    for (const tz of COMMON_TIMEZONES) {
      tzSelect.addOptions(
        new StringSelectMenuOptionBuilder()
          .setLabel(tz)
          .setValue(tz)
          .setDefault(tz === current),
      );
    }

    const components: any[] = [
      new TextDisplayBuilder().setContent('# 🌍 Server Timezone'),
      new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small),
      new TextDisplayBuilder().setContent(
        `Current timezone: **${current}**\n\nPick from the list below or enter a custom IANA name.`,
      ),
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(tzSelect),
      new SectionBuilder()
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent('Enter a custom IANA timezone (e.g. `America/Toronto`)'),
        )
        .setButtonAccessory(
          new ButtonBuilder()
            .setCustomId('tz-custom')
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
      if (i.customId === 'tz-pick') {
        const tz = i.values[0];
        await saveTimezone(i, guildId, tz);
        collector.stop();
      } else if (i.customId === 'tz-custom') {
        await handleCustomTimezone(i, guildId);
        collector.stop();
      }
    });
  },
};

async function handleCustomTimezone(interaction: ButtonInteraction, guildId: string) {
  const modal = new ModalBuilder()
    .setCustomId('tz-custom-modal')
    .setTitle('Custom Timezone');

  const tzInput = new TextInputBuilder()
    .setCustomId('tz-name')
    .setLabel('IANA Timezone Name')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('e.g., America/Toronto, Europe/Madrid')
    .setRequired(true)
    .setMaxLength(64);

  modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(tzInput));

  await interaction.showModal(modal);

  try {
    const submit = await interaction.awaitModalSubmit({
      filter: (i: ModalSubmitInteraction) =>
        i.customId === 'tz-custom-modal' && i.user.id === interaction.user.id,
      time: 300000,
    });

    const tz = submit.fields.getTextInputValue('tz-name').trim();

    if (!isValidTimezone(tz)) {
      await submit.reply({
        components: [
          new TextDisplayBuilder().setContent(
            `❌ **${tz}** is not a valid IANA timezone. Try names like \`America/New_York\` or \`Europe/Paris\`.`,
          ),
        ],
        flags: [MessageFlags.IsComponentsV2],
        ephemeral: true,
      });
      return;
    }

    await saveTimezone(submit, guildId, tz);
  } catch {
    // Timeout — normal flow
  }
}

async function saveTimezone(
  interaction: any,
  guildId: string,
  timezone: string,
) {
  await ServerConfig.findOneAndUpdate(
    { guildId },
    { $set: { timezone } },
    { upsert: true, new: true },
  );

  const components = [
    new TextDisplayBuilder().setContent('# ✅ Timezone Updated'),
    new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small),
    new TextDisplayBuilder().setContent(`Server timezone is now **${timezone}**.`),
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

function isValidTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

