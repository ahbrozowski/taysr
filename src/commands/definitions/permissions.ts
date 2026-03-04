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

async function showRolesList(interaction: ChatInputCommandInteraction | ButtonInteraction) {
  const guildId = interaction.guildId!;
  const perms = await CommandPermission.find({ guildId }).lean();

  // Build a map: roleId → [commandNames]
  const roleMap = new Map<string, string[]>();
  for (const p of perms) {
    for (const roleId of p.roleIds) {
      const existing = roleMap.get(roleId) ?? [];
      existing.push(p.commandName);
      roleMap.set(roleId, existing);
    }
  }

  const components: any[] = [
    new TextDisplayBuilder().setContent('# 🔒 Command Permissions'),
    new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small),
  ];

  if (roleMap.size === 0) {
    components.push(
      new TextDisplayBuilder().setContent(
        'No roles configured yet. All commands are public.\n\n' +
        'Add a role to restrict which commands it can access.'
      )
    );
  } else {
    components.push(
      new TextDisplayBuilder().setContent('Roles with command access configured:')
    );

    for (const [roleId, cmdNames] of roleMap) {
      const role = interaction.guild?.roles.cache.get(roleId);
      const roleName = role ? `@${role.name}` : `*Deleted role*`;
      const cmdCount = cmdNames.length;
      const cmdLabel = cmdCount === 1 ? '1 command' : `${cmdCount} commands`;

      components.push(
        new SectionBuilder()
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`**${roleName}** — ${cmdLabel}`)
          )
          .setButtonAccessory(
            new ButtonBuilder()
              .setCustomId(`perm-role:${roleId}`)
              .setLabel('Configure')
              .setStyle(ButtonStyle.Secondary)
          )
      );
    }
  }

  // Add Role button
  const addRoleSelect = new RoleSelectMenuBuilder()
    .setCustomId('perm-add-role')
    .setPlaceholder('Add a role...');

  components.push(
    new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small),
    new ActionRowBuilder<RoleSelectMenuBuilder>().addComponents(addRoleSelect),
  );

  const message = await respondToInteraction(interaction, components, { fetchReply: true });

  const collector = message!.createMessageComponentCollector({
    filter: (i: any) =>
      i.user.id === interaction.user.id &&
      (i.customId.startsWith('perm-role:') || i.customId === 'perm-add-role'),
    max: 1,
    time: COLLECTOR_TIMEOUT,
  });

  collector.on('collect', async (i: any) => {
    if (i.customId === 'perm-add-role') {
      const roleId = i.values[0];

      // Don't allow @everyone
      if (roleId === interaction.guildId) {
        await showRolesList(i);
        return;
      }

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

  // Get all permissions for this guild
  const perms = await CommandPermission.find({ guildId }).lean();
  const roleCommands = new Set<string>();
  for (const p of perms) {
    if (p.roleIds.includes(roleId)) {
      roleCommands.add(p.commandName);
    }
  }

  const commands = getConfigurableCommands();

  const components: any[] = [
    new TextDisplayBuilder().setContent(`# 🔒 ${roleName}`),
    new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small),
    new TextDisplayBuilder().setContent('Select commands this role can access:'),
  ];

  // Command toggle select menu (multi-select)
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
        .setDefault(hasAccess)
    );
  }

  components.push(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select));

  // Action buttons
  const buttons: ButtonBuilder[] = [];

  if (roleCommands.size > 0) {
    buttons.push(
      new ButtonBuilder()
        .setCustomId(`perm-remove-role:${roleId}`)
        .setLabel('Remove All')
        .setStyle(ButtonStyle.Danger)
    );
  }

  buttons.push(
    new ButtonBuilder()
      .setCustomId('perm-back')
      .setLabel('Back')
      .setStyle(ButtonStyle.Secondary)
  );

  components.push(new ActionRowBuilder<ButtonBuilder>().addComponents(buttons));

  await interaction.update({ components });
  const message = await interaction.fetchReply();

  const collector = message.createMessageComponentCollector({
    filter: (i: any) =>
      i.user.id === interaction.user.id &&
      (i.customId === `perm-toggle:${roleId}` ||
       i.customId === `perm-remove-role:${roleId}` ||
       i.customId === 'perm-back'),
    max: 1,
    time: COLLECTOR_TIMEOUT,
  });

  collector.on('collect', async (i: any) => {
    if (i.customId === 'perm-back') {
      await showRolesList(i);
    } else if (i.customId === `perm-remove-role:${roleId}`) {
      // Remove this role from all commands
      await CommandPermission.updateMany(
        { guildId },
        { $pull: { roleIds: roleId } }
      );
      // Clean up empty documents
      await CommandPermission.deleteMany({ guildId, roleIds: { $size: 0 } });

      await showRolesList(i);
    } else if (i.customId === `perm-toggle:${roleId}`) {
      const selectedCommands = new Set<string>(i.values);

      // Determine what to add and what to remove
      const allCommands = commands.map(c => c.metadata.name);

      for (const cmdName of allCommands) {
        if (selectedCommands.has(cmdName) && !roleCommands.has(cmdName)) {
          // Add role to this command
          await CommandPermission.findOneAndUpdate(
            { guildId, commandName: cmdName },
            { $addToSet: { roleIds: roleId } },
            { upsert: true }
          );
        } else if (!selectedCommands.has(cmdName) && roleCommands.has(cmdName)) {
          // Remove role from this command
          await CommandPermission.findOneAndUpdate(
            { guildId, commandName: cmdName },
            { $pull: { roleIds: roleId } }
          );
        }
      }

      // Clean up empty documents
      await CommandPermission.deleteMany({ guildId, roleIds: { $size: 0 } });

      // Refresh the detail view
      await showRoleDetail(i, roleId);
    }
  });
}

// ── Helpers ───────────────────────────────────────────────────────────

async function respondToInteraction(
  interaction: ChatInputCommandInteraction | ButtonInteraction,
  components: any[],
  options?: { fetchReply?: boolean }
) {
  return interaction.reply({
    components,
    fetchReply: options?.fetchReply,
    flags: [MessageFlags.IsComponentsV2],
    ephemeral: true,
  });
}
