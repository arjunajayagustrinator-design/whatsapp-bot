// Minesweeper 8x8 dengan 10 ranjau. Koordinat pakai kolom huruf + baris angka.
const { mono, randInt } = require('./util');

const SIZE = 8;
const MINES = 10;
const COLS = 'ABCDEFGH';

function parseCoord(text) {
  const match = text.match(/^([a-h])\s*([1-8])$/i) || text.match(/^([1-8])\s*([a-h])$/i);
  if (!match) return null;
  const letter = /[a-h]/i.test(match[1]) ? match[1] : match[2];
  const digit = /[1-8]/.test(match[1]) ? match[1] : match[2];
  return { r: Number(digit) - 1, c: COLS.indexOf(letter.toUpperCase()) };
}

// Ranjau ditanam setelah klik pertama supaya pemain tidak langsung kalah.
function layMines(state, safeR, safeC) {
  let placed = 0;
  while (placed < MINES) {
    const r = randInt(SIZE);
    const c = randInt(SIZE);
    if (state.mines[r][c]) continue;
    if (Math.abs(r - safeR) <= 1 && Math.abs(c - safeC) <= 1) continue;
    state.mines[r][c] = true;
    placed += 1;
  }
  state.laid = true;
}

function around(r, c) {
  const cells = [];
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (!dr && !dc) continue;
      const nr = r + dr;
      const nc = c + dc;
      if (nr >= 0 && nc >= 0 && nr < SIZE && nc < SIZE) cells.push([nr, nc]);
    }
  }
  return cells;
}

function countNear(state, r, c) {
  return around(r, c).filter(([nr, nc]) => state.mines[nr][nc]).length;
}

function open(state, r, c) {
  if (state.opened[r][c] || state.flags[r][c]) return;
  state.opened[r][c] = true;
  if (countNear(state, r, c) === 0 && !state.mines[r][c]) {
    // Petak kosong membuka tetangganya secara berantai.
    for (const [nr, nc] of around(r, c)) open(state, nr, nc);
  }
}

function remaining(state) {
  let closed = 0;
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) if (!state.opened[r][c]) closed += 1;
  }
  return closed;
}

function render(state, note, reveal = false) {
  const header = '   ' + COLS.split('').join(' ');
  const rows = [];
  for (let r = 0; r < SIZE; r++) {
    const cells = [];
    for (let c = 0; c < SIZE; c++) {
      if (reveal && state.mines[r][c]) cells.push('*');
      else if (state.flags[r][c]) cells.push('F');
      else if (!state.opened[r][c]) cells.push('.');
      else {
        const near = countNear(state, r, c);
        cells.push(near ? String(near) : ' ');
      }
    }
    rows.push(`${r + 1}  ${cells.join(' ')}`);
  }
  const flags = state.flags.flat().filter(Boolean).length;
  return [
    '💣 *MINESWEEPER*',
    note ? `_${note}_` : null,
    mono([header, ...rows].join('\n')),
    `🚩 ${flags}/${MINES} bendera · ⬜ ${remaining(state)} petak tertutup`,
    '',
    'Buka petak: ketik `c4`. Pasang bendera: `f c4`.'
  ].filter(v => v !== null && v !== undefined).join('\n');
}

module.exports = {
  id: 'minesweeper',
  name: 'Minesweeper',
  emoji: '💣',
  aliases: ['minesweeper', 'ranjau'],
  usage: '/ranjau',
  desc: 'Buka semua petak aman tanpa menyentuh ranjau.',

  start() {
    const blank = () => Array.from({ length: SIZE }, () => Array(SIZE).fill(false));
    const state = { mines: blank(), opened: blank(), flags: blank(), laid: false, moves: 0 };
    return { text: render(state, `Papan ${SIZE}x${SIZE} dengan ${MINES} ranjau. Klik pertama selalu aman.`), state };
  },

  input(ctx) {
    const state = ctx.session.state;
    const raw = ctx.body.trim().toLowerCase();

    const flagMatch = raw.match(/^f\s*(.+)$/);
    const coord = parseCoord(flagMatch ? flagMatch[1] : raw);
    if (!coord) return null;
    const { r, c } = coord;

    if (flagMatch) {
      if (state.opened[r][c]) return { text: '⚠️ Petak itu sudah terbuka.' };
      state.flags[r][c] = !state.flags[r][c];
      return { text: render(state, state.flags[r][c] ? '🚩 Bendera dipasang.' : '🏳️ Bendera dilepas.') };
    }

    if (!state.laid) layMines(state, r, c);
    if (state.flags[r][c]) return { text: '🚩 Lepas benderanya dulu sebelum membuka petak ini.' };
    if (state.opened[r][c]) return { text: '⚠️ Petak itu sudah terbuka.' };

    state.moves += 1;

    if (state.mines[r][c]) {
      return {
        text: `${render(state, '💥 *BOOM!* Kamu menginjak ranjau.', true)}\n\nBertahan ${state.moves} langkah.\nMain lagi: \`/ranjau\``,
        end: true, score: 0
      };
    }

    open(state, r, c);

    if (remaining(state) === MINES) {
      return {
        text: `${render(state, '🎉 *MENANG!* Semua petak aman berhasil dibuka.', true)}\n\nSelesai dalam ${state.moves} langkah.`,
        end: true, score: Math.max(20, 80 - state.moves), winner: ctx.sender, winnerName: ctx.senderName
      };
    }

    return { text: render(state, `✅ Aman. Petak ${COLS[c]}${r + 1} terbuka.`) };
  }
};
