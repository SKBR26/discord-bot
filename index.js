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

/* =======================================================
   CLIENT
======================================================= */

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers
  ]
});

/* =======================================================
   CONFIG
======================================================= */

const CATEGORY_ID = "1474912707357577236";
const CHANNEL_ID = "1474948831882772500";

const MOD_ROLE_ID = "1474961654793109726";
const OWNER_ROLE_ID = "1401261879292198978";

const TOKEN = process.env.TOKEN;

/* =======================================================
   IDS
======================================================= */

const CLOSE_ID = "ticket_close";
const CLAIM_ID = "ticket_claim";

/* =======================================================
   CONTROLE
======================================================= */

const creating = new Set();
const cooldown = new Map();

const COOLDOWN_MS = 3000;

/* =======================================================
   HELPERS
======================================================= */

function normalizeText(str) {
  return String(str || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function sanitizeChannelName(name) {
  return normalizeText(name)
    .replace(/[^a-z0-9-]/g, "")
    .slice(0, 90);
}

function mapTipo(customId) {
  const id = normalizeText(customId);

  if (id.includes("denuncia")) return "denuncia";
  if (id.includes("doacao")) return "doacao";
  if (id.includes("duvida")) return "duvidas";
  if (id.includes("aniversariante")) return "aniversariante";

  return null;
}

function getTicketType(channelName = "") {
  const name = normalizeText(channelName);

  if (name.startsWith("denuncia-")) return "denuncia";
  if (name.startsWith("doacao-")) return "doacao";
  if (name.startsWith("duvidas-")) return "duvidas";
  if (name.startsWith("aniversariante-")) return "aniversariante";

  return null;
}

function getTicketColor(tipo) {
  const colors = {
    denuncia: 0x95a5a6,
    doacao: 0xe74c3c,
    duvidas: 0x3498db,
    aniversariante: 0x2ecc71
  };

  return colors[tipo] || 0x57F287;
}

function canManageTicket(member, tipo) {
  if (!member) return false;

  if (
    tipo === "doacao" ||
    tipo === "aniversariante"
  ) {
    return member.roles.cache.has(OWNER_ROLE_ID);
  }

  return member.roles.cache.has(MOD_ROLE_ID);
}

/* =======================================================
   MENSAGENS
======================================================= */

const mensagens = {
  denuncia:
    "🛑 **Denúncia**\n" +
    "Envie provas (prints ou vídeos) e descreva o ocorrido.\n\n" +
    "⏰ **Prazo de retorno: até 48h.**",

  doacao:
    "💰 **Doação**\n" +
    "Envie o comprovante da doação.\n\n" +
    "⏰ **Prazo de retorno: até 48h.**",

  duvidas:
    "❓ **Dúvidas**\n" +
    "Descreva sua dúvida detalhadamente.\n\n" +
    "⏰ **Prazo de retorno: até 48h.**",

  aniversariante:
    "🎂 **Aniversariante**\n" +
    "Envie um documento comprovando a data de nascimento.\n\n" +
    "⚠️ Mostre apenas a data de nascimento.\n\n" +
    "⏰ **Prazo de retorno: até 48h.**"
};

/* =======================================================
   BOTÕES
======================================================= */

function buildPanelButtons() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("denuncia")
      .setLabel("DENÚNCIA")
      .setEmoji("🛑")
      .setStyle(ButtonStyle.Secondary),

    new ButtonBuilder()
      .setCustomId("doacao")
      .setLabel("DOAÇÃO")
      .setEmoji("💰")
      .setStyle(ButtonStyle.Danger),

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

function buildTicketButtons(
  claimed = false,
  claimedBy = null
) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(CLAIM_ID)
      .setLabel(
        claimed
          ? `Assumido por ${claimedBy}`
          : "Assumir Ticket"
      )
      .setEmoji("🙋")
      .setStyle(ButtonStyle.Primary)
      .setDisabled(claimed),

    new ButtonBuilder()
      .setCustomId(CLOSE_ID)
      .setLabel("Fechar Ticket")
      .setEmoji("🔒")
      .setStyle(ButtonStyle.Secondary)
  );
}

/* =======================================================
   EMBEDS
======================================================= */

function buildPanelEmbed(guild) {
  return new EmbedBuilder()
    .setTitle("🎫 Sistema de Tickets")
    .setDescription(
      [
        "Selecione abaixo o motivo do atendimento.",
        "",
        "🛑 Denúncias",
        "💰 Doações",
        "❓ Dúvidas",
        "🎂 Aniversariante"
      ].join("\n")
    )
    .setColor(0x57F287)
    .setThumbnail(
      guild.iconURL({ dynamic: true, size: 256 })
    )
    .setFooter({
      text: "ERA DOS GIGANTES"
    })
    .setTimestamp();
}

function buildTicketEmbed(guild, tipo) {
  return new EmbedBuilder()
    .setColor(getTicketColor(tipo))
    .setDescription(mensagens[tipo])
    .setFooter({
      text: guild.name,
      iconURL: guild.iconURL({
        dynamic: true
      })
    })
    .setTimestamp();
}

/* =======================================================
   READY
======================================================= */

client.once("ready", async () => {
  console.log(`✅ Online como ${client.user.tag}`);

  const channel = await client.channels
    .fetch(CHANNEL_ID)
    .catch(() => null);

  if (!channel) {
    return console.log("❌ Canal do painel não encontrado.");
  }

  try {
    const messages = await channel.messages.fetch({
      limit: 20
    });

    const existingPanel = messages.find(msg => {
      if (msg.author.id !== client.user.id) return false;

      const ids = msg.components.flatMap(
        row => row.components.map(c => c.customId)
      );

      return (
        ids.includes("denuncia") &&
        ids.includes("doacao") &&
        ids.includes("duvidas") &&
        ids.includes("aniversariante")
      );
    });

    const payload = {
      embeds: [buildPanelEmbed(channel.guild)],
      components: [buildPanelButtons()]
    };

    if (existingPanel) {
      await existingPanel.edit(payload);
      console.log("♻️ Painel atualizado.");
    } else {
      await channel.send(payload);
      console.log("📨 Painel enviado.");
    }

  } catch (err) {
    console.error("Erro no painel:", err);
  }
});

/* =======================================================
   INTERAÇÕES
======================================================= */

client.on("interactionCreate", async interaction => {
  if (!interaction.isButton()) return;

  /* ===================================================
     CLAIM
  =================================================== */

  if (interaction.customId === CLAIM_ID) {
    const tipo = getTicketType(
      interaction.channel.name
    );

    if (!tipo) {
      return interaction.reply({
        content: "❌ Ticket inválido.",
        ephemeral: true
      });
    }

    if (
      !canManageTicket(
        interaction.member,
        tipo
      )
    ) {
      return interaction.reply({
        content:
          "❌ Você não possui permissão.",
        ephemeral: true
      });
    }

    await interaction.update({
      components: [
        buildTicketButtons(
          true,
          interaction.user.username
        )
      ]
    });

    return interaction.channel.send({
      content:
        `✅ ${interaction.user} assumiu este ticket.`
    });
  }

  /* ===================================================
     FECHAR
  =================================================== */

  if (interaction.customId === CLOSE_ID) {
    if (
      !interaction.member.roles.cache.has(
        MOD_ROLE_ID
      )
    ) {
      return interaction.reply({
        content:
          "❌ Apenas moderadores podem fechar tickets.",
        ephemeral: true
      });
    }

    await interaction.reply({
      content:
        "🔒 Ticket será fechado em 3 segundos...",
      ephemeral: true
    });

    setTimeout(() => {
      interaction.channel.delete().catch(() => {});
    }, 3000);

    return;
  }

  /* ===================================================
     COOLDOWN
  =================================================== */

  const now = Date.now();

  if (
    now -
      (cooldown.get(interaction.user.id) || 0) <
    COOLDOWN_MS
  ) {
    return interaction.reply({
      content:
        "⏳ Aguarde alguns segundos.",
      ephemeral: true
    });
  }

  cooldown.set(interaction.user.id, now);

  /* ===================================================
     TIPO
  =================================================== */

  const tipo = mapTipo(interaction.customId);

  if (!tipo) {
    return interaction.reply({
      content: "❌ Tipo inválido.",
      ephemeral: true
    });
  }

  /* ===================================================
     CRIAÇÃO DUPLA
  =================================================== */

  if (creating.has(interaction.user.id)) {
    return interaction.reply({
      content:
        "⏳ Seu ticket já está sendo criado.",
      ephemeral: true
    });
  }

  creating.add(interaction.user.id);

  try {

    /* ===============================================
       VERIFICAR TICKET EXISTENTE
    =============================================== */

    const channels =
      await interaction.guild.channels.fetch();

    const existing = channels.find(
      c =>
        c.parentId === CATEGORY_ID &&
        c.topic === interaction.user.id
    );

    if (existing) {
      creating.delete(interaction.user.id);

      return interaction.reply({
        content:
          `❌ Você já possui um ticket aberto: ${existing}`,
        ephemeral: true
      });
    }

    /* ===============================================
       NOME
    =============================================== */

    let channelName = sanitizeChannelName(
      `${tipo}-${interaction.user.username}`
    );

    if (channelName.length < 3) {
      channelName =
        `${tipo}-${interaction.user.id}`;
    }

    /* ===============================================
       PERMISSÕES
    =============================================== */

    const overwrites = [
      {
        id: interaction.guild.id,
        deny: [
          PermissionsBitField.Flags.ViewChannel
        ]
      },

      {
        id: interaction.user.id,
        allow: [
          PermissionsBitField.Flags.ViewChannel,
          PermissionsBitField.Flags.SendMessages,
          PermissionsBitField.Flags.ReadMessageHistory,
          PermissionsBitField.Flags.AttachFiles
        ]
      },

      {
        id: client.user.id,
        allow: [
          PermissionsBitField.Flags.ViewChannel,
          PermissionsBitField.Flags.SendMessages,
          PermissionsBitField.Flags.ReadMessageHistory,
          PermissionsBitField.Flags.ManageChannels,
          PermissionsBitField.Flags.ManageMessages
        ]
      }
    ];

    if (
      tipo === "doacao" ||
      tipo === "aniversariante"
    ) {
      overwrites.push({
        id: MOD_ROLE_ID,
        deny: [
          PermissionsBitField.Flags.ViewChannel
        ]
      });

      overwrites.push({
        id: OWNER_ROLE_ID,
        allow: [
          PermissionsBitField.Flags.ViewChannel,
          PermissionsBitField.Flags.SendMessages,
          PermissionsBitField.Flags.ReadMessageHistory
        ]
      });

    } else {
      overwrites.push({
        id: MOD_ROLE_ID,
        allow: [
          PermissionsBitField.Flags.ViewChannel,
          PermissionsBitField.Flags.SendMessages,
          PermissionsBitField.Flags.ReadMessageHistory,
          PermissionsBitField.Flags.ManageMessages,
          PermissionsBitField.Flags.ManageChannels
        ]
      });
    }

    /* ===============================================
       CRIAR CANAL
    =============================================== */

    const ticketChannel =
      await interaction.guild.channels.create({
        name: channelName,
        type: ChannelType.GuildText,
        parent: CATEGORY_ID,
        topic: interaction.user.id,
        permissionOverwrites: overwrites
      });

    /* ===============================================
       MENÇÃO
    =============================================== */

    const mentionRole =
      tipo === "doacao" ||
      tipo === "aniversariante"
        ? OWNER_ROLE_ID
        : MOD_ROLE_ID;

    /* ===============================================
       ENVIAR MENSAGEM
    =============================================== */

    await ticketChannel.send({
      content:
        `📩 Ticket aberto por ${interaction.user}\n\n` +
        `<@&${mentionRole}>`,

      allowedMentions: {
        roles: [mentionRole]
      },

      embeds: [
        buildTicketEmbed(
          interaction.guild,
          tipo
        )
      ],

      components: [buildTicketButtons()]
    });

    /* ===============================================
       RESPOSTA
    =============================================== */

    await interaction.reply({
      content:
        `✅ Ticket criado com sucesso: ${ticketChannel}`,
      ephemeral: true
    });

  } catch (err) {
    console.error(err);

    if (
      !interaction.replied &&
      !interaction.deferred
    ) {
      await interaction.reply({
        content:
          "❌ Ocorreu um erro ao criar o ticket.",
        ephemeral: true
      }).catch(() => {});
    }

  } finally {
    creating.delete(interaction.user.id);
  }
});

/* =======================================================
   LOGIN
======================================================= */

client.login(TOKEN);
