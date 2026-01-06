import { Client, GatewayIntentBits, Events } from 'discord.js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

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
    await message.reply(`👋 Hello ${message.author.username}!`);
  }

  // Respond to !help
  if (message.content === '!help') {
    await message.reply(
      '**Available Commands:**\n' +
      '• `!ping` - Responds with Pong!\n' +
      '• `!hello` - Greets you\n' +
      '• `!help` - Shows this message'
    );
  }
});

// Login to Discord
const token = process.env.DISCORD_TOKEN;
if (!token) {
  console.error('❌ Error: DISCORD_TOKEN not found in environment variables');
  process.exit(1);
}

client.login(token);
