require("dotenv").config();

const {
  Client,
  GatewayIntentBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  SlashCommandBuilder
} = require("discord.js");

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

// Lưu vote tạm theo từng pollId
const polls = {};

client.once("ready", async () => {
  console.log(`🤖 Bot online: ${client.user.tag}`);

  // Tạo slash command /poll (2 lựa chọn)
  const pollCommand = new SlashCommandBuilder()
    .setName("poll")
    .setDescription("Tạo khảo sát")
    .addStringOption(opt =>
      opt.setName("question").setDescription("Câu hỏi").setRequired(true)
    )
    .addStringOption(opt =>
      opt.setName("option1").setDescription("Lựa chọn 1").setRequired(true)
    )
    .addStringOption(opt =>
      opt.setName("option2").setDescription("Lựa chọn 2").setRequired(true)
    );

  // Register command (global). Lần đầu có thể mất vài phút để hiện trong Discord.
  // Register command theo SERVER (hiện ngay)
const GUILD_ID = "1452986114150371463";

await client.application.commands.create(
  pollCommand,
  GUILD_ID
);

});

client.on("interactionCreate", async interaction => {
  // Slash command /poll
  if (interaction.isChatInputCommand() && interaction.commandName === "poll") {
    const question = interaction.options.getString("question");
    const option1 = interaction.options.getString("option1");
    const option2 = interaction.options.getString("option2");

    const pollId = interaction.id;
    polls[pollId] = { option1: 0, option2: 0 };

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`vote_${pollId}_1`)
        .setLabel(option1)
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`vote_${pollId}_2`)
        .setLabel(option2)
        .setStyle(ButtonStyle.Success)
    );

    await interaction.reply({
      content: `📊 **${question}**`,
      components: [row]
    });
  }

  // Button vote
  if (interaction.isButton()) {
    const [type, pollId, option] = interaction.customId.split("_");
    if (type !== "vote") return;
    if (!polls[pollId]) return;

    polls[pollId][`option${option}`]++;

    await interaction.reply({
      content: `✅ Vote thành công!\n🔵 ${polls[pollId].option1} | 🟢 ${polls[pollId].option2}`,
      ephemeral: true
    });
  }
});

client.login(process.env.POLL_TOKEN);
