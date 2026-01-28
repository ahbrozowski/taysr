import {
  ChatInputCommandInteraction,
  ButtonInteraction,
  SlashCommandBuilder,
  SlashCommandOptionsOnlyBuilder,
} from 'discord.js';

/**
 * Metadata for a command that describes its properties
 */
export interface CommandMetadata {
  /** The command name (used for slash commands and routing) */
  name: string;
  /** Emoji to display in UI */
  emoji: string;
  /** Human-readable description */
  description: string;
  /** Whether this command is fully implemented */
  implemented: boolean;
  /** Whether this command requires a guild (server) context */
  requiresGuild: boolean;
}

/**
 * Standard interface that all commands must implement
 */
export interface Command {
  /** Metadata about the command */
  metadata: CommandMetadata;

  /** Builds the slash command definition for Discord registration */
  build: () => SlashCommandBuilder | SlashCommandOptionsOnlyBuilder;

  /**
   * Executes the command logic
   * Must handle both ChatInputCommandInteraction and ButtonInteraction
   * Must handle all responses internally
   */
  execute: (interaction: ChatInputCommandInteraction | ButtonInteraction) => Promise<void>;
}

/**
 * Central registry for all commands
 */
class CommandRegistry {
  private commands = new Map<string, Command>();

  /**
   * Register a command
   */
  register(command: Command): void {
    this.commands.set(command.metadata.name, command);
  }

  /**
   * Get a command by name
   */
  get(name: string): Command | undefined {
    return this.commands.get(name);
  }

  /**
   * Get all registered commands
   */
  getAll(): Command[] {
    return Array.from(this.commands.values());
  }

  /**
   * Get only implemented commands
   */
  getImplemented(): Command[] {
    return this.getAll().filter(cmd => cmd.metadata.implemented);
  }

  /**
   * Get only planned (unimplemented) commands
   */
  getPlanned(): Command[] {
    return this.getAll().filter(cmd => !cmd.metadata.implemented);
  }

  /**
   * Get command metadata map for easy lookups
   */
  getMetadataMap(): Map<string, CommandMetadata> {
    const map = new Map<string, CommandMetadata>();
    for (const command of this.commands.values()) {
      map.set(command.metadata.name, command.metadata);
    }
    return map;
  }
}

/**
 * Global command registry instance
 */
export const commandRegistry = new CommandRegistry();
