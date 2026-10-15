// Game session: rounds, results, daily persistence. Shared by the three games.
import { utcDateKey, dailySeed } from './daily.js';
import { randomSeed } from './rng.js';
import { getDaily, saveDailyProgress, recordGame } from './storage.js';

/**
 * @param {string} game        game id
 * @param {'daily'|'free'} mode
 * @param {(seed:number) => any[]} buildRounds
 * @param {number} max         maximum score of a full game
 */
export function createSession(game, mode, buildRounds, max, { variant = null } = {}) {
  const dateKey = utcDateKey(); // captured once: the daily never changes mid-game
  const seed = mode === 'daily' ? dailySeed(game, dateKey) : randomSeed();
  const rounds = buildRounds(seed);
  const saved = mode === 'daily' ? getDaily(game, dateKey) : null;
  const results = saved?.results ? saved.results.slice() : [];
  // state of a round left half-played (daily only), so reloading the page
  // does not give a fresh set of attempts
  let pending = saved?.pending && saved.pending.index === results.length ? saved.pending.state : null;

  function persist() {
    if (mode !== 'daily') return;
    saveDailyProgress(game, dateKey, {
      results: results.slice(),
      done: session.done,
      score: session.score,
      max,
      pending: pending ? { index: results.length, state: pending } : null,
    });
  }

  const session = {
    game,
    mode,
    dateKey,
    seed,
    rounds,
    results,
    max,
    variant,
    get index() {
      return results.length;
    },
    get done() {
      return results.length >= rounds.length;
    },
    get score() {
      return results.reduce((sum, r) => sum + r.score, 0);
    },
    /** Saved in-round state for the current round, or null. */
    get pending() {
      return pending;
    },
    /** Persist the in-round state (attempts, hints) of a daily. */
    savePending(state) {
      pending = state;
      persist();
    },
    /** Store the result of the current round (and persist a daily). */
    recordRound(result) {
      results.push(result);
      pending = null;
      persist();
    },
    /** Called once when the last round is recorded. */
    finish() {
      recordGame(game, { mode, variant, dateKey, score: session.score, max, detail: results.map((r) => r.symbol) });
    },
  };
  return session;
}

/** True if a daily was already finished (it can be reviewed, not replayed). */
export function dailyStatus(game, dateKey = utcDateKey()) {
  const d = getDaily(game, dateKey);
  if (!d) return { state: 'new' };
  if (d.done) return { state: 'done', score: d.score, max: d.max };
  return { state: 'progress', round: d.results.length };
}
