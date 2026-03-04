import {
  ChatInputCommandInteraction,
  ButtonInteraction,
  SlashCommandBuilder,
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
import { executeCommand } from '../executor';

const SELECTION_TIMEOUT = 60000;

/** Commands shown in the settings picker */
const SETTINGS_COMMANDS = [
  'set-channel',
  'permissions',
  'set-timezone',
  'set-reminders',
];

export const settingsCommand: Command = {
  metadata: {
    name: 'settings',
    emoji: '⚙️',
    description: 'Manage server settings',
    implemented: true,
    requiresGuild: true,
  },

  build: () => {
    return new SlashCommandBuilder()
      .setName('settings')
      .setDescription('Manage server settings (admin only)')
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);
  },

  execute: async (interaction: ChatInputCommandInteraction | ButtonInteraction) => {
    const commands = SETTINGS_COMMANDS
      .map(name => commandRegistry.get(name))
      .filter((c): c is Command => !!c);

    const components: any[] = [
      new TextDisplayBuilder().setContent('# ⚙️ Server Settings\nChoose a setting to configure:'),
      new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small),
    ];

    for (const cmd of commands) {
      components.push(
        new SectionBuilder()
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
              cmd.metadata.implemented
                ? `${cmd.metadata.emoji} **${cmd.metadata.description}**`
                : `${cmd.metadata.emoji} ${cmd.metadata.description}`
            )
          )
          .setButtonAccessory(
            new ButtonBuilder()
              .setCustomId(`settings-cmd:${cmd.metadata.name}`)
              .setLabel(cmd.metadata.implemented ? 'Configure' : 'Coming Soon')
              .setStyle(cmd.metadata.implemented ? ButtonStyle.Primary : ButtonStyle.Secondary)
              .setDisabled(!cmd.metadata.implemented)
          )
      );
    }

    const message = await interaction.reply({
      components,
      flags: [MessageFlags.IsComponentsV2],
      ephemeral: true,
      fetchReply: true,
    });

    const collector = message.createMessageComponentCollector({
      filter: (i: any) => i.user.id === interaction.user.id && i.customId.startsWith('settings-cmd:'),
      max: 1,
      time: SELECTION_TIMEOUT,
    });

    collector.on('collect', async (i: any) => {
      const commandName = i.customId.replace('settings-cmd:', '');
      collector.stop();
      await interaction.deleteReply().catch(() => {});
      await executeCommand(commandName, i);
    });

    collector.on('end', async (_collected: any, reason: string) => {
      if (reason === 'time') {
        const timeoutComponents = [
          new TextDisplayBuilder().setContent('# ⚙️ Server Settings\n\n_Selection timed out._'),
          new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small),
        ];

        const lines = commands
          .filter(c => c.metadata.implemented)
          .map(c => `${c.metadata.emoji} **${c.metadata.description}** — Use \`/${c.metadata.name}\``)
          .join('\n');

        timeoutComponents.push(new TextDisplayBuilder().setContent(lines));

        try {
          await interaction.editReply({ components: timeoutComponents });
        } catch {
          // Ignore if we can't edit
        }
      }
    });
  },
};
