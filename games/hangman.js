// Hangman: tebak huruf sebelum orang-orangan tergantung lengkap.
const { pick, mono } = require('./util');
const { HANGMAN_WORDS } = require('./words');

const MAX_WRONG = 6;

const STAGES = [
  '  +---+\n  |   |\n      |\n      |\n      |\n      |\n=========',
  '  +---+\n  |   |\n  O   |\n      |\n      |\n      |\n=========',
  '  +---+\n  |   |\n  O   |\n  |   |\n      |\n      |\n=========',
  '  +---+\n  |   |\n  O   |\n /|   |\n      |\n      |\n=========',
  '  +---+\n  |   |\n  O   |\n /|\\  |\n      |\n      |\n=========',
  '  +---+\n  |   |\n  O   |\n /|\\  |\n /    |\n      |\n=========',
  '  +---+\n  |   |\n  O   |\n /|\\  |\n / \\  |\n      |\n========='
];

function masked(state) {
  return state.word.split('').map(ch => (state.guessed.includes(ch) ? ch.toUpperCase() : '_')).join(' ');
}

function solved(state) {
  return state.word.split('').every(ch => state.guessed.includes(ch));
}

function render(state, note) {
  const lives = MAX_WRONG - state.wrong.length;
  return [
    `🪢 *HANGMAN*`,
    mono(STAGES[state.wrong.length]),
    `Kata : ${masked(state)}  (${state.word.length} huruf)`,
    `Petunjuk : _${state.hint}_`,
    `Salah : ${state.wrong.length ? state.wrong.join(', ').toUpperCase() : '-'}`,
    `Nyawa : ${'❤️'.repeat(lives)}${'🖤'.repeat(state.wrong.length)}`,
    note ? `\n${note}` : null,
    state.finished ? null : '\nKetik satu huruf, atau langsung tebak seluruh katanya.'
  ].filter(v => v !== null && v !== undefined).join('\n');
}

module.exports = {
  id: 'hangman',
  name: 'Hangman',
  emoji: '🪢',
  aliases: ['hangman', 'gantung', 'tebakhuruf'],
  usage: '/hangman',
  desc: 'Tebak kata huruf demi huruf sebelum nyawa habis.',

  start() {
    const entry = pick(HANGMAN_WORDS);
    const state = { word: entry.word.toLowerCase(), hint: entry.hint, guessed: [], wrong: [], finished: false };
    return { text: render(state, '🎯 Kata baru sudah disiapkan. Semangat!'), state };
  },

  input(ctx) {
    const state = ctx.session.state;
    const guess = ctx.body.trim().toLowerCase();
    if (!/^[a-z]+$/.test(guess)) return null;

    // Tebakan kata utuh: benar langsung menang, salah potong satu nyawa.
    if (guess.length > 1) {
      if (guess === state.word) {
        state.finished = true;
        state.guessed = [...new Set(state.word.split(''))];
        const points = Math.max(8, 25 - state.wrong.length * 3);
        return {
          text: render(state, `🎉 *TEPAT!* Kata rahasianya adalah *${state.word.toUpperCase()}*.`),
          end: true, score: points, winner: ctx.sender, winnerName: ctx.senderName
        };
      }
      state.wrong.push(guess.slice(0, 8));
      if (state.wrong.length >= MAX_WRONG) {
        state.finished = true;
        return { text: render(state, `💀 *Game over!* Kata yang benar: *${state.word.toUpperCase()}*.`), end: true, score: 0 };
      }
      return { text: render(state, `❌ Bukan *${guess}*. Nyawa berkurang satu.`) };
    }

    if (state.guessed.includes(guess) || state.wrong.includes(guess)) {
      return { text: `🔁 Huruf *${guess.toUpperCase()}* sudah pernah ditebak.` };
    }

    if (state.word.includes(guess)) {
      state.guessed.push(guess);
      if (solved(state)) {
        state.finished = true;
        const points = Math.max(8, 22 - state.wrong.length * 3);
        return {
          text: render(state, `🎉 *Selesai!* Kata rahasianya *${state.word.toUpperCase()}*.`),
          end: true, score: points, winner: ctx.sender, winnerName: ctx.senderName
        };
      }
      const count = state.word.split('').filter(ch => ch === guess).length;
      return { text: render(state, `✅ Ada ${count} huruf *${guess.toUpperCase()}*!`) };
    }

    state.wrong.push(guess);
    if (state.wrong.length >= MAX_WRONG) {
      state.finished = true;
      return { text: render(state, `💀 *Game over!* Kata yang benar: *${state.word.toUpperCase()}*.`), end: true, score: 0 };
    }
    return { text: render(state, `❌ Tidak ada huruf *${guess.toUpperCase()}*.`) };
  }
};
