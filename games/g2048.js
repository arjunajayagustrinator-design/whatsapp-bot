// 2048 klasik 4x4. Papan dirender monospace supaya angkanya tetap sejajar.
const { randInt, mono, pad } = require('./util');

const SIZE = 4;

function addTile(state) {
  const free = [];
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) if (!state.board[r][c]) free.push([r, c]);
  }
  if (!free.length) return false;
  const [r, c] = free[randInt(free.length)];
  state.board[r][c] = Math.random() < 0.9 ? 2 : 4;
  return true;
}

function slide(row) {
  const values = row.filter(Boolean);
  const merged = [];
  let gained = 0;
  for (let i = 0; i < values.length; i++) {
    if (values[i] === values[i + 1]) {
      merged.push(values[i] * 2);
      gained += values[i] * 2;
      i += 1;
    } else {
      merged.push(values[i]);
    }
  }
  while (merged.length < SIZE) merged.push(0);
  return { row: merged, gained };
}

function transpose(board) {
  return board[0].map((_, c) => board.map(row => row[c]));
}

function apply(state, dir) {
  let board = state.board.map(row => [...row]);
  const flipped = dir === 'd' || dir === 's';

  if (dir === 'w' || dir === 's') board = transpose(board);
  if (flipped) board = board.map(row => [...row].reverse());

  let gained = 0;
  board = board.map(row => {
    const result = slide(row);
    gained += result.gained;
    return result.row;
  });

  if (flipped) board = board.map(row => [...row].reverse());
  if (dir === 'w' || dir === 's') board = transpose(board);

  const changed = JSON.stringify(board) !== JSON.stringify(state.board);
  return { board, gained, changed };
}

function hasMoves(state) {
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (!state.board[r][c]) return true;
      if (c + 1 < SIZE && state.board[r][c] === state.board[r][c + 1]) return true;
      if (r + 1 < SIZE && state.board[r][c] === state.board[r + 1][c]) return true;
    }
  }
  return false;
}

function best(state) {
  return Math.max(...state.board.flat());
}

function render(state, note) {
  const line = '+------+------+------+------+';
  const rows = state.board.map(row => '|' + row.map(cell => pad(cell || '·', 6)).join('|') + '|');
  const grid = [line, ...rows.flatMap(row => [row, line])].join('\n');
  return [
    '🔢 *2048*',
    note ? `_${note}_` : null,
    mono(grid),
    `📊 Skor ${state.score} · Ubin tertinggi ${best(state)}`,
    '',
    '`w` atas · `s` bawah · `a` kiri · `d` kanan'
  ].filter(v => v !== null && v !== undefined).join('\n');
}

module.exports = {
  id: '2048',
  name: '2048',
  emoji: '🔢',
  aliases: ['2048'],
  usage: '/2048',
  desc: 'Geser dan gabungkan ubin sampai tembus 2048.',

  start() {
    const state = { board: Array.from({ length: SIZE }, () => Array(SIZE).fill(0)), score: 0, won: false };
    addTile(state);
    addTile(state);
    return { text: render(state, 'Gabungkan angka yang sama untuk menaikkan nilainya.'), state };
  },

  input(ctx) {
    const state = ctx.session.state;
    const dir = ctx.body.trim().toLowerCase();
    if (!/^[wasd]$/.test(dir)) return null;

    const result = apply(state, dir);
    if (!result.changed) return { text: `⚠️ Tidak ada ubin yang bisa bergerak ke arah *${dir.toUpperCase()}*. Coba arah lain.` };

    state.board = result.board;
    state.score += result.gained;
    addTile(state);

    if (!state.won && best(state) >= 2048) {
      state.won = true;
      return {
        text: render(state, '🏆 *2048 TERCAPAI!* Silakan lanjut mengejar skor tertinggi.'),
        score: 150, winner: ctx.sender, winnerName: ctx.senderName
      };
    }

    if (!hasMoves(state)) {
      return {
        text: `${render(state, '💀 *GAME OVER* — tidak ada gerakan tersisa.')}\n\nSkor akhir: *${state.score}*\nMain lagi: \`/2048\``,
        end: true,
        score: Math.max(1, Math.floor(state.score / 100)),
        winner: ctx.sender, winnerName: ctx.senderName
      };
    }

    return { text: render(state, result.gained ? `➕ ${result.gained} poin dari penggabungan!` : null) };
  }
};
