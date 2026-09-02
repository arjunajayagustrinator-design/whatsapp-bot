// Tic-Tac-Toe: lawan bot (minimax) atau lawan teman di grup.
const { randInt } = require('./util');

const LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6]
];

const CELL = { X: '❌', O: '⭕' };
const EMPTY_LABEL = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣'];

const DIFFICULTY = {
  mudah: { label: 'Mudah', random: 1, win: 4 },
  normal: { label: 'Normal', random: 0.3, win: 10 },
  sulit: { label: 'Sulit', random: 0, win: 25 }
};

function winner(board) {
  for (const [a, b, c] of LINES) {
    if (board[a] && board[a] === board[b] && board[a] === board[c]) return { symbol: board[a], line: [a, b, c] };
  }
  return board.every(Boolean) ? { symbol: 'draw', line: [] } : null;
}

function minimax(board, symbol, bot, depth = 0) {
  const result = winner(board);
  if (result) {
    if (result.symbol === 'draw') return { score: 0 };
    return { score: result.symbol === bot ? 10 - depth : depth - 10 };
  }
  const moves = [];
  for (let i = 0; i < 9; i++) {
    if (board[i]) continue;
    board[i] = symbol;
    const { score } = minimax(board, symbol === 'X' ? 'O' : 'X', bot, depth + 1);
    board[i] = null;
    moves.push({ index: i, score });
  }
  const best = symbol === bot
    ? moves.reduce((a, b) => (b.score > a.score ? b : a))
    : moves.reduce((a, b) => (b.score < a.score ? b : a));
  return best;
}

function botMove(state) {
  const free = state.board.map((cell, i) => (cell ? null : i)).filter(i => i !== null);
  if (!free.length) return null;
  const config = DIFFICULTY[state.difficulty];
  if (Math.random() < config.random) return free[randInt(free.length)];
  return minimax([...state.board], state.botSymbol, state.botSymbol).index;
}

function render(state, note) {
  const rows = [];
  for (let r = 0; r < 3; r++) {
    rows.push(state.board.slice(r * 3, r * 3 + 3)
      .map((cell, c) => (cell ? CELL[cell] : EMPTY_LABEL[r * 3 + c])).join(''));
  }
  const versus = state.mode === 'bot'
    ? `👤 ${state.names.X} (❌)  vs  🤖 Bot ${DIFFICULTY[state.difficulty].label} (⭕)`
    : `❌ ${state.names.X}  vs  ⭕ ${state.names.O || 'menunggu lawan...'}`;
  const turn = state.finished
    ? ''
    : `\n\nGiliran: ${CELL[state.turn]} *${state.names[state.turn] || 'pemain 2'}*\nKetik angka 1-9 untuk menaruh simbol.`;
  return `❌⭕ *TIC-TAC-TOE*\n${versus}\n\n${rows.join('\n')}${note ? `\n\n${note}` : ''}${turn}`;
}

function finish(state, result, ctx) {
  state.finished = true;
  if (result.symbol === 'draw') {
    return { text: render(state, '🤝 *Seri!* Papan penuh tanpa pemenang.'), end: true, score: 2 };
  }
  const winnerId = state.players[result.symbol];
  const isBot = !winnerId;
  const note = isBot
    ? `🤖 *Bot menang!* Coba lagi dengan /xo`
    : `🎉 *${state.names[result.symbol]} menang!* (${CELL[result.symbol]})`;
  return {
    text: render(state, note),
    end: true,
    score: isBot ? 0 : (state.mode === 'bot' ? DIFFICULTY[state.difficulty].win : 12),
    winner: winnerId,
    winnerName: state.names[result.symbol]
  };
}

module.exports = {
  id: 'tictactoe',
  name: 'Tic-Tac-Toe',
  emoji: '❌⭕',
  aliases: ['xo', 'ttt', 'tictactoe'],
  usage: '/xo [mudah|normal|sulit] atau /xo pvp',
  desc: 'Susun tiga simbol sebaris melawan bot atau teman.',

  start(ctx) {
    const arg = (ctx.argv[0] || '').toLowerCase();
    const mode = ['pvp', 'player', 'teman', '2p'].includes(arg) ? 'pvp' : 'bot';
    if (mode === 'pvp' && !ctx.isGroup) {
      return { text: '❌ Mode PvP hanya bisa di grup. Ketik `/xo` untuk lawan bot.' };
    }
    const difficulty = DIFFICULTY[arg] ? arg : 'normal';
    const state = {
      board: Array(9).fill(null),
      mode,
      difficulty,
      turn: 'X',
      botSymbol: 'O',
      players: { X: ctx.sender, O: mode === 'pvp' ? null : null },
      names: { X: ctx.senderName, O: mode === 'bot' ? 'Bot' : null },
      finished: false
    };
    const intro = mode === 'pvp'
      ? '👥 Mode PvP — pemain kedua otomatis bergabung saat mengirim angka pertama.'
      : `🤖 Mode lawan bot (${DIFFICULTY[difficulty].label}). Kamu ❌ jalan duluan.`;
    return { text: render(state, intro), state };
  },

  input(ctx) {
    const state = ctx.session.state;
    const move = ctx.body.trim();
    if (!/^[1-9]$/.test(move)) return null;
    const index = Number(move) - 1;

    if (state.mode === 'pvp') {
      if (!state.players.O && ctx.sender !== state.players.X) {
        state.players.O = ctx.sender;
        state.names.O = ctx.senderName;
      }
      const symbol = Object.keys(state.players).find(key => state.players[key] === ctx.sender);
      if (!symbol) return { text: '⏳ Kursi pemain sudah penuh. Tunggu game ini selesai ya.' };
      if (symbol !== state.turn) return { text: `⏳ Belum giliranmu. Sekarang giliran *${state.names[state.turn]}*.` };
    } else if (ctx.sender !== state.players.X) {
      return { text: '⏳ Game ini dimulai orang lain. Ketik `/xo` di chat pribadi untuk main sendiri.' };
    }

    if (state.board[index]) return { text: `⚠️ Kotak ${move} sudah terisi. Pilih kotak lain.` };

    state.board[index] = state.turn;
    let result = winner(state.board);
    if (result) return finish(state, result, ctx);

    state.turn = state.turn === 'X' ? 'O' : 'X';

    if (state.mode === 'bot') {
      const botIndex = botMove(state);
      if (botIndex !== null) state.board[botIndex] = state.botSymbol;
      result = winner(state.board);
      if (result) return finish(state, result, ctx);
      state.turn = 'X';
      return { text: render(state, `🤖 Bot menaruh ⭕ di kotak ${botIndex + 1}.`) };
    }

    return { text: render(state) };
  }
};
