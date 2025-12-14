require('dotenv').config();
const { Client } = require('whatsapp-web.js');
const qrcodeTerminal = require('qrcode-terminal');
const qrcode = require('qrcode');
const axios = require('axios');
const fs = require('fs');
const express = require('express');
const cron = require('node-cron');

const SESSION_FILE_PATH = './session.json';
let sessionCfg;
if (fs.existsSync(SESSION_FILE_PATH)) {
  sessionCfg = require(SESSION_FILE_PATH);
}

const client = new Client({
  session: sessionCfg,
  puppeteer: {
    headless: true, // Set to true for containerized environments without display
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-extensions',
      '--disable-gpu',
      '--disable-infobars',
      '--start-maximized'
    ]
  }
});

// Store conversation history per user
const conversationHistory = new Map();
const MAX_HISTORY = 10; // Limit to last 10 messages per user

client.on('qr', (qr) => {
  if (process.env.RAILWAY_ENVIRONMENT) {
    qrcode.toFile('qr.png', qr, (err) => {
      if (err) console.error('Error generating QR PNG:', err);
      console.log('QR Code saved to qr.png');
    });
    qrcode.toDataURL(qr, (err, url) => {
      if (err) console.error('Error generating QR URL:', err);
      console.log('QR Code URL:', url);
    });
  } else {
    qrcodeTerminal.generate(qr, { small: true });
  }
});



client.on('loading_screen', (percent, message) => {
  console.log('Loading screen:', percent, message);
});

client.on('authenticated', (session) => {
  console.log('Authenticated!');
  if (session) {
    fs.writeFileSync(SESSION_FILE_PATH, JSON.stringify(session));
  }
});

client.on('ready', () => {
  console.log('WhatsApp Bot is ready!');
  // Start auto chat cron job every 10 minutes
  cron.schedule('*/10 * * * *', () => {
    if (client.info) {
      client.sendMessage(client.info.wid._serialized, 'Auto keep-alive message');
      console.log('Sent auto keep-alive message at', new Date().toISOString());
    }
  });
});

client.on('disconnected', (reason) => {
  console.log('Client was disconnected:', reason);
  // Optionally, reinitialize after a delay
  setTimeout(() => {
    console.log('Reinitializing client...');
    client.initialize();
  }, 5000);
});

client.on('auth_failure', (msg) => {
  console.error('Authentication failure:', msg);
  // Handle auth failure, perhaps reinitialize
  setTimeout(() => {
    console.log('Reinitializing client after auth failure...');
    client.initialize();
  }, 5000);
});

// Menu command response
const showMenu = async (msg) => {
  const menuText = `
╔════════════════════════════════════╗
║     🤖 WHATSAPP BOT MENU 🤖      ║
╚════════════════════════════════════╝

📋 *DAFTAR PERINTAH:*

🔤 *Perintah AI Chat*
• \`.\` + pertanyaan → Tanya ke AI
  Contoh: \`.apa itu Python?\`

🎨 *Perintah Stiker*
• \`/sticker\` → Buat stiker dari gambar
  (balas gambar dengan /sticker)

👥 *Perintah Grup*
• \`/tagall [pesan]\` → Tag semua member
  (Hanya untuk admin/owner)

ℹ️ *Informasi*
• \`/menu\` → Tampilkan menu ini
• \`/info\` → Info tentang bot

════════════════════════════════════
💡 *Tips:* Gunakan perintah di atas untuk
   menggunakan fitur bot dengan maksimal!
════════════════════════════════════
  `;
  msg.reply(menuText);
};

// Info command response
const showInfo = async (msg) => {
  const infoText = `
╔════════════════════════════════════╗
║      ℹ️  TENTANG BOT ℹ️           ║
╚════════════════════════════════════╝

🤖 *WhatsApp Bot v1.0*

✨ *Fitur Utama:*
✓ Chat dengan AI powered by GPT-3.5
✓ Buat stiker dari gambar
✓ Tag semua member di grup
✓ Responsive & modern interface

⚙️ *Teknologi:*
• Whatsapp-web.js
• OpenRouter API
• Node.js

📧 *Butuh bantuan?*
Ketik \`/menu\` untuk melihat daftar perintah!

════════════════════════════════════
Made with ❤️ for WhatsApp users
════════════════════════════════════
  `;
  msg.reply(infoText);
};

client.on('message', async (msg) => {
  console.log(`Received message from ${msg.from}: ${msg.body || 'media'}`);
  // Ignore messages from the bot itself
  if (msg.from === client.info.wid._serialized) return;

  // Handle menu command
  if (msg.body === '/menu') {
    await showMenu(msg);
    return;
  }

  // Handle info command
  if (msg.body === '/info') {
    await showInfo(msg);
    return;
  }

  // Handle AI responses only if message starts with '.'
  if (msg.body && msg.body.startsWith('.')) {
    try {
      const userId = msg.from;
      if (!conversationHistory.has(userId)) {
        conversationHistory.set(userId, []);
      }
      const history = conversationHistory.get(userId);

      // Remove the leading '.' from the message
      const userMessage = msg.body.slice(1);

      // Add user message to history
      history.push({ role: 'user', content: userMessage });

      // Limit history
      if (history.length > MAX_HISTORY) {
        history.shift();
      }

      console.log('Sending to AI...');
      const apiKey = process.env.OPENROUTER_API_KEY;
      if (!apiKey) {
        throw new Error('OPENROUTER_API_KEY environment variable is not set');
      }
      const response = await axios.post('https://openrouter.ai/api/v1/chat/completions', {
        model: 'openai/gpt-3.5-turbo',
        messages: history
      }, {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        }
      });
      const reply = response.data.choices[0].message.content;
      console.log('AI response:', reply);

      // Add AI response to history
      history.push({ role: 'assistant', content: reply });

      // Limit again
      if (history.length > MAX_HISTORY) {
        history.shift();
      }

      msg.reply(reply);
    } catch (error) {
      console.error('Error with AI response:', error);
      msg.reply('Sorry, I encountered an error processing your message.');
    }
  }
  // Handle sticker creation only if message is '/sticker' and has quoted message
  else if (msg.body === '/sticker' && msg.hasQuotedMsg) {
    try {
      const quotedMsg = await msg.getQuotedMessage();
      if (quotedMsg.hasMedia) {
        const media = await quotedMsg.downloadMedia();
        if (media.mimetype.startsWith('image/')) {
          console.log('Creating sticker from quoted image...');
          msg.reply('⏳ Sedang membuat stiker...');
          await client.sendMessage(msg.from, media, { sendMediaAsSticker: true });
          console.log('Sticker sent.');
          msg.reply('✅ Stiker berhasil dibuat! 🎨');
        } else {
          msg.reply('❌ Pesan yang dikutip bukan gambar. Silakan balas gambar dengan /sticker');
        }
      } else {
        msg.reply('❌ Pesan yang dikutip tidak mengandung media.');
      }
    } catch (error) {
      console.error('Error creating sticker:', error);
      msg.reply('❌ Maaf, terjadi kesalahan saat membuat stiker.');
    }
  }
  // Tag all members in a group: usage '/tagall [optional message]'
  else if (msg.body && msg.body.startsWith('/tagall')) {
    try {
      const chat = await msg.getChat();
      if (!chat.isGroup) {
        msg.reply('❌ Perintah ini hanya bisa digunakan di grup.');
        return;
      }

      // Cek admin - gunakan msg.from untuk mencari participant
      const authorId = msg.from;
      const senderParticipant = chat.participants.find(p => p.id._serialized === authorId);
      
      console.log('Author ID:', authorId);
      console.log('Sender Participant:', senderParticipant);
      console.log('Is Admin:', senderParticipant?.isAdmin);
      console.log('Is Super Admin:', senderParticipant?.isSuperAdmin);
      
      let isAdmin = false;
      if (senderParticipant) {
        isAdmin = senderParticipant.isAdmin === true || senderParticipant.isSuperAdmin === true;
      }
      
      if (!isAdmin) {
        msg.reply('❌ Hanya admin atau owner grup yang dapat menggunakan perintah ini.');
        return;
      }

      const parts = msg.body.split(' ');
      const text = parts.slice(1).join(' ') || '👋 Halo semua member!';

      // Build mentions list - gunakan participant langsung tanpa getContactById
      const mentions = [];
      for (const participant of chat.participants) {
        try {
          const contact = await client.getContactById(participant.id._serialized);
          mentions.push(contact);
        } catch (err) {
          console.warn('Gagal mengambil kontak untuk', participant.id._serialized, ':', err.message);
          // Fallback: tambahkan participant ID langsung
          mentions.push(participant.id._serialized);
        }
      }

      const finalMessage = `📢 *PENGUMUMAN:*\n\n${text}`;
      await chat.sendMessage(finalMessage, { mentions });
      msg.reply(`✅ Berhasil menandai ${mentions.length} anggota grup! 👥`);
      console.log('Tagall command executed successfully for', mentions.length, 'members');
    } catch (err) {
      console.error('Error running tagall:', err);
      msg.reply('❌ Terjadi kesalahan saat menandai semua anggota: ' + err.message);
    }
  }
  // Show error for unknown commands
  else if (msg.body && msg.body.startsWith('/')) {
    msg.reply('❌ Perintah tidak dikenal. Ketik `/menu` untuk melihat daftar perintah yang tersedia.');
  }
  // Ignore other messages
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  // If it's a ProtocolError, reinitialize
  if (reason && reason.message && reason.message.includes('Execution context was destroyed')) {
    console.log('ProtocolError detected, reinitializing client...');
    setTimeout(() => {
      client.initialize();
    }, 5000);
  }
});

// Express server for keep-alive
const app = express();
app.get("/", (req, res) => {
  console.log('Ping received at', new Date().toISOString());
  res.send("Bot aktif 🚀");
});
app.get("/status", (req, res) => {
  const status = client.info ? 'ready' : 'initializing';
  res.json({ status, uptime: process.uptime() });
});
app.listen(3000, () => console.log("Keep-alive server aktif di port 3000"));

console.log('Initializing client...');
client.initialize();
