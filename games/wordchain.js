// Sambung Kata: lawan bot, huruf terakhir jadi huruf awal kata berikutnya.
const { pick } = require('./util');
const { CHAIN_BY_LETTER, CHAIN_WORDS } = require('./words');

// Bot tidak punya kamus lengkap bahasa Indonesia, jadi kata pemain hanya
// disaring seadanya: cukup panjang, ada vokal, dan bukan huruf berulang.
function looksLikeWord(word) {
  if (word.length < 4) return false;
  if (!/[aiueo]/.test(word)) return false;
  if (/(.)\1\1/.test(word)) return false;
  return /^[a-z]+$/.test(word);
}

function botReply(state, letter) {
  const candidates = (CHAIN_BY_LETTER[letter] || []).filter(word => !state.used.includes(word));
  if (!candidates.length) return null;
  return pick(candidates);
}

function render(state, note) {
  const contributors = Object.entries(state.contrib)
    .sort((a, b) => b[1].count - a[1].count)
    .map(([, value]) => `${value.name} (${value.count})`)
    .join(', ');
  return [
    '🔗 *SAMBUNG KATA*',
    note,
    '',
    `Kata terakhir : *${state.last.toUpperCase()}*`,
    `Huruf kamu    : *${state.letter.toUpperCase()}*`,
    `Rantai        : ${state.used.length} kata`,
    contributors ? `Kontributor   : ${contributors}` : null,
    '',
    `Kirim kata yang diawali huruf *${state.letter.toUpperCase()}* (min. 4 huruf, belum pernah dipakai).`
  ].filter(v => v !== null && v !== undefined).join('\n');
}

module.exports = {
  id: 'wordchain',
  name: 'Sambung Kata',
  emoji: '🔗',
  aliases: ['sambungkata', 'wordchain', 'chain'],
  usage: '/sambungkata',
  desc: 'Sambung kata dari huruf terakhir, lawan kamus bot.',

  start(ctx) {
    const first = pick(CHAIN_WORDS);
    const state = {
      last: first,
      letter: first[first.length - 1],
      used: [first],
      contrib: {},
      streak: 0
    };
    return {
      text: render(state, ctx.isGroup ? '👥 Main bareng: siapa pun boleh menyambung.' : '🤖 Bot memulai rantai kata.'),
      state
    };
  },

  input(ctx) {
    const state = ctx.session.state;
    const word = ctx.body.trim().toLowerCase();
    if (!/^[a-z]+$/.test(word)) return null;

    if (word[0] !== state.letter) {
      return { text: `❌ Kata harus diawali huruf *${state.letter.toUpperCase()}*, bukan *${word[0].toUpperCase()}*.` };
    }
    if (state.used.includes(word)) {
      return { text: `🔁 Kata *${word}* sudah dipakai. Cari kata lain yang diawali *${state.letter.toUpperCase()}*.` };
    }
    if (!looksLikeWord(word)) {
      return { text: '❌ Minimal 4 huruf dan harus berupa kata yang wajar ya.' };
    }

    state.used.push(word);
    state.streak += 1;
    const contributor = state.contrib[ctx.sender] || { name: ctx.senderName, count: 0 };
    contributor.count += 1;
    contributor.name = ctx.senderName;
    state.contrib[ctx.sender] = contributor;

    const nextLetter = word[word.length - 1];
    const reply = botReply(state, nextLetter);

    if (!reply) {
      const awards = Object.entries(state.contrib).map(([waId, value]) => ({
        waId, name: value.name, points: value.count * 4 + 10, win: true
      }));
      return {
        text: [
          '🏆 *KAMU MENANG!*',
          `Bot kehabisan kata yang diawali huruf *${nextLetter.toUpperCase()}*.`,
          '',
          `Panjang rantai: ${state.used.length} kata`,
          `Rantai: ${state.used.join(' → ')}`
        ].join('\n'),
        end: true,
        scores: awards
      };
    }

    state.used.push(reply);
    state.last = reply;
    state.letter = reply[reply.length - 1];
    return { text: render(state, `✅ *${word}* diterima! Bot menjawab *${reply.toUpperCase()}*.`) };
  }
};
