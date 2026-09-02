// Helper render & random yang dipakai bareng semua game.

const NUMBER_EMOJI = ['0️⃣', '1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣'];

// WhatsApp merapikan spasi biasa, jadi grid yang butuh alignment (2048,
// Minesweeper) dibungkus monospace supaya kolomnya tetap lurus.
function mono(text) {
  return '```\n' + text + '\n```';
}

function numberEmoji(n) {
  return NUMBER_EMOJI[n] ?? String(n);
}

function randInt(max) {
  return Math.floor(Math.random() * max);
}

function pick(list) {
  return list[randInt(list.length)];
}

function shuffle(list) {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = randInt(i + 1);
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function pad(value, width, align = 'center') {
  const text = String(value);
  if (text.length >= width) return text.slice(0, width);
  const total = width - text.length;
  if (align === 'left') return text + ' '.repeat(total);
  if (align === 'right') return ' '.repeat(total) + text;
  const left = Math.floor(total / 2);
  return ' '.repeat(left) + text + ' '.repeat(total - left);
}

function grid(cells) {
  return cells.map(row => row.join('')).join('\n');
}

function emptyBoard(width, height, fill = 0) {
  return Array.from({ length: height }, () => Array(width).fill(fill));
}

function header(emoji, title, subtitle) {
  return `${emoji} *${title}*${subtitle ? `\n_${subtitle}_` : ''}`;
}

function bar(value, max, width = 10) {
  const filled = Math.max(0, Math.min(width, Math.round((value / max) * width)));
  return '█'.repeat(filled) + '░'.repeat(width - filled);
}

function displayName(waId) {
  return waId ? waId.split('@')[0] : '?';
}

// WhatsApp kadang memakai domain berbeda untuk orang yang sama (@c.us di chat
// pribadi vs @lid di grup), jadi perbandingan identitas pakai nomornya saja.
function waNumber(waId) {
  return waId ? String(waId).split('@')[0].trim() : '';
}

function sameUser(a, b) {
  return waNumber(a) !== '' && waNumber(a) === waNumber(b);
}

// Waktu bermain dalam format "1m 20d".
function duration(ms) {
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}d`;
  return `${Math.floor(seconds / 60)}m ${seconds % 60}d`;
}

module.exports = {
  mono, numberEmoji, randInt, pick, shuffle, pad, grid,
  emptyBoard, header, bar, displayName, duration, waNumber, sameUser
};
