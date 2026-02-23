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
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers
  ]
});

/* ================= CONFIG ================= */
const CATEGORY_ID = "1474912707357577236";
const CHANNEL_ID  = "1474948831882772500";
const MOD_ROLE_ID = "1474961654793109726";
const OWNER_ID    = "1401261879292198978";
const TOKEN = process.env.TOKEN;
/* ========================================== */

const CLOSE_ID = "ticket_close";
const creating = new Set();

// ✅ NÃO mexe no painel: aceita "compra" (painel antigo) e "doacao" (novo)
const TICKET_TYPES = new Set(["denuncia", "duvidas", "doacao", "compra"]);

/* ================= BOT READY ================= */
client.once("ready", async () => {
  console.log(`✅ Bot online como ${client.user.tag}`);

  // ✅ Mantido igual: se o painel já existe, NÃO manda outro (não mexe no painel)
  const channel = await client.channels.fetch(CHANNEL_ID).catch(() => null);
  if (!channel) return console.log("❌ Canal do painel não encontrado.");

  const msgs = await channel.messages.fetch({ limit: 50 }).catch(() => null);
  if (!msgs) return console.log("❌ Não consegui buscar mensagens.");

  const jaExiste = msgs.find(
    (m) => m.author?.id === client.user.id && m.components?.length > 0
  );
  if (jaExiste) return;

  // Se algum dia você quiser que o bot crie painel novo automaticamente,
  // deixa esse trecho. Se NÃO quiser, pode apagar essa parte depois.
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("denuncia")
      .setLabel("🛑 Denúncia")
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId("doacao")
      .setLabel("💝 Doação")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId("duvidas")
      .setLabel("❓ Dúvidas")
      .setStyle(ButtonStyle.Primary)
  );

  await channel.send({
    content: "🎫 **Sistema de Tickets**\nSelecione o motivo do atendimento:",
    components: [row]
  });
});

/* ================= INTERAÇÕES ================= */
client.on("interactionCreate", async (interaction) => {
  if (!interaction.isButton()) return;

  /* ========= FECHAR TICKET ========= */
  if (interaction.customId === CLOSE_ID) {
    if (interaction.channel.parentId !== CATEGORY_ID) {
      return interaction.reply({
        content: "❌ Este botão só funciona dentro de um ticket.",
        ephemeral: true
      });
    }

    // 💝 Doação: só OWNER fecha
    const isDoacao = interaction.channel.name?.startsWith("doacao-");
    if (isDoacao) {
      if (interaction.user.id !== OWNER_ID) {
        return interaction.reply({
          content: "❌ Apenas o OWNER pode encerrar tickets de doação.",
          ephemeral: true
        });
      }
    } else {
      // Outros: só moderação fecha
      if (!interaction.member.roles.cache.has(MOD_ROLE_ID)) {
        return interaction.reply({
          content: "❌ Apenas a moderação pode encerrar o ticket.",
          ephemeral: true
        });
      }
    }

    await interaction.reply({
      content: "🔒 Encerrando ticket em 2 segundos...",
      ephemeral: true
    });

    setTimeout(() => {
      interaction.channel.delete().catch(() => {});
    }, 2000);

    return;
  }

  /* ========= CRIAR TICKET ========= */
  const tipoRaw = interaction.customId;

  // ✅ Conversão global SEM mexer no painel:
  // se o painel mandar "compra", internamente vira "doacao"
  const tipo = tipoRaw === "compra" ? "doacao" : tipoRaw;

  // valida pelo RAW (porque o painel pode mandar "compra")
  if (!TICKET_TYPES.has(tipoRaw)) {
    return interaction.reply({
      content: "❌ Botão inválido.",
      ephemeral: true
    });
  }

  if (creating.has(interaction.user.id)) {
    return interaction.reply({
      content: "⏳ Aguarde, estou criando seu ticket...",
      ephemeral: true
    });
  }

  creating.add(interaction.user.id);

  try {
    const allChannels = await interaction.guild.channels.fetch();

    const jaTem = allChannels.find(
      (c) =>
        c.type === ChannelType.GuildText &&
        c.parentId === CATEGORY_ID &&
        c.topic === interaction.user.id
    );

    if (jaTem) {
      return interaction.reply({
        content: `❌ Você já tem um ticket aberto: ${jaTem}`,
        ephemeral: true
      });
    }

    let nomeCanal = `${tipo}-${interaction.user.username || interaction.user.id}`
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "")
      .slice(0, 80);

    if (nomeCanal.length < 3) {
      nomeCanal = `${tipo}-${interaction.user.id}`;
    }

    /* ========= PERMISSÕES ========= */
    const permissionOverwrites = [
      {
        id: interaction.guild.id,
        deny: [PermissionsBitField.Flags.ViewChannel]
      },
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
          PermissionsBitField.Flags.ReadMessageHistory
        ]
      }
    ];

    // 💝 DOAÇÃO → moderação NÃO vê (mesmo que a categoria dê acesso)
    if (tipo === "doacao") {
      permissionOverwrites.push({
        id: MOD_ROLE_ID,
        deny: [PermissionsBitField.Flags.ViewChannel]
      });

      permissionOverwrites.push({
        id: OWNER_ID,
        allow: [
          PermissionsBitField.Flags.ViewChannel,
          PermissionsBitField.Flags.SendMessages,
          PermissionsBitField.Flags.ReadMessageHistory
        ]
      });
    } else {
      // 🛑 Denúncia / ❓ Dúvidas → moderação vê
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
      new ButtonBuilder()
        .setCustomId(CLOSE_ID)
        .setLabel("🔒 Encerrar Ticket")
        .setStyle(ButtonStyle.Secondary)
    );

    const mensagens = {
      denuncia: "🛑 **Denúncia**\nEnvie provas (prints/vídeos) e descrição.",
      doacao: "💝 **Doação**\nInforme valor e método.\n🔐 *Somente você e o Owner podem ver este canal.*",
      duvidas: "❓ **Dúvidas**\nExplique sua dúvida detalhadamente."
    };

    await canal.send({
      content: `📩 Ticket aberto por ${interaction.user}\n\n${mensagens[tipo]}\n\n${
        tipo === "doacao" ? `<@${OWNER_ID}>` : `<@&${MOD_ROLE_ID}>`
      }`,
      components: [closeRow]
    });

    await interaction.reply({
      content: `✅ Seu ticket foi criado: ${canal}`,
      ephemeral: true
    });
  } finally {
    creating.delete(interaction.user.id);
  }
});

/* ================= LOGIN ================= */
client.login(TOKEN);
