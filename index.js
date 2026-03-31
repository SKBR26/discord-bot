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
  if (id === "compra") return "doacao";
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

/* ========= BOTÕES ========= */
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
      .setStyle(ButtonStyle.Success)
  );
}

/* ========= EMBED DO PAINEL ========= */
function buildPanelEmbed(guild) {
  return new EmbedBuilder()
    .setDescription(
`🎫 **Sistema de Tickets**

Selecione o motivo do atendimento no

### 🌍 **ERA DOS GIGANTES**`
    )
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
    aniversariante: 0xffa500
  };

  return new EmbedBuilder()
    .setDescription(texto)
    .setColor(colors[tipo] || getServerColor(guild))
    .setFooter({
      text: `${guild.name}`,
      iconURL: guild.iconURL?.({ size: 128 }) || undefined
    })
    .setTimestamp();
}

/* ========= READY ========= */
client.once("ready", async () => {
  console.log(`✅ Bot online como ${client.user.tag}`);

  const channel = await client.channels.fetch(CHANNEL_ID).catch(() => null);
  if (!channel) return;

  let painel = null;

  try {
    const msgs = await channel.messages.fetch({ limit: 50 });
    painel = msgs.find(m => {
      if (m.author?.id !== client.user.id) return false;
      if (!m.components?.length) return false;

      const ids = m.components.flatMap(r => r.components || []).map(c => c.customId);
      return (
        ids.includes("denuncia") &&
        ids.includes("doacao") &&
        ids.includes("duvidas") &&
        ids.includes("aniversariante")
      );
    });
  } catch {}

  const payload = {
    embeds: [buildPanelEmbed(channel.guild)],
    components: [buildPanelRow()]
  };

  if (painel) {
    await painel.edit(payload).catch(() => {});
  } else {
    await channel.send(payload).catch(() => {});
  }
});

/* ================= INTERAÇÕES ================= */
client.on("interactionCreate", async (interaction) => {
  if (!interaction.isButton()) return;

  if (interaction.customId === CLOSE_ID) {
    if (interaction.channel?.parentId !== CATEGORY_ID) {
      return interaction.reply({ content: "❌ Este botão só funciona dentro de um ticket.", ephemeral: true });
    }
    await interaction.reply({ content: "🔒 Encerrando ticket em 2 segundos...", ephemeral: true });
    setTimeout(() => interaction.channel.delete().catch(() => {}), 2000);
    return;
  }

  const tipo = mapTipo(interaction.customId);
  if (!tipo) return;

  const canal = await interaction.guild.channels.create({
    name: `${tipo}-${interaction.user.username}`,
    type: ChannelType.GuildText,
    parent: CATEGORY_ID
  });

  const closeRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(CLOSE_ID)
      .setLabel("🔒 Encerrar Ticket")
      .setStyle(ButtonStyle.Secondary)
  );

  await canal.send({
    content: `📩 Ticket aberto por ${interaction.user}`,
    embeds: [
      buildTicketEmbed(interaction.guild, tipo, "Aguarde um membro da staff.")
    ],
    components: [closeRow]
  });

  await interaction.reply({
    content: `✅ Seu ticket foi criado: ${canal}`,
    ephemeral: true
  });
});

client.login(TOKEN);
