// Pac-Man versi chat: labirin emoji, hantu mengejar, pelet sakti membalik keadaan.
const { randInt } = require('./util');

const MAZE = [
  '###########',
  '#....#....#',
  '#.##.#.##.#',
  '#o.......o#',
  '#.#.###.#.#',
  '#.#G#.#G#.#',
  '#.#.....#.#',
  '#....P....#',
  '###########'
];

const TILE = { wall: '🟦', empty: '⬛', dot: '⚪', power: '⭐', pac: '🟡', ghost: '👻', scared: '🔵' };
const DIRS = { w: [-1, 0], s: [1, 0], a: [0, -1], d: [0, 1] };
const FRIGHT_STEPS = 12;

function buildLevel() {
  const walls = [];
  const dots = new Set();
  const powers = new Set();
  let pac = null;
  const ghostHomes = [];

  MAZE.forEach((line, r) => {
    walls.push(line.split('').map(ch => ch === '#'));
    line.split('').forEach((ch, c) => {
      const key = `${r},${c}`;
      if (ch === '.') dots.add(key);
      if (ch === 'o') powers.add(key);
      if (ch === 'P') pac = { r, c };
      if (ch === 'G') ghostHomes.push({ r, c });
    });
  });

  return { walls, dots, powers, pac, ghostHomes };
}

function isWall(state, r, c) {
  return r < 0 || c < 0 || r >= state.walls.length || c >= state.walls[0].length || state.walls[r][c];
}

function neighbours(state, pos) {
  return Object.values(DIRS)
    .map(([dr, dc]) => ({ r: pos.r + dr, c: pos.c + dc }))
    .filter(next => !isWall(state, next.r, next.c));
}

function distance(a, b) {
  return Math.abs(a.r - b.r) + Math.abs(a.c - b.c);
}

function moveGhost(state, ghost) {
  const options = neighbours(state, ghost);
  if (!options.length) return;
  // Hantu tidak boleh langsung berbalik arah kecuali buntu — biar terasa mengejar.
  const forward = options.filter(next => !(next.r === ghost.prev?.r && next.c === ghost.prev?.c));
  const choices = forward.length ? forward : options;

  let target;
  if (state.fright > 0) {
    target = choices.reduce((a, b) => (distance(b, state.pac) > distance(a, state.pac) ? b : a));
  } else if (Math.random() < 0.75) {
    target = choices.reduce((a, b) => (distance(b, state.pac) < distance(a, state.pac) ? b : a));
  } else {
    target = choices[randInt(choices.length)];
  }

  ghost.prev = { r: ghost.r, c: ghost.c };
  ghost.r = target.r;
  ghost.c = target.c;
}

function resetPositions(state) {
  state.pac = { ...state.start };
  state.ghosts = state.ghostHomes.map(home => ({ ...home, prev: null }));
  state.fright = 0;
}

function collide(state) {
  const hit = state.ghosts.find(ghost => ghost.r === state.pac.r && ghost.c === state.pac.c);
  if (!hit) return null;
  if (state.fright > 0) {
    const home = state.ghostHomes[state.ghosts.indexOf(hit)];
    Object.assign(hit, { ...home, prev: null });
    state.score += 100;
    return 'eaten';
  }
  state.lives -= 1;
  return 'caught';
}

function render(state, note) {
  const view = state.walls.map((row, r) => row.map((wall, c) => {
    if (wall) return TILE.wall;
    const key = `${r},${c}`;
    if (state.pac.r === r && state.pac.c === c) return TILE.pac;
    const ghost = state.ghosts.find(g => g.r === r && g.c === c);
    if (ghost) return state.fright > 0 ? TILE.scared : TILE.ghost;
    if (state.dots.has(key)) return TILE.dot;
    if (state.powers.has(key)) return TILE.power;
    return TILE.empty;
  }).join(''));

  return [
    '👻 *PAC-MAN*',
    note ? `_${note}_` : null,
    '',
    view.join('\n'),
    '',
    `🟡 Skor ${state.score} · ❤️ ${state.lives} · Level ${state.level} · Sisa ⚪ ${state.dots.size + state.powers.size}`,
    state.fright > 0 ? `⭐ Mode sakti: ${state.fright} langkah lagi` : null,
    '',
    '`w` atas · `s` bawah · `a` kiri · `d` kanan (bisa digabung, misal `ddw`)'
  ].filter(v => v !== null && v !== undefined).join('\n');
}

function newLevel(level) {
  const level0 = buildLevel();
  const state = {
    walls: level0.walls,
    dots: level0.dots,
    powers: level0.powers,
    start: level0.pac,
    ghostHomes: level0.ghostHomes,
    pac: { ...level0.pac },
    ghosts: level0.ghostHomes.map(home => ({ ...home, prev: null })),
    fright: 0,
    level
  };
  return state;
}

module.exports = {
  id: 'pacman',
  name: 'Pac-Man',
  emoji: '👻',
  aliases: ['pacman', 'pakman'],
  usage: '/pacman',
  desc: 'Habiskan titik di labirin sambil menghindari hantu.',

  start() {
    const state = newLevel(1);
    state.score = 0;
    state.lives = 3;
    return { text: render(state, 'Habiskan semua ⚪. Ambil ⭐ untuk bisa memakan hantu!'), state };
  },

  input(ctx) {
    const state = ctx.session.state;
    const raw = ctx.body.trim().toLowerCase();
    if (!/^[wasd]{1,8}$/.test(raw)) return null;

    let events = [];
    let caught = false;

    for (const key of raw) {
      const [dr, dc] = DIRS[key];
      const next = { r: state.pac.r + dr, c: state.pac.c + dc };
      if (isWall(state, next.r, next.c)) { events.push('🧱'); continue; }
      state.pac = next;

      const tile = `${next.r},${next.c}`;
      if (state.dots.delete(tile)) state.score += 10;
      if (state.powers.delete(tile)) {
        state.score += 50;
        state.fright = FRIGHT_STEPS;
        events.push('⭐');
      }

      let hit = collide(state);
      if (hit === 'eaten') events.push('😋');
      if (hit === 'caught') { caught = true; break; }

      // Hantu bergerak setiap langkah pemain; makin tinggi level makin gesit.
      const ghostSteps = state.level >= 3 ? 2 : 1;
      for (let step = 0; step < ghostSteps; step++) {
        state.ghosts.forEach(ghost => moveGhost(state, ghost));
        hit = collide(state);
        if (hit === 'eaten') events.push('😋');
        if (hit === 'caught') { caught = true; break; }
      }
      if (caught) break;

      if (state.fright > 0) state.fright -= 1;

      if (!state.dots.size && !state.powers.size) break;
    }

    if (caught && state.lives <= 0) {
      return {
        text: `💀 *GAME OVER!*\nHantu menangkapmu.\n\nSkor akhir: *${state.score}* (level ${state.level})\nMain lagi: \`/pacman\``,
        end: true,
        score: Math.max(1, Math.floor(state.score / 30)),
        winner: ctx.sender,
        winnerName: ctx.senderName
      };
    }

    if (caught) {
      resetPositions(state);
      return { text: render(state, `😱 Tertangkap hantu! Sisa nyawa ${state.lives}. Posisi direset.`) };
    }

    if (!state.dots.size && !state.powers.size) {
      const score = state.score;
      const lives = state.lives;
      const nextLevel = newLevel(state.level + 1);
      Object.assign(state, nextLevel, { score: score + 200, lives });
      return { text: render(state, `🎉 Level selesai! +200 poin. Lanjut ke level ${state.level}.`) };
    }

    return { text: render(state, events.length ? events.join('') : null) };
  }
};
