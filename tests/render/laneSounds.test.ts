import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { ENEMY_KINDS, MOB_KINDS } from '../../src/game/laneTypes';
import type { GameEvent } from '../../src/game/types';
import { LANE_SOUND_SEC, LANE_SOUNDS, laneSoundsFor, type LaneSoundId } from '../../src/render/laneSounds';
import {
  createFakeAudioContext,
  FakeAudioParam,
  type FakeAudioContext,
  type FakeAudioNode,
  type FakeGainNode,
} from '../helpers/audio';

const IDS = Object.keys(LANE_SOUNDS) as LaneSoundId[];
const ALL_IDS: readonly LaneSoundId[] = [
  'hammerThud',
  'hammerWhiff',
  'mobSplat',
  'modemCrunch',
  'globSpit',
  'manholeClank',
  'zombieGroan',
];

// Type-level: LANE_SOUNDS and LANE_SOUND_SEC are keyed by exactly the LaneSoundId union.
type Keys = keyof typeof LANE_SOUNDS;
const keysMatch: [Keys] extends [LaneSoundId] ? ([LaneSoundId] extends [Keys] ? true : false) : false = true;

const AT = 2;

function play(id: LaneSoundId, durationSec: number = LANE_SOUND_SEC[id]) {
  const ac = createFakeAudioContext({ state: 'running', currentTime: AT });
  const stop = LANE_SOUNDS[id](ac.asAudioContext(), ac.asDestination(), AT, durationSec);
  return { ac, stop };
}

function params(node: FakeAudioNode): FakeAudioParam[] {
  return Object.values(node).filter((v): v is FakeAudioParam => v instanceof FakeAudioParam);
}

/** Every time used by any start, stop or automation call. */
function scheduledTimes(ac: FakeAudioContext): number[] {
  const times: number[] = [];
  for (const s of ac.sources()) times.push(...s.startTimes, ...s.stopTimes);
  for (const n of ac.nodes) {
    for (const p of params(n)) {
      for (const e of p.events) if ('time' in e) times.push(e.time);
    }
  }
  return times;
}

/** The single gain the recipe connects to its `out` node. */
function outputGainOf(ac: FakeAudioContext): FakeGainNode {
  const outs = ac.gains.filter((g) => g.outputs.includes(ac.destination));
  expect(outs).toHaveLength(1);
  return outs[0] as FakeGainNode;
}

/** Synthesis from the design's sound table: oscillator (type, start Hz, ramp target Hz) and filters. */
const SYNTHESIS: Readonly<
  Record<
    LaneSoundId,
    {
      readonly oscillators: readonly (readonly [OscillatorType, number, number | null])[];
      readonly filters: readonly (readonly [BiquadFilterType, number])[];
      readonly noise: boolean;
    }
  >
> = {
  hammerThud: { oscillators: [['sine', 140, 50]], filters: [['lowpass', 1200]], noise: true },
  hammerWhiff: { oscillators: [], filters: [['bandpass', 2000]], noise: true },
  mobSplat: { oscillators: [['sine', 90, 55]], filters: [['lowpass', 1600]], noise: true },
  modemCrunch: { oscillators: [['square', 80, null]], filters: [['bandpass', 600]], noise: true },
  globSpit: { oscillators: [['sine', 300, 900]], filters: [], noise: false },
  manholeClank: {
    oscillators: [
      ['triangle', 420, null],
      ['triangle', 637, null],
    ],
    filters: [],
    noise: false,
  },
  zombieGroan: {
    oscillators: [
      ['sawtooth', 110, 70],
      ['sawtooth', 113, 72],
    ],
    filters: [['bandpass', 500]],
    noise: false,
  },
};

describe('LANE_SOUNDS', () => {
  it('has a recipe and a duration for every LaneSoundId, 120–300 ms except the 400 ms groan', () => {
    expect(keysMatch).toBe(true);
    expect([...IDS].sort()).toEqual([...ALL_IDS].sort());
    expect(Object.keys(LANE_SOUND_SEC).sort()).toEqual([...ALL_IDS].sort());
    expect(LANE_SOUND_SEC.zombieGroan).toBe(0.4);
    for (const id of ALL_IDS.filter((i) => i !== 'zombieGroan')) {
      expect(LANE_SOUND_SEC[id]).toBeGreaterThanOrEqual(0.12);
      expect(LANE_SOUND_SEC[id]).toBeLessThanOrEqual(0.3);
    }
  });

  it.each(IDS)('%s schedules inside its window, stops and survives a double stop', (id) => {
    const at = 2;
    const d = LANE_SOUND_SEC[id];
    const ac = createFakeAudioContext({ state: 'running', currentTime: at });
    const stop = LANE_SOUNDS[id](ac.asAudioContext(), ac.asDestination(), at, d);
    expect(ac.sources().length).toBeGreaterThan(0);
    for (const s of ac.sources()) expect(s.stopTimes[0]).toBeLessThanOrEqual(at + d + 1e-9);
    stop();
    stop();
    expect(ac.unstopped()).toEqual([]);
    expect(ac.destination.inputs).toEqual([]);
  });

  describe.each(IDS)('%s', (id) => {
    it.each([LANE_SOUND_SEC[id], 0.01, 1.5])('keeps every time inside [at, at + %s]', (d) => {
      const { ac } = play(id, d);
      const times = scheduledTimes(ac);
      expect(times.length).toBeGreaterThan(0);
      for (const t of times) {
        expect(t).toBeGreaterThanOrEqual(AT);
        expect(t).toBeLessThanOrEqual(AT + d + 1e-9);
      }
      // Every source starts in the window and is stopped by its end without a stop() call.
      for (const s of ac.sources()) {
        expect(s.startTimes).toHaveLength(1);
        expect(s.stopTimes).toHaveLength(1);
      }
    });

    it.each([LANE_SOUND_SEC[id], 0.01, 1.5])('keeps every gain value within [0, 1] for %s s', (d) => {
      const { ac } = play(id, d);
      for (const g of ac.gains) {
        for (const v of g.gain.valuesSet()) {
          expect(v).toBeGreaterThanOrEqual(0);
          expect(v).toBeLessThanOrEqual(1);
        }
      }
    });

    it('fades its single output gain in from 0 at `at` and back to 0 at the end', () => {
      const d = LANE_SOUND_SEC[id];
      const { ac } = play(id);
      const timed = outputGainOf(ac).gain.events.filter((e) => 'time' in e);
      expect(timed[0]).toMatchObject({ value: 0, time: AT });
      expect(timed[timed.length - 1]).toMatchObject({ value: 0 });
      expect((timed[timed.length - 1] as { time: number }).time).toBeCloseTo(AT + d, 9);
    });

    it('falls back to its natural length for a non-finite or non-positive duration', () => {
      for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, 0, -1]) {
        const { ac } = play(id, bad);
        const latest = Math.max(...scheduledTimes(ac));
        expect(latest).toBeCloseTo(AT + LANE_SOUND_SEC[id], 9);
      }
    });

    it('uses the oscillators and filters from the sound table', () => {
      const spec = SYNTHESIS[id];
      const { ac } = play(id);
      expect(ac.oscillators.map((o) => o.type)).toEqual(spec.oscillators.map(([type]) => type));
      ac.oscillators.forEach((o, i) => {
        const [, startHz, rampHz] = spec.oscillators[i] ?? [];
        expect(o.frequency.valuesSet()[0]).toBe(startHz);
        const ramps = o.frequency.events.filter((e) => e.type === 'exponentialRampToValueAtTime');
        if (rampHz === null) expect(ramps).toEqual([]);
        else expect(ramps.map((e) => ('value' in e ? e.value : Number.NaN))).toEqual([rampHz]);
      });
      expect(ac.filters.map((f) => [f.type, f.frequency.valuesSet()[0]])).toEqual(spec.filters);
      expect(ac.bufferSources.length > 0).toBe(spec.noise);
    });

    it('synthesizes noise in code from a seed, the same on every run (Req 14.3)', () => {
      const first = play(id).ac;
      const second = play(id).ac;
      // Every buffer a source plays was created (and filled) by this recipe on this context.
      for (const src of first.bufferSources) {
        expect(src.buffer).not.toBeNull();
        expect(first.buffers).toContain(src.buffer);
      }
      expect(first.buffers.length).toBe(second.buffers.length);
      first.buffers.forEach((buffer, i) => {
        const data = buffer.getChannelData(0);
        expect(data.some((v) => v !== 0)).toBe(true);
        expect(Array.from(data)).toEqual(Array.from(second.buffers[i]?.getChannelData(0) ?? []));
      });
    });

    it('stops and disconnects every node, and a second stop changes nothing', () => {
      const { ac, stop } = play(id);
      expect(ac.nodes.length).toBeGreaterThan(0);
      stop();
      expect(ac.unstopped()).toEqual([]);
      for (const n of ac.nodes) expect(n.disconnectCount).toBeGreaterThan(0);
      const disconnects = ac.nodes.map((n) => n.disconnectCount);
      expect(() => stop()).not.toThrow();
      expect(ac.nodes.map((n) => n.disconnectCount)).toEqual(disconnects);
      expect(ac.destination.inputs).toEqual([]);
    });

    it('disconnects its graph once every source has ended on its own', () => {
      const { ac, stop } = play(id);
      const sources = ac.sources();
      sources.slice(0, -1).forEach((s) => s.end());
      expect(ac.destination.inputs).toHaveLength(1);
      sources[sources.length - 1]?.end();
      expect(ac.destination.inputs).toEqual([]);
      // Stopping after the natural end is safe and does not disconnect again.
      const disconnects = ac.nodes.map((n) => n.disconnectCount);
      expect(() => stop()).not.toThrow();
      expect(ac.nodes.map((n) => n.disconnectCount)).toEqual(disconnects);
    });
  });
});

// ---------------------------------------------------------------------------------------------
// laneSoundsFor

/** The design's event → sound table, written independently of the implementation. */
function expectedSound(event: GameEvent): LaneSoundId | null {
  if (event.type === 'hammerSwing') return event.targetId === null ? 'hammerWhiff' : 'hammerThud';
  if (event.type === 'mobKilled') return 'mobSplat';
  if (event.type === 'mobBit') return 'modemCrunch';
  if (event.type === 'globSpat') return 'globSpit';
  if (event.type === 'mobArrived') return 'zombieGroan';
  if (event.type === 'mobSpawned' && event.source === 'schedule') return 'manholeClank';
  return null;
}

const tick = fc.nat({ max: 10_000 });
const id = fc.nat({ max: 500 });
const x = fc.double({ min: 0, max: 1000, noNaN: true });
const mobKind = fc.constantFrom(...MOB_KINDS);
const enemyKind = fc.constantFrom(...ENEMY_KINDS);

const laneEvent: fc.Arbitrary<GameEvent> = fc.oneof(
  fc.record({
    tick,
    type: fc.constant('mobSpawned' as const),
    id,
    kind: mobKind,
    x,
    source: fc.constantFrom('schedule' as const, 'bossSummon' as const),
  }),
  fc.record({ tick, type: fc.constant('globSpat' as const), id, sourceId: id, x }),
  fc.record({ tick, type: fc.constant('mobArrived' as const), id, kind: fc.constantFrom('default' as const, 'fast' as const, 'tank' as const, 'boss' as const) }),
  fc.record({ tick, type: fc.constant('hammerSwing' as const), x, y: x, targetId: fc.option(id, { nil: null }) }),
  fc.record({ tick, type: fc.constant('mobHit' as const), id, kind: enemyKind, damage: fc.nat(5), hp: fc.nat(30) }),
  fc.record({ tick, type: fc.constant('mobKilled' as const), id, kind: enemyKind, x, dropKb: fc.nat(100) }),
  fc.record({ tick, type: fc.constant('mobBit' as const), id, kind: enemyKind, damage: fc.nat(40) }),
  fc.record({
    tick,
    type: fc.constant('bossSummon' as const),
    id,
    threshold: fc.constantFrom(0.75, 0.5, 0.25),
    spawnedIds: fc.array(id, { maxLength: 2 }),
  }),
  fc.record({ tick, type: fc.constant('popupBurst' as const), count: fc.nat(3), cause: fc.constantFrom('tankBite' as const, 'bossBite' as const, 'bossSummon' as const) }),
) as fc.Arbitrary<GameEvent>;

const coreEvent: fc.Arbitrary<GameEvent> = fc.oneof(
  fc.record({ tick, type: fc.constantFrom('connected' as const, 'downloadStarted' as const, 'downloadHalfway' as const) }),
  fc.record({ tick, type: fc.constantFrom('won' as const, 'lost' as const) }),
  fc.record({ tick, type: fc.constant('downloadPenalty' as const), amount: fc.nat(20), download: fc.nat(100) }),
  fc.record({ tick, type: fc.constant('modemHit' as const), amount: fc.nat(40), integrity: fc.nat(100) }),
  fc.record({ tick, type: fc.constant('integrityCritical' as const), integrity: fc.nat(20) }),
) as fc.Arbitrary<GameEvent>;

const anyEvent = fc.oneof({ weight: 3, arbitrary: laneEvent }, { weight: 1, arbitrary: coreEvent });

describe('laneSoundsFor', () => {
  it('maps events to sounds once each, in order of first occurrence', () => {
    const events: GameEvent[] = [
      { tick: 1, type: 'mobSpawned', id: 1, kind: 'default', x: 800, source: 'bossSummon' },
      { tick: 1, type: 'hammerSwing', x: 1, y: 1, targetId: 3 },
      { tick: 1, type: 'mobKilled', id: 3, kind: 'default', x: 1, dropKb: 5 },
      { tick: 1, type: 'hammerSwing', x: 1, y: 1, targetId: 4 },
      { tick: 1, type: 'mobSpawned', id: 2, kind: 'default', x: 800, source: 'schedule' },
      { tick: 1, type: 'connected' },
    ];
    expect(laneSoundsFor(events)).toEqual(['hammerThud', 'mobSplat', 'manholeClank']);
  });

  it.each<[string, GameEvent, LaneSoundId]>([
    ['hammerSwing with a target', { tick: 0, type: 'hammerSwing', x: 5, y: 5, targetId: 0 }, 'hammerThud'],
    ['hammerSwing without a target', { tick: 0, type: 'hammerSwing', x: 5, y: 5, targetId: null }, 'hammerWhiff'],
    ['mobKilled', { tick: 0, type: 'mobKilled', id: 1, kind: 'tank', x: 10, dropKb: 20 }, 'mobSplat'],
    ['mobKilled (glob)', { tick: 0, type: 'mobKilled', id: 1, kind: 'glob', x: 10, dropKb: 1 }, 'mobSplat'],
    ['mobBit', { tick: 0, type: 'mobBit', id: 1, kind: 'fast', damage: 8 }, 'modemCrunch'],
    ['globSpat', { tick: 0, type: 'globSpat', id: 2, sourceId: 1, x: 400 }, 'globSpit'],
    ['mobArrived', { tick: 0, type: 'mobArrived', id: 1, kind: 'tank' }, 'zombieGroan'],
    [
      'scheduled mobSpawned',
      { tick: 0, type: 'mobSpawned', id: 1, kind: 'boss', x: 800, source: 'schedule' },
      'manholeClank',
    ],
  ])('plays the table sound for %s', (_label, event, sound) => {
    expect(laneSoundsFor([event])).toEqual([sound]);
  });

  it.each<[string, GameEvent]>([
    ['a boss-summoned mobSpawned', { tick: 0, type: 'mobSpawned', id: 1, kind: 'default', x: 700, source: 'bossSummon' }],
    ['mobHit', { tick: 0, type: 'mobHit', id: 1, kind: 'tank', damage: 1, hp: 3 }],
    ['bossSummon', { tick: 0, type: 'bossSummon', id: 1, threshold: 0.75, spawnedIds: [2, 3] }],
    ['popupBurst', { tick: 0, type: 'popupBurst', count: 3, cause: 'tankBite' }],
    ['connected', { tick: 0, type: 'connected' }],
    ['modemHit', { tick: 0, type: 'modemHit', amount: 10, integrity: 90 }],
    ['won', { tick: 0, type: 'won' }],
  ])('stays silent for %s', (_label, event) => {
    expect(laneSoundsFor([event])).toEqual([]);
  });

  it('groans once per frame when several Mobs arrive, and still crunches once', () => {
    // Property: lane-melee Req 7.3, 7.4
    const events: GameEvent[] = [
      { tick: 5, type: 'mobArrived', id: 1, kind: 'default' },
      { tick: 5, type: 'mobBit', id: 1, kind: 'default', damage: 4 },
      { tick: 5, type: 'mobArrived', id: 2, kind: 'fast' },
      { tick: 5, type: 'mobBit', id: 2, kind: 'fast', damage: 3 },
    ];
    expect(laneSoundsFor(events)).toEqual(['zombieGroan', 'modemCrunch']);
  });

  it('returns nothing for an empty frame', () => {
    expect(laneSoundsFor([])).toEqual([]);
  });

  // Feature: connection-lane, Property 18: Each lane sound plays at most once per frame
  // Property: Req 14.1 every event with a table sound is heard, and nothing else is
  // Property: Req 14.2 each sound id appears at most once, in order of first occurrence
  it('returns each implied sound exactly once, in order of first occurrence', () => {
    fc.assert(
      fc.property(fc.array(anyEvent, { maxLength: 40 }), (events) => {
        const result = laneSoundsFor(events);

        // At most once per frame (Req 14.2).
        expect(new Set(result).size).toBe(result.length);

        // Exactly the sounds some event implies (Req 14.1).
        const implied = events.map(expectedSound).filter((s): s is LaneSoundId => s !== null);
        expect([...result].sort()).toEqual([...new Set(implied)].sort());

        // In order of first occurrence.
        const firstAt = (sound: LaneSoundId): number => events.findIndex((e) => expectedSound(e) === sound);
        for (let i = 1; i < result.length; i += 1) {
          expect(firstAt(result[i - 1] as LaneSoundId)).toBeLessThan(firstAt(result[i] as LaneSoundId));
        }
      }),
      { numRuns: 200 },
    );
  });
});
