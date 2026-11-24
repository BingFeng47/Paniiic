// Fake `localStorage` for Settings_Store tests (title-and-endings, design "Test helpers").
//
// `createFakeStorage({ mode, initial })` returns the getter to inject as `SettingsDeps.storage`,
// the current stored string per key and a log of every `setItem` call (failed ones included).
//
// Modes:
// - `ok`: a working storage seeded with `initial` under the settings key.
// - `nullGetter`: the getter returns null (no `localStorage` at all).
// - `getterThrows`: reading the `localStorage` property throws a `SecurityError`.
// - `readThrows`: `getItem` throws a `SecurityError`.
// - `writeThrows`: `getItem` works, `setItem` throws a `QuotaExceededError` and stores nothing.
import { STORAGE_KEY, type StorageLike } from '../../src/core/settings';

export type FakeStorageMode = 'ok' | 'nullGetter' | 'getterThrows' | 'readThrows' | 'writeThrows';

export const FAKE_STORAGE_MODES: readonly FakeStorageMode[] = Object.freeze([
  'ok',
  'nullGetter',
  'getterThrows',
  'readThrows',
  'writeThrows',
]);

export interface FakeStorageOptions {
  readonly mode?: FakeStorageMode;
  /** Value stored under `key` before the store reads it. Default null (nothing stored). */
  readonly initial?: string | null;
  /** Key `initial` is stored under. Default `STORAGE_KEY`. */
  readonly key?: string;
}

export interface SetItemCall {
  readonly key: string;
  readonly value: string;
  /** True when this call threw (mode `writeThrows`). */
  readonly threw: boolean;
}

export interface FakeStorage {
  readonly mode: FakeStorageMode;
  /** Inject as `createSettingsStore({ storage: fake.getter })`. */
  readonly getter: () => StorageLike | null;
  /** Current stored value under `key` (default `STORAGE_KEY`), null when nothing is stored. */
  stored(key?: string): string | null;
  /** Every `setItem` call in order, including the ones that threw. */
  readonly writes: readonly SetItemCall[];
  /** Number of times the getter was called. */
  getterCalls(): number;
  /** Number of `getItem` calls, including the ones that threw. */
  reads(): number;
}

export function createFakeStorage(options: FakeStorageOptions = {}): FakeStorage {
  const mode = options.mode ?? 'ok';
  const data = new Map<string, string>();
  if (options.initial !== undefined && options.initial !== null) {
    data.set(options.key ?? STORAGE_KEY, options.initial);
  }
  const writes: SetItemCall[] = [];
  let getterCount = 0;
  let readCount = 0;

  const storage: StorageLike = {
    getItem(key: string): string | null {
      readCount += 1;
      if (mode === 'readThrows') throw new DOMException('The operation is insecure.', 'SecurityError');
      return data.has(key) ? (data.get(key) as string) : null;
    },
    setItem(key: string, value: string): void {
      if (mode === 'writeThrows') {
        writes.push({ key, value, threw: true });
        throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
      }
      writes.push({ key, value, threw: false });
      data.set(key, String(value));
    },
  };

  return {
    mode,
    getter: () => {
      getterCount += 1;
      if (mode === 'nullGetter') return null;
      if (mode === 'getterThrows') throw new DOMException('Access is denied.', 'SecurityError');
      return storage;
    },
    stored: (key = STORAGE_KEY) => (data.has(key) ? (data.get(key) as string) : null),
    writes,
    getterCalls: () => getterCount,
    reads: () => readCount,
  };
}
