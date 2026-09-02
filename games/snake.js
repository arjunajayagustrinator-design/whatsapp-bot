// Snake: setiap huruf arah = satu langkah, jadi bisa merangkai gerakan.
const { randInt } = require('./util');

const SIZE = 10;
const TILE = { empty: '⬛', head: '🟢', body: '🟩', food: '🍎' };
const DIRS = { w: [-1, 0], s: [1, 0], a: [0, -1], d: [0, 1] };

function spawnFood(state) {
  const taken = new Set(state.snake.map(part => `${part.r},${part.c}`));
  const free = [];
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (!taken.has(`${r},${c}`)) free.push({ r, c });
    }
  }
  state.food = free.length ? free[randInt(free.length)] : null;
}

function render(state, note) {
  const view = Array.from({ length: SIZE }, () => Array(SIZE).fill(TILE.empty));
  if (state.food) view[state.food.r][state.food.c] = TILE.food;
  state.snake.forEach((part, i) => {
    view[part.r][part.c] = i === 0 ? TILE.head : TILE.body;
  });
  return [
    '🐍 *SNAKE*',
    note ? `_${note}_` : null,
    '',
    view.map(row => row.join('')).join('\n'),
    '',
    `🍎 Skor ${state.score} · Panjang ${state.snake.length}`,
    '',
    '`w` `a` `s` `d` untuk bergerak — bisa digabung, misal `ddss`.'
  ].filter(v => v !== null && v !== undefined).join('\n');
}

module.exports = {
  id: 'snake',
  name: 'Snake',
  emoji: '🐍',
  aliases: ['snake', 'ular'],
  usage: '/snake',
  desc: 'Makan apel, jangan tabrak dinding atau badan sendiri.',

  start() {
    const state = {
      snake: [{ r: 5, c: 4 }, { r: 5, c: 3 }, { r: 5, c: 2 }],
      dir: 'd',
      score: 0,
      food: null
    };
    spawnFood(state);
    return { text: render(state, 'Ular siap jalan ke kanan.'), state };
  },

  input(ctx) {
    const state = ctx.session.state;
    const raw = ctx.body.trim().toLowerCase();
    if (!/^[wasd]{1,10}$/.test(raw)) return null;

    let eaten = 0;
    for (const key of raw) {
      const opposite = { w: 's', s: 'w', a: 'd', d: 'a' };
      // Ular tidak bisa berbalik 180 derajat; perintah itu diabaikan.
      if (opposite[key] !== state.dir || state.snake.length === 1) state.dir = key;

      const [dr, dc] = DIRS[state.dir];
      const head = { r: state.snake[0].r + dr, c: state.snake[0].c + dc };

      if (head.r < 0 || head.c < 0 || head.r >= SIZE || head.c >= SIZE) {
        return {
          text: `💥 *GAME OVER* — menabrak dinding.\n\nSkor akhir: *${state.score}* · Panjang ${state.snake.length}\nMain lagi: \`/snake\``,
          end: true, score: Math.max(1, Math.floor(state.score / 10)), winner: ctx.sender, winnerName: ctx.senderName
        };
      }
      // Ekor paling belakang akan bergeser, jadi bukan tabrakan.
      const body = state.snake.slice(0, -1);
      if (body.some(part => part.r === head.r && part.c === head.c)) {
        return {
          text: `💥 *GAME OVER* — menggigit badan sendiri.\n\nSkor akhir: *${state.score}* · Panjang ${state.snake.length}\nMain lagi: \`/snake\``,
          end: true, score: Math.max(1, Math.floor(state.score / 10)), winner: ctx.sender, winnerName: ctx.senderName
        };
      }

      state.snake.unshift(head);
      if (state.food && head.r === state.food.r && head.c === state.food.c) {
        state.score += 10;
        eaten += 1;
        spawnFood(state);
      } else {
        state.snake.pop();
      }

      if (state.snake.length >= SIZE * SIZE) {
        return {
          text: `🏆 *SEMPURNA!* Ular memenuhi seluruh papan.\n\nSkor akhir: *${state.score}*`,
          end: true, score: 200, winner: ctx.sender, winnerName: ctx.senderName
        };
      }
    }

    return { text: render(state, eaten ? `😋 Makan ${eaten} apel! +${eaten * 10}` : null) };
  }
};
