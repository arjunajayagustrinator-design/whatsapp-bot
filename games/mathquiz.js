// Kuis Matematika: 10 soal yang makin sulit, dengan bonus kecepatan.
const { randInt, pick } = require('./util');

const TOTAL = 10;

function makeQuestion(round) {
  const level = Math.ceil(round / 3); // 1..4
  const max = [10, 25, 60, 120][Math.min(level - 1, 3)];
  const op = pick(level === 1 ? ['+', '-'] : ['+', '-', '×', '÷']);

  let a = randInt(max) + 2;
  let b = randInt(max) + 2;

  if (op === '-') { if (b > a) [a, b] = [b, a]; }
  if (op === '×') { a = randInt(level === 1 ? 9 : 15) + 2; b = randInt(9) + 2; }
  if (op === '÷') { b = randInt(9) + 2; a = b * (randInt(12) + 2); }

  const answer = { '+': a + b, '-': a - b, '×': a * b, '÷': a / b }[op];
  return { text: `${a} ${op} ${b}`, answer, level };
}

function prompt(state) {
  return [
    `🧮 *KUIS MATEMATIKA* — soal ${state.round}/${TOTAL}`,
    `⭐ Tingkat ${state.current.level} · Skor ${state.points}`,
    '',
    `*${state.current.text} = ?*`,
    '',
    'Ketik angka jawabannya. `lewat` untuk melompati soal.'
  ].join('\n');
}

function finish(state, note) {
  const awards = Object.entries(state.scores)
    .map(([waId, value]) => ({ waId, name: value.name, points: value.points }))
    .sort((a, b) => b.points - a.points);
  const board = awards.length
    ? awards.map((entry, i) => `${['🥇', '🥈', '🥉'][i] || `${i + 1}.`} ${entry.name} — ${entry.points} poin`).join('\n')
    : '_Tidak ada jawaban benar._';
  return {
    text: [note, '', '🏁 *SELESAI!*', `Benar ${state.correct}/${TOTAL}`, '', board, '', 'Main lagi: `/matematika`'].filter(v => v !== null && v !== undefined).join('\n'),
    end: true,
    scores: awards.map((entry, i) => ({ ...entry, win: i === 0 && entry.points > 0 }))
  };
}

module.exports = {
  id: 'math',
  name: 'Kuis Matematika',
  emoji: '🧮',
  aliases: ['matematika', 'math', 'mtk'],
  usage: '/matematika',
  desc: 'Hitung cepat 10 soal yang makin sulit.',

  start() {
    const state = { round: 1, correct: 0, points: 0, scores: {}, askedAt: Date.now(), current: makeQuestion(1) };
    return { text: prompt(state), state };
  },

  input(ctx) {
    const state = ctx.session.state;
    const raw = ctx.body.trim().toLowerCase();

    if (raw === 'lewat' || raw === 'skip') {
      const note = `⏭️ Dilewati. Jawabannya *${state.current.answer}*.`;
      state.round += 1;
      if (state.round > TOTAL) return finish(state, note);
      state.current = makeQuestion(state.round);
      state.askedAt = Date.now();
      return { text: `${note}\n\n${prompt(state)}` };
    }

    if (!/^-?\d+$/.test(raw)) return null;
    if (Number(raw) !== state.current.answer) {
      return { text: `❌ ${ctx.senderName} salah. Masih ada kesempatan untuk yang lain!` };
    }

    // Bonus kecepatan: makin cepat menjawab makin besar poinnya.
    const seconds = (Date.now() - state.askedAt) / 1000;
    const speedBonus = seconds < 10 ? 5 : seconds < 20 ? 3 : 1;
    const gained = state.current.level * 3 + speedBonus;

    state.correct += 1;
    state.points += gained;
    const entry = state.scores[ctx.sender] || { name: ctx.senderName, points: 0 };
    entry.points += gained;
    entry.name = ctx.senderName;
    state.scores[ctx.sender] = entry;

    const note = `✅ *Benar!* ${ctx.senderName} +${gained} poin (${seconds.toFixed(1)} detik)`;
    state.round += 1;
    if (state.round > TOTAL) return finish(state, note);
    state.current = makeQuestion(state.round);
    state.askedAt = Date.now();
    return { text: `${note}\n\n${prompt(state)}` };
  }
};
