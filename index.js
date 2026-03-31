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
const CHANNEL_ID = "1474948831882772500";
const MOD_ROLE_ID = "1474961654793109726";
const OWNER_ROLE_ID = "1401261879292198978";
const TOKEN = process.env.TOKEN;
/* ========================================== */

const CLOSE_ID = "ticket_close";
const creating = new Set();
const cooldown = new Map();
const COOLDOWN_MS = 2500;

/* ========= HELPERS ========= */
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

/* ========= PAINEL PROFISSIONAL ========= */
function buildPanelRows() {
  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("denuncia")
      .setLabel("DENÚNCIA")
      .setEmoji("🛑")
      .setStyle(ButtonStyle.Secondary), // cinza

    new ButtonBuilder()
      .setCustomId("doacao")
      .setLabel("DOAÇÃO")
      .setEmoji("💰")
      .setStyle(ButtonStyle.Danger) // vermelho
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("duvidas")
      .setLabel("DÚVIDAS")
      .setEmoji("❓")
      .setStyle(ButtonStyle.Success), // verde

    new ButtonBuilder()
      .setCustomId("aniversariante")
      .setLabel("ANIVERSARIANTE")
      .setEmoji("🎂")
      .setStyle(ButtonStyle.Primary) // azul
  );

  return [row1, row2];
}

function buildPanelEmbed(guild) {
  return new EmbedBuilder()
    .setTitle("🎫 Central de Atendimento")
    .setDescription(
      [
        "Bem-vindo(a) à central de tickets do **ERA DOS GIGANTES**.",
        "",
        "Selecione abaixo o setor desejado para abrir seu atendimento.",
        "",
        "**Categorias disponíveis:**",
        "🛑 Denúncia",
        "💰 Doação",
        "❓ Dúvidas",
        "🎂 Aniversariante"
      ].join("\n")
    )
    .setColor(0x57F287)
    .setFooter({
      text: "ERA DOS GIGANTES",
      iconURL: guild.iconURL?.({ size: 128 }) || undefined
    })
    .setTimestamp();
}

/* ========= EMBED DO TICKET ========= */
function buildTicketEmbed(guild, tipo) {
  const config = {
    denuncia: {
      color: 0x95a5a6,
      title: "🛑 Ticket de Denúncia",
      description:
        "Envie as provas necessárias, como prints ou vídeos, e descreva o ocorrido com o máximo de detalhes possível.\n\n⏰ **Prazo de retorno:** 24h a 48h."
    },
    doacao: {
      color: 0xe74c3c,
      title: "💰 Ticket de Doação",
      description:
        "Envie o comprovante da doação e aguarde o retorno da equipe responsável.\n\n⏰ **Prazo de retorno:** 24h a 48h."
    },
    duvidas: {
      color: 0x2ecc71,
      title: "❓ Ticket de Dúvidas",
      description:
        "Envie sua dúvida com o máximo de detalhes para que possamos ajudar da melhor forma.\n\n⏰ **Prazo de retorno:** 24h a 48h."
    },
    aniversariante: {
      color: 0x3498db,
      title: "🎂 Ticket de Aniversariante",
      description:
        "Envie um documento que comprove sua data de nascimento.\n\n⚠️ **Observação:** mostre apenas a data de nascimento.\n\n⏰ **Prazo de retorno:** 24h a 48h."
    }
  };

  const data = config[tipo];

  return new EmbedBuilder()
    .setTitle(data.title)
    .setDescription(data.description)
    .setColor(data.color)
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
    components: buildPanelRows()
  };

  if (painel) {
    await painel.edit(payload).catch(() => {});
  } else {
    await channel.send(payload).catch(() => {});
  }
});

/* ================= INTERAÇÕES ================= */
client.on("interactionCreate", async interaction => {
  if (!interaction.isButton()) return;

  /* ===== FECHAR ===== */
  if (interaction.customId === CLOSE_ID) {
    if (interaction.channel?.parentId !== CATEGORY_ID) {
      return interaction.reply({
        content: "❌ Este botão só funciona dentro de um ticket.",
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

  /* ===== COOLDOWN ===== */
  const now = Date.now();
  if (now - (cooldown.get(interaction.user.id) || 0) < COOLDOWN_MS) {
    return interaction.reply({
      content: "⏳ Aguarde um instante antes de tentar novamente.",
      ephemeral: true
    });
  }
  cooldown.set(interaction.user.id, now);

  const tipo = mapTipo(interaction.customId);
  if (!tipo) {
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
      c =>
        c.type === ChannelType.GuildText &&
        c.parentId === CATEGORY_ID &&
        c.topic === interaction.user.id
    );

    if (jaTem) {
      return interaction.reply({
        content: `❌ Você já possui um ticket aberto: ${jaTem}`,
        ephemeral: true
      });
    }

    let nomeCanal = `${tipo}-${interaction.user.username || interaction.user.id}`
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "")
      .slice(0, 80);

    if (nomeCanal.length < 3) nomeCanal = `${tipo}-${interaction.user.id}`;

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
          PermissionsBitField.Flags.ReadMessageHistory,
          PermissionsBitField.Flags.ManageChannels
        ]
      }
    ];

    if (tipo === "doacao" || tipo === "aniversariante") {
      permissionOverwrites.push({
        id: MOD_ROLE_ID,
        deny: [PermissionsBitField.Flags.ViewChannel]
      });

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
      new ButtonBuilder()
        .setCustomId(CLOSE_ID)
        .setLabel("Encerrar Ticket")
        .setEmoji("🔒")
        .setStyle(ButtonStyle.Secondary)
    );

    if (tipo === "doacao" || tipo === "aniversariante") {
      const titulo = tipo === "doacao" ? "DOAÇÃO" : "ANIVERSARIANTE";

      await canal.send({
        content: `📩 **Novo ticket de ${titulo}** aberto por ${interaction.user}\n\n👑 <@&${OWNER_ROLE_ID}>`,
        allowedMentions: { roles: [OWNER_ROLE_ID] },
        embeds: [buildTicketEmbed(interaction.guild, tipo)],
        components: [closeRow]
      });
    } else {
      await canal.send({
        content: `📩 **Novo ticket** aberto por ${interaction.user}\n\n<@&${MOD_ROLE_ID}>`,
        allowedMentions: { roles: [MOD_ROLE_ID] },
        embeds: [buildTicketEmbed(interaction.guild, tipo)],
        components: [closeRow]
      });
    }

    await interaction.reply({
      content: `✅ Seu ticket foi criado com sucesso: ${canal}`,
      ephemeral: true
    });
  } catch (err) {
    console.error("Erro ao criar ticket:", err);

    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: "❌ Ocorreu um erro ao criar seu ticket.",
        ephemeral: true
      }).catch(() => {});
    }
  } finally {
    creating.delete(interaction.user.id);
  }
});

client.login(TOKEN);
