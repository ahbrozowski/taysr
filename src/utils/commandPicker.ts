import {
  ButtonBuilder,
  ButtonStyle,
  ChatInputCommandInteraction,
  ButtonInteraction,
  ComponentType,
  MessageFlags,
  TextDisplayBuilder,
  SectionBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
} from 'discord.js';
import { commandRegistry } from '../commands/registry';
import { executeCommand } from '../commands/executor';

const MAX_COMPONENTS = 35;
const SELECTION_TIMEOUT = 60000;

/**
 * Shows an interactive command picker UI
 */
export async function showCommandPicker(
  interaction: ChatInputCommandInteraction | ButtonInteraction
): Promise<void> {
  const implementedCommands = commandRegistry.getImplemented();
  const plannedCommands = commandRegistry.getPlanned();

  // Build Components V2 layout
  const components = [];

  // Header
  components.push(
    new TextDisplayBuilder().setContent('# 📋 Taysr Task Manager\nChoose a command:')
  );

  components.push(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small));

  // Available Commands Section
  for (const command of implementedCommands) {
    // Skip the help/taysr command itself to avoid recursion
    if (command.metadata.name === 'help' || command.metadata.emoji === '📋') {
      continue;
    }

    components.push(
      new SectionBuilder()
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            `${command.metadata.emoji} **${command.metadata.description}**`
          )
        )
        .setButtonAccessory(
          new ButtonBuilder()
            .setCustomId(`cmd:${command.metadata.name}`)
            .setLabel('Run')
            .setStyle(ButtonStyle.Primary)
        )
    );
  }

  // Only show planned section if there are planned commands
  if (plannedCommands.length > 0) {
    components.push(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small));

    // Coming Soon header
    components.push(
      new TextDisplayBuilder().setContent('## 🚧 Coming Soon')
    );

    // Planned Commands
    for (const command of plannedCommands) {
      components.push(
        new SectionBuilder()
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
              `${command.metadata.emoji} ${command.metadata.description}`
            )
          )
          .setButtonAccessory(
            new ButtonBuilder()
              .setCustomId(`cmd:${command.metadata.name}`)
              .setLabel('Coming Soon')
              .setStyle(ButtonStyle.Secondary)
          )
      );

      // Limit total components
      if (components.length >= MAX_COMPONENTS) break;
    }
  }

  // Send the interactive picker
  if (interaction instanceof ButtonInteraction) {
    await interaction.update({
      components: components,
    });
  } else {
    await interaction.reply({
      components: components,
      flags: [MessageFlags.IsComponentsV2, MessageFlags.Ephemeral],
    });
  }

  // Wait for button click
  try {
    const buttonInteraction = await interaction.channel?.awaitMessageComponent({
      filter: (i) => i.user.id === interaction.user.id && i.customId.startsWith('cmd:'),
      componentType: ComponentType.Button,
      time: SELECTION_TIMEOUT,
    }) as ButtonInteraction;

    const commandName = buttonInteraction.customId.replace('cmd:', '');

    // Use the executor to handle the command
    await executeCommand(commandName, buttonInteraction);
  } catch (error) {
    // Timeout - show static info view
    await showTimeoutView(interaction, implementedCommands, plannedCommands);
  }
}

/**
 * Shows a static informational view when the selection times out
 */
async function showTimeoutView(
  interaction: ChatInputCommandInteraction | ButtonInteraction,
  implementedCommands: ReturnType<typeof commandRegistry.getImplemented>,
  plannedCommands: ReturnType<typeof commandRegistry.getPlanned>
): Promise<void> {
  const timeoutComponents = [
    new TextDisplayBuilder().setContent('# 📋 Taysr Task Manager\n\n_Selection timed out._'),
    new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small),
  ];

  // Build available commands section dynamically
  const availableLines = ['## ✅ Available Commands'];
  for (const command of implementedCommands) {
    if (command.metadata.name === 'help' || command.metadata.emoji === '📋') {
      continue;
    }
    availableLines.push(
      `${command.metadata.emoji} **${command.metadata.description}** - Use \`/${command.metadata.name}\``
    );
  }
  timeoutComponents.push(new TextDisplayBuilder().setContent(availableLines.join('\n')));

  // Build coming soon section dynamically if there are planned commands
  if (plannedCommands.length > 0) {
    timeoutComponents.push(
      new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
    );

    const plannedLines = ['## 🚧 Coming Soon'];
    for (const command of plannedCommands) {
      plannedLines.push(`${command.metadata.emoji} ${command.metadata.description}`);
    }
    timeoutComponents.push(new TextDisplayBuilder().setContent(plannedLines.join('\n')));
  }

  timeoutComponents.push(
    new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
  );
  timeoutComponents.push(
    new TextDisplayBuilder().setContent(
      '_Use slash commands to run commands directly._'
    )
  );

  try {
    await interaction.editReply({
      components: timeoutComponents,
    });
  } catch {
    // Ignore if we can't edit
  }
}
