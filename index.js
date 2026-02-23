const {
  Client,
  GatewayIntentBits,
  ChannelType,
  PermissionsBitField,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require("discord.js");

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

const CATEGORY_ID = "1474912707357577236";
const CHANNEL_ID  = "1474948831882772500";
const MOD_ROLE_ID = "1474961654793109726";
const TOKEN = process.env.TOKEN;

const TICKET_TYPES = new Set(["denuncia", "compra", "duvidas"]);
const CLOSE_ID = "ticket_close";

client.once("ready", async () => {
  console.log(`✅ Bot online como ${client.user.tag}`);

  const channel = await client.channels.fetch(CHANNEL_ID).catch(() => null);
  if (!channel) return console.log("❌ Canal do painel não encontrado.");

  const msgs = await channel.messages.fetch({ limit: 10 });
  const jaExiste = msgs.find(
    (m) => m.author?.id === client.user.id && m.components?.length > 0
  );
  if (jaExiste) return;

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("denuncia")
      .setLabel("🛑 Denúncia")
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId("compra")
      .setLabel("💰 Compra")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId("duvidas")
      .setLabel("❓ Dúvidas")
      .setStyle(ButtonStyle.Primary)
  );

  await channel.send({
    content:
      "🎫 **Sistema de Tickets**\nPara que possamos ajudar, selecione o motivo abaixo:",
    components: [row]
  });
});

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isButton()) return;

  await interaction.guild.channels.fetch().catch(() => null);

  // 🔒 FECHAR TICKET (só fecha)
  if (interaction.customId === CLOSE_ID) {
    if (interaction.channel.parentId !== CATEGORY_ID) {
      return interaction.reply({
        content: "❌ Este botão só funciona dentro de um ticket.",
        ephemeral: true
      });
    }

    // Se quiser que APENAS MOD feche, deixe assim:
    if (!interaction.member.roles.cache.has(MOD_ROLE_ID)) {
      return interaction.reply({
        content: "❌ Apenas a moderação pode encerrar o ticket.",
        ephemeral: true
      });
    }

    await interaction.reply({
      content: "🔒 Encerrando ticket em 2 segundos...",
      ephemeral: true
    });

    setTimeout(() => {
      interaction.channel.delete().catch(() => null);
    }, 2000);

    return;
  }

  // 🎟️ CRIAR TICKET (só se for denuncia/compra/duvidas)
  const tipo = interaction.customId;

  if (!TICKET_TYPES.has(tipo)) {
    return interaction.reply({
      content: "❌ Botão inválido.",
      ephemeral: true
    }).catch(() => null);
  }

  const jaTem = interaction.guild.channels.cache.find(
    (c) => c.parentId === CATEGORY_ID && c.topic === interaction.user.id
  );

  if (jaTem) {
    return interaction.reply({
      content: `❌ Você já tem um ticket aberto: ${jaTem}`,
      ephemeral: true
    });
  }

  const nomeCanal = `${tipo}-${interaction.user.username}`
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "")
    .slice(0, 80);

  const canal = await interaction.guild.channels.create({
    name: nomeCanal,
    type: ChannelType.GuildText,
    parent: CATEGORY_ID,
    topic: interaction.user.id,
    permissionOverwrites: [
      // Ninguém vê
      {
        id: interaction.guild.id,
        deny: [PermissionsBitField.Flags.ViewChannel]
      },
      // Dono do ticket vê
      {
        id: interaction.user.id,
        allow: [
          PermissionsBitField.Flags.ViewChannel,
          PermissionsBitField.Flags.SendMessages,
          PermissionsBitField.Flags.ReadMessageHistory
        ]
      },
      // Mod vê
      {
        id: MOD_ROLE_ID,
        allow: [
          PermissionsBitField.Flags.ViewChannel,
          PermissionsBitField.Flags.SendMessages,
          PermissionsBitField.Flags.ReadMessageHistory
        ]
      },
      // ✅ BOT VÊ E CONSEGUE ENVIAR O BOTÃO
      {
        id: client.user.id,
        allow: [
          PermissionsBitField.Flags.ViewChannel,
          PermissionsBitField.Flags.SendMessages,
          PermissionsBitField.Flags.ReadMessageHistory,
          PermissionsBitField.Flags.EmbedLinks,
          PermissionsBitField.Flags.AttachFiles
        ]
      }
    ]
  });

  const closeRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(CLOSE_ID)
      .setLabel("🔒 Encerrar Ticket")
      .setStyle(ButtonStyle.Secondary)
  );

  await canal.send({
    content: `📩 Ticket de **${tipo}** aberto por ${interaction.user}\n\n<@&${MOD_ROLE_ID}>`,
    components: [closeRow]
  });

  await interaction.reply({
    content: `✅ Seu ticket foi criado: ${canal}`,
    ephemeral: true
  });
});

client.login(TOKEN);
