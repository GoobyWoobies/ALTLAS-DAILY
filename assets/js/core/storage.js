// Local persistence (localStorage). Everything stays on this device: there is
// no account and no server, so statistics are local by design.
import { utcDateKey, daysBetween, addDays } from './daily.js';

const KEY = 'atlas-daily:v1';
const HISTORY_LIMIT = 60;

let memory = null; // fallback when localStorage is unavailable (private mode, blocked)

function emptyState() {
  return { games: {}, daily: {} };
}

export function loadState() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw);
      if (s && typeof s === 'object' && s.games && s.daily) return s;
    }
  } catch {
    /* ignore and fall back */
  }
  return memory || emptyState();
}

function saveState(s) {
  memory = s;
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* quota or disabled storage: keep the in-memory copy */
  }
}

export function resetAll() {
  memory = null;
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

/** Saved progress of a daily challenge: { results: [...], done, score, max } or null. */
export function getDaily(game, dateKey) {
  return loadState().daily[game]?.[dateKey] || null;
}

export function saveDailyProgress(game, dateKey, progress) {
  const s = loadState();
  s.daily[game] ??= {};
  s.daily[game][dateKey] = progress;
  saveState(s);
}

/** Record a finished game (daily or free) in the statistics. */
export function recordGame(game, { mode, variant = null, dateKey, score, max, detail }) {
  const s = loadState();
  const g = (s.games[game] ??= { played: 0, totalScore: 0, totalMax: 0, best: 0, history: [] });
  g.played += 1;
  g.totalScore += score;
  g.totalMax += max;
  g.best = Math.max(g.best, score);
  g.history.unshift({ at: new Date().toISOString(), mode, variant, dateKey, score, max, detail });
  g.history.length = Math.min(g.history.length, HISTORY_LIMIT);
  saveState(s);
}

export function gameStats(game, today = utcDateKey()) {
  const s = loadState();
  const g = s.games[game] || { played: 0, totalScore: 0, totalMax: 0, best: 0, history: [] };
  const days = Object.keys(s.daily[game] || {})
    .filter((k) => s.daily[game][k].done)
    .sort();
  return {
    played: g.played,
    best: g.best,
    average: g.played ? g.totalScore / g.played : 0,
    accuracy: g.totalMax ? g.totalScore / g.totalMax : 0,
    history: g.history,
    dailyDone: days.length,
    ...streaks(days, today),
  };
}

/**
 * Current streak counts consecutive completed days ending today, or ending
 * yesterday if today's challenge has not been played yet.
 */
export function streaks(sortedDays, today) {
  const set = new Set(sortedDays);
  let current = 0;
  let cursor = set.has(today) ? today : addDays(today, -1);
  while (set.has(cursor)) {
    current += 1;
    cursor = addDays(cursor, -1);
  }
  let best = 0;
  let run = 0;
  let prev = null;
  for (const d of sortedDays) {
    run = prev && daysBetween(prev, d) === 1 ? run + 1 : 1;
    best = Math.max(best, run);
    prev = d;
  }
  return { streak: current, bestStreak: best };
}
