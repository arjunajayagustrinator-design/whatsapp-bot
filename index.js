require('dotenv').config();
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcodeTerminal = require('qrcode-terminal');
const qrcode = require('qrcode');
const axios = require('axios');
const fs = require('fs');
const express = require('express');

// Singleton lock
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
process.on('SIGINT', () => {
  console.log('\n⚠️ Shutting down...');
  cleanup();
  process.exit(0);
});
process.on('SIGTERM', () => {
  console.log('\n⚠️ Shutting down...');
  cleanup();
  process.exit(0);
});

// Client with FIXED configuration for stability
const client = new Client({
  authStrategy: new LocalAuth({
    clientId: 'whatsapp-bot',
    dataPath: './.wwebjs_auth'
  }),
  puppeteer: {
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      '--single-process',
      '--disable-gpu'
    ],
    // PENTING: Increase timeout untuk mencegah premature logout
    timeout: 0
  },
  // SOLUSI: Gunakan web version cache untuk stabilitas
  webVersionCache: {
    type: 'remote',
    remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2412.54.html'
  }
});

let isReady = false;
const conversationHistory = new Map();
const MAX_HISTORY = 10;

// Admin management
const ADMIN_FILE = './admin.json';
function loadAdminData() {
  if (!fs.existsSync(ADMIN_FILE)) {
    fs.writeFileSync(ADMIN_FILE, JSON.stringify({ owner: '', admins: [] }, null, 2));
  }
  return JSON.parse(fs.readFileSync(ADMIN_FILE));
}
function saveAdminData(data) {
  fs.writeFileSync(ADMIN_FILE, JSON.stringify(data, null, 2));
}
function isOwner(waId) {
  const data = loadAdminData();
  return String(data.owner).trim() === String(waId).trim();
}
function isAdmin(waId) {
  const data = loadAdminData();
  const normalizedId = String(waId).trim();
  return isOwner(normalizedId) || data.admins.some(admin => String(admin).trim() === normalizedId);
}

// Event handlers dengan DEBOUNCE untuk mencegah duplikasi
let qrCount = 0;
let authCount = 0;
let readyCount = 0;

client.on('qr', (qr) => {
  qrCount++;
  if (qrCount > 1) {
    console.log(`⚠️ QR event #${qrCount} - possible duplicate, ignoring`);
    return;
  }
  
  console.log('\n📱 Scan QR Code:');
  qrcodeTerminal.generate(qr, { small: true });
  
  if (process.env.RAILWAY_ENVIRONMENT) {
    qrcode.toFile('qr.png', qr);
  }
});

client.on('loading_screen', (percent, message) => {
  if (percent === 0 || percent === 50 || percent === 100) {
    console.log(`⏳ Loading: ${percent}%`);
  }
});

client.on('authenticated', () => {
  authCount++;
  if (authCount > 1) return;
  console.log('✅ Authenticated');
});

client.on('ready', () => {
  readyCount++;
  if (readyCount > 1) return;
  
  isReady = true;
  console.log('\n============================================');
  console.log('✅ Bot READY!');
  console.log('   Name:', client.info.pushname || 'N/A');
  console.log('   Number:', client.info.wid.user);
  console.log('============================================\n');
  
  // SOLUSI: Kirim pesan ke diri sendiri untuk "stabilkan" koneksi
  setTimeout(() => {
    client.sendMessage(client.info.wid._serialized, '🤖 Bot started successfully!')
      .then(() => console.log('✅ Self-message sent (connection stabilized)'))
      .catch(err => console.log('⚠️ Self-message failed:', err.message));
  }, 3000);
});

client.on('disconnected', (reason) => {
  console.log('\n⚠️ DISCONNECTED:', reason);
  
  // Cek apakah ini adalah logout tak terduga
  if (reason === 'LOGOUT' && isReady) {
    console.log('\n💡 SOLUSI UNTUK LOGOUT TAK TERDUGA:');
    console.log('1. Cek di HP: Settings > Linked Devices');
    console.log('2. Hapus semua device yang ter-link');
    console.log('3. Hapus session bot: rm -rf .wwebjs_auth');
    console.log('4. Update whatsapp-web.js: npm install whatsapp-web.js@latest');
    console.log('5. Restart bot dan scan ulang\n');
    console.log('6. ALTERNATIF: Gunakan nomor WhatsApp berbeda khusus untuk bot\n');
  }
  
  isReady = false;
  cleanup();
  process.exit(1);
});

client.on('auth_failure', (msg) => {
  console.error('\n❌ Auth failed:', msg);
  console.log('Solusi: rm -rf .wwebjs_auth && npm start\n');
  cleanup();
  process.exit(1);
});

// Tambahkan error handler untuk protocol errors
client.on('change_state', state => {
  console.log('State changed:', state);
});

// Menu
const showMenu = async (msg) => {
  const menuText = [
    '╔════════════════════════════════════╗',
    '║     🤖 WHATSAPP BOT MENU 🤖      ║',
    '╚════════════════════════════════════╝',
    '',
    '🔤 *AI Chat* → `.pertanyaan`',
    '🎨 *Stiker* → `/sticker` (reply gambar)',
    '👥 *Tag All* → `/hidetag pesan` (admin)',
    '⚙️ *Admin* → `/setowner`, `/addadmin`, `/listadmin`',
    'ℹ️ *Info* → `/menu`, `/info`',
    '',
    '════════════════════════════════════',
  ].join('\n');
  msg.reply(menuText);
};

const showInfo = async (msg) => {
  const infoText = [
    '╔════════════════════════════════════╗',
    '║      ℹ️  TENTANG BOT ℹ️           ║',
    '╚════════════════════════════════════╝',
    '',
    '🤖 WhatsApp Bot v2.2',
    '',
    '✨ Fitur: AI Chat, Stiker, Group Tag',
    '⚙️ Tech: whatsapp-web.js + GPT-3.5',
    '',
    '📧 Help: /menu',
    '════════════════════════════════════',
  ].join('\n');
  msg.reply(infoText);
};

// Message handler
client.on('message', async (msg) => {
  try {
    if (!isReady || msg.from === client.info.wid._serialized) return;

    const msgBody = msg.body || '';
    
    // Admin commands
    if (msgBody === '/setowner') {
      const senderWaId = msg.author || msg.from;
      const data = loadAdminData();
      if (data.owner) {
        msg.reply('❌ Owner sudah terdaftar.');
      } else {
        data.owner = senderWaId;
        saveAdminData(data);
        msg.reply(`✅ Anda owner bot!\n🔍 ${senderWaId}`);
      }
      return;
    }

    if (msgBody.startsWith('/addadmin ')) {
      const senderWaId = msg.author || msg.from;
      if (!isOwner(senderWaId)) {
        msg.reply('❌ Hanya owner.');
        return;
      }
      let adminId = msgBody.split(' ')[1];
      if (/^\d+$/.test(adminId)) adminId += '@c.us';
      const data = loadAdminData();
      if (!data.admins.includes(adminId)) {
        data.admins.push(adminId);
        saveAdminData(data);
        msg.reply(`✅ Admin added: ${adminId}`);
      } else {
        msg.reply('⚠️ Already admin.');
      }
      return;
    }

    if (msgBody.startsWith('/deladmin ')) {
      const senderWaId = msg.author || msg.from;
      if (!isOwner(senderWaId)) {
        msg.reply('❌ Hanya owner.');
        return;
      }
      let adminId = msgBody.split(' ')[1];
      if (/^\d+$/.test(adminId)) adminId += '@c.us';
      const data = loadAdminData();
      data.admins = data.admins.filter(a => a !== adminId);
      saveAdminData(data);
      msg.reply(`✅ Admin removed: ${adminId}`);
      return;
    }

    if (msgBody === '/listadmin') {
      const data = loadAdminData();
      const senderWaId = msg.author || msg.from;
      let text = '📋 *ADMIN*\n\n';
      text += `👑 Owner: ${data.owner || 'None'}\n\n`;
      text += '👥 Admin:\n';
      if (data.admins.length > 0) {
        data.admins.forEach((a, i) => text += `${i + 1}. ${a}\n`);
      } else {
        text += 'None\n';
      }
      text += `\n🔍 Your ID: ${senderWaId}`;
      msg.reply(text);
      return;
    }

    // Hidetag
    if (msgBody.startsWith('/hidetag')) {
      const chat = await msg.getChat();
      if (!chat.isGroup) {
        msg.reply('❌ Group only.');
        return;
      }
      
      let senderWaId = msg.author || msg.from;
      let realWaId = senderWaId;
      
      if (!senderWaId.endsWith('@c.us')) {
        const senderNumber = senderWaId.split('@')[0];
        const found = chat.participants.find(p => {
          const pNumber = p.id._serialized.split('@')[0];
          return pNumber === senderNumber && p.id._serialized.endsWith('@c.us');
        });
        if (found) realWaId = found.id._serialized;
      }
      
      if (!isAdmin(realWaId)) {
        msg.reply(`❌ Admin only.\n🔍 ${realWaId}`);
        return;
      }
      
      let text = msgBody.slice(8).trim() || '👋 Hello!';
      const mentions = chat.participants.map(p => p.id._serialized);
      
      await chat.sendMessage(text, { mentions });
      msg.reply(`✅ Tagged ${mentions.length} members!`);
      return;
    }

    // Info
    if (msgBody === '/menu') {
      await showMenu(msg);
      return;
    }
    if (msgBody === '/info') {
      await showInfo(msg);
      return;
    }

    // AI Chat
    if (msgBody.startsWith('.')) {
      const userId = msg.from;
      if (!conversationHistory.has(userId)) {
        conversationHistory.set(userId, []);
      }
      const history = conversationHistory.get(userId);
      const userMessage = msgBody.slice(1).trim();
      
      if (!userMessage) {
        msg.reply('💬 Example: .what is nodejs?');
        return;
      }

      history.push({ role: 'user', content: userMessage });
      if (history.length > MAX_HISTORY * 2) history.splice(0, 2);

      const apiKey = process.env.OPENROUTER_API_KEY;
      if (!apiKey) {
        msg.reply('❌ API key not set.');
        return;
      }
      
      const response = await axios.post(
        'https://openrouter.ai/api/v1/chat/completions',
        { model: 'openai/gpt-3.5-turbo', messages: history },
        { 
          headers: { 
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
          },
          timeout: 30000
        }
      );
      
      const reply = response.data.choices[0].message.content;
      history.push({ role: 'assistant', content: reply });
      if (history.length > MAX_HISTORY * 2) history.splice(0, 2);
      
      msg.reply(reply);
      return;
    }

    // Sticker
    if (msgBody === '/sticker') {
      if (!msg.hasQuotedMsg) {
        msg.reply('⚠️ Reply image with /sticker');
        return;
      }
      
      const quotedMsg = await msg.getQuotedMessage();
      if (!quotedMsg.hasMedia) {
        msg.reply('❌ Not media.');
        return;
      }
      
      const media = await quotedMsg.downloadMedia();
      if (!media.mimetype.startsWith('image/')) {
        msg.reply('❌ Image only.');
        return;
      }
      
      msg.reply('⏳ Creating...');
      await client.sendMessage(msg.from, media, { 
        sendMediaAsSticker: true,
        stickerAuthor: 'Bot',
        stickerName: 'Sticker'
      });
      return;
    }

    // Unknown command
    if (msgBody.startsWith('/')) {
      msg.reply('❓ Unknown. Type /menu');
    }

  } catch (err) {
    console.error('❌ Error:', err.message);
    try { 
      await msg.reply('❌ Error: ' + err.message); 
    } catch {}
  }
});

// Error handlers
process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection:', reason);
  // Jangan exit, biarkan bot terus berjalan
});

process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  // Jika error critical, baru exit
  if (error.message && error.message.includes('ECONNREFUSED')) {
    console.log('⚠️ Connection error, trying to continue...');
  } else {
    cleanup();
    process.exit(1);
  }
});

// Web server
const app = express();

app.get("/", (req, res) => {
  res.send(`Bot: ${isReady ? '✅ Active' : '⏳ Starting'}`);
});

app.get("/status", (req, res) => {
  res.json({ 
    status: isReady ? 'ready' : 'starting',
    uptime: Math.floor(process.uptime()),
    bot: client.info ? {
      name: client.info.pushname,
      number: client.info.wid.user
    } : null
  });
});

app.get("/restart", (req, res) => {
  res.send('⚠️ Manual restart required. Stop and run: npm start');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🌐 Server: http://localhost:${PORT}`);
});

// Initialize
console.log('\n🚀 Starting bot...\n');
console.log('💡 TIPS:');
console.log('   - Pastikan WhatsApp di HP aktif dan ada koneksi internet');
console.log('   - Jangan login bot dengan nomor yang sudah dipakai device lain');
console.log('   - Jika logout terus, coba nomor WhatsApp berbeda\n');

client.initialize().catch(err => {
  console.error('❌ Init failed:', err);
  cleanup();
  process.exit(1);
});