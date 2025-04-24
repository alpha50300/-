// سيرفر Express لخلّي البوت حي 24/7
const express = require("express");
const app = express();
app.get("/", (req, res) => res.send("Bot is running!"));
app.listen(3000, () => console.log("Web server is running!"));

// بوت ديسكورد بسيط
const { Client, GatewayIntentBits } = require("discord.js");
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
});

client.once("ready", () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
});

client.on("messageCreate", message => {
  if (message.content === "ping") {
    message.reply("pong!");
  }
});

client.login('MTIxNjg0MzY2NzA3MTk2MzI4OA.GytmDt.Nqymm0txZYZlh-VeqhjpuUOshVAv9SUjGo8TQ4');
