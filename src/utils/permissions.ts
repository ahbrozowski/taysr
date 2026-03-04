import {
  ChatInputCommandInteraction,
  ButtonInteraction,
  GuildMember,
  PermissionFlagsBits,
} from 'discord.js';
import { CommandPermission } from '../models/CommandPermission';
import { CommandMetadata } from '../commands/registry';

export interface PermissionCheckResult {
  allowed: boolean;
  reason?: string;
}

/**
 * Checks if a user has permission to run a command in a guild.
 *
 * Rules:
 * 1. Non-guild context → allowed
 * 2. Can't resolve GuildMember → denied
 * 3. User has Discord Administrator → always allowed
 * 4. No CommandPermission doc for this command → public (allowed)
 * 5. Doc exists with roleIds → user must have at least one
 * 6. No match → denied with required role names
 */
export async function checkCommandPermission(
  interaction: ChatInputCommandInteraction | ButtonInteraction,
  metadata: CommandMetadata,
): Promise<PermissionCheckResult> {
  if (!interaction.guildId) {
    return { allowed: true };
  }

  const member = interaction.member as GuildMember | null;
  if (!member) {
    return { allowed: false, reason: 'Could not resolve your server membership.' };
  }

  // Discord admins always bypass
  if (member.permissions.has(PermissionFlagsBits.Administrator)) {
    return { allowed: true };
  }

  // Check CommandPermission for this specific command
  const perm = await CommandPermission.findOne({
    guildId: interaction.guildId,
    commandName: metadata.name,
  }).lean();

  // No doc or empty roleIds → public
  if (!perm || !perm.roleIds || perm.roleIds.length === 0) {
    return { allowed: true };
  }

  // Check if user has at least one allowed role
  const memberRoleIds = member.roles.cache.map(r => r.id);
  if (perm.roleIds.some(roleId => memberRoleIds.includes(roleId))) {
    return { allowed: true };
  }

  // Build readable role list for the denial message
  const roleNames = perm.roleIds
    .map(id => {
      const role = interaction.guild?.roles.cache.get(id);
      return role ? `@${role.name}` : `<@&${id}>`;
    })
    .join(', ');

  return {
    allowed: false,
    reason: `You need one of these roles to use this command: ${roleNames}`,
  };
}

/**
 * Checks which commands a user can access in a guild.
 * Returns the set of command names the user is allowed to use.
 * Used by the command picker to filter visible commands.
 */
export async function getAccessibleCommands(
  member: GuildMember,
  guildId: string,
  commandNames: string[],
): Promise<Set<string>> {
  // Admins can access everything
  if (member.permissions.has(PermissionFlagsBits.Administrator)) {
    return new Set(commandNames);
  }

  // Fetch all permissions for this guild in one query
  const perms = await CommandPermission.find({ guildId }).lean();
  const permMap = new Map<string, string[]>();
  for (const perm of perms) {
    if (perm.roleIds.length > 0) {
      permMap.set(perm.commandName, perm.roleIds);
    }
  }

  const memberRoleIds = member.roles.cache.map(r => r.id);
  const accessible = new Set<string>();

  for (const name of commandNames) {
    const allowedRoles = permMap.get(name);
    if (!allowedRoles) {
      // No restrictions — public
      accessible.add(name);
    } else if (allowedRoles.some(roleId => memberRoleIds.includes(roleId))) {
      accessible.add(name);
    }
  }

  return accessible;
}
