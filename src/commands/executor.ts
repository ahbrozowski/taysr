import {
  ChatInputCommandInteraction,
  ButtonInteraction,
  MessageFlags,
  TextDisplayBuilder,
} from 'discord.js';
import { commandRegistry } from './registry';
import { getConstructionMessage } from '../utils/messages';
import { checkCommandPermission } from '../utils/permissions';

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

  await interaction.reply({
    components,
    flags: [MessageFlags.IsComponentsV2],
    ephemeral: true,
  });
}

/**
 * Shows an ephemeral error message, handling already-replied interactions
 */
async function showErrorMessage(
  interaction: ChatInputCommandInteraction | ButtonInteraction,
  content: string
): Promise<void> {
  const components = [new TextDisplayBuilder().setContent(content)];

  try {
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({
        components,
        flags: [MessageFlags.IsComponentsV2],
        ephemeral: true,
      });
    } else {
      await interaction.reply({
        components,
        flags: [MessageFlags.IsComponentsV2],
        ephemeral: true,
      });
    }
  } catch (error) {
    console.error('Failed to show error message:', error);
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
  await interaction.reply({
    components: [new TextDisplayBuilder().setContent(message)],
    flags: [MessageFlags.IsComponentsV2],
    ephemeral: true,
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
    await showErrorMessage(interaction, `❌ An error occurred while executing the command.\n\nTry using \`/${commandName}\` directly.`);
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
      await showErrorMessage(interaction, `❌ An error occurred while executing the command.\n\nTry using \`/${commandName}\` directly.`);
    }
    return;
  }

  // Validate guild context if required
  if (!validateGuildContext(interaction, command.metadata.requiresGuild)) {
    await showGuildRequiredError(interaction);
    return;
  }

  // Check permissions
  const permCheck = await checkCommandPermission(interaction, command.metadata);
  if (!permCheck.allowed) {
    await showErrorMessage(interaction, `🔒 **Permission Denied**\n\n${permCheck.reason!}`);
    return;
  }

  // Execute the command
  try {
    await command.execute(interaction);
  } catch (error) {
    console.error(`Error executing command ${commandName}:`, error);
    await showErrorMessage(interaction, `❌ An error occurred while executing the command.\n\nTry using \`/${commandName}\` directly.`);
  }
}
