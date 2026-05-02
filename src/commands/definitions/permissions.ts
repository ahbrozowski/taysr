import {
  ChatInputCommandInteraction,
  ButtonInteraction,
  SlashCommandBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  RoleSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  TextDisplayBuilder,
  SectionBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  PermissionFlagsBits,
} from 'discord.js';
import { Command, commandRegistry } from '../registry';
import { CommandPermission } from '../../models/CommandPermission';
import { ServerConfig } from '../../models/ServerConfig';

const COLLECTOR_TIMEOUT = 120000;

/** Get all guild commands that can have permissions configured */
function getConfigurableCommands() {
  return commandRegistry.getImplemented()
    .filter(c => c.metadata.requiresGuild)
    .sort((a, b) => a.metadata.name.localeCompare(b.metadata.name));
}

export const permissionsCommand: Command = {
  metadata: {
    name: 'permissions',
    emoji: '🔒',
    description: 'Manage command permissions',
    implemented: true,
    requiresGuild: true,
    category: 'settings',
  },

  build: () => {
    return new SlashCommandBuilder()
      .setName('permissions')
      .setDescription('Manage which roles can use each command (admin only)')
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);
  },

  execute: async (interaction: ChatInputCommandInteraction | ButtonInteraction) => {
    await showRolesList(interaction);
  },
};

// ── Roles List (main view) ────────────────────────────────────────────

async function showRolesList(
  interaction: ChatInputCommandInteraction | ButtonInteraction,
  options: { refresh?: boolean } = {},
) {
  const guildId = interaction.guildId!;
  const perms = await CommandPermission.find({ guildId }).lean();
  const config = await ServerConfig.findOne({ guildId }).lean();
  const lockdown = config?.lockdownEnabled ?? false;
  const allAccessRoleIds = new Set(config?.allAccessRoleIds ?? []);

  // Build a map: roleId → [commandNames]
  const roleMap = new Map<string, string[]>();
  for (const p of perms) {
    for (const roleId of p.roleIds) {
      const existing = roleMap.get(roleId) ?? [];
      existing.push(p.commandName);
      roleMap.set(roleId, existing);
    }
  }

  // Surface all-access roles even if they have no per-command grants
  for (const roleId of allAccessRoleIds) {
    if (!roleMap.has(roleId)) roleMap.set(roleId, []);
  }

  const components: any[] = [
    new TextDisplayBuilder().setContent('# 🔒 Command Permissions'),
    new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small),
    new SectionBuilder()
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          lockdown
            ? '**Lockdown: ON** — commands without roles configured are denied by default.'
            : '**Lockdown: OFF** — commands without roles configured are public.',
        ),
      )
      .setButtonAccessory(
        new ButtonBuilder()
          .setCustomId('perm-lockdown-toggle')
          .setLabel(lockdown ? 'Disable Lockdown' : 'Enable Lockdown')
          .setStyle(lockdown ? ButtonStyle.Danger : ButtonStyle.Primary),
      ),
    new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small),
  ];

  if (roleMap.size === 0) {
    components.push(
      new TextDisplayBuilder().setContent(
        'No roles configured yet. Add a role to grant it command access or all-access.',
      ),
    );
  } else {
    components.push(
      new TextDisplayBuilder().setContent('Configured roles:'),
    );

    for (const [roleId, cmdNames] of roleMap) {
      const role = interaction.guild?.roles.cache.get(roleId);
      const roleName = role
        ? (role.name.startsWith('@') ? role.name : `@${role.name}`)
        : `*Deleted role*`;
      const isAllAccess = allAccessRoleIds.has(roleId);

      let summary: string;
      if (isAllAccess) {
        summary = '🔑 **All-access** (bypasses every permission check)';
      } else {
        const cmdCount = cmdNames.length;
        summary = cmdCount === 1 ? '1 command' : `${cmdCount} commands`;
      }

      components.push(
        new SectionBuilder()
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`**${roleName}** — ${summary}`),
          )
          .setButtonAccessory(
            new ButtonBuilder()
              .setCustomId(`perm-role:${roleId}`)
              .setLabel('Configure')
              .setStyle(ButtonStyle.Secondary),
          ),
      );
    }
  }

  const addRoleSelect = new RoleSelectMenuBuilder()
    .setCustomId('perm-add-role')
    .setPlaceholder('Add a role...');

  components.push(
    new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small),
    new ActionRowBuilder<RoleSelectMenuBuilder>().addComponents(addRoleSelect),
  );

  let message: any;
  if (options.refresh) {
    await (interaction as any).update({ components });
    message = await (interaction as any).fetchReply();
  } else {
    message = await interaction.reply({
      components,
      flags: [MessageFlags.IsComponentsV2],
      ephemeral: true,
      fetchReply: true,
    });
  }

  const collector = message!.createMessageComponentCollector({
    filter: (i: any) =>
      i.user.id === interaction.user.id &&
      (i.customId.startsWith('perm-role:') ||
       i.customId === 'perm-add-role' ||
       i.customId === 'perm-lockdown-toggle'),
    max: 1,
    time: COLLECTOR_TIMEOUT,
  });

  collector.on('collect', async (i: any) => {
    if (i.customId === 'perm-lockdown-toggle') {
      await ServerConfig.findOneAndUpdate(
        { guildId },
        { $set: { lockdownEnabled: !lockdown } },
        { upsert: true },
      );
      await showRolesList(i, { refresh: true });
    } else if (i.customId === 'perm-add-role') {
      const roleId = i.values[0];
      await showRoleDetail(i, roleId);
    } else if (i.customId.startsWith('perm-role:')) {
      const roleId = i.customId.replace('perm-role:', '');
      await showRoleDetail(i, roleId);
    }
  });
}

// ── Role Detail (command toggles) ─────────────────────────────────────

async function showRoleDetail(interaction: any, roleId: string) {
  const guildId = interaction.guildId!;
  const role = interaction.guild?.roles.cache.get(roleId);
  const roleName = role ? `@${role.name}` : `*Deleted role*`;

  const perms = await CommandPermission.find({ guildId }).lean();
  const roleCommands = new Set<string>();
  for (const p of perms) {
    if (p.roleIds.includes(roleId)) {
      roleCommands.add(p.commandName);
    }
  }

  const config = await ServerConfig.findOne({ guildId }).lean();
  const isAllAccess = (config?.allAccessRoleIds ?? []).includes(roleId);

  const commands = getConfigurableCommands();

  const components: any[] = [
    new TextDisplayBuilder().setContent(`# 🔒 ${roleName}`),
    new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small),
    new SectionBuilder()
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          isAllAccess
            ? '🔑 **All-access enabled** — this role bypasses every permission check, including any commands added later.'
            : 'Grant this role access to every command (current and future) in one toggle.',
        ),
      )
      .setButtonAccessory(
        new ButtonBuilder()
          .setCustomId(`perm-allaccess:${roleId}`)
          .setLabel(isAllAccess ? 'Revoke All-Access' : 'Grant All-Access')
          .setStyle(isAllAccess ? ButtonStyle.Danger : ButtonStyle.Primary),
      ),
    new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small),
    new TextDisplayBuilder().setContent(
      isAllAccess
        ? 'Per-command grants below are still tracked but redundant while all-access is on:'
        : 'Select commands this role can access:',
    ),
  ];

  const select = new StringSelectMenuBuilder()
    .setCustomId(`perm-toggle:${roleId}`)
    .setPlaceholder('Select commands...')
    .setMinValues(0)
    .setMaxValues(commands.length);

  for (const cmd of commands) {
    const hasAccess = roleCommands.has(cmd.metadata.name);
    select.addOptions(
      new StringSelectMenuOptionBuilder()
        .setLabel(`/${cmd.metadata.name}`)
        .setValue(cmd.metadata.name)
        .setDescription(cmd.metadata.description)
        .setEmoji(cmd.metadata.emoji)
        .setDefault(hasAccess),
    );
  }

  components.push(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select));

  const buttons: ButtonBuilder[] = [];

  if (roleCommands.size > 0) {
    buttons.push(
      new ButtonBuilder()
        .setCustomId(`perm-remove-role:${roleId}`)
        .setLabel('Remove All')
        .setStyle(ButtonStyle.Danger),
    );
  }

  buttons.push(
    new ButtonBuilder()
      .setCustomId('perm-back')
      .setLabel('Back')
      .setStyle(ButtonStyle.Secondary),
  );

  components.push(new ActionRowBuilder<ButtonBuilder>().addComponents(buttons));

  await interaction.update({ components });
  const message = await interaction.fetchReply();

  const collector = message.createMessageComponentCollector({
    filter: (i: any) =>
      i.user.id === interaction.user.id &&
      (i.customId === `perm-toggle:${roleId}` ||
       i.customId === `perm-remove-role:${roleId}` ||
       i.customId === `perm-allaccess:${roleId}` ||
       i.customId === 'perm-back'),
    max: 1,
    time: COLLECTOR_TIMEOUT,
  });

  collector.on('collect', async (i: any) => {
    if (i.customId === 'perm-back') {
      await showRolesList(i, { refresh: true });
    } else if (i.customId === `perm-allaccess:${roleId}`) {
      if (isAllAccess) {
        await ServerConfig.findOneAndUpdate(
          { guildId },
          { $pull: { allAccessRoleIds: roleId } },
        );
      } else {
        await ServerConfig.findOneAndUpdate(
          { guildId },
          { $addToSet: { allAccessRoleIds: roleId } },
          { upsert: true },
        );
      }
      await showRoleDetail(i, roleId);
    } else if (i.customId === `perm-remove-role:${roleId}`) {
      await CommandPermission.updateMany(
        { guildId },
        { $pull: { roleIds: roleId } },
      );
      await CommandPermission.deleteMany({ guildId, roleIds: { $size: 0 } });
      await showRolesList(i, { refresh: true });
    } else if (i.customId === `perm-toggle:${roleId}`) {
      const selectedCommands = new Set<string>(i.values);
      const allCommands = commands.map(c => c.metadata.name);

      for (const cmdName of allCommands) {
        if (selectedCommands.has(cmdName) && !roleCommands.has(cmdName)) {
          await CommandPermission.findOneAndUpdate(
            { guildId, commandName: cmdName },
            { $addToSet: { roleIds: roleId } },
            { upsert: true },
          );
        } else if (!selectedCommands.has(cmdName) && roleCommands.has(cmdName)) {
          await CommandPermission.findOneAndUpdate(
            { guildId, commandName: cmdName },
            { $pull: { roleIds: roleId } },
          );
        }
      }

      await CommandPermission.deleteMany({ guildId, roleIds: { $size: 0 } });
      await showRoleDetail(i, roleId);
    }
  });
}

