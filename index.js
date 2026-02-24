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
const OWNER_ROLE_ID = "1401261879292198978"; // apenas para ver/ser marcado em doação
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
  return null;
}

/* ========= PAINEL ========= */
function buildPanelRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("denuncia").setLabel("🛑 DENÚNCIA").setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId("doacao").setLabel("💰 DOAÇÃO").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId("duvidas").setLabel("❓ DÚVIDAS").setStyle(ButtonStyle.Primary)
  );
}

const PANEL_TEXT = "🎫 **Sistema de Tickets**\nSelecione o motivo do atendimento:";

// cor automática do servidor (cor do cargo mais alto do BOT)
function getServerColor(guild) {
  const botMember = guild.members.me;
  return botMember?.roles?.highest?.color || 0x2ecc71;
}

// ✅ EMBED do painel com footer + timestamp
function buildPanelEmbed(guild) {
  const roleColor = getServerColor(guild);
  return new EmbedBuilder()
    .setDescription(PANEL_TEXT)
    .setColor(roleColor)
    .setFooter({
      text: `${guild.name} • Sistema de Tickets`,
      iconURL: guild.iconURL?.({ size: 128 }) || undefined
    })
    .setTimestamp();
}

// ✅ EMBED do ticket com footer + timestamp (mantém o texto igual)
function buildTicketEmbed(guild, textoMensagem) {
  const roleColor = getServerColor(guild);
  return new EmbedBuilder()
    .setDescription(textoMensagem)
    .setColor(roleColor)
    .setFooter({
      text: `${guild.name} • Sistema de Tickets`,
      iconURL: guild.iconURL?.({ size: 128 }) || undefined
    })
    .setTimestamp();
}

client.once("ready", async () => {
  console.log(`✅ Bot online como ${client.user.tag}`);

  const channel = await client.channels.fetch(CHANNEL_ID).catch(() => null);
  if (!channel) return;

  let painel = null;
  try {
    const msgs = await channel.messages.fetch({ limit: 30 });
    painel = msgs.find(m => m.author?.id === client.user.id && m.components?.length > 0);
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

  /* ===== FECHAR TICKET (QUALQUER UM) ===== */
  if (interaction.customId === CLOSE_ID) {
    if (interaction.channel?.parentId !== CATEGORY_ID) {
      return interaction.reply({ content: "❌ Este botão só funciona dentro de um ticket.", ephemeral: true });
    }
    await interaction.reply({ content: "🔒 Encerrando ticket em 2 segundos...", ephemeral: true });
    setTimeout(() => interaction.channel.delete().catch(() => {}), 2000);
    return;
  }

  /* ===== CRIAR TICKET ===== */
  const now = Date.now();
  if (now - (cooldown.get(interaction.user.id) || 0) < COOLDOWN_MS) {
    return interaction.reply({ content: "⏳ Aguarde um instante...", ephemeral: true });
  }
  cooldown.set(interaction.user.id, now);

  const tipo = mapTipo(interaction.customId);
  if (!tipo) {
    return interaction.reply({ content: "❌ Botão inválido.", ephemeral: true });
  }

  if (creating.has(interaction.user.id)) {
    return interaction.reply({ content: "⏳ Aguarde, estou criando seu ticket...", ephemeral: true });
  }
  creating.add(interaction.user.id);

  try {
    const allChannels = await interaction.guild.channels.fetch();
    const jaTem = allChannels.find(
      c => c.type === ChannelType.GuildText && c.parentId === CATEGORY_ID && c.topic === interaction.user.id
    );
    if (jaTem) {
      return interaction.reply({ content: `❌ Você já tem um ticket aberto: ${jaTem}`, ephemeral: true });
    }

    let nomeCanal = `${tipo}-${interaction.user.username || interaction.user.id}`
      .toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 80);
    if (nomeCanal.length < 3) nomeCanal = `${tipo}-${interaction.user.id}`;

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
          PermissionsBitField.Flags.ReadMessageHistory,
          PermissionsBitField.Flags.ManageChannels
        ]
      }
    ];

    if (tipo === "doacao") {
      permissionOverwrites.push({ id: MOD_ROLE_ID, deny: [PermissionsBitField.Flags.ViewChannel] });
      permissionOverwrites.push({
        id: OWNER_ROLE_ID,
        allow: [
          PermissionsBitField.Flags.ViewChannel,
          PermissionsBitField.Flags.SendMessages,
          PermissionsBitField.Flags.ReadMessageHistory
        ]
      });
    } else {
      permissionOverwrites.push({
        id: MOD_ROLE_ID,
        allow: [
          PermissionsBitField.Flags.ViewChannel,
          PermissionsBitField.Flags.SendMessages,
          PermissionsBitField.Flags.ReadMessageHistory,
          PermissionsBitField.Flags.ManageChannels,
          PermissionsBitField.Flags.ManageMessages
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

    const closeRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(CLOSE_ID).setLabel("🔒 Encerrar Ticket").setStyle(ButtonStyle.Secondary)
    );

    // 🔥 TEXTOS FINAIS (mantidos iguais, só mudou 💝 -> 💰)
    const mensagens = {
      denuncia:
        "🛑 **Denúncia**\nEnvie as provas (prints ou vídeo) e descreva o ocorrido por gentileza.\n\n⏰ **Prazo de retorno: 24h a 48h.**",
      doacao:
        "💰 **Doação**\nEnvie o comprovante e aguarde o retorno dos Staffs.\n\n⏰ **Prazo de retorno: 24h a 48h.**",
      duvidas:
        "❓ **Dúvidas**\nEm que podemos ajudá-los?\n\n⏰ **Prazo de retorno: 24h a 48h.**"
    };

    if (tipo === "doacao") {
      await canal.send({
        // mantém seu texto do header igual
        content: `📩 **Ticket de DOAÇÃO** aberto por ${interaction.user}\n\n👑 <@&${OWNER_ROLE_ID}>`,
        allowedMentions: { roles: [OWNER_ROLE_ID] },
        // mensagem vai no embed (com footer + timestamp)
        embeds: [buildTicketEmbed(interaction.guild, mensagens.doacao)],
        components: [closeRow]
      });
    } else {
      await canal.send({
        content: `📩 Ticket aberto por ${interaction.user}\n\n<@&${MOD_ROLE_ID}>`,
        allowedMentions: { roles: [MOD_ROLE_ID] },
        embeds: [buildTicketEmbed(interaction.guild, mensagens[tipo])],
        components: [closeRow]
      });
    }

    await interaction.reply({ content: `✅ Seu ticket foi criado: ${canal}`, ephemeral: true });
  } finally {
    creating.delete(interaction.user.id);
  }
});

client.login(TOKEN);
