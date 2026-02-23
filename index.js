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
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers]
});

/* ================= CONFIG ================= */
const CATEGORY_ID = "1474912707357577236";
const CHANNEL_ID  = "1474948831882772500";
const MOD_ROLE_ID = "1474961654793109726";

// ✅ ID DO CARGO Owner (só pra VER/ser marcado no ticket de doação, não pra fechar)
const OWNER_ROLE_ID = "1401261879292198978";

const TOKEN = process.env.TOKEN;
/* ========================================== */

const CLOSE_ID = "ticket_close";

// anti duplicação de ticket
const creating = new Set();
const cooldown = new Map(); // userId -> timestamp
const COOLDOWN_MS = 2500;

/* ========= Normalização / compatibilidade ========= */
function normalizeId(str) {
  return String(str || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function mapTipo(customId) {
  const id = normalizeId(customId).replace(/[^a-z0-9_-]/g, "");
  if (id === "compra") return "doacao";
  if (id === "doacao" || id.includes("doacao")) return "doacao";
  if (id === "denuncia" || id.includes("denuncia")) return "denuncia";
  if (id === "duvidas" || id === "duvida" || id.includes("duvida")) return "duvidas";
  return null;
}

/* ========= Painel ========= */
function buildPanelRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("denuncia").setLabel("🛑 Denúncia").setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId("doacao").setLabel("💝 Doação").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId("duvidas").setLabel("❓ Dúvidas").setStyle(ButtonStyle.Primary)
  );
}

const PANEL_TEXT = "🎫 **Sistema de Tickets**\nSelecione o motivo do atendimento:";

async function ensureSinglePanel(panelChannel) {
  const msgs = await panelChannel.messages.fetch({ limit: 100 });

  const botPanels = msgs
    .filter((m) => m.author?.id === client.user.id && m.components?.length > 0)
    .sort((a, b) => b.createdTimestamp - a.createdTimestamp);

  const keep = botPanels.first();

  // apaga extras
  const extras = botPanels.filter((m) => m.id !== keep?.id);
  for (const [, m] of extras) await m.delete().catch(() => null);

  // edita o que ficou
  if (keep) {
    await keep.edit({ content: PANEL_TEXT, components: [buildPanelRow()] }).catch(() => null);
    return keep;
  }

  // cria se não existir
  return panelChannel.send({ content: PANEL_TEXT, components: [buildPanelRow()] });
}

/* ================= BOT READY ================= */
client.once("ready", async () => {
  console.log(`✅ Bot online como ${client.user.tag}`);

  const channel = await client.channels.fetch(CHANNEL_ID).catch(() => null);
  if (!channel) return console.log("❌ Canal do painel não encontrado.");

  await ensureSinglePanel(channel).catch((err) => {
    console.log("❌ Erro ao garantir painel único:", err?.message || err);
  });

  console.log("✅ Painel ok (único e atualizado).");
});

/* ================= INTERAÇÕES ================= */
client.on("interactionCreate", async (interaction) => {
  if (!interaction.isButton()) return;

  /* ========= FECHAR TICKET (QUALQUER UM) ========= */
  if (interaction.customId === CLOSE_ID) {
    if (interaction.channel?.parentId !== CATEGORY_ID) {
      return interaction.reply({
        content: "❌ Este botão só funciona dentro de um ticket.",
        ephemeral: true
      });
    }

    // ✅ QUALQUER UM pode fechar qualquer ticket (doação também)
    await interaction.reply({
      content: "🔒 Encerrando ticket em 2 segundos...",
      ephemeral: true
    });

    setTimeout(() => {
      interaction.channel.delete().catch((err) => {
        console.log("❌ Erro ao deletar canal:", err?.message || err);
      });
    }, 2000);

    return;
  }

  /* ========= CRIAR TICKET ========= */
  const now = Date.now();
  const last = cooldown.get(interaction.user.id) || 0;
  if (now - last < COOLDOWN_MS) {
    return interaction.reply({ content: "⏳ Aguarde um instante...", ephemeral: true }).catch(() => null);
  }
  cooldown.set(interaction.user.id, now);

  const tipo = mapTipo(interaction.customId);
  if (!tipo) {
    console.log("❌ Botão inválido customId:", interaction.customId);
    return interaction.reply({ content: "❌ Botão inválido.", ephemeral: true }).catch(() => null);
  }

  if (creating.has(interaction.user.id)) {
    return interaction.reply({ content: "⏳ Aguarde, estou criando seu ticket...", ephemeral: true }).catch(() => null);
  }
  creating.add(interaction.user.id);

  try {
    const allChannels = await interaction.guild.channels.fetch();

    const jaTem = allChannels.find(
      (c) => c.type === ChannelType.GuildText && c.parentId === CATEGORY_ID && c.topic === interaction.user.id
    );

    if (jaTem) {
      return interaction.reply({
        content: `❌ Você já tem um ticket aberto: ${jaTem}`,
        ephemeral: true
      }).catch(() => null);
    }

    let nomeCanal = `${tipo}-${interaction.user.username || interaction.user.id}`
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "")
      .slice(0, 80);

    if (nomeCanal.length < 3) nomeCanal = `${tipo}-${interaction.user.id}`;

    /* ========= PERMISSÕES ========= */
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
      // doação: mod não vê
      permissionOverwrites.push({
        id: MOD_ROLE_ID,
        deny: [PermissionsBitField.Flags.ViewChannel]
      });

      // cargo owner vê (apenas para acompanhar/ser marcado)
      permissionOverwrites.push({
        id: OWNER_ROLE_ID,
        allow: [
          PermissionsBitField.Flags.ViewChannel,
          PermissionsBitField.Flags.SendMessages,
          PermissionsBitField.Flags.ReadMessageHistory
        ]
      });
    } else {
      // outros: mod vê
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

    const mensagens = {
      denuncia: "🛑 **Denúncia**\nEnvie provas (prints/vídeos) e descrição.",
      doacao:  "💝 **Doação**\nInforme valor e método.\n🔐 *Este canal é privado (apenas participantes autorizados).*",
      duvidas: "❓ **Dúvidas**\nExplique sua dúvida detalhadamente."
    };

    if (tipo === "doacao") {
      await canal.send({
        content: `📩 **Ticket de DOAÇÃO** aberto por ${interaction.user}\n\n${mensagens.doacao}\n\n👑 <@&${OWNER_ROLE_ID}>`,
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

    await interaction.reply({
      content: `✅ Seu ticket foi criado: ${canal}`,
      ephemeral: true
    }).catch(() => null);

  } catch (err) {
    console.log("❌ Erro ao criar ticket:", err?.message || err);
    await interaction.reply({
      content: "❌ Deu erro ao criar o ticket. Verifique permissões do bot.",
      ephemeral: true
    }).catch(() => null);
  } finally {
    creating.delete(interaction.user.id);
  }
});

/* ================= LOGIN ================= */
client.login(TOKEN);

