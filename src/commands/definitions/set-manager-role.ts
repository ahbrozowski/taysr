import {
  ActionRowBuilder,
  ButtonInteraction,
  ChatInputCommandInteraction,
  MessageFlags,
  PermissionFlagsBits,
  RoleSelectMenuBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  SlashCommandBuilder,
  TextDisplayBuilder,
} from 'discord.js';
import { Command } from '../registry';
import { CommandPermission } from '../../models';

const COLLECTOR_TIMEOUT = 120000;

const MANAGER_COMMANDS = ['refresh', 'assign', 'unassign', 'delete', 'edit', 'goal'];

export const setManagerRoleCommand: Command = {
  metadata: {
    name: 'set-manager-role',
    emoji: '🛡️',
    description: 'Restrict manager commands to a role',
    implemented: true,
    requiresGuild: true,
    category: 'settings',
  },

  build: () => {
    return new SlashCommandBuilder()
      .setName('set-manager-role')
      .setDescription('Restrict the preset manager commands to a chosen role (admin only)')
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);
  },

  execute: async (interaction: ChatInputCommandInteraction | ButtonInteraction) => {
    const guildId = interaction.guildId!;

    const roleSelect = new RoleSelectMenuBuilder()
      .setCustomId('manager-role-select')
      .setPlaceholder('Select a manager role')
      .setMinValues(1)
      .setMaxValues(1);

    const components: any[] = [
      new TextDisplayBuilder().setContent('# 🛡️ Set Manager Role'),
      new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small),
      new TextDisplayBuilder().setContent(
        `Pick a role that should be allowed to run the preset manager commands:\n` +
        MANAGER_COMMANDS.map(c => `• \`/${c}\``).join('\n') +
        `\n\nThis is additive — running it again with another role grants both roles access. Use \`/permissions\` to fine-tune.`,
      ),
      new ActionRowBuilder<RoleSelectMenuBuilder>().addComponents(roleSelect),
    ];

    const message = await interaction.reply({
      components,
      flags: [MessageFlags.IsComponentsV2],
      ephemeral: true,
      fetchReply: true,
    });

    const collector = message.createMessageComponentCollector({
      filter: (i: any) => i.user.id === interaction.user.id && i.customId === 'manager-role-select',
      max: 1,
      time: COLLECTOR_TIMEOUT,
    });

    collector.on('collect', async (i: any) => {
      const roleId = i.values[0];

      if (roleId === guildId) {
        await i.update({
          components: [
            new TextDisplayBuilder().setContent('❌ `@everyone` cannot be used as a manager role.'),
          ],
        });
        return;
      }

      for (const commandName of MANAGER_COMMANDS) {
        await CommandPermission.findOneAndUpdate(
          { guildId, commandName },
          { $addToSet: { roleIds: roleId } },
          { upsert: true },
        );
      }

      const role = i.guild?.roles.cache.get(roleId);
      const roleName = role ? `@${role.name}` : `<@&${roleId}>`;

      await i.update({
        components: [
          new TextDisplayBuilder().setContent('# ✅ Manager Role Set'),
          new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small),
          new TextDisplayBuilder().setContent(
            `**${roleName}** can now use:\n` +
            MANAGER_COMMANDS.map(c => `• \`/${c}\``).join('\n') +
            `\n\nUse \`/permissions\` to add more roles or fine-tune access.`,
          ),
        ],
      });
    });
  },
};
