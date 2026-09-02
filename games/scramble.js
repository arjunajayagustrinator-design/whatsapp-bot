// Tebak Kata: huruf diacak, tebak kata aslinya. Lima ronde per sesi.
const { pick, shuffle } = require('./util');

const ROUNDS = 5;
const { SCRAMBLE_WORDS } = require('./words');

function scrambleOf(word) {
  let result = shuffle(word.split('')).join('');
  // Pastikan hasil acakan tidak kebetulan sama dengan kata aslinya.
  let guard = 0;
  while (result === word && guard++ < 10) result = shuffle(word.split('')).join('');
  return result;
}

function nextRound(state) {
  const remaining = SCRAMBLE_WORDS.filter(entry => !state.used.includes(entry.word));
  const entry = pick(remaining.length ? remaining : SCRAMBLE_WORDS);
  state.used.push(entry.word);
  state.current = { word: entry.word, hint: entry.hint, scrambled: scrambleOf(entry.word), tries: 0, revealed: 1 };
}

function prompt(state) {
  const { current } = state;
  const preview = current.word.slice(0, current.revealed).toUpperCase()
    + '·'.repeat(current.word.length - current.revealed);
  return [
    `🔤 *TEBAK KATA* — ronde ${state.round}/${ROUNDS}`,
    '',
    `Huruf acak : *${current.scrambled.toUpperCase().split('').join(' ')}*`,
    `Petunjuk   : _${current.hint}_`,
    `Awalan     : ${preview}  (${current.word.length} huruf)`,
    '',
    'Ketik jawabanmu. `bantuan` untuk buka satu huruf, `lewat` untuk ganti soal.'
  ].join('\n');
}

function finish(state, ctx, note) {
  return {
    text: [
      note,
      '',
      '🏁 *SESI SELESAI*',
      `Benar: ${state.correct}/${ROUNDS}`,
      `Poin: ${state.points}`,
      '',
      'Main lagi: `/tebakkata`'
    ].filter(v => v !== null && v !== undefined).join('\n'),
    end: true,
    score: state.points,
    winner: ctx.sender,
    winnerName: ctx.senderName
  };
}

module.exports = {
  id: 'scramble',
  name: 'Tebak Kata',
  emoji: '🔤',
  aliases: ['tebakkata', 'scramble', 'acakkata'],
  usage: '/tebakkata',
  desc: 'Susun ulang huruf acak menjadi kata yang benar.',

  start() {
    const state = { round: 1, correct: 0, points: 0, used: [], current: null };
    nextRound(state);
    return { text: prompt(state), state };
  },

  input(ctx) {
    const state = ctx.session.state;
    const raw = ctx.body.trim().toLowerCase();
    if (!/^[a-z]+$/.test(raw)) return null;

    const { current } = state;

    if (raw === 'bantuan' || raw === 'hint') {
      if (current.revealed < current.word.length - 1) current.revealed += 1;
      return { text: `💡 Satu huruf dibuka.\n\n${prompt(state)}` };
    }

    if (raw === 'lewat' || raw === 'skip') {
      const answer = current.word.toUpperCase();
      state.round += 1;
      if (state.round > ROUNDS) return finish(state, ctx, `⏭️ Dilewati. Jawabannya *${answer}*.`);
      nextRound(state);
      return { text: `⏭️ Dilewati. Jawabannya *${answer}*.\n\n${prompt(state)}` };
    }

    if (raw !== current.word) {
      current.tries += 1;
      const closeness = raw.length === current.word.length ? 'Panjangnya sudah pas, tapi susunannya belum.' : 'Jumlah hurufnya belum cocok.';
      return { text: `❌ Bukan *${raw}*. ${closeness} (percobaan ke-${current.tries})` };
    }

    const gained = Math.max(4, 15 - current.tries * 2 - (current.revealed - 1) * 3);
    state.correct += 1;
    state.points += gained;
    const note = `✅ *BENAR!* ${current.word.toUpperCase()} — +${gained} poin.`;

    state.round += 1;
    if (state.round > ROUNDS) return finish(state, ctx, note);
    nextRound(state);
    return { text: `${note}\n\n${prompt(state)}` };
  }
};
