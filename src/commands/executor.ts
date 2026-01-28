import {
  ChatInputCommandInteraction,
  ButtonInteraction,
  MessageFlags,
  TextDisplayBuilder,
} from 'discord.js';
import { commandRegistry } from './registry';
import { getConstructionMessage } from '../utils/messages';

/**
 * Validates that the interaction has a guild context when required
 */
function validateGuildContext(
  interaction: ChatInputCommandInteraction | ButtonInteraction,
  requiresGuild: boolean
): boolean {
  if (requiresGuild && !interaction.guildId) {
    return false;
  }
  return true;
}

/**
 * Shows an error message for missing guild context
 */
async function showGuildRequiredError(
  interaction: ChatInputCommandInteraction | ButtonInteraction
): Promise<void> {
  const components = [
    new TextDisplayBuilder().setContent('❌ This command can only be used in a server.')
  ];

  if (interaction instanceof ButtonInteraction) {
    await interaction.update({ components });
  } else {
    await interaction.reply({
      components,
      flags: [MessageFlags.IsComponentsV2, MessageFlags.Ephemeral],
    });
  }
}

/**
 * Shows an error message for generic execution failures
 */
async function showExecutionError(
  interaction: ChatInputCommandInteraction | ButtonInteraction,
  commandName: string
): Promise<void> {
  const components = [
    new TextDisplayBuilder().setContent(
      `❌ An error occurred while executing the command.\n\nTry using \`/${commandName}\` directly.`
    )
  ];

  try {
    if (interaction instanceof ButtonInteraction) {
      await interaction.update({ components });
    } else if (interaction.replied || interaction.deferred) {
      await interaction.followUp({
        components,
        flags: [MessageFlags.IsComponentsV2, MessageFlags.Ephemeral],
      });
    } else {
      await interaction.reply({
        components,
        flags: [MessageFlags.IsComponentsV2, MessageFlags.Ephemeral],
      });
    }
  } catch (error) {
    console.error('Failed to show execution error:', error);
  }
}

/**
 * Shows a construction message for unimplemented commands
 */
async function showConstructionMessage(
  interaction: ButtonInteraction,
  commandName: string
): Promise<void> {
  const message = getConstructionMessage(`/${commandName}`);
  await interaction.update({
    components: [new TextDisplayBuilder().setContent(message)],
  });
}

/**
 * Executes a command by name with the given interaction
 * Handles validation, error handling, and routing
 */
export async function executeCommand(
  commandName: string,
  interaction: ChatInputCommandInteraction | ButtonInteraction
): Promise<void> {
  // Find the command in the registry
  const command = commandRegistry.get(commandName);

  if (!command) {
    console.error(`Command not found in registry: ${commandName}`);
    await showExecutionError(interaction, commandName);
    return;
  }

  // Check if command is implemented
  if (!command.metadata.implemented) {
    // Only show construction message for button interactions (from picker)
    if (interaction instanceof ButtonInteraction) {
      await showConstructionMessage(interaction, commandName);
    } else {
      // For slash commands, this shouldn't happen as planned commands aren't registered
      console.error(`Unimplemented command invoked via slash: ${commandName}`);
      await showExecutionError(interaction, commandName);
    }
    return;
  }

  // Validate guild context if required
  if (!validateGuildContext(interaction, command.metadata.requiresGuild)) {
    await showGuildRequiredError(interaction);
    return;
  }

  // Execute the command
  try {
    await command.execute(interaction);
  } catch (error) {
    console.error(`Error executing command ${commandName}:`, error);
    await showExecutionError(interaction, commandName);
  }
}
