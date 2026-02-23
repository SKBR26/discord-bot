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

const CATEGORY_ID = "1474912707357577236"; // categoria dos tickets
const CHANNEL_ID = "1474948831882772500";  // canal do painel
const MOD_ROLE_ID = "1474961654793109726"; // cargo moderação
const TOKEN = process.env.TOKEN;

// SOMENTE estes IDs podem criar ticket
const TICKET_TYPES = new Set(["denuncia", "compra", "duvidas"]);

// ID exclusivo do botão de fechar (não confunde com tipos)
const CLOSE_ID = "ticket_close";

client.once("ready", async () => {
  console.log(`✅ Bot online como ${client.user.tag}`);

  const channel = await client.channels.fetch(CHANNEL_ID).catch(() => null);
  if (!channel) return console.log("❌ Canal do painel não encontrado.");

  // não duplica painel
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

  // garante cache completo (pra achar ticket aberto)
  await interaction.guild.channels.fetch().catch(() => null);

  /* ============================
     🔒 BOTÃO: ENCERRAR TICKET
     (SÓ FECHA, NUNCA CRIA)
  ============================ */
  if (interaction.customId === CLOSE_ID) {
    // só funciona em canais dentro da categoria
    if (interaction.channel.parentId !== CATEGORY_ID) {
      return interaction.reply({
        content: "❌ Este botão só funciona dentro de um ticket.",
        ephemeral: true
      });
    }

    // opcional: permitir apenas MOD fechar
    if (!interaction.member.roles.cache.has(MOD_ROLE_ID)) {
      return interaction.reply({
        content: "❌ Apenas a moderação pode encerrar o ticket.",
        ephemeral: true
      });
    }

    await interaction.reply({
      content: "🔒 Ticket encerrado. Apagando em 2 segundos...",
      ephemeral: true
    });

    setTimeout(() => {
      interaction.channel.delete().catch(() => null);
    }, 2000);

    return;
  }

  /* ============================
     🎟️ CRIAR TICKET
     (SÓ se for denuncia/compra/duvidas)
  ============================ */
  const tipo = interaction.customId;

  // Se não for um tipo permitido, ignora (impede “fechar_ticket” virar ticket)
  if (!TICKET_TYPES.has(tipo)) {
    return interaction.reply({
      content: "❌ Botão inválido.",
      ephemeral: true
    }).catch(() => null);
  }

  // 1 ticket por usuário (salvo no topic)
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
      { id: interaction.guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
      { id: interaction.user.id, allow: [PermissionsBitField.Flags.ViewChannel] },
      { id: MOD_ROLE_ID, allow: [PermissionsBitField.Flags.ViewChannel] }
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
