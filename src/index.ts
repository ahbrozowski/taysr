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
    const year = now.getUTCFullYear();
    let christmasMs = Date.UTC(year, 11, 25, 0, 0, 0);
    if (now.getTime() > christmasMs) {
      christmasMs = Date.UTC(year + 1, 11, 25, 0, 0, 0);
    }
    const christmasTs = Math.floor(christmasMs / 1000);
    // Discord renders relative timestamps in the viewer's local timezone.
    await message.reply(`🎄 Christmas is <t:${christmasTs}:R> (<t:${christmasTs}:D>)`);
  }

  // Respond to !help
  if (message.content === '!help') {
    await message.reply(
      '**Available Commands:**\n' +
      '• `!ping` - Responds with Pong!\n' +
      '• `!hello` - Greets you\n' +
      '• `!time` - Shows the server time\n' +
      '• `!days` - Shows days until Christmas\n' +
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
