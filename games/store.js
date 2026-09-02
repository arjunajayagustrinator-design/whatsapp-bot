// Penyimpanan sesi game (in-memory) dan papan skor (persisten di data/).
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(process.cwd(), 'data');
const SCORE_FILE = path.join(DATA_DIR, 'game-scores.json');

// Sesi idle lebih lama dari ini dibersihkan otomatis supaya chat tidak
// "terkunci" selamanya kalau pemain kabur di tengah permainan.
const IDLE_TIMEOUT = Number(process.env.GAME_IDLE_TIMEOUT_MS || 15 * 60 * 1000);

function readJson(file, fallback) {
  try {
    if (!fs.existsSync(file)) return fallback;
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJson(file, value) {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(value, null, 2));
  } catch (err) {
    console.error('Game store write error:', err.message);
  }
}

const scores = readJson(SCORE_FILE, { players: {} });
const persistScores = () => writeJson(SCORE_FILE, scores);

// chatId -> session. Satu chat hanya boleh punya satu game aktif.
const sessions = new Map();
// userId -> chatId. Dipakai Mafia agar aksi malam lewat DM tetap nyambung ke grup.
const dmRoutes = new Map();

function createSession(chatId, gameId, extra = {}) {
  const session = {
    gameId,
    chatId,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    timers: new Set(),
    state: {},
    ...extra
  };
  sessions.set(chatId, session);
  return session;
}

function getSession(chatId) {
  const session = sessions.get(chatId);
  if (!session) return null;
  if (Date.now() - session.updatedAt > IDLE_TIMEOUT) {
    endSession(chatId);
    return null;
  }
  return session;
}

function touchSession(session) {
  if (session) session.updatedAt = Date.now();
}

function endSession(chatId) {
  const session = sessions.get(chatId);
  if (!session) return null;
  // Ditandai supaya pekerjaan async yang terlanjur berjalan (timer Mafia,
  // setImmediate) berhenti mengirim pesan ke sesi yang sudah selesai.
  session.closed = true;
  for (const timer of session.timers) clearTimeout(timer);
  session.timers.clear();
  for (const [userId, target] of dmRoutes) {
    if (target === chatId) dmRoutes.delete(userId);
  }
  sessions.delete(chatId);
  return session;
}

// Buang sesi mati; dipanggil dari router jadi tidak butuh interval sendiri.
function sweepSessions(onExpire) {
  const now = Date.now();
  for (const [chatId, session] of sessions) {
    if (now - session.updatedAt > IDLE_TIMEOUT) {
      endSession(chatId);
      if (onExpire) onExpire(chatId, session);
    }
  }
}

function routeDm(userId, chatId) { dmRoutes.set(userId, chatId); }
function clearDmRoute(userId) { dmRoutes.delete(userId); }
function dmTarget(userId) {
  const chatId = dmRoutes.get(userId);
  if (!chatId) return null;
  if (!sessions.has(chatId)) { dmRoutes.delete(userId); return null; }
  return chatId;
}

function playerRecord(waId, name) {
  const record = scores.players[waId] || { name: name || waId.split('@')[0], points: 0, wins: 0, plays: 0, games: {} };
  if (name) record.name = name;
  scores.players[waId] = record;
  return record;
}

function addScore(waId, name, gameId, points, won = false) {
  if (!waId) return null;
  const record = playerRecord(waId, name);
  record.points += points;
  record.plays += 1;
  if (won) record.wins += 1;
  record.games[gameId] = (record.games[gameId] || 0) + points;
  persistScores();
  return record;
}

function leaderboard(limit = 10, gameId = null) {
  return Object.entries(scores.players)
    .map(([waId, record]) => ({
      waId,
      name: record.name,
      points: gameId ? (record.games?.[gameId] || 0) : record.points,
      wins: record.wins || 0,
      plays: record.plays || 0
    }))
    .filter(entry => entry.points > 0)
    .sort((a, b) => b.points - a.points)
    .slice(0, limit);
}

function statsFor(waId) {
  return scores.players[waId] || null;
}

module.exports = {
  IDLE_TIMEOUT,
  sessions,
  createSession,
  getSession,
  touchSession,
  endSession,
  sweepSessions,
  routeDm,
  clearDmRoute,
  dmTarget,
  addScore,
  leaderboard,
  statsFor
};
