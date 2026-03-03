const {
  Client,
  GatewayIntentBits,
  ChannelType,
  PermissionsBitField,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder
} = require("discord.js");

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers]
});

/* ================= CONFIG ================= */
const CATEGORY_ID = "1474912707357577236";
const CHANNEL_ID  = "1474948831882772500";
const MOD_ROLE_ID = "1474961654793109726";
const OWNER_ROLE_ID = "1401261879292198978";
const TOKEN = process.env.TOKEN;
/* ========================================== */

const CLOSE_ID = "ticket_close";
const creating = new Set();
const cooldown = new Map();
const COOLDOWN_MS = 2500;

/* ========= helpers ========= */
function normalizeId(str) {
  return String(str || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function mapTipo(customId) {
  const id = normalizeId(customId).replace(/[^a-z0-9_-]/g, "");
  if (id.includes("doacao")) return "doacao";
  if (id.includes("denuncia")) return "denuncia";
  if (id.includes("duvida")) return "duvidas";
  if (id.includes("aniversariante")) return "aniversariante";
  return null;
}

/* ========= CORES ========= */
function getServerColor(guild) {
  const botMember = guild.members.me;
  return botMember?.roles?.highest?.color || 0x2ecc71;
}

/* ========= PAINEL ========= */
function buildPanelRow() {
  return new ActionRowBuilder().addComponents(

    new ButtonBuilder()
      .setCustomId("denuncia")
      .setLabel("DENÚNCIA")
      .setEmoji("🛑")
      .setStyle(ButtonStyle.Danger),

    new ButtonBuilder()
      .setCustomId("doacao")
      .setLabel("DOAÇÃO")
      .setEmoji("💰")
      .setStyle(ButtonStyle.Success),

    new ButtonBuilder()
      .setCustomId("duvidas")
      .setLabel("DÚVIDAS")
      .setEmoji("❓")
      .setStyle(ButtonStyle.Primary),

    new ButtonBuilder()
      .setCustomId("aniversariante")
      .setLabel("ANIVERSARIANTE")
      .setEmoji("🎂")
      .setStyle(ButtonStyle.Danger) // cor mais próxima de laranja
  );
}

function buildPanelEmbed(guild) {
  return new EmbedBuilder()
    .setDescription("🎫 **Sistema de Tickets**\nSelecione o motivo do atendimento:")
    .setColor(getServerColor(guild))
    .setFooter({
      text: "ERA DOS GIGANTES",
      iconURL: guild.iconURL?.({ size: 128 }) || undefined
    });
}

/* ========= EMBED DO TICKET ========= */
function buildTicketEmbed(guild, tipo, texto) {

  const colors = {
    denuncia: 0xe74c3c,
    doacao: 0x2ecc71,
    duvidas: 0x3498db,
    aniversariante: 0xffa500 // LARANJA
  };

  return new EmbedBuilder()
    .setDescription(texto)
    .setColor(colors[tipo] || getServerColor(guild))
    .setFooter({
      text: guild.name,
      iconURL: guild.iconURL?.({ size: 128 }) || undefined
    })
    .setTimestamp();
}

/* ========= READY ========= */
client.once("ready", async () => {

  console.log(`✅ Bot online como ${client.user.tag}`);

  const channel = await client.channels.fetch(CHANNEL_ID).catch(() => null);
  if (!channel) return;

  const payload = {
    embeds: [buildPanelEmbed(channel.guild)],
    components: [buildPanelRow()]
  };

  channel.send(payload).catch(() => {});
});

/* ================= INTERAÇÕES ================= */
client.on("interactionCreate", async (interaction) => {

  if (!interaction.isButton()) return;

  if (interaction.customId === CLOSE_ID) {

    await interaction.reply({
      content: "🔒 Encerrando ticket...",
      ephemeral: true
    });

    setTimeout(() => {
      interaction.channel.delete().catch(() => {});
    }, 2000);

    return;
  }

  const now = Date.now();

  if (now - (cooldown.get(interaction.user.id) || 0) < COOLDOWN_MS) {
    return interaction.reply({
      content: "⏳ Aguarde um instante...",
      ephemeral: true
    });
  }

  cooldown.set(interaction.user.id, now);

  const tipo = mapTipo(interaction.customId);

  if (!tipo) return;

  let nomeCanal = `${tipo}-${interaction.user.username}`
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "");

  const permissionOverwrites = [

    { id: interaction.guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },

    {
      id: interaction.user.id,
      allow: [
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.SendMessages,
        PermissionsBitField.Flags.ReadMessageHistory
      ]
    },

    {
      id: client.user.id,
      allow: [
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.SendMessages,
        PermissionsBitField.Flags.ManageChannels
      ]
    }
  ];

  if (tipo === "doacao" || tipo === "aniversariante") {

    permissionOverwrites.push({
      id: OWNER_ROLE_ID,
      allow: [
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.SendMessages
      ]
    });

  } else {

    permissionOverwrites.push({
      id: MOD_ROLE_ID,
      allow: [
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.SendMessages
      ]
    });

  }

  const canal = await interaction.guild.channels.create({
    name: nomeCanal,
    type: ChannelType.GuildText,
    parent: CATEGORY_ID,
    topic: interaction.user.id,
    permissionOverwrites
  });

  const mensagens = {

    denuncia:
      "🛑 **Denúncia**\nEnvie as provas.\n\n⏰ **Prazo: 24h a 48h**",

    doacao:
      "💰 **Doação**\nEnvie o comprovante.\n\n⏰ **Prazo: 24h a 48h**",

    duvidas:
      "❓ **Dúvidas**\nComo podemos ajudar?",

    aniversariante:
      "🎂 **Aniversariante**\nEnvie um documento que comprove seu aniversário.\n\n⚠️ **OBS.: Mostrar somente a data de nascimento.**"
  };

  await canal.send({

    content: `📩 Ticket aberto por ${interaction.user}\n\n<@&${OWNER_ROLE_ID}>`,

    embeds: [
      buildTicketEmbed(interaction.guild, tipo, mensagens[tipo])
    ],

    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(CLOSE_ID)
          .setLabel("🔒 Encerrar Ticket")
          .setStyle(ButtonStyle.Secondary)
      )
    ]

  });

  await interaction.reply({
    content: `✅ Ticket criado: ${canal}`,
    ephemeral: true
  });

});

client.login(TOKEN);
