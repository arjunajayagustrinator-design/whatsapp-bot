require('dotenv').config();
const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcodeTerminal = require('qrcode-terminal');
const qrcode = require('qrcode');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFile } = require('child_process');
const { promisify } = require('util');
const express = require('express');
const { createCanvas, loadImage } = require('canvas');
const execFileAsync = promisify(execFile);

const DATA_DIR = './data';
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

function readJson(file, fallback) {
  try {
    if (!fs.existsSync(file)) return fallback;
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    console.error(`Gagal membaca ${file}:`, err.message);
    return fallback;
  }
}

function writeJson(file, value) {
  const temp = `${file}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(value, null, 2));
  fs.renameSync(temp, file);
}

// ─── Singleton Lock ────────────────────────────────────────────────────────────
const LOCK_FILE = './bot.lock';
if (fs.existsSync(LOCK_FILE)) {
  console.error('ERROR: Bot already running! Remove bot.lock if not running.');
  process.exit(1);
}
fs.writeFileSync(LOCK_FILE, process.pid.toString());

const cleanup = () => {
  try {
    if (fs.existsSync(LOCK_FILE)) fs.unlinkSync(LOCK_FILE);
  } catch {}
};

process.on('exit', cleanup);
process.on('SIGINT', () => { cleanup(); process.exit(0); });
process.on('SIGTERM', () => { cleanup(); process.exit(0); });

// ─── Client Config ─────────────────────────────────────────────────────────────
// PENTING: webVersionCache 'none' = selalu ambil versi WhatsApp Web yang LIVE
// saat ini, bukan versi statis yang di-pin. Ini mencegah bug "downloadMedia
// gagal / error minified (mis. 'r')" akibat versi cache sudah usang.
// Kalau kamu tetap ingin pin manual, cek dulu file yang benar-benar ada di:
// https://github.com/wppconnect-team/wa-version/tree/main/html
const client = new Client({
  authStrategy: new LocalAuth({
    clientId: 'whatsapp-bot',
    dataPath: './.wwebjs_auth'
  }),
  webVersionCache: {
    type: process.env.WA_WEB_VERSION_URL ? 'remote' : 'none',
    ...(process.env.WA_WEB_VERSION_URL ? { remotePath: process.env.WA_WEB_VERSION_URL } : {})
  },
  puppeteer: {
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      '--disable-gpu',
      '--disable-extensions',
      '--disable-background-networking'
    ],
    timeout: 60000
  },
  qrMaxRetries: 10
});

// ─── State ─────────────────────────────────────────────────────────────────────
let isReady = false;
let authWatchdog = null;
let qrShownCount = 0;
const MAX_HISTORY = 10;
const HISTORY_FILE = `${DATA_DIR}/conversation-history.json`;
const conversationHistory = new Map(Object.entries(readJson(HISTORY_FILE, {})));
const persistHistory = () => writeJson(HISTORY_FILE, Object.fromEntries(conversationHistory));
const processedMessageIds = new Map();
const aiRateLimit = new Map();
const AI_RATE_LIMIT = Number(process.env.AI_RATE_LIMIT || 5);
const AI_RATE_WINDOW = Number(process.env.AI_RATE_WINDOW_MS || 60 * 60 * 1000);
const SETTINGS_FILE = `${DATA_DIR}/settings.json`;
const settings = readJson(SETTINGS_FILE, { model: process.env.OPENROUTER_MODEL || null });
const MODERATION_FILE = `${DATA_DIR}/moderation.json`;
const moderation = readJson(MODERATION_FILE, { mutedGroups: [], antiLinkGroups: [], blacklist: [] });
const saveModeration = () => writeJson(MODERATION_FILE, moderation);
const ERROR_LOG_FILE = `${DATA_DIR}/errors.log`;

function activeModel() { return settings.model || MODEL_FALLBACK[0]; }

function isBlacklisted(waId) {
  return moderation.blacklist.some(id => sameWaUser(id, waId));
}

function senderId(msg) { return msg.author || msg.from; }

function groupId(msg) { return msg.from?.endsWith('@g.us') ? msg.from : null; }

function isGroupAdmin(chat, waId) {
  const number = extractWaNumber(waId);
  return chat.participants?.some(p => extractWaNumber(p.id?._serialized || p.id) === number && (p.isAdmin || p.isSuperAdmin));
}

function isBotAdmin(chat) {
  return chat.participants?.some(p => sameWaUser(p.id?._serialized || p.id, client.info?.wid?._serialized || client.info?.wid?.user) && (p.isAdmin || p.isSuperAdmin));
}

async function notifyOwner(text) {
  const owner = loadAdminData().owner;
  if (owner && isReady) {
    try { await client.sendMessage(owner, text); } catch (err) { console.error('Gagal log ke owner:', err.message); }
  }
}

function logError(label, err) {
  const line = `[${new Date().toISOString()}] ${label}: ${err?.stack || err}\n`;
  try { fs.appendFileSync(ERROR_LOG_FILE, line); } catch {}
  console.error(label, err?.message || err);
}

function startAuthWatchdog() {
  if (authWatchdog) clearTimeout(authWatchdog);
  authWatchdog = setTimeout(async () => {
    if (isReady) return;
    console.log('\nLogin terdeteksi stuck. Reinitialize client...');
    try { await client.destroy(); } catch (err) {
      console.log('Gagal destroy client:', err.message);
    }
    try { await client.initialize(); } catch (err) {
      console.error('❌ Reinitialize gagal:', err.message);
    }
  }, 120000);
}

function stopAuthWatchdog() {
  if (!authWatchdog) return;
  clearTimeout(authWatchdog);
  authWatchdog = null;
}

function cleanupProcessedMessages() {
  const now = Date.now();
  for (const [id, timestamp] of processedMessageIds.entries()) {
    if (now - timestamp > 2 * 60 * 1000) processedMessageIds.delete(id);
  }
}

function getMessageUniqueId(msg) {
  if (msg?.id?._serialized) return msg.id._serialized;
  if (msg?.id?.id) return msg.id.id;
  return `${msg.from || 'unknown'}:${msg.timestamp || Date.now()}`;
}

function extractWaNumber(waId) {
  if (!waId) return '';
  return String(waId).split('@')[0].trim();
}

function sameWaUser(a, b) {
  return extractWaNumber(a) !== '' && extractWaNumber(a) === extractWaNumber(b);
}

// ─── Admin Management ──────────────────────────────────────────────────────────
const ADMIN_FILE = './admin.json';

function loadAdminData() {
  return readJson(ADMIN_FILE, { owner: '', admins: [] });
}

function saveAdminData(data) {
  writeJson(ADMIN_FILE, data);
}

function isOwner(waId) {
  const data = loadAdminData();
  return sameWaUser(data.owner, waId);
}

function isAdmin(waId) {
  const data = loadAdminData();
  return isOwner(waId) || data.admins.some(a => sameWaUser(a, waId));
}

// ─── OpenRouter AI ─────────────────────────────────────────────────────────────
// Daftar model fallback — jika model utama gagal, otomatis coba berikutnya
const MODEL_FALLBACK = [
  settings.model || process.env.OPENROUTER_MODEL || 'z-ai/glm-5.2:free',
  'qwen/qwen3-8b:free',
  'google/gemma-4-26b-a4b-it:free',
  'meta-llama/llama-3.3-70b-instruct:free',
  'openai/gpt-oss-120b:free'
];

// Model yang benar-benar support input gambar (vision). Kalau ada gambar
// masuk, bot akan MULAI dari model ini, bukan dari MODEL_FALLBACK[0],
// supaya gambar tidak dikirim ke model text-only yang akan mengabaikannya.
const VISION_MODELS = [
  'google/gemma-4-26b-a4b-it:free'
  // tambahkan model lain di sini kalau kamu tahu itu vision-capable
];

const SYSTEM_PROMPT = process.env.BOT_SYSTEM_PROMPT ||
  'Kamu adalah asisten WhatsApp bernama Aruma. Kamu ramah, helpful, dan selalu menjawab dalam Bahasa Indonesia kecuali user bertanya dalam bahasa lain.';

async function callOpenRouter(history, modelIndex = 0) {
  if (modelIndex >= MODEL_FALLBACK.length) {
    throw new Error('Semua model gagal. Coba lagi nanti.');
  }

  const model = MODEL_FALLBACK[modelIndex];
  const apiKey = process.env.OPENROUTER_API_KEY;

  console.log(`Mencoba model: ${model}`);

  try {
    const response = await axios.post(
      'https://openrouter.ai/api/v1/chat/completions',
      {
        model,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          ...history
        ]
      },
      {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://whatsapp-bot.local',
          'X-Title': 'WhatsApp Bot'
        },
        timeout: 60000
      }
    );

    const data = response.data;

    // Validasi response
    if (!data) {
      throw new Error('Response kosong dari OpenRouter');
    }

    if (data.error) {
      const errMsg = data.error?.message || JSON.stringify(data.error);
      console.error(`❌ OpenRouter error [${model}]:`, errMsg);

      // Jika rate limit atau model tidak tersedia, coba model berikutnya
      const code = data.error?.code;
      if (code === 429 || code === 400 || errMsg.includes('rate limit') || errMsg.includes('not found')) {
        console.log(`Model ${model} gagal (${code}), mencoba fallback...`);
        return await callOpenRouter(history, modelIndex + 1);
      }

      throw new Error(errMsg);
    }

    if (!data.choices || !Array.isArray(data.choices) || data.choices.length === 0) {
      console.error('❌ Response tidak punya choices:', JSON.stringify(data, null, 2));
      // Coba model berikutnya
      return await callOpenRouter(history, modelIndex + 1);
    }

    const content = data.choices[0]?.message?.content;
    if (!content) {
      console.error('❌ choices[0].message.content kosong:', JSON.stringify(data.choices[0], null, 2));
      return await callOpenRouter(history, modelIndex + 1);
    }

    console.log(`✅ Berhasil dari model: ${model}`);
    return { content, model };

  } catch (err) {
    // Error jaringan / timeout
    if (err.code === 'ECONNABORTED' || err.code === 'ETIMEDOUT') {
      console.error(`⏱️ Timeout model ${model}, mencoba fallback...`);
      return await callOpenRouter(history, modelIndex + 1);
    }

    // Error axios dengan response
    if (err.response?.data) {
      const errData = err.response.data;
      console.error(`❌ HTTP error [${model}]:`, JSON.stringify(errData, null, 2));
      const code = err.response.status;
      if (code === 429 || code === 400 || code === 503) {
        return await callOpenRouter(history, modelIndex + 1);
      }
    }

    throw err;
  }
}

// ─── Event: QR ─────────────────────────────────────────────────────────────────
client.on('qr', (qr) => {
  qrShownCount += 1;
  startAuthWatchdog();

  console.log('\nQR Code baru — silakan scan!\n');
  console.log(`ℹ️ QR attempt: ${qrShownCount}`);

  qrcode.toDataURL(qr, (err, url) => {
    if (err) {
      console.error('❌ Gagal generate QR data URL:', err);
    } else if (process.env.RAILWAY_ENVIRONMENT) {
      console.log('QR (data:image):');
      console.log(url);
    }
  });

  if (!process.env.RAILWAY_ENVIRONMENT) {
    qrcodeTerminal.generate(qr, { small: true });
  }
});

// ─── Event: Loading Screen ─────────────────────────────────────────────────────
client.on('loading_screen', (percent, message) => {
  console.log(`⏳ Loading WhatsApp Web: ${percent}% — ${message}`);
});

// ─── Event: Authenticated ──────────────────────────────────────────────────────
client.on('authenticated', () => {
  console.log('✅ Authenticated!');
  startAuthWatchdog();
});

// ─── Event: Auth Failure ───────────────────────────────────────────────────────
client.on('auth_failure', (msg) => {
  console.error('\n❌ Auth failed:', msg);
  console.log('Solusi: hapus folder .wwebjs_auth lalu npm start\n');
  cleanup();
  process.exit(1);
});

// ─── Event: Ready ──────────────────────────────────────────────────────────────
client.on('ready', async () => {
  if (isReady) return;
  isReady = true;
  stopAuthWatchdog();
  qrShownCount = 0;

  try {
    const page = client.pupPage;
    if (page) {
      await page.evaluate(() => {
        if (window.WWebJS && window.WWebJS.sendSeen) {
          window.WWebJS.sendSeen = async () => true;
        }
      });
    }
  } catch {}

  console.log('\n============================================');
  console.log('✅ Bot READY!');
  console.log('   Name  :', client.info.pushname || 'N/A');
  console.log('   Number:', client.info.wid.user);
  console.log('   Model :', activeModel());
  console.log('============================================\n');

  startAutoMessage();
});

// ─── Event: Remote Session Saved ──────────────────────────────────────────────
client.on('remote_session_saved', async () => {
  try {
    const page = client.pupPage;
    if (page) {
      await page.evaluate(() => {
        if (window.WWebJS && window.WWebJS.sendSeen) {
          window.WWebJS.sendSeen = async () => true;
        }
      });
    }
  } catch {}
});

// ─── Event: Change State ───────────────────────────────────────────────────────
client.on('change_state', (state) => {
  console.log('State:', state);
});

// ─── Event: Disconnected ──────────────────────────────────────────────────────
client.on('disconnected', (reason) => {
  console.log('\nDISCONNECTED:', reason);
  if (reason === 'LOGOUT') {
    console.log('\nSolusi logout tak terduga:');
    console.log('   1. HP: Settings > Linked Devices > hapus semua');
    console.log('   2. Hapus session: rmdir /s /q .wwebjs_auth');
    console.log('   3. npm start dan scan ulang\n');
  }
  stopAuthWatchdog();
  isReady = false;
  cleanup();
  process.exit(1);
});

// ─── Brat Image Generator ──────────────────────────────────────────────────────
function generateBratImage(text) {
  // Brat sengaja dibuat dari kanvas kecil lalu di-upscale agar hasilnya
  // sedikit burik/pixelated seperti meme aslinya.
  const sourceSize = 100;
  const width = 500;
  const height = 500;
  const source = createCanvas(sourceSize, sourceSize);
  const ctx = source.getContext('2d');

  ctx.fillStyle = 'white';
  ctx.fillRect(0, 0, sourceSize, sourceSize);

  text = text.toLowerCase();
  ctx.fillStyle = 'black';
  ctx.font = 'bold 16px Arial';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';

  const maxWidth = sourceSize - 30;
  const words = text.split(' ');
  const lines = [];
  let currentLine = words[0];

  for (let i = 1; i < words.length; i++) {
    const testLine = currentLine + ' ' + words[i];
    if (ctx.measureText(testLine).width > maxWidth) {
      lines.push(currentLine);
      currentLine = words[i];
    } else {
      currentLine = testLine;
    }
  }
  lines.push(currentLine);

  const lineHeight = 14;
  const totalHeight = lines.length * lineHeight;
  const startY = (sourceSize - totalHeight) / 2 + lineHeight / 2;

  lines.forEach((line, i) => {
    ctx.fillText(line, 6, startY + i * lineHeight);
  });

  const canvas = createCanvas(width, height);
  const output = canvas.getContext('2d');
  output.imageSmoothingEnabled = false;
  output.drawImage(source, 0, 0, width, height);

  return canvas.toBuffer('image/png');
}

function drawWrappedText(ctx, text, x, y, maxWidth, lineHeight, maxLines = 5) {
  const words = text.trim().split(/\s+/);
  const lines = [];
  let line = '';
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(next).width > maxWidth) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line) lines.push(line);
  lines.slice(0, maxLines).forEach((item, index) => ctx.fillText(item, x, y + index * lineHeight));
}

function generateMemeImage(topText, bottomText) {
  const canvas = createCanvas(800, 800);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#d8d8d8';
  ctx.fillRect(0, 0, 800, 800);
  ctx.fillStyle = '#777';
  ctx.fillRect(40, 170, 720, 460);
  ctx.fillStyle = '#444';
  ctx.font = 'bold 52px Arial';
  ctx.textAlign = 'center';
  drawWrappedText(ctx, topText || 'TOP TEXT', 400, 80, 720, 60, 2);
  drawWrappedText(ctx, bottomText || 'BOTTOM TEXT', 400, 690, 720, 60, 2);
  return canvas.toBuffer('image/png');
}

function generateQuoteImage(text, author = '') {
  const canvas = createCanvas(800, 800);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#202124';
  ctx.fillRect(0, 0, 800, 800);
  ctx.fillStyle = '#f5f5f5';
  ctx.textAlign = 'left';
  ctx.font = 'bold 48px Arial';
  drawWrappedText(ctx, `“${text}”`, 70, 250, 660, 65, 6);
  ctx.font = '30px Arial';
  if (author) ctx.fillText(`— ${author}`, 70, 680);
  return canvas.toBuffer('image/png');
}

async function sendGeneratedImage(msg, buffer, filename, caption) {
  const tempFile = path.join(os.tmpdir(), `${Date.now()}-${filename}`);
  try {
    fs.writeFileSync(tempFile, buffer);
    await msg.reply(MessageMedia.fromFilePath(tempFile), undefined, { caption });
  } finally {
    try { fs.unlinkSync(tempFile); } catch {}
  }
}

async function downloadWithYtDlp(url, audioOnly = false) {
  if (!/^https?:\/\/\S+$/i.test(url)) throw new Error('URL tidak valid.');
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wa-download-'));
  const output = path.join(tempDir, audioOnly ? 'audio.%(ext)s' : 'video.%(ext)s');
  try {
    const args = ['--no-playlist', '--max-filesize', '30M', '--no-warnings', '-o', output];
    if (audioOnly) args.push('-x', '--audio-format', 'mp3');
    else args.push('-f', 'best[ext=mp4][height<=720]/best[height<=720]');
    args.push(url);
    await execFileAsync(process.env.YTDLP_BIN || 'yt-dlp', args, { timeout: 120000, windowsHide: true });
    const file = fs.readdirSync(tempDir).find(name => /\.(mp3|mp4|m4a|webm|mkv)$/i.test(name));
    if (!file) throw new Error('File hasil download tidak ditemukan.');
    return { file: path.join(tempDir, file), tempDir };
  } catch (err) {
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch {}
    if (err.code === 'ENOENT') throw new Error('yt-dlp belum terpasang di server.');
    throw err;
  }
}

// ─── Menu & Info ───────────────────────────────────────────────────────────────
let showMenu = (msg) => {
  const extraMenu = '\n/reset atau /clear — hapus riwayat AI\n/ping — cek latency\n/translate en teks — terjemahkan\n/stickerimage — ubah sticker ke gambar\n/kick, /promote, /demote — moderasi admin\n/mute, /antilink on|off — kontrol grup';
  msg.reply([
    '╔════════════════════════════════════╗',
    '║        WHATSAPP BOT MENU        ║',
    '╚════════════════════════════════════╝',
    '',
    '*AI Chat*      → `.pertanyaan` (bisa sekalian kirim/reply gambar)',
    '*Stiker*       → `/sticker` (reply gambar)',
    '*Brat Stiker*  → `/brat teks anda`',
    '*Tag All*      → `/hidetag pesan` (admin)',
    '*Admin*        → `/setowner`, `/addadmin`, `/listadmin`',
    'ℹ️ *Info*         → `/menu`, `/info`',
    '',
    '════════════════════════════════════',
  ].join('\n') + extraMenu);
};

showMenu = (msg) => {
  msg.reply([
    '*WHATSAPP BOT MENU*', '',
    '*AI*',
    'Ketik pesan biasa - Chat AI / analisis gambar',
    'Prefix `.` masih didukung untuk kompatibilitas',
    '`/reset` atau `/clear` - Hapus riwayat chat',
    '`/translate en teks` - Terjemahkan teks', '',
    '*MEDIA*',
    '`/sticker` - Gambar menjadi sticker (reply gambar)',
    '`/stickerimage` - Sticker menjadi gambar (reply sticker)',
    '`/brat teks` - Buat sticker Brat burik', '',
    '`/meme atas | bawah` - Buat meme sederhana',
    '`/quote teks | penulis` - Buat gambar quote',
    '`/tts teks` - Ubah teks menjadi audio',
    '`/download URL` - Download video',
    '`/tiktok URL` - Download video TikTok',
    '`/ytmp3 URL` - Download audio', '',
    '*GRUP*',
    '`/hidetag pesan` - Tag semua anggota',
    '`/kick @user` - Keluarkan anggota',
    '`/promote @user` - Jadikan admin',
    '`/demote @user` - Turunkan admin',
    '`/mute` / `/unmute` - Bot diam/aktif kembali',
    '`/antilink on|off` - Blokir link grup', '',
    '*OWNER / ADMIN*',
    '`/setowner` - Daftarkan owner pertama',
    '`/addadmin nomor` - Tambah admin',
    '`/deladmin nomor` - Hapus admin',
    '`/listadmin` - Lihat daftar admin',
    '`/blacklist nomor` - Blokir user',
    '`/unblacklist nomor` - Buka blokir user',
    '`/broadcast pesan` - Kirim ke semua chat',
    '`/setmodel nama/model` - Ganti model AI',
    '`/restart` - Restart bot', '',
    '*LAINNYA*',
    '`/ping` - Cek respons bot',
    '`/model` - Lihat model AI aktif',
    '`/info` - Informasi bot'
  ].join('\n'));
};

const showInfo = (msg) => {
  const currentModel = activeModel();
  msg.reply([
    '╔════════════════════════════════════╗',
    '║      ℹ️  TENTANG BOT ℹ️           ║',
    '╚════════════════════════════════════╝',
    '',
    'WhatsApp Bot v2.7',
    '',
    '✨ Fitur: AI Chat (+gambar), Stiker, Brat, Group Tag',
    'Tech: whatsapp-web.js + OpenRouter',
    `Model: ${currentModel}`,
    '',
    'Help: /menu',
    '════════════════════════════════════',
  ].join('\n'));
};

// ─── Message Handler ───────────────────────────────────────────────────────────
const handleMessage = async (msg) => {
  try {
    if (!isReady) return;

    const msgBody = msg.body || '';
    const messageId = getMessageUniqueId(msg);
    cleanupProcessedMessages();
    if (processedMessageIds.has(messageId)) return;
    processedMessageIds.set(messageId, Date.now());

    const commandPrefix = msgBody.startsWith('/');
    if (msg.fromMe && !commandPrefix) return;

    const senderWaId = senderId(msg);
    if (isBlacklisted(senderWaId)) return;

    // Mute dan anti-link berlaku sebelum command/AI diproses.
    const currentGroupId = groupId(msg);
    if (currentGroupId && moderation.mutedGroups.includes(currentGroupId) && !isAdmin(senderWaId)) return;
    if (currentGroupId && moderation.antiLinkGroups.includes(currentGroupId) && /https?:\/\/\S+/i.test(msgBody)) {
      try { await msg.delete(true); } catch {}
      try { await msg.reply('⚠️ Link tidak diizinkan di grup ini.'); } catch {}
      return;
    }

    if (msgBody === '/ping') {
      const started = Date.now();
      await msg.reply(`🏓 Pong! ${Date.now() - started} ms`);
      return;
    }

    if (msgBody.startsWith('/translate ')) {
      const parts = msgBody.slice('/translate '.length).trim().split(/\s+/);
      const language = parts.shift();
      const text = parts.join(' ');
      if (!language || !text) { await msg.reply('Format: /translate en halo dunia'); return; }
      if (!process.env.OPENROUTER_API_KEY) { await msg.reply('❌ OPENROUTER_API_KEY belum diset.'); return; }
      try {
        const result = await callOpenRouter([{ role: 'user', content: `Terjemahkan teks berikut ke bahasa ${language}. Balas hanya hasil terjemahannya, tanpa penjelasan:\n${text}` }]);
        await msg.reply(result.content);
      } catch (err) { logError('Translate error', err); await msg.reply('❌ Gagal menerjemahkan.'); }
      return;
    }

    if (msgBody === '/reset' || msgBody === '/clear') {
      conversationHistory.delete(msg.from);
      persistHistory();
      await msg.reply('✅ Riwayat percakapan kamu sudah dihapus.');
      return;
    }

    // Group moderation commands: admin grup atau admin bot.
    if (/^\/(kick|promote|demote)(?:\s+(.+))?$/i.test(msgBody)) {
      const chat = await msg.getChat();
      if (!chat.isGroup) { await msg.reply('❌ Perintah ini hanya untuk grup.'); return; }
      if (!isGroupAdmin(chat, senderWaId) && !isAdmin(senderWaId)) { await msg.reply('❌ Hanya admin grup.'); return; }
      if (!isBotAdmin(chat)) { await msg.reply('❌ Bot harus menjadi admin grup.'); return; }
      let target = null;
      if (msg.mentionedIds?.length) target = msg.mentionedIds[0];
      if (!target && msg.hasQuotedMsg) target = (await msg.getQuotedMessage()).author;
      if (!target) { await msg.reply('Format: /kick @user (atau reply pesan user)'); return; }
      const action = msgBody.match(/^\/(kick|promote|demote)/i)[1].toLowerCase();
      if (action === 'kick') await chat.removeParticipants([target]);
      if (action === 'promote') await chat.promoteParticipants([target]);
      if (action === 'demote') await chat.demoteParticipants([target]);
      await msg.reply(`✅ Berhasil ${action}: @${extractWaNumber(target)}`, { mentions: [target] });
      return;
    }

    if (/^\/(mute|unmute|antilink)(?:\s+(on|off))?$/i.test(msgBody)) {
      const chat = await msg.getChat();
      if (!chat.isGroup) { await msg.reply('❌ Perintah ini hanya untuk grup.'); return; }
      if (!isGroupAdmin(chat, senderWaId) && !isAdmin(senderWaId)) { await msg.reply('❌ Hanya admin grup.'); return; }
      const match = msgBody.match(/^\/(mute|unmute|antilink)(?:\s+(on|off))?$/i);
      const action = match[1].toLowerCase();
      const list = action === 'antilink' ? moderation.antiLinkGroups : moderation.mutedGroups;
      const enabled = action === 'mute' || (action === 'antilink' && (match[2] || 'on').toLowerCase() === 'on');
      const index = list.indexOf(chat.id._serialized);
      if (enabled && index < 0) list.push(chat.id._serialized);
      if (!enabled && index >= 0) list.splice(index, 1);
      saveModeration();
      await msg.reply(`✅ ${action} ${enabled ? 'diaktifkan' : 'dimatikan'}.`);
      return;
    }

    // /setowner
    if (msgBody === '/setowner') {
      const data = loadAdminData();
      if (data.owner) {
        msg.reply('✅ Owner sudah terdaftar.');
      } else {
        data.owner = senderWaId;
        saveAdminData(data);
        msg.reply(`Anda owner bot!\n${senderWaId}`);
      }
      return;
    }

    // /addadmin
    if (msgBody.startsWith('/addadmin ')) {
      if (!isOwner(senderWaId)) { msg.reply('❌ Hanya owner.'); return; }
      let adminId = msgBody.split(' ')[1];
      if (/^\d+$/.test(adminId)) adminId += '@c.us';
      const data = loadAdminData();
      if (!data.admins.some(a => sameWaUser(a, adminId))) {
        data.admins.push(adminId);
        saveAdminData(data);
        msg.reply(`✅ Admin ditambahkan: ${adminId}`);
      } else {
        msg.reply('Sudah admin.');
      }
      return;
    }

    // /deladmin
    if (msgBody.startsWith('/deladmin ')) {
      if (!isOwner(senderWaId)) { msg.reply('❌ Hanya owner.'); return; }
      let adminId = msgBody.split(' ')[1];
      if (/^\d+$/.test(adminId)) adminId += '@c.us';
      const data = loadAdminData();
      data.admins = data.admins.filter(a => !sameWaUser(a, adminId));
      saveAdminData(data);
      msg.reply(`✅ Admin dihapus: ${adminId}`);
      return;
    }

    // /listadmin
    if (msgBody === '/listadmin') {
      const data = loadAdminData();
      let text = '*ADMIN LIST*\n\n';
      text += `Owner: ${data.owner || 'None'}\n\nAdmin:\n`;
      if (data.admins.length > 0) {
        data.admins.forEach((a, i) => text += `${i + 1}. ${a}\n`);
      } else {
        text += 'None\n';
      }
      text += `\nYour ID: ${senderWaId}`;
      msg.reply(text);
      return;
    }

    if (/^\/(blacklist|unblacklist)\s+\S+$/i.test(msgBody)) {
      if (!isOwner(senderWaId)) { await msg.reply('❌ Hanya owner.'); return; }
      let target = msgBody.split(/\s+/)[1];
      if (/^\d+$/.test(target)) target += '@c.us';
      const index = moderation.blacklist.findIndex(id => sameWaUser(id, target));
      if (msgBody.toLowerCase().startsWith('/blacklist')) {
        if (index < 0) moderation.blacklist.push(target);
        await msg.reply('✅ User masuk blacklist.');
      } else {
        if (index >= 0) moderation.blacklist.splice(index, 1);
        await msg.reply('✅ User dihapus dari blacklist.');
      }
      saveModeration();
      return;
    }

    if (msgBody.startsWith('/broadcast ')) {
      if (!isOwner(senderWaId)) { await msg.reply('❌ Hanya owner.'); return; }
      const text = msgBody.slice('/broadcast '.length).trim();
      if (!text) { await msg.reply('Format: /broadcast pesan'); return; }
      const chats = await client.getChats();
      let sent = 0;
      for (const chat of chats.filter(c => c.isGroup || c.isReadOnly === false)) {
        try { await chat.sendMessage(text); sent++; } catch (err) { logError(`Broadcast ${chat.id?._serialized}`, err); }
      }
      await msg.reply(`✅ Broadcast terkirim ke ${sent} chat.`);
      return;
    }

    if (msgBody === '/restart') {
      if (!isOwner(senderWaId)) { await msg.reply('❌ Hanya owner.'); return; }
      await msg.reply('♻️ Bot akan restart.');
      setTimeout(() => process.exit(0), 500);
      return;
    }

    // /hidetag
    if (msgBody.startsWith('/hidetag')) {
      const chat = await msg.getChat();
      if (!chat.isGroup) { msg.reply('❌ Group only.'); return; }

      let senderWaId = msg.author || msg.from;
      if (!senderWaId.endsWith('@c.us')) {
        const senderNumber = senderWaId.split('@')[0];
        const found = chat.participants.find(p => {
          return p.id._serialized.split('@')[0] === senderNumber && p.id._serialized.endsWith('@c.us');
        });
        if (found) senderWaId = found.id._serialized;
      }

      if (!isAdmin(senderWaId)) return;

      const text = msgBody.slice(8).trim() || 'Hello!';
      const mentions = chat.participants.map(p => p.id._serialized);
      await chat.sendMessage(text, { mentions });
      return;
    }

    if (msgBody.startsWith('/meme ')) {
      const parts = msgBody.slice(6).split('|').map(part => part.trim());
      if (!parts[0]) { await msg.reply('Format: /meme teks atas | teks bawah'); return; }
      try { await sendGeneratedImage(msg, generateMemeImage(parts[0], parts[1]), 'meme.png'); }
      catch (err) { logError('Meme error', err); await msg.reply('❌ Gagal membuat meme.'); }
      return;
    }

    if (msgBody.startsWith('/quote ')) {
      const parts = msgBody.slice(7).split('|').map(part => part.trim());
      if (!parts[0]) { await msg.reply('Format: /quote teks | nama penulis'); return; }
      try { await sendGeneratedImage(msg, generateQuoteImage(parts[0], parts[1]), 'quote.png'); }
      catch (err) { logError('Quote error', err); await msg.reply('❌ Gagal membuat quote.'); }
      return;
    }

    if (msgBody.startsWith('/tts ')) {
      const text = msgBody.slice(5).trim();
      if (!text) { await msg.reply('Format: /tts teks yang ingin dibacakan'); return; }
      if (text.length > 250) { await msg.reply('❌ Teks TTS maksimal 250 karakter.'); return; }
      try {
        const response = await axios.get('https://translate.google.com/translate_tts', {
          params: { ie: 'UTF-8', q: text, tl: 'id', client: 'tw-ob' },
          responseType: 'arraybuffer', timeout: 30000
        });
        const media = new MessageMedia('audio/mpeg', Buffer.from(response.data).toString('base64'), 'tts.mp3');
        await msg.reply(media);
      } catch (err) { logError('TTS error', err); await msg.reply('❌ TTS gagal. Pastikan server bisa mengakses layanan suara.'); }
      return;
    }

    if (msgBody.startsWith('/ytmp3 ') || msgBody.startsWith('/download ') || msgBody.startsWith('/tiktok ')) {
      const audioOnly = msgBody.startsWith('/ytmp3 ');
      const command = msgBody.split(/\s+/, 1)[0].toLowerCase();
      const url = msgBody.slice(command.length).trim();
      if (!url) { await msg.reply(`Format: ${command} URL`); return; }
      if (command === '/tiktok' && !/^https?:\/\/(www\.)?(tiktok\.com|vm\.tiktok\.com)\//i.test(url)) {
        await msg.reply('❌ Gunakan URL TikTok yang valid.');
        return;
      }
      let download = null;
      try {
        await msg.reply('⏳ Sedang mengunduh, tunggu sebentar...');
        download = await downloadWithYtDlp(url, audioOnly);
        const media = MessageMedia.fromFilePath(download.file);
        await msg.reply(media);
      } catch (err) {
        logError('Downloader error', err);
        await msg.reply(`❌ Download gagal: ${err.message}`);
      } finally {
        if (download) {
          try { fs.rmSync(download.tempDir, { recursive: true, force: true }); } catch {}
        }
      }
      return;
    }

    // /brat
    if (msgBody.startsWith('/brat')) {
      let text = msgBody.slice(5).trim();
      if (!text && msg.hasQuotedMsg) {
        const q = await msg.getQuotedMessage();
        text = q.body || '';
      }
      if (!text) {
        msg.reply('Contoh: /brat ada nona ambon ga disini?\nAtau reply pesan dengan /brat');
        return;
      }

      msg.reply('Membuat brat...');
      try {
        const imageBuffer = generateBratImage(text);
        const tempFile = './temp_brat.png';
        fs.writeFileSync(tempFile, imageBuffer);
        const media = MessageMedia.fromFilePath(tempFile);

        try {
          await client.sendMessage(msg.from, media, {
            sendMediaAsSticker: true,
            stickerAuthor: 'Bot',
            stickerName: 'Brat'
          });
        } catch {
          await msg.reply(media);
        }

        try { fs.unlinkSync(tempFile); } catch {}
      } catch (err) {
        console.error('Brat error:', err.message);
        msg.reply('❌ Gagal membuat brat: ' + err.message);
      }
      return;
    }

    // /menu & /info
    if (msgBody === '/menu') { showMenu(msg); return; }
    if (msgBody === '/info') { showInfo(msg); return; }

    // /setmodel (owner only) — ganti model AI saat runtime
    if (msgBody.startsWith('/setmodel ')) {
      const senderWaId = msg.author || msg.from;
      if (!isOwner(senderWaId)) { msg.reply('❌ Hanya owner.'); return; }
      const newModel = msgBody.slice(10).trim();
      if (!newModel) { msg.reply('❌ Format: /setmodel nama/model:free'); return; }
      process.env.OPENROUTER_MODEL = newModel;
      MODEL_FALLBACK[0] = newModel;
      settings.model = newModel;
      writeJson(SETTINGS_FILE, settings);
      msg.reply(`✅ Model diubah ke:\n\`${newModel}\``);
      return;
    }

    // /model — lihat model aktif
    if (msgBody === '/model') {
      const currentModel = activeModel();
      msg.reply(`Model aktif:\n\`${currentModel}\`\n\nFallback list:\n${MODEL_FALLBACK.map((m, i) => `${i + 1}. ${m}`).join('\n')}\n\nVision models:\n${VISION_MODELS.join('\n')}`);
      return;
    }

    // ─── AI Chat via OpenRouter (support baca gambar) ─────────────────────────
    if (msgBody.trim() && !msgBody.startsWith('/') && (!msg.from.endsWith('@g.us') || process.env.AI_IN_GROUP === 'true' || msgBody.startsWith('.'))) {
      // Chat biasa langsung masuk ke AI. Prefix titik lama tetap didukung,
      // tetapi tidak lagi wajib digunakan.
      const userMessage = msgBody.startsWith('.') ? msgBody.slice(1).trim() : msgBody.trim();

      const now = Date.now();
      const rate = aiRateLimit.get(msg.from) || { count: 0, since: now };
      if (now - rate.since >= AI_RATE_WINDOW) { rate.count = 0; rate.since = now; }
      if (rate.count >= AI_RATE_LIMIT) {
        await msg.reply(`⏳ Batas AI tercapai (${AI_RATE_LIMIT} pesan/${Math.ceil(AI_RATE_WINDOW / 60000)} menit). Coba lagi nanti.`);
        return;
      }
      rate.count++;
      aiRateLimit.set(msg.from, rate);

      const apiKey = process.env.OPENROUTER_API_KEY;
      if (!apiKey) {
        msg.reply('❌ OPENROUTER_API_KEY belum diset di .env');
        return;
      }

      // Cek gambar: dari pesan itu sendiri, atau dari pesan yang di-reply
      let imageBase64 = null;
      let imageMime = null;
      let mediaWasExpectedButFailed = false; // true kalau ada gambar tapi downloadMedia() gagal

      // Workaround perubahan ID internal WhatsApp Web: beberapa versi
      // menyimpan serialized ID sebagai "$1", bukan _serialized.
      function normalizeMediaMessageId(target) {
        const id = target?.id;
        if (!id || id._serialized) return;

        const serialized = id.$1 || (
          id.fromMe !== undefined && id.remote && id.id
            ? `${id.fromMe}_${id.remote}_${id.id}`
            : null
        );

        if (!serialized) return;

        try {
          id._serialized = serialized;
        } catch {
          Object.defineProperty(id, '_serialized', {
            value: serialized,
            writable: true,
            configurable: true
          });
        }
      }

      // downloadMedia() dari whatsapp-web.js kadang gagal dengan error opak
      // (bug library, lihat github.com/wwebjs/whatsapp-web.js/issues/201833,
      // belum di-fix per Agustus 2026). Retry singkat kadang membantu.
      async function tryDownloadMedia(target, label) {
        normalizeMediaMessageId(target);

        for (let attempt = 1; attempt <= 2; attempt++) {
          try {
            const media = await target.downloadMedia();
            if (media && media.mimetype && media.mimetype.startsWith('image/')) {
              return media;
            }
            return null;
          } catch (err) {
            console.error(`❌ Gagal download media (${label}, attempt ${attempt}):`, err.message);
            if (attempt < 2) await new Promise(r => setTimeout(r, 800));
          }
        }
        return null;
      }

      try {
        if (msg.hasMedia) {
          const media = await tryDownloadMedia(msg, 'pesan langsung');
          if (media) {
            imageBase64 = media.data;
            imageMime = media.mimetype;
          } else {
            mediaWasExpectedButFailed = true;
          }
        } else if (msg.hasQuotedMsg) {
          const quoted = await msg.getQuotedMessage();
          if (quoted.hasMedia) {
            const media = await tryDownloadMedia(quoted, 'quoted message');
            if (media) {
              imageBase64 = media.data;
              imageMime = media.mimetype;
            } else {
              mediaWasExpectedButFailed = true;
            }
          }
        }
      } catch (err) {
        console.error('❌ Gagal proses media:', err.message, '|', err.stack);
        mediaWasExpectedButFailed = true;
      }

      // Ada gambar tapi gagal di-download semua — kasih tahu user apa adanya,
      // jangan diam-diam lanjut cuma dengan teks (bisa bikin jawaban AI ngawur
      // karena "membahas" gambar yang sebenarnya tidak pernah diterima).
      if (mediaWasExpectedButFailed && !userMessage) {
        msg.reply('Maaf, gambar gagal diproses (ada bug di library WhatsApp bot yang belum diperbaiki). Coba lagi dalam beberapa saat, atau kirim pertanyaan teks biasa.');
        return;
      }
      if (mediaWasExpectedButFailed) {
        msg.reply('Gambar gagal dibaca, tapi saya coba jawab pertanyaan teksnya saja dulu ya.');
      }

      if (!userMessage && !imageBase64) {
        msg.reply('Contoh: .apa itu nodejs?\nAtau kirim/reply gambar dengan caption .jelaskan gambar ini');
        return;
      }

      const userId = msg.from;
      if (!conversationHistory.has(userId)) conversationHistory.set(userId, []);
      const history = conversationHistory.get(userId);

      // Kalau ada gambar → content harus array (format vision), bukan string biasa
      const userContent = imageBase64
        ? [
            { type: 'text', text: userMessage || 'Tolong jelaskan gambar ini.' },
            { type: 'image_url', image_url: { url: `data:${imageMime};base64,${imageBase64}` } }
          ]
        : userMessage;

      history.push({ role: 'user', content: userContent });
      if (history.length > MAX_HISTORY * 2) history.splice(0, 2);
      persistHistory();

      try { await client.sendPresenceAvailable(); } catch {}

      try {
        // Kalau ada gambar, wajib pakai model vision — jangan mulai dari model text-only
        const startIndex = imageBase64
          ? Math.max(0, MODEL_FALLBACK.findIndex(m => VISION_MODELS.includes(m)))
          : 0;

        const { content: reply, model: usedModel } = await callOpenRouter(history, startIndex);

        history.push({ role: 'assistant', content: reply });
        if (history.length > MAX_HISTORY * 2) history.splice(0, 2);
        persistHistory();

        const primaryModel = activeModel();
        const modelNote = usedModel !== primaryModel ? `\n\n_(via ${usedModel})_` : '';

        await msg.reply(reply + modelNote);

      } catch (err) {
        console.error('❌ AI final error:', err.message);

        let errMsg = '❌ AI Error: ';
        if (err.message.includes('rate limit') || err.message.includes('429')) {
          errMsg += 'Semua model sedang sibuk. Coba lagi dalam beberapa menit.';
        } else if (err.message.includes('API key')) {
          errMsg += 'API key tidak valid. Cek .env kamu.';
        } else if (err.message.includes('timeout') || err.message.includes('ETIMEDOUT')) {
          errMsg += 'Timeout. Coba lagi.';
        } else {
          errMsg += err.message;
        }

        msg.reply(errMsg);
      }
      return;
    }

    // /sticker
    if (msgBody === '/sticker') {
      if (!msg.hasQuotedMsg) { msg.reply('Reply gambar dengan /sticker'); return; }
      const quotedMsg = await msg.getQuotedMessage();
      if (!quotedMsg.hasMedia) { msg.reply('❌ Bukan media.'); return; }
      const media = await quotedMsg.downloadMedia();
      if (!media.mimetype.startsWith('image/')) { msg.reply('❌ Hanya gambar.'); return; }

      msg.reply('Membuat stiker...');
      try {
        await client.sendMessage(msg.from, media, {
          sendMediaAsSticker: true,
          stickerAuthor: 'Bot',
          stickerName: 'Sticker'
        });
      } catch (err) {
        console.error('Sticker error:', err.message);
        msg.reply('❌ Gagal buat stiker: ' + err.message);
      }
      return;
    }

    // Konversi sticker gambar menjadi gambar biasa.
    if (msgBody === '/stickerimage') {
      if (!msg.hasQuotedMsg) { await msg.reply('Reply sticker dengan /stickerimage'); return; }
      const quotedMsg = await msg.getQuotedMessage();
      if (!quotedMsg.hasMedia) { await msg.reply('❌ Pesan yang direply bukan sticker.'); return; }
      try {
        const media = await quotedMsg.downloadMedia();
        if (!media || media.mimetype !== 'image/webp') { await msg.reply('❌ Hanya sticker WhatsApp.'); return; }
        const image = await loadImage(Buffer.from(media.data, 'base64'));
        const canvas = createCanvas(image.width, image.height);
        canvas.getContext('2d').drawImage(image, 0, 0);
        await msg.reply(new MessageMedia('image/png', canvas.toBuffer('image/png').toString('base64'), 'sticker.png'));
      } catch (err) { logError('Sticker image error', err); await msg.reply('❌ Gagal mengubah sticker menjadi gambar.'); }
      return;
    }

    // Unknown command
    if (msgBody.startsWith('/')) {
      msg.reply('❓ Perintah tidak dikenal. Ketik /menu');
    }

  } catch (err) {
    logError('Message handler error', err);
    try { await msg.reply('❌ Error: ' + err.message); } catch {}
  }
};

client.on('message', handleMessage);

client.on('call', async (call) => {
  try {
    await call.reject();
    await client.sendMessage(call.from, '📵 Panggilan otomatis ditolak. Silakan kirim pesan chat.');
  } catch (err) { logError('Anti-call error', err); }
});

async function handleGroupNotification(notification, joined) {
  try {
    const chat = await notification.getChat();
    const ids = notification.recipientIds || (notification.recipientId ? [notification.recipientId] : []);
    if (!chat.isGroup || !ids.length) return;
    const names = [];
    for (const id of ids) {
      try { names.push((await client.getContactById(id)).pushname || id.split('@')[0]); } catch { names.push(id.split('@')[0]); }
    }
    const template = joined ? '👋 Selamat datang %s di *%s*!' : '👋 Sampai jumpa %s.';
    await chat.sendMessage(template.replace('%s', names.join(', ')).replace('%s', chat.name || 'grup ini'));
  } catch (err) { logError('Group welcome/goodbye error', err); }
}

client.on('group_join', notification => handleGroupNotification(notification, true));
client.on('group_leave', notification => handleGroupNotification(notification, false));

// ─── Error Handlers ────────────────────────────────────────────────────────────
process.on('unhandledRejection', (reason) => {
  logError('Unhandled Rejection', reason);
  notifyOwner(`⚠️ Unhandled rejection:\n${reason?.message || reason}`).catch(() => {});
});

process.on('uncaughtException', (error) => {
  logError('Uncaught Exception', error);
  notifyOwner(`🚨 Uncaught exception:\n${error.message}`).catch(() => {});
  if (error.message?.includes('ECONNREFUSED')) {
    console.log('Connection error, mencoba lanjut...');
  } else {
    cleanup();
    process.exit(1);
  }
});

// ─── Auto Message (tiap 10 menit ke owner) ────────────────────────────────────
const AUTO_MESSAGE_INTERVAL = 10 * 60 * 1000;
let autoMessageInterval = null;

function startAutoMessage() {
  if (autoMessageInterval) return;
  autoMessageInterval = setInterval(async () => {
    if (!isReady) return;
    const data = loadAdminData();
    if (data.owner) {
      try {
        await client.sendMessage(data.owner, '⏰ Bot aktif: ' + new Date().toLocaleTimeString('id-ID'));
        console.log('✅ Auto message terkirim ke owner');
      } catch (err) {
        console.log('Gagal kirim auto message:', err.message);
      }
    }
  }, AUTO_MESSAGE_INTERVAL);
}

// ─── Web Server ────────────────────────────────────────────────────────────────
const app = express();

app.get('/', (req, res) => {
  res.send(`Bot: ${isReady ? '✅ Active' : '⏳ Starting'}`);
});

app.get('/status', (req, res) => {
  res.json({
    status: isReady ? 'ready' : 'starting',
    uptime: Math.floor(process.uptime()),
    model: activeModel(),
    bot: client.info ? {
      name: client.info.pushname,
      number: client.info.wid.user
    } : null
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server: http://localhost:${PORT}`);
});

// ─── Initialize ────────────────────────────────────────────────────────────────
console.log('\nStarting bot...\n');
console.log('TIPS:');
console.log('   - Pastikan WhatsApp di HP aktif dan ada koneksi internet');
console.log('   - Jangan login bot dengan nomor yang sudah dipakai device lain');
console.log('   - Jika masih gagal: hapus folder .wwebjs_auth lalu npm start\n');

client.initialize().catch(err => {
  console.error('❌ Init failed:', err);
  cleanup();
  process.exit(1);
});
