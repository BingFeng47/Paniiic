// Player Settings and the Settings_Store (title-and-endings, design D7–D9).
//
// The pure half (`normalizeVolume`, `parseSettings`, `serializeSettings`, `mergeSettings`) never
// throws. The store reads and writes `localStorage` through an injected getter and wraps the
// getter, `getItem` and `setItem` in `try`/`catch`, so a blocked, missing or full storage only
// costs persistence, never the game (Req 5.9, 5.10).
//
// `localStorage` is resolved lazily inside the default getter, so importing this module in Node
// or jsdom is safe.
import type { AudioEngine, AudioMix } from './audio';

export interface Settings {
  /** Integer 0..100. */
  readonly masterVolume: number;
  readonly musicEnabled: boolean;
  readonly sfxEnabled: boolean;
  readonly screenShake: boolean;
  /** Shows the hint balloons (player-guide Req 4.1). */
  readonly hintsEnabled: boolean;
}

/** Format version written with the stored Settings. Any other version loads the defaults. */
export const SETTINGS_VERSION = 1;
export const STORAGE_KEY = 'phantom98.settings';

export const DEFAULT_SETTINGS: Settings = Object.freeze({
  masterVolume: 100,
  musicEnabled: true,
  sfxEnabled: true,
  screenShake: true,
  hintsEnabled: true,
});

/** The Volume_Slider moves in steps of this many percent (Req 4.3). */
export const VOLUME_STEP = 10;

const MIN_VOLUME = 0;
const MAX_VOLUME = 100;

function clampVolume(value: number): number {
  // Math.max(0, -0) is +0, so a clamped value is never -0.
  return Math.min(MAX_VOLUME, Math.max(MIN_VOLUME, value));
}

/** Round to the nearest integer and clamp to 0..100; non-finite → 100; never returns -0 (Req 5.7, 5.8). */
export function normalizeVolume(value: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return DEFAULT_SETTINGS.masterVolume;
  return clampVolume(Math.round(value));
}

/** Slider value (string or number) → nearest multiple of VOLUME_STEP in 0..100 (Req 4.3). */
export function volumeFromSlider(raw: string | number): number {
  const value = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(value)) return DEFAULT_SETTINGS.masterVolume;
  return clampVolume(Math.round(clampVolume(value) / VOLUME_STEP) * VOLUME_STEP);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isValidSettings(value: unknown): value is Settings {
  if (!isPlainObject(value)) return false;
  const v = value.masterVolume;
  return (
    typeof v === 'number' &&
    Number.isInteger(v) &&
    v >= MIN_VOLUME &&
    v <= MAX_VOLUME &&
    typeof value.musicEnabled === 'boolean' &&
    typeof value.sfxEnabled === 'boolean' &&
    typeof value.screenShake === 'boolean' &&
    typeof value.hintsEnabled === 'boolean'
  );
}

/** JSON with the version first: {"v":1,"masterVolume":..,"musicEnabled":..,"sfxEnabled":..,"screenShake":..,"hintsEnabled":..} */
export function serializeSettings(settings: Settings): string {
  return JSON.stringify({
    v: SETTINGS_VERSION,
    masterVolume: settings.masterVolume,
    musicEnabled: settings.musicEnabled,
    sfxEnabled: settings.sfxEnabled,
    screenShake: settings.screenShake,
    hintsEnabled: settings.hintsEnabled,
  });
}

/** Per-field fold shared by parsing and merging: a field of the wrong type keeps `base`'s value. */
function applyFields(base: Settings, source: Record<string, unknown>): Settings {
  const volume = source.masterVolume;
  const music = source.musicEnabled;
  const sfx = source.sfxEnabled;
  const shake = source.screenShake;
  const hints = source.hintsEnabled;
  return Object.freeze({
    masterVolume: typeof volume === 'number' ? normalizeVolume(volume) : base.masterVolume,
    musicEnabled: typeof music === 'boolean' ? music : base.musicEnabled,
    sfxEnabled: typeof sfx === 'boolean' ? sfx : base.sfxEnabled,
    screenShake: typeof shake === 'boolean' ? shake : base.screenShake,
    hintsEnabled: typeof hints === 'boolean' ? hints : base.hintsEnabled,
  });
}

/** Never throws. null → defaults; bad JSON, non-object or v ≠ 1 → defaults; per-field fallback (Req 5.4–5.8). */
export function parseSettings(raw: string | null): Settings {
  // Rule 1: nothing stored (Req 5.4).
  if (raw === null || typeof raw !== 'string') return DEFAULT_SETTINGS;
  // Rule 2: not JSON, not a plain object, or another version (Req 5.5).
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return DEFAULT_SETTINGS;
  }
  if (!isPlainObject(parsed) || parsed.v !== SETTINGS_VERSION) return DEFAULT_SETTINGS;
  // Rule 3: field by field; unknown fields are ignored (Req 5.6, 5.7, 5.8).
  return applyFields(DEFAULT_SETTINGS, parsed);
}

function sameSettings(a: Settings, b: Settings): boolean {
  return (
    a.masterVolume === b.masterVolume &&
    a.musicEnabled === b.musicEnabled &&
    a.sfxEnabled === b.sfxEnabled &&
    a.screenShake === b.screenShake &&
    a.hintsEnabled === b.hintsEnabled
  );
}

/**
 * Applies a patch field by field with the same rules; a field of the wrong type keeps `current`'s
 * value. Returns `current` itself when nothing changes.
 */
export function mergeSettings(current: Settings, patch: Partial<Settings>): Settings {
  if (!isPlainObject(patch)) return current;
  const next = applyFields(current, patch as Record<string, unknown>);
  return sameSettings(current, next) ? current : next;
}

export function mixOf(settings: Settings): AudioMix {
  return Object.freeze({
    volume: settings.masterVolume,
    music: settings.musicEnabled,
    sfx: settings.sfxEnabled,
  });
}

export type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

export interface SettingsDeps {
  /** Defaults to () => globalThis.localStorage. May return null/undefined or throw. */
  readonly storage?: () => StorageLike | null | undefined;
  /** Defaults to console.warn. Called at most once per store. */
  readonly warn?: (message: string, error: unknown) => void;
}

export type SettingsListener = (settings: Settings) => void;

export interface SettingsStore {
  get(): Settings;
  /** Merges, and when anything changed: writes (unless memory-only) and notifies synchronously. */
  update(patch: Partial<Settings>): Settings;
  subscribe(listener: SettingsListener): () => void;
  /** False after a failed or impossible read (Req 5.9). */
  isPersistent(): boolean;
}

const defaultStorage = (): StorageLike | null | undefined =>
  (globalThis as { localStorage?: StorageLike }).localStorage;

const defaultWarn = (message: string, error: unknown): void => {
  console.warn(message, error);
};

export function createSettingsStore(deps: SettingsDeps = {}): SettingsStore {
  const getStorage = deps.storage ?? defaultStorage;
  const warnSink = deps.warn ?? defaultWarn;

  let warned = false;
  const warnOnce = (message: string, error: unknown): void => {
    if (warned) return;
    warned = true;
    try {
      warnSink(message, error);
    } catch {
      // A broken warn sink must not break the store.
    }
  };

  // Load (Req 5.1, 5.4, 5.9). `storage` stays null when the store is memory only.
  let storage: StorageLike | null = null;
  let current: Settings = DEFAULT_SETTINGS;
  try {
    storage = getStorage() ?? null;
    // A missing storage is a failed read too (design Error Handling, Req 5.9).
    if (storage === null) warnOnce('Settings storage is unavailable; settings will not be saved.', undefined);
  } catch (error) {
    storage = null;
    warnOnce('Settings storage is unavailable; settings will not be saved.', error);
  }
  if (storage !== null) {
    try {
      current = parseSettings(storage.getItem(STORAGE_KEY));
    } catch (error) {
      storage = null;
      current = DEFAULT_SETTINGS;
      warnOnce('Could not read saved settings; using defaults for this page.', error);
    }
  }

  // Each entry is its own object, so subscribing the same function twice gives two calls.
  let listeners: ReadonlyArray<{ readonly fn: SettingsListener }> = [];

  const write = (settings: Settings): void => {
    if (storage === null) return;
    try {
      storage.setItem(STORAGE_KEY, serializeSettings(settings));
    } catch (error) {
      // Stay persistent: a full storage may free up, so the next change tries again (D8, Req 5.10).
      warnOnce('Could not save settings; keeping them in memory.', error);
    }
  };

  return {
    get: () => current,
    update(patch) {
      const next = mergeSettings(current, patch);
      if (sameSettings(current, next)) return current;
      current = next;
      write(next);
      for (const entry of listeners) {
        try {
          entry.fn(next);
        } catch (error) {
          console.error('Settings listener failed:', error);
        }
      }
      return current;
    },
    subscribe(listener) {
      const entry = { fn: listener };
      listeners = [...listeners, entry];
      return () => {
        listeners = listeners.filter((e) => e !== entry);
      };
    },
    isPersistent: () => storage !== null,
  };
}

/** Applies store.get() now and on every change; returns the unsubscribe function (Req 4.5, 5.11). */
export function bindAudioSettings(audio: Pick<AudioEngine, 'setMix'>, store: SettingsStore): () => void {
  audio.setMix(mixOf(store.get()));
  return store.subscribe((settings) => audio.setMix(mixOf(settings)));
}
