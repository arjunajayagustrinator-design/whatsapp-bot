// Tetris versi chat. Satu pesan = satu giliran: semua perintah dijalankan
// berurutan, lalu gravitasi menarik balok turun sesuai level.
const { pick, emptyBoard } = require('./util');

const WIDTH = 8;
const HEIGHT = 12;
const EMPTY = '⬛';

const PIECES = {
  I: { cells: [[1, 1, 1, 1]], color: '🟦' },
  O: { cells: [[1, 1], [1, 1]], color: '🟨' },
  T: { cells: [[0, 1, 0], [1, 1, 1]], color: '🟪' },
  S: { cells: [[0, 1, 1], [1, 1, 0]], color: '🟩' },
  Z: { cells: [[1, 1, 0], [0, 1, 1]], color: '🟥' },
  J: { cells: [[1, 0, 0], [1, 1, 1]], color: '🟫' },
  L: { cells: [[0, 0, 1], [1, 1, 1]], color: '🟧' }
};

const KEYS = Object.keys(PIECES);
const LINE_SCORE = [0, 100, 300, 500, 800];

function rotate(cells) {
  const rows = cells.length;
  const cols = cells[0].length;
  return Array.from({ length: cols }, (_, r) => Array.from({ length: rows }, (_, c) => cells[rows - 1 - c][r]));
}

function spawn(state) {
  const key = state.next || pick(KEYS);
  state.next = pick(KEYS);
  const cells = PIECES[key].cells.map(row => [...row]);
  state.piece = {
    key,
    cells,
    color: PIECES[key].color,
    row: 0,
    col: Math.floor((WIDTH - cells[0].length) / 2)
  };
  return !collides(state, state.piece.cells, state.piece.row, state.piece.col);
}

function collides(state, cells, row, col) {
  for (let r = 0; r < cells.length; r++) {
    for (let c = 0; c < cells[r].length; c++) {
      if (!cells[r][c]) continue;
      const boardRow = row + r;
      const boardCol = col + c;
      if (boardCol < 0 || boardCol >= WIDTH || boardRow >= HEIGHT) return true;
      if (boardRow >= 0 && state.board[boardRow][boardCol]) return true;
    }
  }
  return false;
}

function move(state, dRow, dCol) {
  const { piece } = state;
  if (collides(state, piece.cells, piece.row + dRow, piece.col + dCol)) return false;
  piece.row += dRow;
  piece.col += dCol;
  return true;
}

function tryRotate(state) {
  const { piece } = state;
  const rotated = rotate(piece.cells);
  // Wall kick sederhana: geser sedikit kalau hasil rotasi menabrak dinding.
  for (const offset of [0, -1, 1, -2, 2]) {
    if (!collides(state, rotated, piece.row, piece.col + offset)) {
      piece.cells = rotated;
      piece.col += offset;
      return true;
    }
  }
  return false;
}

function lock(state) {
  const { piece } = state;
  for (let r = 0; r < piece.cells.length; r++) {
    for (let c = 0; c < piece.cells[r].length; c++) {
      if (!piece.cells[r][c]) continue;
      const boardRow = piece.row + r;
      if (boardRow < 0) { state.over = true; return 0; }
      state.board[boardRow][piece.col + c] = piece.color;
    }
  }
  let cleared = 0;
  for (let r = HEIGHT - 1; r >= 0; r--) {
    if (state.board[r].every(Boolean)) {
      state.board.splice(r, 1);
      state.board.unshift(Array(WIDTH).fill(0));
      cleared += 1;
      r += 1;
    }
  }
  state.lines += cleared;
  state.score += LINE_SCORE[cleared] + 10;
  state.level = Math.min(5, 1 + Math.floor(state.lines / 5));
  if (!spawn(state)) state.over = true;
  return cleared;
}

function previewOf(key) {
  const { cells, color } = PIECES[key];
  return cells.map(row => row.map(cell => (cell ? color : '⬛')).join('')).join('\n');
}

function render(state, note) {
  const view = state.board.map(row => row.map(cell => cell || EMPTY));
  if (!state.over && state.piece) {
    const { piece } = state;
    for (let r = 0; r < piece.cells.length; r++) {
      for (let c = 0; c < piece.cells[r].length; c++) {
        if (!piece.cells[r][c]) continue;
        const boardRow = piece.row + r;
        const boardCol = piece.col + c;
        if (boardRow >= 0 && boardRow < HEIGHT) view[boardRow][boardCol] = piece.color;
      }
    }
  }
  return [
    '🧱 *TETRIS*',
    note ? `_${note}_` : null,
    '',
    view.map(row => row.join('')).join('\n'),
    '',
    `📊 Skor ${state.score} · Baris ${state.lines} · Level ${state.level}`,
    `⏭️ Berikutnya:\n${previewOf(state.next)}`,
    '',
    '`a` kiri · `d` kanan · `w` putar · `s` turun · `x` jatuhkan',
    'Bisa digabung, misalnya `aaw` atau `ddx`.'
  ].filter(v => v !== null && v !== undefined).join('\n');
}

module.exports = {
  id: 'tetris',
  name: 'Tetris',
  emoji: '🧱',
  aliases: ['tetris'],
  usage: '/tetris',
  desc: 'Susun balok dan bersihkan baris sebanyak mungkin.',

  start() {
    const state = { board: emptyBoard(WIDTH, HEIGHT, 0), score: 0, lines: 0, level: 1, over: false, next: null, piece: null };
    spawn(state);
    return { text: render(state, 'Balok pertama turun. Semoga beruntung!'), state };
  },

  input(ctx) {
    const state = ctx.session.state;
    const raw = ctx.body.trim().toLowerCase();
    if (!/^[adwsx]{1,12}$/.test(raw)) return null;

    let locked = false;
    let cleared = 0;
    const actions = [];

    for (const key of raw) {
      if (locked) break;
      if (key === 'a' && move(state, 0, -1)) actions.push('⬅️');
      else if (key === 'd' && move(state, 0, 1)) actions.push('➡️');
      else if (key === 'w' && tryRotate(state)) actions.push('🔄');
      else if (key === 's') {
        if (!move(state, 1, 0)) { cleared += lock(state); locked = true; actions.push('🔒'); }
        else actions.push('⬇️');
      } else if (key === 'x') {
        while (move(state, 1, 0)) actions.push('⏬');
        cleared += lock(state);
        locked = true;
      }
    }

    // Gravitasi giliran: turun sebanyak level saat ini.
    if (!locked && !state.over) {
      for (let step = 0; step < state.level; step++) {
        if (!move(state, 1, 0)) { cleared += lock(state); locked = true; break; }
      }
    }

    if (state.over) {
      return {
        text: [
          '💀 *GAME OVER*',
          '',
          render(state, null).split('\n').slice(2).join('\n'),
          '',
          `Skor akhir: *${state.score}* dari ${state.lines} baris.`,
          'Main lagi: `/tetris`'
        ].join('\n'),
        end: true,
        score: Math.max(1, Math.floor(state.score / 40)),
        winner: ctx.sender,
        winnerName: ctx.senderName
      };
    }

    const note = cleared
      ? `🔥 ${cleared} baris hilang! +${LINE_SCORE[cleared]} poin`
      : (actions.length ? actions.join('') : 'Balok tidak bisa bergerak ke sana.');
    return { text: render(state, note) };
  }
};
