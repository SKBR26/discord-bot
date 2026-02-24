/**
 * ✅ TICKETS + LOGS HTML (abre no navegador) — COMPLETO E CORRIGIDO
 * Discord.js v14
 *
 * O que este código faz:
 * ✅ Cria tickets (denúncia / doação / dúvidas) dentro da categoria CATEGORY_ID
 * ✅ Evita duplicar painel (não cria painel 2x)
 * ✅ Evita ticket duplicado (lock forte)
 * ✅ Ao fechar: gera TRANSCRIPT em HTML (estilo “print do Discord”) e envia no canal de logs
 * ✅ Só apaga o canal do ticket SE o log for enviado com sucesso (pra não perder conversa)
 * ✅ Debug no console (mostra exatamente por que falhou, se falhar)
 *
 * IMPORTANTE (Discord Developer Portal):
 * - Ligue: MESSAGE CONTENT INTENT
 *
 * IMPORTANTE (Permissões do bot):
 * - Canal de logs: Ver Canal / Enviar Mensagens / Anexar Arquivos / Ler Histórico
 * - Categoria tickets: Gerenciar Canais (ou permissões suficientes para criar/deletar canais)
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
const CHANNEL_ID  = "1474948831882772500";      // canal onde fica o painel
const MOD_ROLE_ID = "1474961654793109726";
const OWNER_ROLE_ID = "1401261879292198978";    // só pra doação
const LOGS_CHANNEL_ID = "1475713089092583554";  // ✅ canal de logs
const TOKEN = process.env.TOKEN;
/* ========================================== */

const CLOSE_ID = "ticket_close";
const COOLDOWN_MS = 2500;

const cooldown = new Map();       // cooldown por usuário
const creatingUser = new Set();   // lock por usuário
const creatingKey = new Set();    // lock por guild+user+tipo (evita duplicar mesmo com lag)

/* ================= HELPERS ================= */
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

/* ================= PAINEL ================= */
function buildPanelRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("denuncia").setLabel("🛑 Denúncia").setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId("doacao").setLabel("💝 Doação").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId("duvidas").setLabel("❓ Dúvidas").setStyle(ButtonStyle.Primary)
  );
}

const PANEL_TEXT = "🎫 **Sistema de Tickets**\nSelecione o motivo do atendimento:";

function isTicketPanelMessage(msg, botId) {
  if (!msg) return false;
  if (msg.author?.id !== botId) return false;
  if (!msg.components?.length) return false;
  if (!(msg.content || "").includes("Sistema de Tickets")) return false;

  const ids = new Set();
  for (const row of msg.components) {
    for (const c of row.components || []) {
      if (c?.customId) ids.add(c.customId);
    }
  }
  return ids.has("denuncia") && ids.has("doacao") && ids.has("duvidas");
}

/* =========================================================
   LOGS HTML (abre no navegador)
   ========================================================= */
async function fetchAllMessages(channel, limitTotal = 2000) {
  const all = [];
  let lastId = null;

  while (all.length < limitTotal) {
    const opts = { limit: 100 };
    if (lastId) opts.before = lastId;

    const batch = await channel.messages.fetch(opts);
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

    // pula mensagens vazias
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

/**
 * Retorna:
 * - true  => log enviado
 * - false => falhou (e imprime o motivo no console)
 */
async function sendTicketLogHtml({ interaction, closedBy, reason, ignoreBotMessages = true }) {
  try {
    const guild = interaction.guild;
    const channel = interaction.channel;

    const logChannel = await guild.channels.fetch(LOGS_CHANNEL_ID).catch((e) => {
      console.error("❌ [LOG] Não consegui buscar o canal de logs:", e);
      return null;
    });

    if (!logChannel || logChannel.type !== ChannelType.GuildText) {
      console.error("❌ [LOG] Canal de logs inválido ou não é texto. ID:", LOGS_CHANNEL_ID);
      return false;
    }

    const me = guild.members.me || (await guild.members.fetchMe().catch(() => null));
    if (!me) {
      console.error("❌ [LOG] Não consegui obter o membro do bot (fetchMe).");
      return false;
    }

    // Checagem de permissões no canal de logs
    const perms = logChannel.permissionsFor(me);
    const need = [
      PermissionsBitField.Flags.ViewChannel,
      PermissionsBitField.Flags.SendMessages,
      PermissionsBitField.Flags.AttachFiles
    ];
    const missing = need.filter(p => !perms?.has(p));
    if (missing.length) {
      console.error("❌ [LOG] Faltam permissões no canal de logs:", missing);
      console.error("➡️ Precisa: Ver canal / Enviar mensagens / Anexar arquivos");
      return false;
    }

    const openerId = channel.topic; // topic = user.id
    const opener = openerId ? await guild.members.fetch(openerId).catch(() => null) : null;

    let msgs = await fetchAllMessages(channel, 2000).catch((e) => {
      console.error("❌ [LOG] Erro ao buscar mensagens do ticket:", e);
      return [];
    });

    if (ignoreBotMessages) {
      msgs = msgs.filter(m => m.author?.id !== me.id);
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

    const safeBase = `ticket-${channel.name}-${channel.id}`
      .replace(/[^a-zA-Z0-9-_]/g, "")
      .slice(0, 80);

    const fileName = `${safeBase}.html`;

    await logChannel.send({
      content: `🧾 **Transcript (abre no navegador)** • \`${channel.name}\``,
      files: [{ attachment: Buffer.from(html, "utf-8"), name: fileName }]
    });

    console.log(`✅ [LOG] Transcript enviado para #${logChannel.name} | Ticket: ${channel.id}`);
    return true;
  } catch (e) {
    console.error("❌ [LOG] Falha geral ao enviar transcript:", e);
    return false;
  }
}

/* ================= READY ================= */
client.once("ready", async () => {
  console.log(`✅ Bot online como ${client.user.tag}`);

  // ✅ TESTE DO CANAL DE LOGS (se falhar, vai ficar claro o motivo)
  try {
    const logs = await client.channels.fetch(LOGS_CHANNEL_ID);
    if (!logs || logs.type !== ChannelType.GuildText) {
      console.error("❌ Canal de logs não é texto ou não foi encontrado. ID:", LOGS_CHANNEL_ID);
    } else {
      console.log("✅ Canal de logs encontrado:", logs.name, "| ID:", LOGS_CHANNEL_ID);
    }
  } catch (e) {
    console.error("❌ Não consegui acessar o canal de logs. Verifique ID/permissões:", e);
  }

  // Painel
  const channel = await client.channels.fetch(CHANNEL_ID).catch((e) => {
    console.error("❌ Não consegui buscar o canal do painel:", e);
    return null;
  });
  if (!channel || channel.type !== ChannelType.GuildText) return;

  let painel = null;
  try {
    const msgs = await channel.messages.fetch({ limit: 50 });
    painel = msgs.find(m => isTicketPanelMessage(m, client.user.id));
  } catch (e) {
    console.error("❌ Erro ao buscar mensagens do painel:", e);
  }

  if (painel) {
    await painel.edit({ content: PANEL_TEXT, components: [buildPanelRow()] }).catch((e) => {
      console.error("❌ Falha ao editar painel:", e);
    });
  } else {
    await channel.send({ content: PANEL_TEXT, components: [buildPanelRow()] }).catch((e) => {
      console.error("❌ Falha ao enviar painel:", e);
    });
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

    await interaction.reply({ content: "🧾 Salvando transcript (HTML) no canal de logs...", ephemeral: true });

    // ✅ tenta salvar log
    const ok = await sendTicketLogHtml({
      interaction,
      closedBy: interaction.user,
      reason: null,
      ignoreBotMessages: true
    });

    // ✅ se falhar, NÃO apaga o ticket (pra você não perder conversa)
    if (!ok) {
      return interaction.followUp({
        content: "❌ Não consegui salvar o log. **NÃO vou apagar o ticket.** Veja o console do bot (permissão/erro).",
        ephemeral: true
      });
    }

    await interaction.followUp({ content: "✅ Log salvo! Encerrando ticket em 2 segundos...", ephemeral: true });

    setTimeout(() => interaction.channel.delete().catch((e) => {
      console.error("❌ Falha ao deletar o canal do ticket:", e);
    }), 2000);

    return;
  }

  /* ===== CRIAR TICKET ===== */
  const now = Date.now();
  if (now - (cooldown.get(interaction.user.id) || 0) < COOLDOWN_MS) {
    return interaction.reply({ content: "⏳ Aguarde um instante...", ephemeral: true });
  }
  cooldown.set(interaction.user.id, now);

  const tipo = mapTipo(interaction.customId);
  if (!tipo) return interaction.reply({ content: "❌ Botão inválido.", ephemeral: true });

  const key = `${interaction.guildId}:${interaction.user.id}:${tipo}`;
  if (creatingKey.has(key) || creatingUser.has(interaction.user.id)) {
    return interaction.reply({ content: "⏳ Aguarde, estou criando seu ticket...", ephemeral: true });
  }
  creatingKey.add(key);
  creatingUser.add(interaction.user.id);

  try {
    const allChannels = await interaction.guild.channels.fetch();

    // 1 ticket por usuário dentro da categoria
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
  } catch (e) {
    console.error("❌ Erro ao criar ticket:", e);
    try {
      await interaction.reply({ content: "❌ Deu erro ao criar seu ticket. Tente novamente.", ephemeral: true });
    } catch {}
  } finally {
    creatingUser.delete(interaction.user.id);
    creatingKey.delete(key);
  }
});

client.login(TOKEN);
