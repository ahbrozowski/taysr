import { Command, commandRegistry } from './registry';
import { helpCommand } from './definitions/help';
import { createTaysrCommand } from './definitions/taysr';
import { setChannelCommand } from './definitions/set-channel';
import { createCommand } from './definitions/create';
import { refreshCommand } from './definitions/refresh';
import { completeCommand } from './definitions/complete';
import { goalCommand } from './definitions/goal';
import { assignCommand } from './definitions/assign';
import { takeCommand } from './definitions/take';
import { unassignCommand } from './definitions/unassign';
import { deleteCommand } from './definitions/delete';
import { editCommand } from './definitions/edit';
import { listCommand } from './definitions/list';
import { settingsCommand } from './definitions/settings';
import { permissionsCommand } from './definitions/permissions';
import { plannedCommands } from './definitions/planned';

/**
 * Initializes the command registry with all commands
 * @param taysrCommandName - The name for the branded command (e.g., 'taysr' in prod, custom in dev)
 */
export function initializeCommands(taysrCommandName: string): void {
  const taysrCommand = createTaysrCommand(taysrCommandName);

  // Register all implemented commands
  commandRegistry.register(taysrCommand);
  commandRegistry.register(helpCommand);
  commandRegistry.register(setChannelCommand);
  commandRegistry.register(createCommand);
  commandRegistry.register(refreshCommand);
  commandRegistry.register(completeCommand);
  commandRegistry.register(goalCommand);
  commandRegistry.register(assignCommand);
  commandRegistry.register(takeCommand);
  commandRegistry.register(unassignCommand);
  commandRegistry.register(deleteCommand);
  commandRegistry.register(editCommand);
  commandRegistry.register(listCommand);
  commandRegistry.register(settingsCommand);
  commandRegistry.register(permissionsCommand);

  // Register all planned commands
  for (const command of plannedCommands) {
    commandRegistry.register(command);
  }
}

/**
 * Gets all commands for slash command registration
 * Only returns implemented commands (planned commands are not registered as slash commands)
 */
export function getCommandsForRegistration(): Command[] {
  return commandRegistry.getImplemented();
}

export { Command } from './registry';
export { commandRegistry } from './registry';
export { executeCommand } from './executor';
