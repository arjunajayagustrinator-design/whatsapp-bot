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

client.on('message', async (msg) => {
  console.log(`Received message from ${msg.from}: ${msg.body || 'media'}`);
  // Ignore messages from the bot itself
  if (msg.from === client.info.wid._serialized) return;

  const body = msg.body || '';

  // ==================== MENU COMMANDS (/) ====================
  
  // /menu - Show all available commands
  if (body === '/menu') {
    const menuText = `╔══════════════════════╗
║     📋 *MENU BOT*      ║
╠══════════════════════╣
║                        ║
║ 🤖 *AI Agent:*         ║
║ .pesan anda            ║
║ (contoh: .apa itu AI?) ║
║                        ║
║ 🎨 *Sticker:*          ║
║ /sticker               ║
║ (reply ke gambar)      ║
║                        ║
║ ℹ️ *Info:*             ║
║ /info                  ║
║ /ping                  ║
║ /menu                  ║
║                        ║
╚══════════════════════╝`;
    msg.reply(menuText);
    return;
  }

  // /info - Bot information
  if (body === '/info') {
    const infoText = `🤖 *WhatsApp Bot Info*\n\n` +
      `📌 Version: 1.0.0\n` +
      `⏱️ Uptime: ${Math.floor(process.uptime() / 60)} menit\n` +
      `🧠 AI Model: GPT-3.5 Turbo\n\n` +
      `Ketik /menu untuk melihat semua perintah.`;
    msg.reply(infoText);
    return;
  }

  // /ping - Check bot response
  if (body === '/ping') {
    msg.reply('🏓 Pong! Bot aktif dan siap melayani.');
    return;
  }

  // /sticker - Create sticker from quoted image
  if (body === '/sticker' && msg.hasQuotedMsg) {
    try {
      const quotedMsg = await msg.getQuotedMessage();
      if (quotedMsg.hasMedia) {
        const media = await quotedMsg.downloadMedia();
        if (media.mimetype.startsWith('image/')) {
          console.log('Creating sticker from quoted image...');
          await client.sendMessage(msg.from, media, { sendMediaAsSticker: true });
          console.log('Sticker sent.');
        } else {
          msg.reply('❌ Pesan yang di-reply bukan gambar.');
        }
      } else {
        msg.reply('❌ Pesan yang di-reply tidak mengandung media.');
      }
    } catch (error) {
      console.error('Error creating sticker:', error);
      msg.reply('❌ Maaf, terjadi error saat membuat sticker.');
    }
    return;
  }

  // /sticker without quoted message
  if (body === '/sticker' && !msg.hasQuotedMsg) {
    msg.reply('ℹ️ Reply/balas ke gambar dengan perintah /sticker untuk membuat sticker.');
    return;
  }

  // ==================== AI AGENT (.) ====================
  
  // Handle AI responses only if message starts with '.'
  if (body.startsWith('.')) {
    // Remove the leading '.' from the message
    const userMessage = body.slice(1).trim();
    
    // Check if message is empty after removing '.'
    if (!userMessage) {
      msg.reply('ℹ️ Ketik pesan setelah titik.\nContoh: .apa itu artificial intelligence?');
      return;
    }

    try {
      const userId = msg.from;
      if (!conversationHistory.has(userId)) {
        conversationHistory.set(userId, []);
      }
      const history = conversationHistory.get(userId);

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
        model: 'qwen/qwen3-coder:free',
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
      msg.reply('❌ Maaf, terjadi error saat memproses pesan anda.');
    }
    return;
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
