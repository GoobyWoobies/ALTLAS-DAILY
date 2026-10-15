// Daily challenges are keyed by the UTC calendar date: everyone gets the same
// puzzle between 00:00 and 23:59 UTC. The date is captured once when a game
// starts, so a game in progress never changes at midnight.
import { hashString } from './rng.js';

// Bump when the selection algorithm or the content pool changes in a way that
// would alter past dailies; it is part of the seed.
export const DAILY_VERSION = 1;

export function utcDateKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

export function dailySeed(game, dateKey) {
  return hashString(`atlas-daily:${game}:${dateKey}:v${DAILY_VERSION}`);
}

/** Number of whole days from key a to key b (both YYYY-MM-DD). */
export function daysBetween(a, b) {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);
}

export function addDays(key, n) {
  return utcDateKey(new Date(Date.parse(`${key}T00:00:00Z`) + n * 86400000));
}

/** Milliseconds until the next UTC midnight. */
export function msUntilNextDaily(now = new Date()) {
  const next = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
  return next - now.getTime();
}

export function formatDateKey(key) {
  const [y, m, d] = key.split('-');
  return `${d}/${m}/${y}`;
}
