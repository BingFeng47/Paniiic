import fc from 'fast-check';
import { describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_SETTINGS,
  SETTINGS_VERSION,
  STORAGE_KEY,
  bindAudioSettings,
  createSettingsStore,
  isValidSettings,
  mergeSettings,
  mixOf,
  normalizeVolume,
  parseSettings,
  serializeSettings,
  volumeFromSlider,
  type Settings,
} from '../../src/core/settings';
import { createFakeAudioEngine } from '../helpers/audio';
import { FAKE_STORAGE_MODES, createFakeStorage } from '../helpers/storage';

const FLAGS = ['musicEnabled', 'sfxEnabled', 'screenShake', 'hintsEnabled'] as const;

const arbSettings: fc.Arbitrary<Settings> = fc.record({
  masterVolume: fc.integer({ min: 0, max: 100 }),
  musicEnabled: fc.boolean(),
  sfxEnabled: fc.boolean(),
  screenShake: fc.boolean(),
  hintsEnabled: fc.boolean(),
});

/** Any value a hand-edited or foreign storage entry might hold for a field. */
const arbWrongType = fc.oneof(
  fc.string(),
  fc.constant(null),
  fc.array(fc.integer(), { maxLength: 3 }),
  fc.dictionary(fc.string({ maxLength: 3 }), fc.integer(), { maxKeys: 2 }),
);

const arbVolumeField = fc.oneof(
  fc.integer({ min: 0, max: 100 }),
  fc.integer({ min: -1000, max: 1000 }),
  fc.double({ noNaN: true, noDefaultInfinity: true, min: -500, max: 500 }),
  fc.boolean(),
  arbWrongType,
);
const arbFlagField = fc.oneof(fc.boolean(), fc.integer({ min: 0, max: 1 }), arbWrongType);

/** Objects shaped like stored settings: `v` mostly 1, each field missing, right or wrong type. */
const arbSettingsLikeObject = fc.record(
  {
    v: fc.oneof(
      { weight: 4, arbitrary: fc.constant(SETTINGS_VERSION) },
      { weight: 1, arbitrary: fc.constantFrom(0, 2, '1', true, null, 1.5) },
    ),
    masterVolume: arbVolumeField,
    musicEnabled: arbFlagField,
    sfxEnabled: arbFlagField,
    screenShake: arbFlagField,
    hintsEnabled: arbFlagField,
    extra: fc.string(),
  },
  { requiredKeys: [] },
);

const arbRawSettings: fc.Arbitrary<string | null> = fc.oneof(
  fc.constant(null),
  fc.string(),
  fc.json(),
  arbSettingsLikeObject.map((o) => JSON.stringify(o)),
  arbSettings.map(serializeSettings),
);

/** Patches as `update` might receive them: any subset of fields, sometimes out of range or mistyped. */
const arbPatch: fc.Arbitrary<Partial<Settings>> = fc
  .record(
    {
      masterVolume: fc.oneof(
        fc.integer({ min: 0, max: 100 }),
        fc.integer({ min: -200, max: 300 }),
        fc.double(),
        fc.string({ maxLength: 3 }),
      ),
      musicEnabled: fc.oneof(fc.boolean(), fc.constant(null)),
      sfxEnabled: fc.oneof(fc.boolean(), fc.constant('yes')),
      screenShake: fc.boolean(),
      hintsEnabled: fc.oneof(fc.boolean(), fc.constant(0)),
    },
    { requiredKeys: [] },
  )
  .map((p) => p as unknown as Partial<Settings>);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function sameFields(a: Settings, b: Settings): boolean {
  return (
    a.masterVolume === b.masterVolume &&
    a.musicEnabled === b.musicEnabled &&
    a.sfxEnabled === b.sfxEnabled &&
    a.screenShake === b.screenShake &&
    a.hintsEnabled === b.hintsEnabled
  );
}

describe('settings: examples', () => {
  it('uses the phantom98.settings key and 100 / on / on / on defaults', () => {
    expect(STORAGE_KEY).toBe('phantom98.settings');
    expect(SETTINGS_VERSION).toBe(1);
    expect(DEFAULT_SETTINGS).toEqual({ masterVolume: 100, musicEnabled: true, sfxEnabled: true, screenShake: true, hintsEnabled: true });
    expect(Object.isFrozen(DEFAULT_SETTINGS)).toBe(true);
  });

  it.each([
    ['null', null],
    ['bad JSON', '{'],
    ['an array', '[]'],
    ['a number', '42'],
    ['version 2', '{"v":2,"masterVolume":30,"musicEnabled":false,"sfxEnabled":false,"screenShake":false}'],
  ])('parses %s as the defaults', (_label, raw) => {
    expect(parseSettings(raw)).toEqual(DEFAULT_SETTINGS);
  });

  it('keeps the default volume for a string volume and keeps the valid fields', () => {
    expect(parseSettings('{"v":1,"masterVolume":"80","musicEnabled":false}')).toEqual({
      ...DEFAULT_SETTINGS,
      musicEnabled: false,
    });
  });

  it('writes the version first', () => {
    const s: Settings = { masterVolume: 70, musicEnabled: true, sfxEnabled: true, screenShake: false, hintsEnabled: false };
    expect(serializeSettings(s)).toBe(
      '{"v":1,"masterVolume":70,"musicEnabled":true,"sfxEnabled":true,"screenShake":false,"hintsEnabled":false}',
    );
  });

  it('reads old version-1 data without hintsEnabled as hints on (player-guide Req 4.4)', () => {
    expect(
      parseSettings('{"v":1,"masterVolume":40,"musicEnabled":false,"sfxEnabled":true,"screenShake":false}'),
    ).toEqual({ masterVolume: 40, musicEnabled: false, sfxEnabled: true, screenShake: false, hintsEnabled: true });
    expect(parseSettings('{"v":1,"hintsEnabled":"no"}').hintsEnabled).toBe(true);
    expect(parseSettings('{"v":1,"hintsEnabled":false}').hintsEnabled).toBe(false);
  });

  it('round-trips any valid Settings and parses version-1 data without hintsEnabled as true (Property 4)', () => {
    // **Validates: Requirements 4.1, 4.4, 4.5**
    fc.assert(
      fc.property(arbSettings, (s) => {
        expect(parseSettings(serializeSettings(s))).toEqual(s);
        const { hintsEnabled: _dropped, ...old } = JSON.parse(serializeSettings(s)) as Record<string, unknown>;
        expect(parseSettings(JSON.stringify(old))).toEqual({ ...s, hintsEnabled: true });
      }),
    );
  });

  it('writes nothing on creation and stores the settings only after the first change', () => {
    const fake = createFakeStorage({ mode: 'ok' });
    const store = createSettingsStore({ storage: fake.getter, warn: vi.fn() });
    expect(fake.writes).toHaveLength(0);
    expect(fake.stored()).toBeNull();

    store.update({ masterVolume: 100 });
    expect(fake.writes).toHaveLength(0);

    store.update({ masterVolume: 40 });
    expect(fake.writes).toEqual([{ key: STORAGE_KEY, value: serializeSettings(store.get()), threw: false }]);
    expect(parseSettings(fake.stored())).toEqual({ ...DEFAULT_SETTINGS, masterVolume: 40 });
  });

  it('loads what an earlier store saved', () => {
    const first = createFakeStorage({ mode: 'ok' });
    createSettingsStore({ storage: first.getter }).update({ screenShake: false, masterVolume: 60 });
    const second = createFakeStorage({ mode: 'ok', initial: first.stored() });
    const store = createSettingsStore({ storage: second.getter });
    expect(store.get()).toEqual({ ...DEFAULT_SETTINGS, masterVolume: 60, screenShake: false });
    expect(store.isPersistent()).toBe(true);
  });

  it('warns once and stays memory only when there is no localStorage', () => {
    const fake = createFakeStorage({ mode: 'nullGetter', initial: serializeSettings({ ...DEFAULT_SETTINGS, masterVolume: 10 }) });
    const warn = vi.fn();
    const store = createSettingsStore({ storage: fake.getter, warn });
    expect(store.get()).toEqual(DEFAULT_SETTINGS);
    expect(store.isPersistent()).toBe(false);
    expect(warn).toHaveBeenCalledTimes(1);
    store.update({ masterVolume: 20 });
    expect(store.get().masterVolume).toBe(20);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('bindAudioSettings applies the mix at bind time and on each change until unbound', () => {
    const audio = createFakeAudioEngine();
    const store = createSettingsStore({ storage: createFakeStorage({ mode: 'ok' }).getter });
    const setMixes = () => audio.log.filter((e) => e.type === 'setMix');

    const unbind = bindAudioSettings(audio, store);
    expect(setMixes()).toEqual([{ type: 'setMix', mix: mixOf(DEFAULT_SETTINGS) }]);

    store.update({ musicEnabled: false });
    store.update({ musicEnabled: false }); // no change, no call
    store.update({ masterVolume: 30 });
    expect(setMixes().map((e) => e.type === 'setMix' && e.mix)).toEqual([
      { volume: 100, music: true, sfx: true },
      { volume: 100, music: false, sfx: true },
      { volume: 30, music: false, sfx: true },
    ]);

    unbind();
    store.update({ sfxEnabled: false });
    expect(setMixes()).toHaveLength(3);
  });

  it('a throwing listener does not stop the audio binding', () => {
    const audio = createFakeAudioEngine();
    const store = createSettingsStore({ storage: createFakeStorage({ mode: 'nullGetter' }).getter, warn: vi.fn() });
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    store.subscribe(() => {
      throw new Error('boom');
    });
    bindAudioSettings(audio, store);
    expect(() => store.update({ sfxEnabled: false })).not.toThrow();
    expect(audio.mix()).toEqual({ volume: 100, music: true, sfx: false });
    expect(error).toHaveBeenCalledTimes(1);
    error.mockRestore();
  });
});

describe('settings: properties', () => {
  // Property: Req 5.3 serializing then parsing valid Settings gives the same Settings
  // Feature: title-and-endings, Property 5: Settings survive a storage round trip
  it('Property 5: Settings survive a storage round trip', () => {
    fc.assert(
      fc.property(arbSettings, (s) => {
        const raw = serializeSettings(s);
        expect(parseSettings(raw)).toEqual(s);
        expect((JSON.parse(raw) as { v: unknown }).v).toBe(1);
      }),
      { numRuns: 200 },
    );
  });

  // Property: Req 5.4, 5.5, 5.6 parsing never throws, bad input gives the defaults and every valid
  // stored field is kept
  // Feature: title-and-endings, Property 6: Parsing never throws and keeps every valid stored field
  it('Property 6: Parsing never throws and keeps every valid stored field', () => {
    fc.assert(
      fc.property(arbRawSettings, (raw) => {
        const result = parseSettings(raw);
        expect(isValidSettings(result)).toBe(true);

        let parsed: unknown;
        try {
          parsed = raw === null ? undefined : JSON.parse(raw);
        } catch {
          parsed = undefined;
        }
        if (!isPlainObject(parsed) || parsed.v !== 1) {
          expect(result).toEqual(DEFAULT_SETTINGS);
          return;
        }
        const volume = parsed.masterVolume;
        expect(result.masterVolume).toBe(
          typeof volume === 'number' ? normalizeVolume(volume) : DEFAULT_SETTINGS.masterVolume,
        );
        for (const flag of FLAGS) {
          const stored = parsed[flag];
          expect(result[flag]).toBe(typeof stored === 'boolean' ? stored : DEFAULT_SETTINGS[flag]);
        }
      }),
      { numRuns: 300 },
    );
  });

  // Property: Req 4.3, 5.7, 5.8 volumes are rounded and clamped to 0..100 (100 when not finite),
  // and the slider snaps to multiples of 10
  // Feature: title-and-endings, Property 7: Volume values are rounded, clamped and snapped
  it('Property 7: Volume values are rounded, clamped and snapped', () => {
    const arbNumber = fc.oneof(
      fc.double(),
      fc.integer({ min: -1_000_000, max: 1_000_000 }),
      fc.double({ min: -5, max: 105, noNaN: true }),
      fc.constantFrom(Number.NaN, Infinity, -Infinity, -0, 0.5, -0.5, -0.4, 99.5, 100.4, 100.5),
    );
    const arbSlider = fc.oneof(arbNumber, arbNumber.map(String), fc.string({ maxLength: 4 }));
    fc.assert(
      fc.property(arbNumber, arbSlider, fc.integer({ min: 0, max: 10 }), (x, slider, k) => {
        const v = normalizeVolume(x);
        expect(Number.isInteger(v)).toBe(true);
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(100);
        expect(Object.is(v, -0)).toBe(false);
        expect(v).toBe(Number.isFinite(x) ? Math.min(100, Math.max(0, Math.round(x))) : 100);
        expect(normalizeVolume(v)).toBe(v);

        const snapped = volumeFromSlider(slider);
        expect(snapped % 10).toBe(0);
        expect(snapped).toBeGreaterThanOrEqual(0);
        expect(snapped).toBeLessThanOrEqual(100);
        expect(Object.is(snapped, -0)).toBe(false);
        expect(volumeFromSlider(k * 10)).toBe(k * 10);
        expect(volumeFromSlider(String(k * 10))).toBe(k * 10);
      }),
      { numRuns: 300 },
    );
  });

  // Property: Req 5.1, 5.2, 5.9, 5.10 whatever storage does, the store never throws and behaves
  // like an in-memory model; healthy storage always holds the current settings
  // Feature: title-and-endings, Property 8: The Settings_Store behaves like an in-memory model whatever storage does
  it('Property 8: The Settings_Store behaves like an in-memory model whatever storage does', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...FAKE_STORAGE_MODES),
        arbRawSettings,
        fc.array(arbPatch, { maxLength: 12 }),
        (mode, initial, patches) => {
          const fake = createFakeStorage({ mode, initial });
          const warn = vi.fn();
          const store = createSettingsStore({ storage: fake.getter, warn });
          const readFailed = mode === 'nullGetter' || mode === 'getterThrows' || mode === 'readThrows';

          let model: Settings = readFailed ? DEFAULT_SETTINGS : parseSettings(initial);
          expect(store.get()).toEqual(model);
          expect(store.isPersistent()).toBe(!readFailed);

          let notified = 0;
          store.subscribe((s) => {
            notified += 1;
            expect(s).toEqual(store.get());
          });

          let changes = 0;
          for (const patch of patches) {
            const next = mergeSettings(model, patch);
            const changed = !sameFields(model, next);
            model = next;
            if (changed) changes += 1;

            const returned = store.update(patch);
            expect(returned).toEqual(model);
            expect(store.get()).toEqual(model);
            expect(isValidSettings(store.get())).toBe(true);
            expect(notified).toBe(changes);
            if (mode === 'ok' && changed) expect(parseSettings(fake.stored())).toEqual(store.get());
          }

          if (readFailed) expect(fake.writes).toHaveLength(0);
          else expect(fake.writes).toHaveLength(changes);
          if (mode === 'ok') expect(fake.stored()).toBe(changes > 0 ? serializeSettings(model) : initial);
          if (mode === 'writeThrows') expect(fake.stored()).toBe(initial);

          const expectedWarns = readFailed ? 1 : mode === 'writeThrows' && changes > 0 ? 1 : 0;
          expect(warn).toHaveBeenCalledTimes(expectedWarns);
          expect(store.isPersistent()).toBe(!readFailed);
        },
      ),
      { numRuns: 300 },
    );
  });
});
