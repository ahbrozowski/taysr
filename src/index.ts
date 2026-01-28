import { Client, GatewayIntentBits, Events, REST, Routes } from 'discord.js';
import type { RouteLike } from '@discordjs/rest';
import dotenv from 'dotenv';
import { connectToDatabase, disconnectFromDatabase, Task } from './models';
import { initializeCommands, getCommandsForRegistration, executeCommand } from './commands';
import { setClient } from './utils/client';

// Load environment variables
dotenv.config();

const DEFAULT_COMMAND_NAME = 'taysr';
const COMMAND_NAME_PATTERN = /^[a-z0-9-]{1,32}$/;
const mongoUri = process.env.MONGODB_URI;

function resolveCommandName(isProduction: boolean): string {
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

function buildCommandsJson() {
  const commands = getCommandsForRegistration();
  return commands.map(cmd => cmd.build().toJSON());
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
  setClient(client);
  console.log(`✅ Bot is ready! Logged in as ${c.user.tag}`);
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  await executeCommand(interaction.commandName, interaction);
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
      const tasks = await Task.find({}).lean();

      if (tasks.length === 0) {
        await message.reply('No tasks found.');
        return;
      }

      const lines = tasks.map((task) => {
        const taskId = task.taskId;
        const title = task.title ?? 'Untitled';
        const status = task.status ?? 'unknown';
        const due = task.dueAt ? new Date(task.dueAt).toISOString() : 'no due date';
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
  route: RouteLike;
  scopeLabel: string;
  commandsJson: ReturnType<typeof buildCommandsJson>;
}) {
  const { token, route, scopeLabel, commandsJson } = options;
  const rest = new REST({ version: '10' }).setToken(token);

  await rest.put(route, { body: commandsJson });
  console.log(
    `✅ Registered ${commandsJson.length} slash commands (${scopeLabel}).`
  );
}

async function startBot() {
  const token = process.env.DISCORD_TOKEN;
  const applicationId = process.env.DISCORD_APPLICATION_ID;
  const devGuildId = process.env.DISCORD_DEV_GUILD_ID;
  const nodeEnv = process.env.NODE_ENV ?? 'development';
  const isProduction = nodeEnv === 'production';

  if (!token) {
    throw new Error('DISCORD_TOKEN not found in environment variables');
  }
  if (!applicationId) {
    throw new Error('DISCORD_APPLICATION_ID not found in environment variables');
  }
  if (!mongoUri) {
    throw new Error('MONGODB_URI not found in environment variables');
  }

  console.log(`INFO: NODE_ENV=${nodeEnv}`);

  // Connect to MongoDB
  await connectToDatabase(mongoUri);

  let route: RouteLike;
  let scopeLabel: string;
  if (isProduction) {
    route = Routes.applicationCommands(applicationId);
    scopeLabel = 'global';
  } else {
    if (devGuildId) {
      route = Routes.applicationGuildCommands(applicationId, devGuildId);
      scopeLabel = `guild ${devGuildId}`;
    } else {
      route = Routes.applicationCommands(applicationId);
      scopeLabel = 'global';
      console.warn(
        '⚠️ DISCORD_DEV_GUILD_ID not set; registering slash commands globally.'
      );
    }
  }

  // Resolve the branded command name based on environment
  const taysrCommandName = resolveCommandName(isProduction);

  // Initialize all commands with the resolved name
  initializeCommands(taysrCommandName);

  const commandsJson = buildCommandsJson();

  await registerSlashCommands({
    token,
    route,
    scopeLabel,
    commandsJson,
  });
  await client.login(token);
}

// Graceful shutdown handler
async function shutdown(signal: string) {
  console.log(`\n${signal} received. Shutting down gracefully...`);

  try {
    // Destroy Discord client
    await client.destroy();
    console.log('✅ Discord client destroyed');

    // Disconnect from database
    await disconnectFromDatabase();

    console.log('✅ Graceful shutdown complete');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error during shutdown:', error);
    process.exit(1);
  }
}

// Handle shutdown signals
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

startBot().catch((error) => {
  console.error('❌ Failed to start bot:', error);
  process.exit(1);
});
