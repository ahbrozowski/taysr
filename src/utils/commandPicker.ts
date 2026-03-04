import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChatInputCommandInteraction,
  ButtonInteraction,
  GuildMember,
  MessageFlags,
  TextDisplayBuilder,
  SectionBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
} from 'discord.js';
import { Command, commandRegistry } from '../commands/registry';
import { executeCommand } from '../commands/executor';
import { getAccessibleCommands } from './permissions';

interface PickerState {
  page: number;
  implemented: Command[];
  planned: Command[];
  all: Command[];
}

const COMMANDS_PER_PAGE = 8;
const SELECTION_TIMEOUT = 60000;

function getDisplayCommands() {
  const implemented = commandRegistry.getImplemented()
    .filter((c) => c.metadata.name !== 'help' && c.metadata.name !== 'settings' && c.metadata.emoji !== '📋' && c.metadata.category !== 'settings');
  const planned = commandRegistry.getPlanned();

  // Settings goes at the bottom of implemented commands
  const settings = commandRegistry.get('settings');
  if (settings?.metadata.implemented) {
    implemented.push(settings);
  }

  return { implemented, planned, all: [...implemented, ...planned] };
}

function render(state: PickerState) {
  const { implemented, all } = state;
  const totalPages = Math.ceil(all.length / COMMANDS_PER_PAGE);
  const start = state.page * COMMANDS_PER_PAGE;
  const pageCommands = all.slice(start, start + COMMANDS_PER_PAGE);
  const implementedCount = implemented.length;

  const components: any[] = [
    new TextDisplayBuilder().setContent('# 📋 Taysr Task Manager\nChoose a command:'),
    new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small),
  ];

  let passedBoundary = false;

  for (let i = 0; i < pageCommands.length; i++) {
    const command = pageCommands[i];
    const globalIndex = start + i;

    // Add "Coming Soon" header at the boundary between implemented and planned
    if (!passedBoundary && globalIndex >= implementedCount) {
      passedBoundary = true;
      components.push(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small));
      components.push(new TextDisplayBuilder().setContent('## 🚧 Coming Soon'));
    }

    components.push(
      new SectionBuilder()
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            command.metadata.implemented
              ? `${command.metadata.emoji} **${command.metadata.description}**`
              : `${command.metadata.emoji} ${command.metadata.description}`
          )
        )
        .setButtonAccessory(
          new ButtonBuilder()
            .setCustomId(`cmd:${command.metadata.name}`)
            .setLabel(command.metadata.implemented ? 'Run' : 'Coming Soon')
            .setStyle(command.metadata.implemented ? ButtonStyle.Primary : ButtonStyle.Secondary)
        )
    );
  }

  if (totalPages > 1) {
    components.push(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId('picker_prev')
          .setLabel('Previous')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(state.page === 0),
        new ButtonBuilder()
          .setCustomId('picker_next')
          .setLabel('Next')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(state.page >= totalPages - 1)
      )
    );
  }

  return components;
}

export async function showCommandPicker(
  interaction: ChatInputCommandInteraction | ButtonInteraction
): Promise<void> {
  // Pre-filter commands by user permissions (one DB query, reused across pages)
  const { implemented, planned } = getDisplayCommands();
  const allCommands = [...implemented, ...planned];

  let filteredImplemented = implemented;
  let filteredPlanned = planned;

  if (interaction.guildId && interaction.member) {
    const member = interaction.member as GuildMember;
    const allNames = allCommands.map(c => c.metadata.name);
    const accessible = await getAccessibleCommands(member, interaction.guildId, allNames);

    filteredImplemented = implemented.filter(c => accessible.has(c.metadata.name));
    filteredPlanned = planned.filter(c => accessible.has(c.metadata.name));
  }

  const state: PickerState = {
    page: 0,
    implemented: filteredImplemented,
    planned: filteredPlanned,
    all: [...filteredImplemented, ...filteredPlanned],
  };

  let message;
  if (interaction instanceof ButtonInteraction) {
    await interaction.update({ components: render(state) });
    message = await interaction.fetchReply();
  } else {
    message = await interaction.reply({
      components: render(state),
      flags: [MessageFlags.IsComponentsV2],
      ephemeral: true,
      fetchReply: true,
    });
  }

  const collector = message.createMessageComponentCollector({ time: SELECTION_TIMEOUT });

  collector.on('collect', async (i: any) => {
    if (i.customId === 'picker_prev') {
      state.page = Math.max(0, state.page - 1);
      await i.update({ components: render(state) });
    } else if (i.customId === 'picker_next') {
      state.page += 1;
      await i.update({ components: render(state) });
    } else if (i.customId.startsWith('cmd:')) {
      const commandName = i.customId.replace('cmd:', '');
      collector.stop();
      // Delete the picker message so it doesn't linger as a dead UI
      await interaction.deleteReply().catch(() => {});
      await executeCommand(commandName, i);
    }
  });

  collector.on('end', async (_collected: any, reason: string) => {
    if (reason === 'time') {
      await showTimeoutView(interaction, state);
    }
  });
}

async function showTimeoutView(
  interaction: ChatInputCommandInteraction | ButtonInteraction,
  state: PickerState
): Promise<void> {
  const { implemented, planned } = state;

  const components = [
    new TextDisplayBuilder().setContent('# 📋 Taysr Task Manager\n\n_Selection timed out._'),
    new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small),
  ];

  const availableLines = ['## ✅ Available Commands'];
  for (const command of implemented) {
    availableLines.push(
      `${command.metadata.emoji} **${command.metadata.description}** - Use \`/${command.metadata.name}\``
    );
  }
  components.push(new TextDisplayBuilder().setContent(availableLines.join('\n')));

  if (planned.length > 0) {
    components.push(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small));
    const plannedLines = ['## 🚧 Coming Soon'];
    for (const command of planned) {
      plannedLines.push(`${command.metadata.emoji} ${command.metadata.description}`);
    }
    components.push(new TextDisplayBuilder().setContent(plannedLines.join('\n')));
  }

  components.push(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small));
  components.push(new TextDisplayBuilder().setContent('_Use slash commands to run commands directly._'));

  try {
    await interaction.editReply({ components });
  } catch {
    // Ignore if we can't edit
  }
}
