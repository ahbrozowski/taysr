import {
  ChatInputCommandInteraction,
  ButtonInteraction,
  GuildMember,
  PermissionFlagsBits,
} from 'discord.js';
import { CommandPermission } from '../models/CommandPermission';
import { ServerConfig } from '../models/ServerConfig';
import { CommandMetadata } from '../commands/registry';

export interface PermissionCheckResult {
  allowed: boolean;
  reason?: string;
}

/**
 * Checks if a user has permission to run a command in a guild.
 *
 * Order:
 * 1. Non-guild context → allowed
 * 2. Can't resolve GuildMember → denied
 * 3. Discord Administrator → allowed
 * 4. Member has any all-access role from ServerConfig → allowed
 * 5. CommandPermission doc with non-empty roleIds → role check
 * 6. No doc + lockdown ON → denied
 * 7. No doc + lockdown OFF → allowed (public default)
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

  if (member.permissions.has(PermissionFlagsBits.Administrator)) {
    return { allowed: true };
  }

  const config = await ServerConfig.findOne({ guildId: interaction.guildId }).lean();
  const memberRoleIds = member.roles.cache.map(r => r.id);

  if (config?.allAccessRoleIds?.some(roleId => memberRoleIds.includes(roleId))) {
    return { allowed: true };
  }

  const perm = await CommandPermission.findOne({
    guildId: interaction.guildId,
    commandName: metadata.name,
  }).lean();

  if (perm && perm.roleIds && perm.roleIds.length > 0) {
    if (perm.roleIds.some(roleId => memberRoleIds.includes(roleId))) {
      return { allowed: true };
    }

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

  if (config?.lockdownEnabled) {
    return {
      allowed: false,
      reason: 'Lockdown is enabled and this command has no roles configured. Ask an admin to grant access via `/permissions`.',
    };
  }

  return { allowed: true };
}

/**
 * Checks which commands a user can access in a guild.
 * Same logic as checkCommandPermission, batched into a single set lookup.
 */
export async function getAccessibleCommands(
  member: GuildMember,
  guildId: string,
  commandNames: string[],
): Promise<Set<string>> {
  if (member.permissions.has(PermissionFlagsBits.Administrator)) {
    return new Set(commandNames);
  }

  const config = await ServerConfig.findOne({ guildId }).lean();
  const memberRoleIds = member.roles.cache.map(r => r.id);

  if (config?.allAccessRoleIds?.some(roleId => memberRoleIds.includes(roleId))) {
    return new Set(commandNames);
  }

  const perms = await CommandPermission.find({ guildId }).lean();
  const permMap = new Map<string, string[]>();
  for (const perm of perms) {
    if (perm.roleIds.length > 0) {
      permMap.set(perm.commandName, perm.roleIds);
    }
  }

  const accessible = new Set<string>();
  const lockdown = config?.lockdownEnabled ?? false;

  for (const name of commandNames) {
    const allowedRoles = permMap.get(name);
    if (allowedRoles) {
      if (allowedRoles.some(roleId => memberRoleIds.includes(roleId))) {
        accessible.add(name);
      }
    } else if (!lockdown) {
      accessible.add(name);
    }
  }

  return accessible;
}
