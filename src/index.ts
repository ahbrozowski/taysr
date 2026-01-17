import { Client, GatewayIntentBits, Events, REST, Routes, SlashCommandBuilder } from 'discord.js';
import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const DEFAULT_COMMAND_NAME = 'taysr';
const COMMAND_NAME_PATTERN = /^[a-z0-9-]{1,32}$/;
let activeCommandName = DEFAULT_COMMAND_NAME;

const mongoUri = process.env.MONGODB_URI;
const mongoDbName = process.env.MONGODB_DB || 'taysr';
let mongoClient: MongoClient | null = null;

function resolveCommandName(isProduction: boolean) {
  if (isProduction) {
    return DEFAULT_COMMAND_NAME;
  }

  const configured = process.env.DEV_COMMAND_PREFIX ?? DEFAULT_COMMAND_NAME;
  const commandName = configured.toLowerCase();
  if (!COMMAND_NAME_PATTERN.test(commandName)) {
    throw new Error(
      `Invalid command name "${configured}". Discord slash command names must be ` +
      'lowercase, 1-32 characters, and match /^[a-z0-9-]{1,32}$/.'
    );
  }

  return commandName;
}

function buildCommandJson(commandName: string) {
  const commandData = [
    new SlashCommandBuilder()
      .setName(commandName)
      .setDescription('Task management for roller derby teams')
      .addSubcommand((subcommand) =>
        subcommand.setName('help').setDescription('Show help and usage')
      ),
  ];

  return commandData.map((command) => command.toJSON());
}

async function getMongoDb() {
  if (!mongoUri) {
    throw new Error('MONGODB_URI not found in environment variables');
  }
  if (!mongoClient) {
    mongoClient = new MongoClient(mongoUri);
    await mongoClient.connect();
  }
  return mongoClient.db(mongoDbName);
}

// Create a new Discord client
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

// When the bot is ready
client.once(Events.ClientReady, (c) => {
  console.log(`✅ Bot is ready! Logged in as ${c.user.tag}`);
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  if (interaction.commandName !== activeCommandName) return;

  const subcommand = interaction.options.getSubcommand();
  if (subcommand === 'help') {
    const lines = [
      '**Taysr (WIP)**',
      'Slash commands are being built. Planned commands:',
      `/${activeCommandName} create, assign, unassign, take, complete, edit, delete, list,`,
      `/${activeCommandName} set-channel, set-timezone, set-reminders, help`,
    ];
    await interaction.reply({ content: lines.join('\n'), ephemeral: true });
  }
});

// Listen for messages
client.on(Events.MessageCreate, async (message) => {
  // Ignore messages from bots
  if (message.author.bot) return;

  // Respond to !ping
  if (message.content === '!ping') {
    await message.reply('🏓 Pong!');
  }

  // Respond to !hello
  if (message.content === '!hello') {
    await message.reply(`👋 Whats up ${message.author.username}!`);
  }

  // Respond to !time
  if (message.content === '!time') {
    const now = Math.floor(Date.now() / 1000);
    // Discord renders timestamps in the viewer's local timezone.
    await message.reply(`⏰ Your local time: <t:${now}:F>`);
  }

  // Respond to !days
  if (message.content === '!days') {
    const now = new Date();
    const year = now.getFullYear();
    const christmas = new Date(year, 11, 25);
    if (now > christmas) {
      christmas.setFullYear(year + 1);
    }
    const msPerDay = 24 * 60 * 60 * 1000;
    const diffDays = Math.ceil((christmas.getTime() - now.getTime()) / msPerDay);
    await message.reply(`🎄 ${diffDays} day${diffDays === 1 ? '' : 's'} until Christmas!`);
  }

  // Respond to !help
  if (message.content === '!help') {
    await message.reply(
      '**Available Commands:**\n' +
      '• `!ping` - Responds with Pong!\n' +
      '• `!hello` - Greets you\n' +
      '• `!time` - Shows the server time\n' +
      '• `!days` - Shows days until Christmas\n' +
      '• `!task` - Lists tasks from the database\n' +
      '• `!help` - Shows this message'
    );
  }

  // Respond to !task
  if (message.content === '!task') {
    try {
      const db = await getMongoDb();
      const tasks = await db.collection('tasks').find({}).toArray();

      if (tasks.length === 0) {
        await message.reply('No tasks found.');
        return;
      }

      const lines = tasks.map((task) => {
        const taskId = task.task_id ?? String(task._id);
        const title = task.title ?? 'Untitled';
        const status = task.status ?? 'unknown';
        const due = task.due_at ? new Date(task.due_at).toISOString() : 'no due date';
        return `• ${taskId} | ${title} | ${status} | ${due}`;
      });

      const header = `Tasks (${tasks.length}):\n`;
      const messageText = header + lines.join('\n');
      const limit = 1900;
      if (messageText.length <= limit) {
        await message.reply(messageText);
        return;
      }

      const chunks: string[] = [];
      let current = header;
      for (const line of lines) {
        if ((current + line + '\n').length > limit) {
          chunks.push(current.trimEnd());
          current = '';
        }
        current += `${line}\n`;
      }
      if (current.trim().length > 0) {
        chunks.push(current.trimEnd());
      }

      for (const chunk of chunks) {
        await message.reply(chunk);
      }
    } catch (error) {
      console.error('Failed to load tasks:', error);
      await message.reply('Failed to load tasks from the database.');
    }
  }
});

async function registerSlashCommands(options: {
  token: string;
  applicationId: string;
  isProduction: boolean;
  devGuildId?: string;
  commandName: string;
  commandJson: ReturnType<typeof buildCommandJson>;
}) {
  const { token, applicationId, isProduction, devGuildId, commandName, commandJson } = options;
  const rest = new REST({ version: '10' }).setToken(token);
  const route = isProduction
    ? Routes.applicationCommands(applicationId)
    : Routes.applicationGuildCommands(applicationId, devGuildId as string);
  const scopeLabel = isProduction ? 'global' : `guild ${devGuildId}`;

  await rest.put(route, { body: commandJson });
  console.log(
    `✅ Registered ${commandJson.length} commands (${scopeLabel}) for /${commandName}.`
  );
}

async function startBot() {
  const token = process.env.DISCORD_TOKEN;
  const applicationId = process.env.DISCORD_APPLICATION_ID;
  const devGuildId = process.env.DISCORD_DEV_GUILD_ID;
  const isProduction = process.env.NODE_ENV === 'production';

  if (!token) {
    throw new Error('DISCORD_TOKEN not found in environment variables');
  }
  if (!applicationId) {
    throw new Error('DISCORD_APPLICATION_ID not found in environment variables');
  }
  if (!isProduction && !devGuildId) {
    throw new Error('DISCORD_DEV_GUILD_ID not found in environment variables');
  }

  activeCommandName = resolveCommandName(isProduction);
  const commandJson = buildCommandJson(activeCommandName);

  await registerSlashCommands({
    token,
    applicationId,
    isProduction,
    devGuildId,
    commandName: activeCommandName,
    commandJson,
  });
  await client.login(token);
}

startBot().catch((error) => {
  console.error('❌ Failed to start bot:', error);
  process.exit(1);
});
