// Harness headless untuk Game Center. Menjalankan tiap game tanpa WhatsApp.
const path = require('path');
const fs = require('fs');
const os = require('os');

const PROJECT = path.join(__dirname, '..');
// Skor tes ditulis ke folder sementara, bukan data/ milik bot.
const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'gametest-'));
process.chdir(sandbox);

const games = require(path.join(PROJECT, 'games'));

let failures = 0;
const outbox = [];

function assert(cond, label) {
  if (!cond) { failures++; console.log(`   ❌ FAIL: ${label}`); }
  else console.log(`   ✅ ${label}`);
}

const client = {
  sendMessage: async (chatId, text) => { outbox.push({ chatId, text }); return {}; }
};

function makeMsg(chatId, sender, body) {
  return {
    body,
    from: chatId,
    author: chatId.endsWith('@g.us') ? sender : undefined,
    _data: { notifyName: sender.split('@')[0] },
    reply: async (content) => { outbox.push({ chatId, text: content }); return {}; }
  };
}

async function send(chatId, sender, body, isGroup = false) {
  const before = outbox.length;
  const handled = await games.handleMessage({
    msg: makeMsg(chatId, sender, body),
    client,
    body,
    sender,
    senderName: sender.split('@')[0],
    chatId,
    isGroup
  });
  const replies = outbox.slice(before).map(o => o.text);
  return { handled, replies, last: replies[replies.length - 1] || '' };
}

const P1 = '628111111111@c.us';
const P2 = '628222222222@c.us';
const P3 = '628333333333@c.us';
const P4 = '628444444444@c.us';
const P5 = '628555555555@c.us';

async function run() {
  console.log('\n=== 1. Menu & fall-through ===');
  let r = await send(P1, P1, '/game');
  assert(r.handled && r.last.includes('GAME CENTER'), 'menu /game tampil');
  assert(games.GAMES.length === 12, `terdaftar ${games.GAMES.length} game (harap 12)`);
  r = await send(P1, P1, 'halo apa kabar');
  assert(r.handled === false, 'chat biasa tanpa sesi diteruskan ke bot (tidak ditelan game)');
  r = await send(P1, P1, '/sticker');
  assert(r.handled === false, 'perintah bot lain tidak diambil alih');

  console.log('\n=== 2. Tic-Tac-Toe vs bot ===');
  r = await send(P1, P1, '/xo sulit');
  assert(r.handled && r.last.includes('TIC-TAC-TOE'), 'game dimulai');
  let done = false;
  for (const cell of ['1', '2', '3', '4', '5', '6', '7', '8', '9']) {
    r = await send(P1, P1, cell);
    if (/menang|Seri/i.test(r.last)) { done = true; break; }
  }
  assert(done, 'permainan selesai dengan hasil menang/seri');
  assert(games.store.sessions.size === 0, 'sesi dibersihkan setelah selesai');

  console.log('\n=== 3. Tic-Tac-Toe PvP di grup ===');
  const G = '120363000000000000@g.us';
  r = await send(G, P1, '/xo pvp', true);
  assert(r.last.includes('PvP'), 'mode PvP aktif');
  r = await send(G, P2, '5', true);
  assert(r.last.includes('⭕'), 'pemain kedua otomatis bergabung');
  r = await send(G, P2, '1', true);
  assert(r.last.includes('Belum giliranmu'), 'giliran ditegakkan');
  await send(G, P1, '1', true);
  await send(G, P2, '2', true);
  await send(G, P1, '4', true);
  await send(G, P2, '3', true);
  r = await send(G, P1, '7', true);
  assert(r.last.includes('menang'), 'kemenangan garis vertikal terdeteksi');

  console.log('\n=== 4. Tetris ===');
  r = await send(P1, P1, '/tetris');
  assert(r.last.includes('TETRIS') && r.last.includes('🧱'), 'papan tetris tampil');
  let over = false;
  for (let i = 0; i < 400; i++) {
    const cmd = ['a', 'd', 'w', 's', 'x', 'aa', 'dd', 'ddx'][Math.floor(Math.random() * 8)];
    r = await send(P1, P1, cmd);
    if (!r.handled) { assert(false, `tetris menolak perintah "${cmd}"`); break; }
    if (r.last.includes('GAME OVER')) { over = true; break; }
  }
  assert(over, 'tetris berakhir dengan game over (tanpa crash)');
  assert(games.store.sessions.size === 0, 'sesi tetris ditutup');

  console.log('\n=== 5. Pac-Man ===');
  r = await send(P1, P1, '/pacman');
  assert(r.last.includes('PAC-MAN'), 'labirin tampil');
  let ate = false;
  for (let i = 0; i < 300; i++) {
    const cmd = ['w', 'a', 's', 'd', 'ww', 'dd', 'aa', 'ss'][Math.floor(Math.random() * 8)];
    r = await send(P1, P1, cmd);
    if (/Skor (?!0 )/.test(r.last)) ate = true;
    if (r.last.includes('GAME OVER') || r.last.includes('Level selesai')) break;
  }
  assert(ate, 'pac-man mengumpulkan titik');
  await send(P1, P1, '/stopgame');

  console.log('\n=== 6. Hangman ===');
  r = await send(P1, P1, '/hangman');
  assert(r.last.includes('HANGMAN'), 'hangman dimulai');
  let ended = false;
  for (const ch of 'aiueontsrkldmpgbhjcwyfvzqx') {
    r = await send(P1, P1, ch);
    if (/Selesai|Game over/i.test(r.last)) { ended = true; break; }
  }
  assert(ended, 'hangman selesai (menang atau kalah)');

  console.log('\n=== 7. Kuis ===');
  r = await send(P1, P1, '/quiz 3');
  assert(r.last.includes('KUIS'), 'kuis dimulai');
  for (let i = 0; i < 30; i++) {
    r = await send(P1, P1, ['a', 'b', 'c', 'd'][i % 4]);
    if (r.last.includes('KUIS SELESAI')) break;
  }
  assert(r.last.includes('KUIS SELESAI'), 'kuis 3 soal selesai');

  console.log('\n=== 8. Sambung Kata ===');
  r = await send(P1, P1, '/sambungkata');
  assert(r.last.includes('SAMBUNG KATA'), 'sambung kata dimulai');
  const letter = r.last.match(/Huruf kamu\s+: \*([A-Z])\*/)?.[1];
  assert(!!letter, 'huruf target terbaca');
  r = await send(P1, P1, 'zzz');
  assert(r.last.includes('diawali huruf') || r.last.includes('Minimal'), 'kata salah ditolak');
  await send(P1, P1, '/stopgame');

  console.log('\n=== 9. Snake ===');
  r = await send(P1, P1, '/snake');
  assert(r.last.includes('SNAKE'), 'snake dimulai');
  for (let i = 0; i < 200; i++) {
    r = await send(P1, P1, ['w', 'a', 's', 'd'][Math.floor(Math.random() * 4)]);
    if (r.last.includes('GAME OVER')) break;
  }
  assert(r.last.includes('GAME OVER') || r.last.includes('Skor'), 'snake berjalan sampai selesai');
  if (games.store.sessions.size) await send(P1, P1, '/stopgame');

  console.log('\n=== 10. 2048 ===');
  r = await send(P1, P1, '/2048');
  assert(r.last.includes('2048'), '2048 dimulai');
  let gameover = false;
  for (let i = 0; i < 3000; i++) {
    r = await send(P1, P1, ['w', 'a', 's', 'd'][Math.floor(Math.random() * 4)]);
    if (r.last.includes('GAME OVER')) { gameover = true; break; }
  }
  assert(gameover, '2048 mencapai game over tanpa crash');

  console.log('\n=== 11. Minesweeper ===');
  r = await send(P1, P1, '/ranjau');
  assert(r.last.includes('MINESWEEPER'), 'ranjau dimulai');
  r = await send(P1, P1, 'f c4');
  assert(r.last.includes('Bendera dipasang'), 'bendera bisa dipasang');
  r = await send(P1, P1, 'f c4');
  assert(r.last.includes('Bendera dilepas'), 'bendera bisa dilepas');
  let finishedMs = false;
  for (const col of 'abcdefgh') {
    for (let row = 1; row <= 8; row++) {
      r = await send(P1, P1, `${col}${row}`);
      if (r.last.includes('BOOM') || r.last.includes('MENANG')) { finishedMs = true; break; }
    }
    if (finishedMs) break;
  }
  assert(finishedMs, 'minesweeper berakhir (kena ranjau atau menang)');

  console.log('\n=== 12. Tebak Kata ===');
  r = await send(P1, P1, '/tebakkata');
  assert(r.last.includes('TEBAK KATA'), 'tebak kata dimulai');
  r = await send(P1, P1, 'bantuan');
  assert(r.last.includes('huruf dibuka'), 'bantuan membuka huruf');
  for (let i = 0; i < 6; i++) {
    r = await send(P1, P1, 'lewat');
    if (r.last.includes('SESI SELESAI')) break;
  }
  assert(r.last.includes('SESI SELESAI'), 'lima ronde tebak kata selesai');

  console.log('\n=== 13. Kuis Matematika ===');
  r = await send(P1, P1, '/matematika');
  assert(r.last.includes('KUIS MATEMATIKA'), 'kuis matematika dimulai');
  for (let i = 0; i < 12; i++) {
    const soal = r.last.match(/\*(-?\d+) ([+\-×÷]) (-?\d+) = \?\*/);
    if (!soal) break;
    const [, a, op, b] = soal;
    const jawab = { '+': +a + +b, '-': +a - +b, '×': +a * +b, '÷': +a / +b }[op];
    r = await send(P1, P1, String(jawab));
    if (r.last.includes('SELESAI')) break;
  }
  assert(r.last.includes('SELESAI'), 'sepuluh soal matematika terjawab benar');

  console.log('\n=== 14. Mafia (grup + aksi DM) ===');
  const GM = '120363111111111111@g.us';
  r = await send(GM, P1, '/mafia', true);
  assert(r.last.includes('LOBI DIBUKA'), 'lobi mafia dibuka');
  r = await send(GM, P2, 'join', true);
  await send(GM, P3, 'join', true);
  await send(GM, P4, 'join', true);
  r = await send(GM, P5, 'join', true);
  assert(r.last.includes('5/15'), 'lima pemain bergabung');
  r = await send(GM, P2, 'mulai', true);
  assert(r.last.includes('Hanya host'), 'hanya host yang boleh memulai');
  r = await send(GM, P1, 'mulai', true);
  assert(r.replies.some(t => t.includes('GAME DIMULAI')), 'game mafia dimulai');

  await new Promise(res => setTimeout(res, 60));
  const session = games.store.sessions.get(GM);
  assert(!!session, 'sesi mafia tersimpan');
  assert(session.state.phase === 'night', `fase malam aktif (sekarang: ${session.state.phase})`);

  const roles = session.state.players.map(p => `${p.name}=${p.role}`).join(', ');
  console.log(`   ℹ️  peran: ${roles}`);
  const mafia = session.state.players.find(p => p.role === 'mafia');
  const doctor = session.state.players.find(p => p.role === 'doctor');
  const detective = session.state.players.find(p => p.role === 'detective');
  const victim = session.state.players.find(p => p.role === 'villager');

  r = await send(mafia.id, mafia.id, 'halo bot');
  assert(r.handled === false, 'chat pribadi biasa pemain mafia tidak ditelan game');
  r = await send(mafia.id, mafia.id, `bunuh ${victim.number}`);
  assert(r.last.includes('Target malam ini'), 'mafia bisa memilih target lewat DM');
  r = await send(doctor.id, doctor.id, `lindungi ${doctor.number}`);
  assert(r.last.includes('melindungi'), 'dokter bisa melindungi');
  r = await send(detective.id, detective.id, `cek ${mafia.number}`);
  assert(r.last.includes('MAFIA'), 'detektif mendapat hasil penyelidikan yang benar');

  await new Promise(res => setTimeout(res, 60));
  assert(session.state.phase === 'day', `malam otomatis selesai ke fase siang (sekarang: ${session.state.phase})`);
  assert(victim.alive === false, 'korban mafia tewas');

  const hidup = session.state.players.filter(p => p.alive);
  for (const p of hidup) {
    r = await send(GM, p.id, `vote ${mafia.number}`, true);
  }
  await new Promise(res => setTimeout(res, 60));
  assert(mafia.alive === false || session.state.phase === 'ended', 'voting menggantung target');
  const mafiaClosed = !games.store.sessions.has(GM);
  assert(mafiaClosed, 'warga menang dan sesi mafia ditutup');

  console.log('\n=== 15. Papan skor ===');
  r = await send(P1, P1, '/skor');
  assert(r.last.includes('PAPAN SKOR'), 'papan skor tampil');
  r = await send(P1, P1, '/statgame');
  assert(r.last.includes('STATISTIK'), 'statistik pribadi tampil');
  const scoreFile = path.join(sandbox, 'data', 'game-scores.json');
  assert(fs.existsSync(scoreFile), 'skor tersimpan ke data/game-scores.json');

  console.log('\n=== 16. Penjagaan sesi ===');
  await send(P1, P1, '/tetris');
  r = await send(P1, P1, '/snake');
  assert(r.last.includes('Masih ada game'), 'tidak bisa memulai dua game sekaligus');
  r = await send(P1, P1, '.apa itu nodejs');
  assert(r.handled === false, 'prefix titik lolos ke AI walau ada game aktif');
  r = await send(P1, P1, '/stopgame');
  assert(r.last.includes('dihentikan'), '/stopgame menutup sesi');
  r = await send(P1, P1, '/mafia');
  assert(r.last.includes('hanya bisa dimainkan di grup'), 'mafia ditolak di chat pribadi');
  assert(games.store.sessions.size === 0, 'tidak ada sesi menggantung di akhir');

  console.log(`\n${failures === 0 ? '🎉 SEMUA TES LULUS' : `💥 ${failures} TES GAGAL`}`);
  process.exit(failures === 0 ? 0 : 1);
}

run().catch(err => { console.error('CRASH:', err); process.exit(1); });
