import {
  ChatInputCommandInteraction,
  ButtonInteraction,
  GuildMember,
  PermissionFlagsBits,
} from 'discord.js';
import { CommandPermission } from '../models/CommandPermission';
import { ServerConfig } from '../models/ServerConfig';
import { commandRegistry, CommandMetadata } from '../commands/registry';

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

  if (metadata.alwaysPublic) {
    return { allowed: true };
  }

  const member = interaction.member as GuildMember | null;
  if (!member) {
    return { allowed: false, reason: 'Could not resolve your server membership.' };
  }

  const userTag = `${member.user?.tag ?? interaction.user.tag} (${interaction.user.id})`;

  if (member.permissions.has(PermissionFlagsBits.Administrator)) {
    console.error(`[perm] ${userTag} → /${metadata.name}: ALLOW (Discord admin)`);
    return { allowed: true };
  }

  const config = await ServerConfig.findOne({ guildId: interaction.guildId }).lean();
  const memberRoleIds = member.roles.cache.map(r => r.id);
  // @everyone always applies — its role ID equals the guild ID
  memberRoleIds.push(interaction.guildId);
  const lockdown = config?.lockdownEnabled ?? false;
  const allAccess = config?.allAccessRoleIds ?? [];

  if (allAccess.some(roleId => memberRoleIds.includes(roleId))) {
    console.error(`[perm] ${userTag} → /${metadata.name}: ALLOW (all-access role)`);
    return { allowed: true };
  }

  const perm = await CommandPermission.findOne({
    guildId: interaction.guildId,
    commandName: metadata.name,
  }).lean();

  if (perm && perm.roleIds && perm.roleIds.length > 0) {
    if (perm.roleIds.some(roleId => memberRoleIds.includes(roleId))) {
      console.error(`[perm] ${userTag} → /${metadata.name}: ALLOW (role grant) memberRoles=[${memberRoleIds.join(',')}] allowed=[${perm.roleIds.join(',')}]`);
      return { allowed: true };
    }

    const roleNames = perm.roleIds
      .map(id => {
        const role = interaction.guild?.roles.cache.get(id);
        return role ? `@${role.name}` : `<@&${id}>`;
      })
      .join(', ');

    console.error(`[perm] ${userTag} → /${metadata.name}: DENY (no matching role) memberRoles=[${memberRoleIds.join(',')}] allowed=[${perm.roleIds.join(',')}]`);
    return {
      allowed: false,
      reason: `You need one of these roles to use this command: ${roleNames}`,
    };
  }

  if (lockdown) {
    console.error(`[perm] ${userTag} → /${metadata.name}: DENY (lockdown, no perm doc) memberRoles=[${memberRoleIds.join(',')}]`);
    return {
      allowed: false,
      reason: 'Lockdown is enabled and this command has no roles configured. Ask an admin to grant access via `/permissions`.',
    };
  }

  console.error(`[perm] ${userTag} → /${metadata.name}: ALLOW (public, lockdown=${lockdown}) memberRoles=[${memberRoleIds.join(',')}]`);
  return { allowed: true };
}

/**
 * Checks which commands a user can access in a guild.
 * Same logic as checkCommandPermission, batched into a single set lookup.
 */
/**
 * Returns true if the user can only operate on tasks assigned to themselves.
 * - Discord admin → false (full access)
 * - Has any all-access role → false
 * - Has at least one ownTasksOnly role AND no unrestricted role grant for this
 *   specific command → true
 * - Otherwise false
 *
 * Public commands (no CommandPermission doc) where the user has any
 * ownTasksOnly role and no unrestricted role still count as restricted —
 * the user's effective profile is "limited member."
 */
export async function isRestrictedToOwnTasks(
  interaction: ChatInputCommandInteraction | ButtonInteraction,
  commandName: string,
): Promise<boolean> {
  if (!interaction.guildId) return false;

  const member = interaction.member as GuildMember | null;
  if (!member) return false;

  if (member.permissions.has(PermissionFlagsBits.Administrator)) return false;

  const config = await ServerConfig.findOne({ guildId: interaction.guildId }).lean();
  const memberRoleIds = member.roles.cache.map(r => r.id);
  memberRoleIds.push(interaction.guildId); // @everyone

  const allAccess = config?.allAccessRoleIds ?? [];
  if (allAccess.some(id => memberRoleIds.includes(id))) return false;

  const ownTasksOnly = config?.ownTasksOnlyRoleIds ?? [];
  const userOwnTasksOnlyRoles = ownTasksOnly.filter(id => memberRoleIds.includes(id));
  if (userOwnTasksOnlyRoles.length === 0) return false;

  // Does the user have any non-ownTasksOnly role that grants this command?
  const perm = await CommandPermission.findOne({
    guildId: interaction.guildId,
    commandName,
  }).lean();

  if (perm && perm.roleIds && perm.roleIds.length > 0) {
    const grantingRolesUserHas = perm.roleIds.filter(id => memberRoleIds.includes(id));
    const unrestrictedGrantingRoles = grantingRolesUserHas.filter(id => !ownTasksOnly.includes(id));
    if (unrestrictedGrantingRoles.length > 0) return false;
  }

  return true;
}

export async function getAccessibleCommands(
  member: GuildMember,
  guildId: string,
  commandNames: string[],
): Promise<Set<string>> {
  const accessible = new Set<string>();

  // Always-public commands bypass everything
  for (const name of commandNames) {
    if (commandRegistry.get(name)?.metadata.alwaysPublic) {
      accessible.add(name);
    }
  }

  if (member.permissions.has(PermissionFlagsBits.Administrator)) {
    return new Set(commandNames);
  }

  const config = await ServerConfig.findOne({ guildId }).lean();
  const memberRoleIds = member.roles.cache.map(r => r.id);
  // @everyone always counts as a "role" the member has
  memberRoleIds.push(guildId);

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

  const lockdown = config?.lockdownEnabled ?? false;

  for (const name of commandNames) {
    if (accessible.has(name)) continue;
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
