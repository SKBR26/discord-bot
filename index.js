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

const CATEGORY_ID = "1474912707357577236"; // ID da categoria
const CHANNEL_ID = "1474948831882772500";  // ID do canal do painel
const MOD_ROLE_ID = "1474961654793109726"; // ID do cargo Moderação
const TOKEN = process.env.TOKEN;

client.once('ready', async () => {
  console.log('Bot online!');

  const channel = await client.channels.fetch(CHANNEL_ID);

  // Verifica se já existe painel para não duplicar
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
    content: '🎫 **Sistema de Tickets**\nPara que possamos ajudar, selecione o motivo abaixo:',
    components: [row]
  });
});

client.on('interactionCreate', async interaction => {
  if (!interaction.isButton()) return;

  const tipo = interaction.customId;

  const canal = await interaction.guild.channels.create({
    name: `${tipo}-${interaction.user.username}`,
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

  await canal.send({
    content: `📩 Ticket de **${tipo}** aberto por ${interaction.user}\n\n<@&${MOD_ROLE_ID}>`
  });

  await interaction.reply({
    content: '✅ Seu ticket foi criado!',
    ephemeral: true
  });
});

client.login(TOKEN);
