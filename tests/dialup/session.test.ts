// Tests for the Session (Req 10.1–10.7): pure `advanceTicks`, examples for `createSession` and
// Property 9, which compares a Session on a manual loop with a tick-by-tick `step` reference.
import fc from 'fast-check';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { advanceTicks, createSession, type SessionContext, type SessionView } from '../../src/dialup/session';
import { SESSION_REGISTRY } from '../../src/dialup/sessionRegistry';
import { createAdSystems } from '../../src/game/ads/adSystems';
import type { CoreBalance } from '../../src/game/balance/core';
import { createDirector } from '../../src/game/director';
import { createEconomySystems } from '../../src/game/economy';
import { createLaneSystems } from '../../src/game/lane';
import { createRun } from '../../src/game/state';
import { step } from '../../src/game/step';
import { TICK_RATE, type GameEvent, type GameState, type InputCommand } from '../../src/game/types';
import { scheduledDamage, type ScheduledAmount } from '../helpers/game';
import { createManualLoop } from '../helpers/loop';

const host = {} as Omit<SessionContext, 'send'>;
const START: InputCommand = { type: 'startDownload' };

afterEach(() => {
  vi.restoreAllMocks();
});

interface Update {
  readonly state: GameState;
  readonly events: readonly GameEvent[];
}

function recordingView(log: string[], name: string) {
  let ctx: SessionContext | null = null;
  const updates: Update[] = [];
  const view: SessionView = {
    mount: (c) => {
      ctx = c;
      log.push(`mount ${name}`);
    },
    update: (state, events) => {
      updates.push({ state, events });
    },
    unmount: () => {
      log.push(`unmount ${name}`);
    },
  };
  return { view, updates, send: (...args: Parameters<SessionContext['send']>) => ctx?.send(...args) };
}

function isOver(state: GameState): boolean {
  return state.phase === 'won' || state.phase === 'lost';
}

describe('advanceTicks', () => {
  it('equals stepping tick by tick and stops at won', () => {
    const balance = { dialSeconds: 1, downloadPercentPerSecond: 600 };
    let ref = createRun({ seed: 7, balance });
    const refEvents: GameEvent[] = [];
    for (let i = 0; i < 200; i += 1) {
      const r = step(ref, i === 60 ? [{ type: 'startDownload' }] : []);
      ref = r.state;
      refEvents.push(...r.events);
    }
    const a = advanceTicks(createRun({ seed: 7, balance }), 60, [], []);
    const b = advanceTicks(a.state, 140, [{ type: 'startDownload' }], []);
    expect(b.state).toEqual(ref);
    expect([...a.events, ...b.events]).toEqual(refEvents);
    expect(b.state.phase).toBe('won');
    expect(b.state.tick).toBeLessThan(200);
  });
});

describe('createSession', () => {
  it('creates the Run from the given seed and starts the loop', () => {
    for (const seed of [0xc0ffee, -1]) {
      const loop = createManualLoop();
      const rec = recordingView([], 'rec');
      const session = createSession({ seed, systems: [], views: [rec.view], startLoop: loop.start });
      expect(() => session.state()).toThrow();
      session.start(host);
      expect(session.state().seed).toBe(seed >>> 0);
      expect(session.state()).toEqual(createRun({ seed }));
      expect(session.isActive()).toBe(true);
      expect(loop.startCount()).toBe(1);
      expect(loop.isRunning()).toBe(true);
      // The views see the initial state at once, with no events.
      expect(rec.updates).toEqual([{ state: session.state(), events: [] }]);
      session.stop();
    }
  });

  it('delivers a command sent before a zero-tick frame on the next non-empty frame', () => {
    const loop = createManualLoop();
    const rec = recordingView([], 'rec');
    const session = createSession({
      seed: 5,
      balance: { dialSeconds: 1 },
      systems: [],
      views: [rec.view],
      startLoop: loop.start,
    });
    session.start(host);
    loop.frame(60);
    expect(session.state()).toMatchObject({ phase: 'connected', tick: 60 });

    rec.send(START);
    loop.frame(0);
    loop.frame(0);
    // Zero-tick frames still update the views, but run nothing and keep the command queued.
    expect(rec.updates.slice(-2).map((u) => u.events)).toEqual([[], []]);
    expect(session.state()).toMatchObject({ phase: 'connected', tick: 60 });

    loop.frame(3);
    const last = rec.updates[rec.updates.length - 1];
    expect(last.events.filter((e) => e.type === 'downloadStarted')).toEqual([
      { type: 'downloadStarted', tick: 61 },
    ]);
    expect(session.state()).toMatchObject({ phase: 'downloading', phaseStartTick: 61, tick: 63 });
    session.stop();
  });

  it('queues sends, ends once on won and unmounts in reverse order', () => {
    const loop = createManualLoop();
    const log: string[] = [];
    const a = recordingView(log, 'a');
    const b = recordingView(log, 'b');
    const onEnd = vi.fn();
    const session = createSession({
      seed: 3,
      balance: { dialSeconds: 1, downloadPercentPerSecond: 60 },
      systems: [],
      views: [a.view, b.view],
      startLoop: loop.start,
      onEnd,
    });
    session.start(host);
    expect(a.updates).toHaveLength(1);
    expect(a.updates[0].events).toEqual([]);
    loop.frame(60);
    expect(session.state().phase).toBe('connected');
    a.send({ type: 'startDownload' });
    loop.frame(0);
    expect(session.state().phase).toBe('connected');
    loop.frame(15);
    expect(session.state().phase).toBe('downloading');
    for (let i = 0; i < 20; i += 1) loop.frame(15);
    expect(session.state().phase).toBe('won');
    expect(onEnd).toHaveBeenCalledTimes(1);
    expect(onEnd).toHaveBeenCalledWith(session.state());
    expect(loop.isRunning()).toBe(false);
    expect(session.isActive()).toBe(false);
    expect(log).toEqual(['mount a', 'mount b', 'unmount b', 'unmount a']);
    session.stop();
    expect(log).toHaveLength(4);
  });

  it('stop() unmounts in reverse order once, stops the loop and ignores later sends', () => {
    const loop = createManualLoop();
    const log: string[] = [];
    const views = ['a', 'b', 'c'].map((name) => recordingView(log, name));
    const onEnd = vi.fn();
    const session = createSession({
      seed: 9,
      systems: [],
      views: views.map((v) => v.view),
      startLoop: loop.start,
      onEnd,
    });
    session.start(host);
    loop.frame(5);
    session.stop();
    expect(log).toEqual(['mount a', 'mount b', 'mount c', 'unmount c', 'unmount b', 'unmount a']);
    expect(loop.isRunning()).toBe(false);
    expect(loop.stopCount()).toBe(1);
    expect(session.isActive()).toBe(false);

    session.stop();
    expect(log).toHaveLength(6);
    expect(loop.stopCount()).toBe(1);

    views[0].send(START);
    loop.frame(10);
    expect(session.state().tick).toBe(5);
    expect(views[0].updates).toHaveLength(2);
    // A manual stop is not the end of the Run.
    expect(onEnd).not.toHaveBeenCalled();
  });

  it('logs a throwing update and still updates the other views through the end of the Run', () => {
    const loop = createManualLoop();
    const log: string[] = [];
    const good = recordingView(log, 'good');
    const boom = new Error('boom');
    const bad: SessionView = {
      mount: () => {},
      update: () => {
        throw boom;
      },
      unmount: () => {},
    };
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const onEnd = vi.fn();
    const session = createSession({
      seed: 1,
      balance: { dialSeconds: 1 / TICK_RATE, downloadPercentPerSecond: 3000 },
      systems: [],
      views: [bad, good.view],
      startLoop: loop.start,
      onEnd,
    });
    session.start(host);
    loop.frame(2);
    expect(good.updates).toHaveLength(2);
    expect(error).toHaveBeenCalledTimes(2);
    expect(error).toHaveBeenCalledWith(expect.stringContaining('view 0'), boom);

    good.send(START);
    loop.frame(10);
    expect(session.state().phase).toBe('won');
    expect(good.updates[good.updates.length - 1].events.map((e) => e.type)).toContain('won');
    expect(onEnd).toHaveBeenCalledTimes(1);
    expect(log).toEqual(['mount good', 'unmount good']);
  });

  it('unmounts mounted views and rethrows when a mount throws', () => {
    const loop = createManualLoop();
    const log: string[] = [];
    const first = recordingView(log, 'first');
    const bad: SessionView = { mount: () => { throw new Error('mount'); }, update: () => {}, unmount: () => {} };
    const session = createSession({ seed: 1, systems: [], views: [first.view, bad], startLoop: loop.start });
    expect(() => session.start(host)).toThrow('mount');
    expect(log).toEqual(['mount first', 'unmount first']);
    expect(session.isActive()).toBe(false);
    expect(loop.startCount()).toBe(0);
  });

  // Milestone 4 (browser front) added the Browser_View factory and the four Ad_Systems, so this
  // test was updated on purpose (approved exception to Req 14.4). player-guide task 4.1 added
  // the Hint_View factory as the third view. juice-and-endings task 3.3 added the Juice_View fourth.
  it('registry lists the lane, browser, hint and juice view factories, the lane systems with weapons, the ad systems, then the wallet (Req 9.5, 14.2, economy Req 13.5, decision D14)', () => {
    expect(SESSION_REGISTRY.views).toHaveLength(4);
    for (const factory of SESSION_REGISTRY.views) {
      const view = factory();
      expect(typeof view.mount).toBe('function');
      expect(typeof view.update).toBe('function');
      expect(typeof view.unmount).toBe('function');
    }
    // The registry fills the Spawner and Ad_Scheduler slots from the Director (director Req 2.1, 3.1).
    const director = createDirector();
    const economy = createEconomySystems();
    const lane = createLaneSystems({ spawner: director.laneSpawner, weapons: economy.weapons });
    const ads = createAdSystems({ scheduler: director.adScheduler });
    expect(lane).toHaveLength(5);
    expect(ads).toHaveLength(4);
    // ad-pressure task 2.3: bandwidthSystem runs last, after the wallet.
    expect(SESSION_REGISTRY.systems).toHaveLength(11);
    for (const system of SESSION_REGISTRY.systems) expect(typeof system).toBe('function');
    expect(SESSION_REGISTRY.systems.slice(0, 5).map((s) => s.name)).toEqual(lane.map((s) => s.name));
    expect(SESSION_REGISTRY.systems[2]?.name).toBe('weapons');
    expect(SESSION_REGISTRY.systems.slice(5, 9).map((s) => s.name)).toEqual(ads.map((s) => s.name));
    expect(SESSION_REGISTRY.systems[9]?.name).toBe('wallet');
    expect(SESSION_REGISTRY.systems[10]?.name).toBe('bandwidthSystem');
  });
});

// ---------------------------------------------------------------------------------------------
// Property 9

interface FramePlan {
  /** `startDownload` commands sent before this frame. */
  readonly sends: number;
  /** Ticks the loop reports for this frame (0 allowed). */
  readonly ticks: number;
}

interface Scenario {
  readonly seed: number;
  readonly balance: Partial<CoreBalance>;
  readonly damage: readonly ScheduledAmount[];
  readonly frames: readonly FramePlan[];
}

const frameArb: fc.Arbitrary<FramePlan> = fc.record({
  sends: fc.oneof(
    { arbitrary: fc.constant(0), weight: 3 },
    { arbitrary: fc.integer({ min: 1, max: 2 }), weight: 1 },
  ),
  ticks: fc.oneof(
    { arbitrary: fc.constant(0), weight: 1 },
    { arbitrary: fc.integer({ min: 1, max: 15 }), weight: 3 },
  ),
});

// Short runs: 1–30 dial ticks and a 5–60 tick download, so about two thirds of the cases end in
// `won` or `lost` (through the damage schedule) within the generated frames; the rest stop while
// dialing, connected or downloading. Every intermediate frame state is compared as well.
const scenarioArb: fc.Arbitrary<Scenario> = fc.record({
  seed: fc.integer(),
  balance: fc.record({
    dialSeconds: fc.integer({ min: 1, max: 30 }).map((ticks) => ticks / TICK_RATE),
    downloadPercentPerSecond: fc.integer({ min: 100, max: 1200 }),
  }),
  damage: fc.array(
    fc.record({ tick: fc.integer({ min: 1, max: 100 }), amount: fc.integer({ min: 0, max: 60 }) }),
    { maxLength: 8 },
  ),
  frames: fc.array(frameArb, { minLength: 5, maxLength: 60 }),
});

/**
 * Reference: one `step` per tick. Commands sent before a frame go to the first tick run after
 * they were sent. Records what a view should see: the initial state, then the state and events
 * after every frame until the frame that ends the Run.
 */
function reference(scenario: Scenario): { state: GameState; updates: Update[] } {
  const systems = [scheduledDamage(scenario.damage)];
  let state = createRun({ seed: scenario.seed, balance: scenario.balance });
  const updates: Update[] = [{ state, events: [] }];
  let pending: InputCommand[] = [];
  for (const frame of scenario.frames) {
    if (isOver(state)) break;
    for (let i = 0; i < frame.sends; i += 1) pending.push(START);
    const events: GameEvent[] = [];
    for (let i = 0; i < frame.ticks && !isOver(state); i += 1) {
      const result = step(state, pending, systems);
      pending = [];
      state = result.state;
      events.push(...result.events);
    }
    updates.push({ state, events });
  }
  return { state, updates };
}

describe('Session properties', () => {
  // Feature: retro-shell, Property 9: The Session matches tick-by-tick stepping for any frame grouping
  // Property: Req 10.2, 10.3, 10.4, 10.5 any frame grouping gives the reference's states and events
  // Property: Req 10.6, 10.7 once won or lost, no further ticks run, the views are unmounted and
  // onEnd is called exactly once
  it('matches tick-by-tick stepping for any frame grouping', () => {
    fc.assert(
      fc.property(scenarioArb, (scenario) => {
        const error = vi.spyOn(console, 'error').mockImplementation(() => {});
        try {
          const loop = createManualLoop();
          const log: string[] = [];
          const rec = recordingView(log, 'rec');
          const onEnd = vi.fn();
          const session = createSession({
            seed: scenario.seed,
            balance: scenario.balance,
            systems: [scheduledDamage(scenario.damage)],
            views: [rec.view],
            startLoop: loop.start,
            onEnd,
          });
          session.start(host);
          for (const frame of scenario.frames) {
            for (let i = 0; i < frame.sends; i += 1) rec.send(START);
            loop.frame(frame.ticks);
          }

          const expected = reference(scenario);
          expect(session.state()).toEqual(expected.state);
          expect(rec.updates).toEqual(expected.updates);
          expect(rec.updates.flatMap((u) => u.events)).toEqual(
            expected.updates.flatMap((u) => u.events),
          );

          if (isOver(expected.state)) {
            expect(onEnd).toHaveBeenCalledTimes(1);
            expect(onEnd).toHaveBeenCalledWith(session.state());
            expect(loop.isRunning()).toBe(false);
            expect(session.isActive()).toBe(false);
            expect(log).toEqual(['mount rec', 'unmount rec']);
            // A late frame after the end changes nothing.
            loop.frame(5);
            expect(rec.updates).toHaveLength(expected.updates.length);
            expect(session.state()).toBe(rec.updates[rec.updates.length - 1].state);
          } else {
            expect(onEnd).not.toHaveBeenCalled();
            expect(loop.isRunning()).toBe(true);
            session.stop();
          }
          expect(error).not.toHaveBeenCalled();
        } finally {
          error.mockRestore();
        }
      }),
      { numRuns: 200 },
    );
  });
});
