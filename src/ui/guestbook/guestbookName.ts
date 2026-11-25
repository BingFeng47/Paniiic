// Guestbook name rules and storage (leaderboard Req 5.2, 5.8).
//
// `normalizeName` is pure. `loadName` / `saveName` read and write the last Player_Name under
// `phantom98.guestbook` as `{"v":1,"name":"..."}`. Like `createSettingsStore`, every storage
// access sits in try/catch: blocked, missing or bad storage gives null and never throws.
import type { StorageLike } from '../../core/settings';

export const GUESTBOOK_STORAGE_KEY = 'phantom98.guestbook';
const GUESTBOOK_VERSION = 1;

/** Same rule as the `name` check in docs/leaderboard.sql and the client in src/core/leaderboard.ts. */
const NAME = /^[A-Za-z0-9 _-]{3,12}$/;

/** A storage getter, like `SettingsDeps.storage`. May return null/undefined or throw. */
export type StorageSource = () => StorageLike | null | undefined;

/** The page's `localStorage`, for callers outside tests. */
export const browserStorage: StorageSource = () => (globalThis as { localStorage?: StorageLike }).localStorage;

/**
 * Trims, collapses inner runs of spaces to one, then returns the Player_Name, or null if the
 * result is not 3–12 letters, digits, spaces, `_` or `-`.
 */
export function normalizeName(raw: string): string | null {
  if (typeof raw !== 'string') return null;
  const name = raw.trim().replace(/ {2,}/g, ' ');
  return NAME.test(name) ? name : null;
}

function resolve(storage: StorageSource): StorageLike | null {
  try {
    return storage() ?? null;
  } catch {
    return null;
  }
}

/** The last saved Player_Name, or null when nothing valid is stored or storage is unusable. */
export function loadName(storage: StorageSource): string | null {
  const store = resolve(storage);
  if (store === null) return null;
  try {
    const text = store.getItem(GUESTBOOK_STORAGE_KEY);
    if (typeof text !== 'string') return null;
    const data: unknown = JSON.parse(text);
    if (typeof data !== 'object' || data === null) return null;
    const { v, name } = data as { v?: unknown; name?: unknown };
    if (v !== GUESTBOOK_VERSION || typeof name !== 'string') return null;
    return normalizeName(name);
  } catch {
    return null;
  }
}

/**
 * Stores the normalized name. Returns true when it was written; false for an invalid name or
 * unusable storage. Never throws.
 */
export function saveName(storage: StorageSource, name: string): boolean {
  const clean = normalizeName(name);
  if (clean === null) return false;
  const store = resolve(storage);
  if (store === null) return false;
  try {
    store.setItem(GUESTBOOK_STORAGE_KEY, JSON.stringify({ v: GUESTBOOK_VERSION, name: clean }));
    return true;
  } catch {
    return false;
  }
}
