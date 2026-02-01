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
