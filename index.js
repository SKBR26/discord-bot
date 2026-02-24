/**
 * Ticket Bot + Logs (Transcript HTML estilo "print")
 * Discord.js v14
 *
 * ✅ Logs em HTML (quase uma print) ao fechar ticket
 * ✅ Envia transcript no canal de logs: 1475713089092583554
 *
 * IMPORTANTE:
 * - Ative no Developer Portal do bot: MESSAGE CONTENT INTENT
 * - Garanta permissões do bot no canal de logs: Ver canal / Enviar / Anexar arquivos / Ler histórico
 */

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
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

/* ================= CONFIG ================= */
const CATEGORY_ID = "1474912707357577236";
const CHANNEL_ID  = "1474948831882772500";
const MOD_ROLE_ID = "1474961654793109726";
const OWNER_ROLE_ID = "1401261879292198978"; // apenas para ver/ser marcado em doação
const LOGS_CHANNEL_ID = "1475713089092583554"; // ✅ canal de logs
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

/* ========= painel ========= */
function buildPanelRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("denuncia").setLabel("🛑 Denúncia").setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId("doacao").setLabel("💝 Doação").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId("duvidas").setLabel("❓ Dúvidas").setStyle(ButtonStyle.Primary)
  );
}

const PANEL_TEXT = "🎫 **Sistema de Tickets**\nSelecione o motivo do atendimento:";

/* =========================================================
   LOGS: transcript HTML "quase print"
   ========================================================= */

async function fetchAllMessages(channel, limitTotal = 2000) {
  const all = [];
  let lastId = null;

  while (all.length < limitTotal) {
    const options = { limit: 100 };
    if (lastId) options.before = lastId;

    const batch = await channel.messages.fetch(options);
    if (batch.size === 0) break;

    all.push(...batch.values());
    lastId = batch.last().id;

    if (batch.size < 100) break;
  }

  return all.sort((a, b) => a.createdTimestamp - b.createdTimestamp);
}

function brTime(ts) {
  return new Date(ts).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour12: false
  });
}

function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function linkify(text) {
  const escaped = escapeHtml(text);
  return escaped.replace(
    /(https?:\/\/[^\s]+)/g,
    `<a href="$1" target="_blank" rel="noreferrer">$1</a>`
  );
}

function normalizeContent(content) {
  let c = String(content ?? "").replace(/\r/g, "");
  c = c.replace(/[ \t]+/g, " ").trim();
  return c;
}

function isImageAttachment(att) {
  const name = (att.name || "").toLowerCase();
  const ct = (att.contentType || "").toLowerCase();
  return (
    ct.startsWith("image/") ||
    name.endsWith(".png") ||
    name.endsWith(".jpg") ||
    name.endsWith(".jpeg") ||
    name.endsWith(".gif") ||
    name.endsWith(".webp")
  );
}

function buildTranscriptHtml({ guild, channel, opener, openerId, closedBy, reason, messages }) {
  const header = `
    <div class="header">
      <div class="title">Transcript do Ticket</div>
      <div class="meta">
        <div><b>Servidor:</b> ${escapeHtml(guild.name)} (${guild.id})</div>
        <div><b>Canal:</b> #${escapeHtml(channel.name)} (${channel.id})</div>
        <div><b>Aberto por:</b> ${
          opener ? `${escapeHtml(opener.user.tag)} (${opener.id})` : escapeHtml(openerId || "desconhecido")
        }</div>
        <div><b>Fechado por:</b> ${escapeHtml(closedBy?.tag || "desconhecido")} (${escapeHtml(closedBy?.id || "?")})</div>
        ${reason ? `<div><b>Motivo:</b> ${escapeHtml(reason)}</div>` : ""}
        <div><b>Fechamento:</b> ${escapeHtml(brTime(Date.now()))} (America/Sao_Paulo)</div>
        <div><b>Total de mensagens:</b> ${messages.length}</div>
      </div>
    </div>
  `;

  const items = messages.map(msg => {
    const author = msg.author;
    const avatar = author?.displayAvatarURL?.({ extension: "png", size: 64 }) || "";
    const name = author?.username || "Unknown";
    const tag = author?.tag || "Unknown";
    const time = brTime(msg.createdTimestamp);

    const content = normalizeContent(msg.content);
    const contentHtml = content
      ? `<div class="content">${linkify(content).replace(/\n/g, "<br>")}</div>`
      : "";

    const attachments = [...msg.attachments.values()];
    const attHtml = attachments.length
      ? `
        <div class="attachments">
          ${attachments.map(a => {
            const url = escapeHtml(a.url);
            const fname = escapeHtml(a.name || "arquivo");
            if (isImageAttachment(a)) {
              return `
                <a class="imgwrap" href="${url}" target="_blank" rel="noreferrer">
                  <img src="${url}" alt="${fname}">
                </a>
              `;
            }
            return `<a class="file" href="${url}" target="_blank" rel="noreferrer">📎 ${fname}</a>`;
          }).join("")}
        </div>
      `
      : "";

    const embedNote = msg.embeds?.length ? `<div class="embednote">🧩 ${msg.embeds.length} embed(s)</div>` : "";

    if (!content && attachments.length === 0 && (!msg.embeds || msg.embeds.length === 0)) return "";

    return `
      <div class="msg">
        <img class="avatar" src="${escapeHtml(avatar)}" alt="">
        <div class="bubble">
          <div class="topline">
            <span class="name">${escapeHtml(name)}</span>
            <span class="tag">${escapeHtml(tag)}</span>
            <span class="time">${escapeHtml(time)}</span>
          </div>
          ${contentHtml}
          ${attHtml}
          ${embedNote}
        </div>
      </div>
    `;
  }).join("");

  return `
<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Transcript - ${escapeHtml(channel.name)}</title>
  <style>
    :root{
      --bg:#0f111a;
      --panel:#151826;
      --text:#e6e6e6;
      --muted:#a7adba;
      --line:rgba(255,255,255,.08);
      --bubble:#1b2033;
      --link:#6aa7ff;
    }
    *{box-sizing:border-box}
    body{
      margin:0;
      font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial, "Apple Color Emoji","Segoe UI Emoji";
      background:var(--bg);
      color:var(--text);
    }
    .wrap{max-width:980px;margin:0 auto;padding:18px}
    .header{
      background:var(--panel);
      border:1px solid var(--line);
      border-radius:14px;
      padding:14px 14px;
      margin-bottom:14px;
    }
    .title{font-size:18px;font-weight:700;margin-bottom:8px}
    .meta{color:var(--muted);font-size:13px;line-height:1.6}
    .msg{
      display:flex;
      gap:10px;
      padding:10px 0;
      border-bottom:1px solid var(--line);
    }
    .avatar{
      width:42px;height:42px;border-radius:50%;
      flex:0 0 auto;
      background:#222;
      object-fit:cover;
    }
    .bubble{
      flex:1;
      background:var(--bubble);
      border:1px solid var(--line);
      border-radius:14px;
      padding:10px 12px;
    }
    .topline{
      display:flex;gap:8px;align-items:baseline;flex-wrap:wrap;
      margin-bottom:6px;
    }
    .name{font-weight:700}
    .tag{color:var(--muted);font-size:12px}
    .time{color:var(--muted);font-size:12px;margin-left:auto}
    .content{white-space:normal;line-height:1.45}
    a{color:var(--link);text-decoration:none}
    a:hover{text-decoration:underline}
    .attachments{margin-top:8px;display:flex;gap:10px;flex-wrap:wrap}
    .file{
      display:inline-block;
      padding:8px 10px;
      border:1px solid var(--line);
      border-radius:12px;
      background:rgba(255,255,255,.03);
      font-size:13px;
    }
    .imgwrap{
      border:1px solid var(--line);
      border-radius:12px;
      overflow:hidden;
      display:inline-block;
      background:rgba(255,255,255,.03);
    }
    .imgwrap img{
      display:block;
      max-width:320px;
      height:auto;
    }
    .embednote{margin-top:8px;color:var(--muted);font-size:12px}
  </style>
</head>
<body>
  <div class="wrap">
    ${header}
    ${items || `<div style="color:var(--muted)">Sem mensagens para exibir.</div>`}
  </div>
</body>
</html>
`;
}

async function sendTicketLogHtml({ interaction, closedBy, reason, ignoreBotMessages = true }) {
  const guild = interaction.guild;
  const channel = interaction.channel;

  const logChannel = await guild.channels.fetch(LOGS_CHANNEL_ID).catch(() => null);
  if (!logChannel) return;

  const openerId = channel.topic; // topic = user.id
  const opener = openerId ? await guild.members.fetch(openerId).catch(() => null) : null;

  let msgs = await fetchAllMessages(channel, 2000).catch(() => []);
  if (ignoreBotMessages) {
    const meId = guild.members.me?.id;
    if (meId) msgs = msgs.filter(m => m.author?.id !== meId);
  }

  const html = buildTranscriptHtml({
    guild,
    channel,
    opener,
    openerId,
    closedBy,
    reason,
    messages: msgs
  });

  const baseName = `ticket-${channel.name}-${channel.id}`.replace(/[^a-zA-Z0-9-_]/g, "").slice(0, 80);
  const fileName = `${baseName}.html`;

  await logChannel.send({
    content: `🧾 **Transcript (estilo print)** • \`${channel.name}\``,
    files: [{ attachment: Buffer.from(html, "utf-8"), name: fileName }]
  }).catch(() => {});
}

/* ================= READY ================= */
client.once("ready", async () => {
  console.log(`✅ Bot online como ${client.user.tag}`);

  const channel = await client.channels.fetch(CHANNEL_ID).catch(() => null);
  if (!channel) return;

  let painel = null;
  try {
    const msgs = await channel.messages.fetch({ limit: 30 });
    painel = msgs.find(m => m.author?.id === client.user.id && m.components?.length > 0);
  } catch {}

  if (painel) {
    await painel.edit({ content: PANEL_TEXT, components: [buildPanelRow()] }).catch(() => {});
  } else {
    await channel.send({ content: PANEL_TEXT, components: [buildPanelRow()] }).catch(() => {});
  }
});

/* ================= INTERAÇÕES ================= */
client.on("interactionCreate", async (interaction) => {
  if (!interaction.isButton()) return;

  /* ===== FECHAR TICKET ===== */
  if (interaction.customId === CLOSE_ID) {
    if (interaction.channel?.parentId !== CATEGORY_ID) {
      return interaction.reply({ content: "❌ Este botão só funciona dentro de um ticket.", ephemeral: true });
    }

    // Opcional: só staff fecha (descomente se quiser)
    // const member = interaction.member;
    // const canClose =
    //   member?.permissions?.has(PermissionsBitField.Flags.ManageChannels) ||
    //   member?.roles?.cache?.has(MOD_ROLE_ID) ||
    //   member?.roles?.cache?.has(OWNER_ROLE_ID);
    // if (!canClose) return interaction.reply({ content: "❌ Só a staff pode fechar este ticket.", ephemeral: true });

    await interaction.reply({
      content: "🔒 Gerando transcript (estilo print) e encerrando em 2 segundos...",
      ephemeral: true
    });

    // ✅ envia transcript HTML mais limpo (não registra mensagens do bot)
    await sendTicketLogHtml({
      interaction,
      closedBy: interaction.user,
      reason: null,
      ignoreBotMessages: true
    });

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
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "")
      .slice(0, 80);
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

    const mensagens = {
      denuncia:
        "🛑 **Denúncia**\nEnvie as provas (prints ou vídeo) e descreva o ocorrido por gentileza.\n\n⏰ **Prazo de retorno: 24h a 48h.**",
      doacao:
        "💝 **Doação**\nEnvie o comprovante e aguarde o retorno dos Staffs.\n\n⏰ **Prazo de retorno: 24h a 48h.**",
      duvidas:
        "❓ **Dúvidas**\nEm que podemos ajudá-los?\n\n⏰ **Prazo de retorno: 24h a 48h.**"
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

    await interaction.reply({ content: `✅ Seu ticket foi criado: ${canal}`, ephemeral: true });
  } finally {
    creating.delete(interaction.user.id);
  }
});

client.login(TOKEN);
