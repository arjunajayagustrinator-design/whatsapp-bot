// Game Center: registry, router perintah, dan papan skor.
//
// Aturan routing supaya tidak mengganggu fitur bot lain:
//   1. Perintah slash game hanya dikenali kalau alias-nya terdaftar di sini.
//   2. Teks biasa hanya diteruskan ke game kalau chat itu punya sesi aktif.
//   3. Game boleh mengembalikan null kalau teks bukan gerakan valid — pesan
//      itu lalu jatuh kembali ke handler bot biasa (AI, dsb).
//   4. Pesan berawalan "." atau "/" tidak pernah dianggap gerakan game.
const store = require('./store');

const GAMES = [
  require('./tetris'),
  require('./tictactoe'),
  require('./pacman'),
  require('./hangman'),
  require('./quiz'),
  require('./mafia'),
  require('./wordchain'),
  require('./snake'),
  require('./g2048'),
  require('./minesweeper'),
  require('./scramble'),
  require('./mathquiz')
];

const BY_ALIAS = new Map();
for (const game of GAMES) {
  for (const alias of game.aliases) BY_ALIAS.set(alias, game);
  BY_ALIAS.set(game.id, game);
}

const MENU_COMMANDS = ['game', 'games', 'gamemenu', 'menugame', 'listgame'];
const STOP_COMMANDS = ['stopgame', 'stop', 'nyerah', 'berhenti', 'endgame'];
const SCORE_COMMANDS = ['skor', 'topskor', 'leaderboard', 'papanskor'];
const STATS_COMMANDS = ['statgame', 'gamestats', 'statistik'];

function gameById(id) {
  return GAMES.find(game => game.id === id);
}

function menuText() {
  const lines = GAMES.map(game => `${game.emoji} *${game.name}*\n   \`${game.usage}\` — ${game.desc}`);
  return [
    '╔═══════════════════════╗',
    '  🎮 *GAME CENTER*',
    '╚═══════════════════════╝',
    `${GAMES.length} game siap dimainkan:`,
    '',
    lines.join('\n\n'),
    '',
    '─────────────────',
    '`/skor` — papan skor',
    '`/statgame` — statistik kamu',
    '`/stopgame` — hentikan game aktif',
    '',
    '_Saat game aktif, chat biasa jadi gerakan game._',
    '_Mau tanya AI di tengah game? Awali dengan titik, contoh: `.apa itu tetris`_'
  ].join('\n');
}

function leaderboardText(gameId) {
  const game = gameId ? gameById(gameId) : null;
  const rows = store.leaderboard(10, game?.id || null);
  if (!rows.length) return '📊 Belum ada skor tercatat. Mainkan game dulu dengan `/game`!';
  const medal = i => ['🥇', '🥈', '🥉'][i] || `${String(i + 1).padStart(2, ' ')}.`;
  return [
    `🏆 *PAPAN SKOR${game ? ` — ${game.name.toUpperCase()}` : ''}*`,
    '',
    rows.map((row, i) => `${medal(i)} ${row.name} — *${row.points}* poin${game ? '' : ` (${row.wins} menang)`}`).join('\n'),
    '',
    game ? '`/skor` untuk skor keseluruhan' : '`/skor tetris` untuk skor per game'
  ].join('\n');
}

function statsText(waId, name) {
  const record = store.statsFor(waId);
  if (!record) return `📊 ${name}, kamu belum punya catatan. Ketik \`/game\` untuk mulai main.`;
  const perGame = Object.entries(record.games || {})
    .sort((a, b) => b[1] - a[1])
    .map(([id, points]) => `• ${gameById(id)?.name || id}: ${points} poin`)
    .join('\n');
  return [
    `📊 *STATISTIK — ${record.name}*`,
    '',
    `Total poin : *${record.points}*`,
    `Kemenangan : ${record.wins}`,
    `Sesi main  : ${record.plays}`,
    perGame ? `\n*Rincian per game:*\n${perGame}` : null
  ].filter(v => v !== null && v !== undefined).join('\n');
}

// API yang dipegang tiap sesi; dipakai game untuk kirim pesan async, timer,
// DM, dan pencatatan skor.
function attachApi(session, client) {
  session.api = {
    // Semua pengiriman dikunci saat sesi berakhir, jadi timer atau callback
    // yang telat tidak lagi mengirim pesan ke chat.
    send: (text, options) => (session.closed
      ? Promise.resolve()
      : client.sendMessage(session.chatId, text, options).catch(err => {
        console.error('Game send error:', err.message);
      })),
    dm: (userId, text) => (session.closed ? Promise.resolve() : client.sendMessage(userId, text)),
    routeDm: userId => store.routeDm(userId, session.chatId),
    setTimer: (ms, fn) => {
      const timer = setTimeout(() => {
        session.timers.delete(timer);
        if (session.closed) return;
        try { fn(); } catch (err) { console.error('Game timer error:', err.message); }
      }, ms);
      session.timers.add(timer);
      return timer;
    },
    endSession: () => store.endSession(session.chatId),
    award: (waId, name, points, win) => store.addScore(waId, name, session.gameId, points, win)
  };
  return session.api;
}

async function applyResult(result, ctx, game) {
  if (!result) return false;
  if (result.text) await ctx.reply(result.text, result.options);

  if (Array.isArray(result.scores)) {
    for (const entry of result.scores) {
      if (entry.points > 0) store.addScore(entry.waId, entry.name, game.id, entry.points, !!entry.win);
    }
  } else if (result.score > 0) {
    store.addScore(result.winner || ctx.sender, result.winnerName || ctx.senderName, game.id, result.score, !!result.winner);
  }

  if (result.end) store.endSession(ctx.chatId);
  return true;
}

/**
 * Titik masuk dari index.js.
 * @returns {Promise<boolean>} true kalau pesan sudah ditangani Game Center.
 */
async function handleMessage(input) {
  const { msg, client, body, sender, senderName, chatId, isGroup } = input;
  const text = (body || '').trim();
  if (!text) return false;

  const reply = (content, options) => msg.reply(content, undefined, options);
  const lower = text.toLowerCase();

  // Bersihkan sesi yang sudah basi dan beri tahu chat-nya.
  store.sweepSessions((deadChatId, session) => {
    const game = gameById(session.gameId);
    client.sendMessage(deadChatId, `⌛ Sesi *${game?.name || 'game'}* dihentikan otomatis karena tidak ada aktivitas.`).catch(() => {});
  });

  const isCommand = text.startsWith('/');
  const command = isCommand ? lower.slice(1).split(/\s+/)[0] : null;
  const argsText = isCommand ? text.slice(command.length + 1).trim() : text;
  const argv = argsText ? argsText.split(/\s+/) : [];

  const ctx = {
    body: text, args: argsText, argv, sender, senderName,
    chatId, isGroup, msg, client, reply
  };

  // ── Perintah info ────────────────────────────────────────────────────────
  if (isCommand && MENU_COMMANDS.includes(command)) {
    const requested = argv[0] && BY_ALIAS.get(argv[0].toLowerCase());
    if (requested) return startGame(requested, ctx, input);
    await reply(menuText());
    return true;
  }

  if (isCommand && SCORE_COMMANDS.includes(command)) {
    const requested = argv[0] && BY_ALIAS.get(argv[0].toLowerCase());
    await reply(leaderboardText(requested?.id));
    return true;
  }

  if (isCommand && STATS_COMMANDS.includes(command)) {
    await reply(statsText(sender, senderName));
    return true;
  }

  if (isCommand && STOP_COMMANDS.includes(command)) {
    const session = store.getSession(chatId);
    if (!session) { await reply('ℹ️ Tidak ada game yang sedang berjalan di chat ini.'); return true; }
    const game = gameById(session.gameId);
    store.endSession(chatId);
    await reply(`🛑 Game *${game?.name || session.gameId}* dihentikan oleh ${senderName}.`);
    return true;
  }

  // ── Mulai game baru ──────────────────────────────────────────────────────
  if (isCommand && BY_ALIAS.has(command)) {
    return startGame(BY_ALIAS.get(command), ctx, input);
  }

  // ── Aksi malam Mafia lewat chat pribadi ──────────────────────────────────
  if (!isGroup) {
    const targetChat = store.dmTarget(sender);
    if (targetChat) {
      const session = store.sessions.get(targetChat);
      const game = session && gameById(session.gameId);
      if (game?.dmInput) {
        const result = await game.dmInput({ ...ctx, session, api: session.api, chatId: targetChat });
        if (result) {
          store.touchSession(session);
          return applyResult(result, { ...ctx, chatId: targetChat }, game);
        }
      }
    }
  }

  // ── Gerakan di dalam sesi aktif ──────────────────────────────────────────
  if (isCommand || text.startsWith('.')) return false;

  const session = store.getSession(chatId);
  if (!session) return false;
  const game = gameById(session.gameId);
  if (!game?.input) return false;

  const result = await game.input({ ...ctx, session, api: session.api });
  if (!result) return false;
  store.touchSession(session);
  return applyResult(result, ctx, game);
}

async function startGame(game, ctx, input) {
  const { client, chatId, isGroup } = input;

  if (game.groupOnly && !isGroup) {
    await ctx.reply(`❌ *${game.name}* hanya bisa dimainkan di grup.`);
    return true;
  }

  const running = store.getSession(chatId);
  if (running) {
    const current = gameById(running.gameId);
    await ctx.reply(`⚠️ Masih ada game *${current?.name || running.gameId}* berjalan di chat ini.\nSelesaikan dulu atau ketik \`/stopgame\`.`);
    return true;
  }

  const session = store.createSession(chatId, game.id, { host: ctx.sender, hostName: ctx.senderName, isGroup });
  attachApi(session, client);

  let result;
  try {
    result = await game.start({ ...ctx, session, api: session.api });
  } catch (err) {
    store.endSession(chatId);
    console.error(`Game ${game.id} start error:`, err.message);
    await ctx.reply(`❌ Gagal memulai *${game.name}*: ${err.message}`);
    return true;
  }

  // Game yang hanya mengembalikan teks (misal salah pakai mode) tidak
  // menyisakan sesi menggantung.
  if (!result?.state) {
    store.endSession(chatId);
    if (result?.text) await ctx.reply(result.text);
    return true;
  }

  session.state = result.state;
  store.touchSession(session);
  await ctx.reply(result.text);
  return true;
}

module.exports = { handleMessage, menuText, leaderboardText, GAMES, store };
