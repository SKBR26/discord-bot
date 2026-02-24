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
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
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
  return null;
}

/* ========= PAINEL (EMBED) ========= */
function buildPanelRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("denuncia")
      .setLabel("🛑 DENÚNCIA")
      .setStyle(ButtonStyle.Danger),

    new ButtonBuilder()
      .setCustomId("doacao")
      .setLabel("💰 DOAÇÃO")
      .setStyle(ButtonStyle.Success),

    new ButtonBuilder()
      .setCustomId("duvidas")
      .setLabel("❓ DÚVIDAS")
      .setStyle(ButtonStyle.Secondary)
  );
}

function buildPanelEmbed() {
  return new EmbedBuilder()
    .setTitle("🎫 SISTEMA DE TICKETS")
    .setDescription(
      "**Selecione o motivo do atendimento:**\n\n" +
      "🛑 **DENÚNCIA**\n" +
      "💰 **DOAÇÃO**\n" +
      "❓ **DÚVIDAS**"
    )
    .setFooter({ text: "Clique em um botão para abrir seu ticket." })
    // cor do embed (barra lateral). Você pode mudar depois.
    .setColor(0x2ecc71);
}

/* ===== encontra painel correto ===== */
async function findPanel(channel) {
  const msgs = await channel.messages.fetch({ limit: 50 });
  return (
    msgs.find(m => {
      if (m.author?.id !== client.user.id) return false;
      if (!m.components?.length) return false;

      const ids = m.components.flatMap(r => r.components).map(b => b.customId);
      return ids.includes("denuncia") && ids.includes("doacao") && ids.includes("duvidas");
    }) || null
  );
}

/* ===== cria ou edita painel ===== */
async function upsertPanel() {
  const channel = await client.channels.fetch(CHANNEL_ID).catch(() => null);
  if (!channel) return;

  const painel = await findPanel(channel);

  const payload = {
    embeds: [buildPanelEmbed()],
    components: [buildPanelRow()]
  };

  if (painel) {
    await painel.edit(payload).catch(() => {});
  } else {
    await channel.send(payload).catch(() => {});
  }
}

client.once("ready", async () => {
  console.log(`✅ Bot online como ${client.user.tag}`);
  await upsertPanel();
});

/* ===== comando !painel (teste rápido) ===== */
client.on("messageCreate", async (msg) => {
  if (msg.author.bot) return;
  if (msg.channel.id !== CHANNEL_ID) return;

  if (msg.content.trim().toLowerCase() === "!painel") {
    await upsertPanel();
    await msg.reply("✅ Painel atualizado!").catch(() => {});
  }
});

/* ================= INTERAÇÕES ================= */
client.on("interactionCreate", async (interaction) => {
  if (!interaction.isButton()) return;

  /* ===== FECHAR TICKET ===== */
  if (interaction.customId === CLOSE_ID) {
    if (interaction.channel?.parentId !== CATEGORY_ID) {
      return interaction.reply({ content: "❌ Use isso dentro de um ticket.", ephemeral: true });
    }
    await interaction.reply({ content: "🔒 Encerrando ticket...", ephemeral: true });
    setTimeout(() => interaction.channel.delete().catch(() => {}), 2000);
    return;
  }

  /* ===== COOLDOWN ===== */
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
    return interaction.reply({ content: "⏳ Criando seu ticket...", ephemeral: true });
  }
  creating.add(interaction.user.id);

  try {
    const canais = await interaction.guild.channels.fetch();
    const aberto = canais.find(
      c => c.type === ChannelType.GuildText && c.parentId === CATEGORY_ID && c.topic === interaction.user.id
    );
    if (aberto) {
      return interaction.reply({ content: `❌ Você já tem um ticket: ${aberto}`, ephemeral: true });
    }

    let nome = `${tipo}-${interaction.user.username || interaction.user.id}`
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "")
      .slice(0, 80);
    if (nome.length < 3) nome = `${tipo}-${interaction.user.id}`;

    const perms = [
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
      perms.push({ id: MOD_ROLE_ID, deny: [PermissionsBitField.Flags.ViewChannel] });
      perms.push({
        id: OWNER_ROLE_ID,
        allow: [
          PermissionsBitField.Flags.ViewChannel,
          PermissionsBitField.Flags.SendMessages,
          PermissionsBitField.Flags.ReadMessageHistory
        ]
      });
    } else {
      perms.push({
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
      name: nome,
      type: ChannelType.GuildText,
      parent: CATEGORY_ID,
      topic: interaction.user.id,
      permissionOverwrites: perms
    });

    const closeRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(CLOSE_ID)
        .setLabel("🔒 ENCERRAR TICKET")
        .setStyle(ButtonStyle.Secondary)
    );

    const mensagens = {
      denuncia:
        "🛑 **DENÚNCIA**\nEnvie as provas (prints ou vídeo) e descreva o ocorrido.\n\n⏰ **Prazo de retorno: 24h a 48h.**",
      doacao:
        "💰 **DOAÇÃO**\nEnvie o comprovante e aguarde o retorno.\n\n⏰ **Prazo de retorno: 24h a 48h.**",
      duvidas:
        "❓ **DÚVIDAS**\nEm que podemos ajudar?\n\n⏰ **Prazo de retorno: 24h a 48h.**"
    };

    if (tipo === "doacao") {
      await canal.send({
        content: `📩 **TICKET DE DOAÇÃO** aberto por ${interaction.user}\n\n${mensagens.doacao}\n\n👑 <@&${OWNER_ROLE_ID}>`,
        allowedMentions: { roles: [OWNER_ROLE_ID] },
        components: [closeRow]
      });
    } else {
      await canal.send({
        content: `📩 Ticket aberto por ${interaction.user}\n\n${mensagens[tipo]}\n\n<@&${MOD_ROLE_ID}>`,
        allowedMentions: { roles: [MOD_ROLE_ID] },
        components: [closeRow]
      });
    }

    await interaction.reply({ content: `✅ Ticket criado: ${canal}`, ephemeral: true });
  } finally {
    creating.delete(interaction.user.id);
  }
});

client.login(TOKEN);
