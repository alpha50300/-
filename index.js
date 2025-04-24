const { Client, GatewayIntentBits, EmbedBuilder, AttachmentBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, Events, Collection, PermissionsBitField, ActivityType } = require('discord.js');
const { REST } = require('@discordjs/rest');
const { Routes } = require('discord-api-types/v9');
const fs = require('fs');
const path = require('path');
const Tesseract = require('tesseract.js');
const axios = require('axios');
const sharp = require('sharp');

// Configure logging
const logger = {
  info: (message) => console.log(`${new Date().toISOString()} - INFO - ${message}`),
  error: (message) => console.error(`${new Date().toISOString()} - ERROR - ${message}`)
};

// Bot Status Constants
const BOT_STATUS = {
  ONLINE: 'online',
  IDLE: 'idle',
  DND: 'dnd',
  OFFLINE: 'invisible'
};

// Load configuration from config file
let TOKEN, ADMIN_ROLE_ID, RESPONSE_CHANNEL_ID, ADMIN_CHANNEL_ID, DESIGNATED_IMAGE_CHANNEL_ID, THUMBNAIL_URL, SOCIAL_LINKS, BOT_VERSION;

try {
  const config = JSON.parse(fs.readFileSync('config.json', 'utf8'));
  
  TOKEN = config.token || '';
  ADMIN_ROLE_ID = config.admin_role_id || 0;
  RESPONSE_CHANNEL_ID = config.response_channel_id || 0;
  ADMIN_CHANNEL_ID = config.admin_channel_id || 0;
  DESIGNATED_IMAGE_CHANNEL_ID = config.designated_image_channel_id || 0;
  THUMBNAIL_URL = config.thumbnail_url || '';
  SOCIAL_LINKS = config.social_links || {};
  BOT_VERSION = config.bot_version || '1.1.0';
  
  if (!TOKEN) {
    logger.error("No token found in config.json");
    process.exit(1);
  }
} catch (e) {
  logger.error(`Error loading config: ${e}`);
  process.exit(1);
}

// Check if JSON file exists, if not create it
if (!fs.existsSync('title.json')) {
  fs.writeFileSync('title.json', JSON.stringify({ pairs: [] }, null, 4));
}

// Load questions and answers from JSON
function loadQAPairs() {
  try {
    const data = JSON.parse(fs.readFileSync('title.json', 'utf8'));
    return data;
  } catch (e) {
    logger.error(`Error loading QA pairs: ${e}`);
    return { pairs: [] };
  }
}

// Save questions and answers to JSON
function saveQAPairs(data) {
  try {
    fs.writeFileSync('title.json', JSON.stringify(data, null, 4));
    return true;
  } catch (e) {
    logger.error(`Error saving QA pairs: ${e}`);
    return false;
  }
}

// Function to extract text from image
async function extractTextFromImage(imageUrl) {
  try {
    const response = await axios({
      url: imageUrl,
      responseType: 'arraybuffer'
    });
    
    const buffer = Buffer.from(response.data);
    const { data: { text } } = await Tesseract.recognize(buffer, 'eng');
    return text;
  } catch (e) {
    logger.error(`Error extracting text from image: ${e}`);
    return "";
  }
}

// Function to find question in extracted text - FIXED REGEX
function findQuestionInText(text) {
  // This pattern looks for text that contains question marks or keywords like "which", "what", etc.
  const questionPattern = /(which|what|who|when|where|why|how).*\?/i;
  const match = text.match(questionPattern);
  if (match) {
    return match[0].trim();
  }
  return null;
}

// Function to find question in database
function findQuestionInDatabase(question) {
  const data = loadQAPairs();
  for (const pair of data.pairs) {
    // Using fuzzy matching to account for minor differences in text extraction
    if (question.toLowerCase().includes(pair.question.toLowerCase()) || 
        pair.question.toLowerCase().includes(question.toLowerCase())) {
      return pair;
    }
  }
  return null;
}

// Create bot instance with status
const client = new Client({ 
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ],
  presence: {
    status: BOT_STATUS.idle,
    activities: [{ 
      name: 'Rise of Kingdoms AR', 
      type: ActivityType.Playing 
    }]
  }
});

// Function to update bot status dynamically
function updateBotStatus(status, activityName) {
  client.user.setPresence({
    status: status,
    activities: [{ 
      name: activityName || 'Playing', 
      type: ActivityType.Playing 
    }]
  });
}

// Set up commands collection
client.commands = new Collection();

// Define slash commands
const commands = [
  {
    name: 'addqa',
    description: 'Add a new question and answer to the database',
    options: [
      {
        name: 'question',
        description: 'The question to add',
        type: 3, // STRING
        required: true
      },
      {
        name: 'answer',
        description: 'The answer to the question',
        type: 3, // STRING
        required: true
      }
    ]
  },
  {
    name: 'listqa',
    description: 'List all questions and answers in the database'
  },
  {
    name: 'deleteqa',
    description: 'Delete a question from the database',
    options: [
      {
        name: 'question',
        description: 'The question to delete (exact match required)',
        type: 3, // STRING
        required: true
      }
    ]
  }
];

// Register slash commands
client.once(Events.ClientReady, async () => {
  logger.info(`${client.user.tag} has connected to Discord!`);
  
  try {
    const rest = new REST({ version: '9' }).setToken(TOKEN);
    await rest.put(
      Routes.applicationCommands(client.user.id),
      { body: commands }
    );
    logger.info('Successfully registered application commands.');
  } catch (error) {
    logger.error(`Failed to register commands: ${error}`);
  }
});

// Handle image messages
client.on(Events.MessageCreate, async message => {
  // Ignore messages from the bot itself
  if (message.author.bot) return;

  // Only process images in the designated channel
  if (message.channel.id !== DESIGNATED_IMAGE_CHANNEL_ID) return;

  // Process attached images
  if (message.attachments.size > 0) {
    for (const [_, attachment] of message.attachments) {
      const filename = attachment.name.toLowerCase();
      if (filename.endsWith('.png') || filename.endsWith('.jpg') || 
          filename.endsWith('.jpeg') || filename.endsWith('.gif')) {
        
        // Send "please wait" message
        const waitingMessage = await message.channel.send(
          `${message.author.toString()}, please wait while I process your image...`
        );
        
        // Extract text from the image
        const text = await extractTextFromImage(attachment.url);
        const question = findQuestionInText(text);
        
        if (question) {
          // Find the question in the database
          const qaPair = findQuestionInDatabase(question);
          
          if (qaPair) {
            // Create embed response
            const embed = new EmbedBuilder()
              .setTitle("Rise of Kingdoms AR")
              .setDescription("🏹 Rise of Kingdoms AR 🏹")
              .setColor(0x00ff00)
              .addFields({ name: "✅ Answer", value: qaPair.answer, inline: false })
              .setFooter({ text: `Requested by @${message.author.username} | Version:${BOT_VERSION}` });
            
            // Set the pet image thumbnail if available
            if (THUMBNAIL_URL) {
              embed.setThumbnail(THUMBNAIL_URL);
            }
            
            // Create the response message with buttons
            const row = new ActionRowBuilder();
            
            // Add social media buttons from config
            if (SOCIAL_LINKS.youtube) {
              row.addComponents(
                new ButtonBuilder()
                  .setLabel("YouTube")
                  .setStyle(ButtonStyle.Link)
                  .setURL(SOCIAL_LINKS.youtube)
              );
            }
            
            if (SOCIAL_LINKS.plutomall) {
              row.addComponents(
                new ButtonBuilder()
                  .setLabel("Plutomall")
                  .setStyle(ButtonStyle.Link)
                  .setURL(SOCIAL_LINKS.plutomall)
              );
            }
            
            if (SOCIAL_LINKS.facebook) {
              row.addComponents(
                new ButtonBuilder()
                  .setLabel("Facebook")
                  .setStyle(ButtonStyle.Link)
                  .setURL(SOCIAL_LINKS.facebook)
              );
            }
            
            // Delete the waiting message
            await waitingMessage.delete().catch(e => logger.error(`Error deleting waiting message: ${e}`));
            
            // Only send ActionRow if it has components
            if (row.components.length > 0) {
              await message.channel.send({
                content: `@${message.author.username}, here's the answer to your question`,
                embeds: [embed],
                components: [row]
              });
            } else {
              await message.channel.send({
                content: `@${message.author.username}, here's the answer to your question`,
                embeds: [embed]
              });
            }
          } else {
            // Delete the waiting message
            await waitingMessage.delete().catch(e => logger.error(`Error deleting waiting message: ${e}`));
            
            // Question not found, send apology message to user
            await message.channel.send(
              `${message.author.toString()}, we apologize but this question is not in our database.`
            );
            
            // Forward to admin channel
            const adminChannel = client.channels.cache.get(ADMIN_CHANNEL_ID);
            if (adminChannel) {
              const adminEmbed = new EmbedBuilder()
                .setTitle("New Question Detected")
                .setDescription("A user asked a question that's not in our database.")
                .setColor(0xff0000)
                .addFields(
                  { name: "Question", value: question, inline: false },
                  { name: "Requested by", value: message.author.toString(), inline: false }
                )
                .setImage(attachment.url);
              
              await adminChannel.send({ 
                content: "Please add this question and answer to the database using the /addqa command.",
                embeds: [adminEmbed] 
              });
            }
          }
        } else {
          // No question detected in the image
          await waitingMessage.delete().catch(e => logger.error(`Error deleting waiting message: ${e}`));
          
          await message.channel.send(
            `${message.author.toString()}, I couldn't detect a question in your image.`
          );
          
          // Forward to admin channel anyway
          const adminChannel = client.channels.cache.get(ADMIN_CHANNEL_ID);
          if (adminChannel) {
            const adminEmbed = new EmbedBuilder()
              .setTitle("No Question Detected")
              .setDescription("A user sent an image, but no question was detected.")
              .setColor(0xffff00)
              .addFields(
                { name: "Requested by", value: message.author.toString(), inline: false }
              )
              .setImage(attachment.url);
            
            await adminChannel.send({ embeds: [adminEmbed] });
          }
        }
      }
    }
  }
});

// Slash command handlers
client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isCommand()) return;

  const { commandName } = interaction;

  if (commandName === 'addqa') {
    // Ensure only admin can add QA pairs
    if (!interaction.member.roles.cache.has(ADMIN_ROLE_ID)) {
      await interaction.reply({ 
        content: "You do not have permission to add Q&A pairs.", 
        ephemeral: true 
      });
      return;
    }

    const question = interaction.options.getString('question');
    const answer = interaction.options.getString('answer');

    const data = loadQAPairs();
    
    // Check if question already exists
    const existingPair = findQuestionInDatabase(question);
    if (existingPair) {
      await interaction.reply({ 
        content: "This question already exists in the database.", 
        ephemeral: true 
      });
      return;
    }

    // Add new Q&A pair
    data.pairs.push({ question, answer });
    
    if (saveQAPairs(data)) {
      await interaction.reply({ 
        content: `Question "${question}" added successfully!`, 
        ephemeral: true 
      });
    } else {
      await interaction.reply({ 
        content: "Failed to save the Q&A pair.", 
        ephemeral: true 
      });
    }
  }

  if (commandName === 'listqa') {
    const data = loadQAPairs();
    
    if (data.pairs.length === 0) {
      await interaction.reply({ 
        content: "No Q&A pairs found in the database.", 
        ephemeral: true 
      });
      return;
    }

    // Create a formatted list of questions
    const questionsList = data.pairs
      .map((pair, index) => `${index + 1}. ${pair.question}`)
      .join('\n');

    await interaction.reply({ 
      content: `**Current Q&A Pairs:**\n${questionsList}`, 
      ephemeral: true 
    });
  }

  if (commandName === 'deleteqa') {
    // Ensure only admin can delete QA pairs
    if (!interaction.member.roles.cache.has(ADMIN_ROLE_ID)) {
      await interaction.reply({ 
        content: "You do not have permission to delete Q&A pairs.", 
        ephemeral: true 
      });
      return;
    }

    const question = interaction.options.getString('question');
    const data = loadQAPairs();
    
    const index = data.pairs.findIndex(pair => 
      pair.question.toLowerCase() === question.toLowerCase()
    );

    if (index !== -1) {
      data.pairs.splice(index, 1);
      
      if (saveQAPairs(data)) {
        await interaction.reply({ 
          content: `Question "${question}" deleted successfully!`, 
          ephemeral: true 
        });
      } else {
        await interaction.reply({ 
          content: "Failed to delete the Q&A pair.", 
          ephemeral: true 
        });
      }
    } else {
      await interaction.reply({ 
        content: "Question not found in the database.", 
        ephemeral: true 
      });
    }
  }
});

// Handle process termination
process.on('SIGINT', () => {
  logger.info('Shutting down bot...');
  client.destroy();
  process.exit(0);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error(`Uncaught Exception: ${error.message}`);
  console.error(error);
});

// Run the bot
client.login(TOKEN).catch(error => {
  logger.error(`Error logging in: ${error.message}`);
  process.exit(1);
});
