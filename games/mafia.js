// Mafia: game grup dengan fase malam (aksi lewat DM) dan fase siang (voting).
// Aksi rahasia dikirim ke chat pribadi bot, hasilnya diumumkan ke grup.
const { shuffle, sameUser } = require('./util');

const MIN_PLAYERS = 4;
const MAX_PLAYERS = 15;
const NIGHT_MS = Number(process.env.MAFIA_NIGHT_MS || 90 * 1000);
const DAY_MS = Number(process.env.MAFIA_DAY_MS || 120 * 1000);

const ROLE = {
  mafia: { name: 'Mafia', emoji: '🔪' },
  doctor: { name: 'Dokter', emoji: '💉' },
  detective: { name: 'Detektif', emoji: '🕵️' },
  villager: { name: 'Warga', emoji: '👨‍🌾' }
};

const alive = state => state.players.filter(p => p.alive);
const aliveMafia = state => alive(state).filter(p => p.role === 'mafia');
const aliveTown = state => alive(state).filter(p => p.role !== 'mafia');
const byNumber = (state, n) => state.players.find(p => p.number === Number(n));
const findPlayer = (state, waId) => state.players.find(p => sameUser(p.id, waId));

function roster(state, showDead = true) {
  return state.players
    .filter(p => showDead || p.alive)
    .map(p => `${p.number}. ${p.alive ? '🟢' : '⚰️'} ${p.name}${p.alive ? '' : ` _(${ROLE[p.role].name})_`}`)
    .join('\n');
}

function assignRoles(state) {
  const count = state.players.length;
  const mafiaCount = Math.max(1, Math.floor(count / 4));
  const roles = Array(mafiaCount).fill('mafia');
  roles.push('doctor');
  if (count >= 5) roles.push('detective');
  while (roles.length < count) roles.push('villager');

  const shuffled = shuffle(roles);
  state.players.forEach((player, i) => { player.role = shuffled[i]; });
}

// Token fase mencegah timer lama menembak fase yang sudah berganti.
function nextPhase(state, phase) {
  state.phase = phase;
  state.token = (state.token || 0) + 1;
  return state.token;
}

async function sendRoles(state, api) {
  const list = state.players.map(p => `${p.number}. ${p.name}`).join('\n');
  const failed = [];
  for (const player of state.players) {
    const mates = state.players.filter(p => p.role === 'mafia' && p.id !== player.id).map(p => `${p.number}. ${p.name}`);
    const lines = [
      `${ROLE[player.role].emoji} *Peranmu: ${ROLE[player.role].name.toUpperCase()}*`,
      '',
      '*Daftar pemain:*',
      list,
      ''
    ];
    if (player.role === 'mafia') {
      lines.push(mates.length ? `Rekan mafiamu: ${mates.join(', ')}` : 'Kamu mafia tunggal.');
      lines.push('Setiap malam ketik `bunuh <nomor>` di chat ini.');
    } else if (player.role === 'doctor') {
      lines.push('Setiap malam ketik `lindungi <nomor>` untuk menyelamatkan satu orang (boleh dirimu sendiri).');
    } else if (player.role === 'detective') {
      lines.push('Setiap malam ketik `cek <nomor>` untuk menyelidiki identitas seseorang.');
    } else {
      lines.push('Kamu tidak punya aksi malam. Gunakan logika saat voting siang hari.');
    }
    try {
      await api.dm(player.id, lines.join('\n'));
    } catch {
      failed.push(player.name);
    }
  }
  return failed;
}

function beginNight(state, api) {
  const token = nextPhase(state, 'night');
  state.night = { kill: null, heal: null, done: {} };
  state.day = (state.day || 0) + 1;

  const needed = alive(state).filter(p => p.role !== 'villager').map(p => p.id);
  state.night.needed = needed;

  api.send([
    `🌙 *MALAM ${state.day}*`,
    '',
    'Semua warga tidur. Mafia, Dokter, dan Detektif silakan buka chat pribadi dengan bot untuk melakukan aksi.',
    '',
    '*Pemain hidup:*',
    roster(state, false),
    '',
    `⏳ Waktu malam ${Math.round(NIGHT_MS / 1000)} detik.`
  ].join('\n'));

  for (const player of alive(state)) {
    if (player.role === 'villager') continue;
    const options = alive(state).map(p => `${p.number}. ${p.name}`).join('\n');
    const verb = player.role === 'mafia' ? 'bunuh' : player.role === 'doctor' ? 'lindungi' : 'cek';
    api.dm(player.id, `🌙 *Malam ${state.day}* — giliranmu.\n\n${options}\n\nKetik \`${verb} <nomor>\`.`).catch(() => {});
  }

  api.setTimer(NIGHT_MS, () => {
    if (state.phase === 'night' && state.token === token) resolveNight(state, api);
  });
}

function resolveNight(state, api) {
  const victim = state.night.kill ? byNumber(state, state.night.kill) : null;
  const healed = state.night.heal ? byNumber(state, state.night.heal) : null;

  let report;
  if (!victim) {
    report = '😴 Malam berlalu tanpa korban. Mafia tidak beraksi.';
  } else if (healed && healed.number === victim.number) {
    report = `💉 Ada yang diserang malam ini, tapi Dokter berhasil menyelamatkannya!`;
  } else {
    victim.alive = false;
    report = `⚰️ *${victim.name}* ditemukan tewas pagi ini. Perannya: ${ROLE[victim.role].emoji} *${ROLE[victim.role].name}*.`;
  }

  api.send(`☀️ *PAGI HARI ${state.day}*\n\n${report}`);
  if (checkWin(state, api)) return;
  beginDay(state, api);
}

function beginDay(state, api) {
  const token = nextPhase(state, 'day');
  state.votes = {};
  api.send([
    `💬 *MUSYAWARAH SIANG ${state.day}*`,
    '',
    '*Pemain hidup:*',
    roster(state, false),
    '',
    'Diskusikan siapa yang mencurigakan, lalu ketik `vote <nomor>` untuk menggantung seseorang.',
    'Ketik `vote 0` untuk memilih tidak menggantung siapa pun.',
    '',
    `⏳ Waktu diskusi ${Math.round(DAY_MS / 1000)} detik.`
  ].join('\n'));

  api.setTimer(DAY_MS, () => {
    if (state.phase === 'day' && state.token === token) resolveDay(state, api);
  });
}

function resolveDay(state, api) {
  const tally = {};
  for (const target of Object.values(state.votes)) tally[target] = (tally[target] || 0) + 1;

  const entries = Object.entries(tally).sort((a, b) => b[1] - a[1]);
  const summary = entries.length
    ? entries.map(([number, count]) => `${number === '0' ? 'Tidak digantung' : byNumber(state, number)?.name} — ${count} suara`).join('\n')
    : '_Tidak ada yang memberi suara._';

  const top = entries[0];
  const tie = entries.length > 1 && entries[1][1] === top?.[1];

  let report;
  if (!top || tie || top[0] === '0') {
    report = tie ? '⚖️ Suara imbang. Tidak ada yang digantung hari ini.' : '🤐 Warga tidak sepakat. Tidak ada yang digantung.';
  } else {
    const target = byNumber(state, top[0]);
    target.alive = false;
    report = `🪢 *${target.name}* digantung warga. Perannya: ${ROLE[target.role].emoji} *${ROLE[target.role].name}*.`;
  }

  api.send([`🗳️ *HASIL VOTING HARI ${state.day}*`, '', summary, '', report].join('\n'));
  if (checkWin(state, api)) return;
  beginNight(state, api);
}

function checkWin(state, api) {
  const mafia = aliveMafia(state);
  const town = aliveTown(state);
  if (mafia.length && mafia.length < town.length) return false;

  nextPhase(state, 'ended');
  const mafiaWon = mafia.length > 0;
  const winners = state.players.filter(p => (mafiaWon ? p.role === 'mafia' : p.role !== 'mafia'));

  api.send([
    mafiaWon ? '🔪 *MAFIA MENANG!*' : '🎉 *WARGA MENANG!*',
    mafiaWon ? 'Mafia berhasil menguasai kota.' : 'Semua mafia berhasil dilenyapkan.',
    '',
    '*Peran lengkap:*',
    state.players.map(p => `${p.number}. ${ROLE[p.role].emoji} ${p.name} — ${ROLE[p.role].name}${p.alive ? '' : ' (tewas)'}`).join('\n'),
    '',
    'Main lagi: `/mafia`'
  ].join('\n'));

  for (const player of winners) api.award(player.id, player.name, player.role === 'mafia' ? 30 : 20, true);
  api.endSession();
  return true;
}

module.exports = {
  id: 'mafia',
  name: 'Mafia',
  emoji: '🕵️',
  aliases: ['mafia', 'werewolf'],
  usage: '/mafia',
  desc: `Game peran untuk ${MIN_PLAYERS}+ pemain di grup.`,
  groupOnly: true,

  start(ctx) {
    const state = {
      phase: 'lobby',
      host: ctx.sender,
      hostName: ctx.senderName,
      players: [{ id: ctx.sender, name: ctx.senderName, alive: true, number: 1 }],
      day: 0,
      token: 0
    };
    return {
      text: [
        '🕵️ *MAFIA — LOBI DIBUKA*',
        '',
        `Host: ${ctx.senderName}`,
        `Pemain: 1/${MAX_PLAYERS} (minimal ${MIN_PLAYERS})`,
        '',
        'Ketik `join` untuk ikut bermain.',
        'Host ketik `mulai` kalau pemain sudah cukup.',
        '',
        '⚠️ *Penting:* chat pribadi dengan bot minimal sekali agar bisa menerima peran rahasia.'
      ].join('\n'),
      state
    };
  },

  input(ctx) {
    const state = ctx.session.state;
    const raw = ctx.body.trim().toLowerCase();

    if (state.phase === 'lobby') {
      if (['join', 'gabung', 'ikut'].includes(raw)) {
        if (findPlayer(state, ctx.sender)) return { text: '✅ Kamu sudah ada di lobi.' };
        if (state.players.length >= MAX_PLAYERS) return { text: `❌ Lobi penuh (${MAX_PLAYERS} pemain).` };
        state.players.push({ id: ctx.sender, name: ctx.senderName, alive: true, number: state.players.length + 1 });
        return {
          text: `➕ *${ctx.senderName}* bergabung (${state.players.length}/${MAX_PLAYERS}).\n\n${roster(state)}\n\n${state.players.length >= MIN_PLAYERS ? 'Host bisa ketik `mulai`.' : `Butuh ${MIN_PLAYERS - state.players.length} pemain lagi.`}`
        };
      }

      if (['mulai', 'start'].includes(raw)) {
        if (ctx.sender !== state.host) return { text: `❌ Hanya host (*${state.hostName}*) yang bisa memulai.` };
        if (state.players.length < MIN_PLAYERS) return { text: `❌ Minimal ${MIN_PLAYERS} pemain. Sekarang baru ${state.players.length}.` };

        assignRoles(state);
        for (const player of state.players) ctx.api.routeDm(player.id);

        (async () => {
          const failed = await sendRoles(state, ctx.api);
          if (failed.length) {
            await ctx.api.send(`⚠️ Peran gagal dikirim ke: ${failed.join(', ')}.\nMereka perlu chat bot dulu. Game tetap lanjut.`);
          }
          beginNight(state, ctx.api);
        })();

        return { text: `🎬 *GAME DIMULAI!*\n\n${state.players.length} pemain sedang menerima peran lewat chat pribadi...` };
      }

      return null;
    }

    const voteMatch = raw.match(/^vote\s+(\d+)$/);
    if (voteMatch && state.phase === 'day') {
      const voter = findPlayer(state, ctx.sender);
      if (!voter || !voter.alive) return { text: '⚰️ Hanya pemain yang masih hidup boleh memberi suara.' };
      const number = Number(voteMatch[1]);
      const target = number === 0 ? null : byNumber(state, number);
      if (number !== 0 && (!target || !target.alive)) return { text: '❌ Nomor tidak valid atau pemain sudah tewas.' };

      state.votes[ctx.sender] = number;
      const voted = Object.keys(state.votes).length;
      const total = alive(state).length;

      if (voted >= total) {
        resolveDay(state, ctx.api);
        return { text: `🗳️ ${voter.name} memilih ${target ? target.name : 'tidak menggantung siapa pun'}. Semua suara masuk!` };
      }
      return { text: `🗳️ ${voter.name} sudah memilih. (${voted}/${total} suara)` };
    }

    if (raw === 'status') {
      return { text: `🕵️ *MAFIA* — fase *${state.phase}* hari ${state.day}\n\n${roster(state)}` };
    }

    return null;
  },

  // Aksi malam yang dikirim pemain lewat chat pribadi.
  dmInput(ctx) {
    const state = ctx.session.state;

    // Pola dicek lebih dulu: kalau bukan perintah aksi malam, kembalikan null
    // supaya chat pribadi pemain tetap bisa dipakai untuk fitur bot lain.
    const match = ctx.body.trim().toLowerCase().match(/^(bunuh|kill|lindungi|heal|cek|check)\s+(\d+)$/);
    if (!match) return null;
    if (state.phase !== 'night') return { text: '🌞 Sekarang bukan fase malam. Tunggu pengumuman di grup.' };

    const player = findPlayer(state, ctx.sender);
    if (!player || !player.alive) return { text: '⚰️ Kamu sudah tidak bisa beraksi.' };

    const action = match[1];
    const target = byNumber(state, match[2]);
    if (!target || !target.alive) return { text: '❌ Nomor tidak valid atau pemain sudah tewas.' };

    const isKill = ['bunuh', 'kill'].includes(action);
    const isHeal = ['lindungi', 'heal'].includes(action);
    const expected = isKill ? 'mafia' : isHeal ? 'doctor' : 'detective';
    if (player.role !== expected) return { text: `❌ Aksi itu bukan milik peranmu (${ROLE[player.role].name}).` };

    let reply;
    if (isKill) {
      if (target.role === 'mafia') return { text: '❌ Kamu tidak bisa membunuh sesama mafia.' };
      state.night.kill = target.number;
      reply = `🔪 Target malam ini: *${target.name}*.`;
      // Rekan mafia diberi tahu supaya tidak saling menimpa keputusan.
      for (const mate of aliveMafia(state)) {
        if (mate.id !== player.id) ctx.api.dm(mate.id, `🔪 ${player.name} memilih target *${target.name}*.`).catch(() => {});
      }
    } else if (isHeal) {
      state.night.heal = target.number;
      reply = `💉 Kamu melindungi *${target.name}* malam ini.`;
    } else {
      reply = `🕵️ Hasil penyelidikan: *${target.name}* adalah ${target.role === 'mafia' ? '🔪 *MAFIA*' : '✅ bukan mafia'}.`;
    }

    // Dikunci pakai ID kanonik pemain agar cocok dengan daftar 'needed'.
    state.night.done[player.id] = true;

    // Kalau semua peran khusus sudah beraksi, malam langsung diselesaikan.
    const pending = state.night.needed.filter(id => !state.night.done[id] && findPlayer(state, id)?.alive);
    if (!pending.length) {
      setImmediate(() => { if (state.phase === 'night') resolveNight(state, ctx.api); });
    }

    return { text: reply };
  }
};
