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
const CLAIM_ID = "ticket_claim";
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

function getServerColor(guild) {
  const botMember = guild.members.me;
  return botMember?.roles?.highest?.color || 0x57F287;
}

function getTicketTipoFromChannelName(channelName = "") {
  const name = normalizeId(channelName);
  if (name.startsWith("denuncia-")) return "denuncia";
  if (name.startsWith("doacao-")) return "doacao";
  if (name.startsWith("duvidas-")) return "duvidas";
  if (name.startsWith("aniversariante-")) return "aniversariante";
  return null;
}

/* 🔒 AGORA SOMENTE MOD PODE GERENCIAR */
function canCloseTicket(member) {
  if (!member) return false;
  return member.roles.cache.has(MOD_ROLE_ID);
}

/* ========= BOTÕES ========= */
function buildPanelRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("denuncia").setLabel("DENÚNCIA").setEmoji("🛑").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("doacao").setLabel("DOAÇÃO").setEmoji("💰").setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId("duvidas").setLabel("DÚVIDAS").setEmoji("❓").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId("aniversariante").setLabel("ANIVERSARIANTE").setEmoji("🎂").setStyle(ButtonStyle.Success)
  );
}

function buildTicketControls(claimed = false, claimedBy = null) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(CLAIM_ID)
      .setLabel(claimed ? `Assumido por ${claimedBy || "Staff"}` : "Assumir Ticket")
      .setEmoji("🙋")
      .setStyle(ButtonStyle.Primary)
      .setDisabled(claimed),

    new ButtonBuilder()
      .setCustomId(CLOSE_ID)
      .setLabel("Encerrar Ticket")
      .setEmoji("🔒")
      .setStyle(ButtonStyle.Secondary)
  );
}

function buildPanelEmbed(guild) {
  return new EmbedBuilder()
    .setTitle("🎫 Sistema de Tickets")
    .setDescription("Selecione o motivo do atendimento no **ERA DOS GIGANTES**.")
    .setColor(0x57F287)
    .setFooter({
      text: "ERA DOS GIGANTES",
      iconURL: guild.iconURL?.({ size: 128 }) || undefined
    });
}

function buildTicketEmbed(guild, tipo, texto) {
  const colors = {
    denuncia: 0x95a5a6,
    doacao: 0xe74c3c,
    duvidas: 0x3498db,
    aniversariante: 0x2ecc71
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

  await channel.send(payload).catch(() => {});
});

/* ================= INTERAÇÕES ================= */
client.on("interactionCreate", async (interaction) => {
  if (!interaction.isButton()) return;

  /* ===== FECHAR (AGORA COM PERMISSÃO) ===== */
  if (interaction.customId === CLOSE_ID) {
    if (interaction.channel?.parentId !== CATEGORY_ID) {
      return interaction.reply({
        content: "❌ Este botão só funciona dentro de um ticket.",
        ephemeral: true
      });
    }

    if (!canCloseTicket(interaction.member)) {
      return interaction.reply({
        content: "❌ Apenas a moderação pode encerrar este ticket.",
        ephemeral: true
      });
    }

    await interaction.reply({
      content: "🔒 Encerrando ticket em 2 segundos...",
      ephemeral: true
    });

    setTimeout(() => interaction.channel.delete().catch(() => {}), 2000);
    return;
  }

  /* ===== RESTANTE DO CÓDIGO NORMAL ===== */

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

  if (creating.has(interaction.user.id)) {
    return interaction.reply({
      content: "⏳ Criando seu ticket...",
      ephemeral: true
    });
  }

  creating.add(interaction.user.id);

  try {
    const canal = await interaction.guild.channels.create({
      name: `${tipo}-${interaction.user.username}`,
      type: ChannelType.GuildText,
      parent: CATEGORY_ID,
      topic: interaction.user.id,
      permissionOverwrites: [
        { id: interaction.guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
        { id: interaction.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] },
        { id: MOD_ROLE_ID, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] }
      ]
    });

    await canal.send({
      content: `📩 Ticket aberto por ${interaction.user}`,
      components: [buildTicketControls()]
    });

    await interaction.reply({
      content: `✅ Ticket criado: ${canal}`,
      ephemeral: true
    });

  } catch (err) {
    console.error(err);
  } finally {
    creating.delete(interaction.user.id);
  }
});

client.login(TOKEN);
