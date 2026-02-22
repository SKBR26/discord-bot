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
  intents: [
    GatewayIntentBits.Guilds
  ]
});

const CATEGORY_ID = "1474912707357577236";
const CHANNEL_ID = "1474948831882772500";
const TOKEN = process.env.TOKEN;

client.once('ready', async () => {
  console.log('Bot online!');

  const channel = await client.channels.fetch(CHANNEL_ID);

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
      }
    ]
  });

  await canal.send(`📩 Ticket de **${tipo}** aberto por ${interaction.user}`);
  await interaction.reply({ content: 'Seu ticket foi criado!', ephemeral: true });
});


client.login(TOKEN);



