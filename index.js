const { 
  Client, 
  GatewayIntentBits, 
  ChannelType, 
  PermissionsBitField, 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle 
} = require('discord.js');

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

const CATEGORY_ID = "1474912707357577236";
const CHANNEL_ID = "1474948831882772500";
const MOD_ROLE_ID = "1474961654793109726";
const TOKEN = process.env.TOKEN;

client.once('ready', async () => {
  console.log(`✅ Bot online como ${client.user.tag}`);

  const channel = await client.channels.fetch(CHANNEL_ID).catch(() => null);
  if (!channel) return console.log("❌ Canal do painel não encontrado.");

  const mensagens = await channel.messages.fetch({ limit: 10 });

  const jaExiste = mensagens.find(msg =>
    msg.author.id === client.user.id &&
    msg.components.length > 0
  );

  if (jaExiste) return;

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('denuncia')
      .setLabel('🛑 Denúncia')
      .setStyle(ButtonStyle.Danger),

    new ButtonBuilder()
      .setCustomId('compra')
      .setLabel('💰 Compra')
      .setStyle(ButtonStyle.Success),

    new ButtonBuilder()
      .setCustomId('duvidas')
      .setLabel('❓ Dúvidas')
      .setStyle(ButtonStyle.Primary)
  );

  await channel.send({
    content: '🎫 **Sistema de Tickets**\nSelecione abaixo o motivo do seu atendimento:',
    components: [row]
  });
});

client.on('interactionCreate', async interaction => {
  if (!interaction.isButton()) return;

  /* ================================
     🔒 BOTÃO DE FECHAR TICKET
  ================================== */
  if (interaction.customId === 'fechar_ticket') {

    if (interaction.channel.parentId !== CATEGORY_ID) {
      return interaction.reply({
        content: "❌ Este botão só funciona em tickets.",
        ephemeral: true
      });
    }

    if (!interaction.member.roles.cache.has(MOD_ROLE_ID)) {
      return interaction.reply({
        content: "❌ Apenas a moderação pode encerrar o ticket.",
        ephemeral: true
      });
    }

    await interaction.reply({
      content: "🔒 Encerrando ticket em 3 segundos...",
      ephemeral: true
    });

    setTimeout(() => {
      interaction.channel.delete().catch(() => null);
    }, 3000);

    return;
  }

  /* ================================
     🎟️ CRIAÇÃO DE TICKET
  ================================== */

  const tipo = interaction.customId;

  const jaTem = interaction.guild.channels.cache.find(c =>
    c.parentId === CATEGORY_ID &&
    c.name.includes(interaction.user.username.toLowerCase())
  );

  if (jaTem) {
    return interaction.reply({
      content: "❌ Você já possui um ticket aberto.",
      ephemeral: true
    });
  }

  const nomeCanal = `${tipo}-${interaction.user.username}`
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '');

  const canal = await interaction.guild.channels.create({
    name: nomeCanal,
    type: ChannelType.GuildText,
    parent: CATEGORY_ID,
    permissionOverwrites: [
      {
        id: interaction.guild.id,
        deny: [PermissionsBitField.Flags.ViewChannel]
      },
      {
        id: interaction.user.id,
        allow: [PermissionsBitField.Flags.ViewChannel]
      },
      {
        id: MOD_ROLE_ID,
        allow: [PermissionsBitField.Flags.ViewChannel]
      }
    ]
  });

  const closeRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('fechar_ticket')
      .setLabel('🔒 Encerrar Ticket')
      .setStyle(ButtonStyle.Secondary)
  );

  await canal.send({
    content: `📩 Ticket de **${tipo}** aberto por ${interaction.user}\n\n<@&${MOD_ROLE_ID}>`,
    components: [closeRow]
  });

  await interaction.reply({
    content: "✅ Seu ticket foi criado!",
    ephemeral: true
  });
});

client.login(TOKEN);
