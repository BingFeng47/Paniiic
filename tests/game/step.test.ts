import { describe, expect, it } from 'vitest';
import type { System } from '../../src/game/context';
import { createRun } from '../../src/game/state';
import { step } from '../../src/game/step';
import { scheduledDamage, scheduledPenalty, stepN } from '../helpers/game';

describe('step (smoke)', () => {
  it('walks dialing → connected → downloading → won on the expected ticks', () => {
    const start = createRun({ seed: 1 });
    const { state, events } = stepN(step, start, 9300, {
      inputs: [{ tick: 1201, command: { type: 'startDownload' } }],
    });
    expect(state.phase).toBe('won');
    expect(state.download).toBe(100);
    expect(events.map((e) => [e.type, e.tick])).toEqual([
      ['connected', 1200],
      ['downloadStarted', 1201],
      ['downloadHalfway', 5250],
      ['won', 9300],
    ]);
    // The start state is untouched and terminal states are returned as-is.
    expect(start.tick).toBe(0);
    const after = step(state, [{ type: 'startDownload' }]);
    expect(after.state).toBe(state);
    expect(after.events).toEqual([]);
  });

  it('holds progress on the tick a pause source is removed and resumes on the next', () => {
    const pauseFor: System = (_draft, ctx) => {
      if (ctx.tick === 1202) ctx.addPauseSource('ad');
      if (ctx.tick === 1205) ctx.removePauseSource('ad');
    };
    const { state: before } = stepN(step, createRun({ seed: 1 }), 1201, {
      inputs: [{ tick: 1201, command: { type: 'startDownload' } }],
    });
    const atStart = before.download;
    const { state: removed } = stepN(step, before, 4, { systems: [pauseFor] }); // ticks 1202-1205
    expect(removed.download).toBe(atStart);
    const { state: resumed } = stepN(step, removed, 1, { systems: [pauseFor] }); // tick 1206
    expect(resumed.download).toBeGreaterThan(atStart);
  });
});

// Example tests for the phase rules (task 3.2). Default balance: dial 20 s = 1,200 ticks; a full
// download is 8,100 un-paused ticks (pacing-and-economy Req 1.1), so starting on tick 1201 wins on
// tick 9300 and the halfway mark falls on tick 5250.
const START = { tick: 1201, command: { type: 'startDownload' } } as const;
const PER_TICK = 100 / 135 / 60;

/** A run that has just started downloading (state at tick 1201). */
function downloadingRun() {
  return stepN(step, createRun({ seed: 1 }), 1201, { inputs: [START] }).state;
}

describe('step: dialing and connecting', () => {
  it('connects on exactly tick 1200, not before', () => {
    const { state: before, events: early } = stepN(step, createRun({ seed: 1 }), 1199);
    expect(before.phase).toBe('dialing');
    expect(early).toEqual([]);

    const { state, events } = step(before, []);
    expect(state.tick).toBe(1200);
    expect(state.phase).toBe('connected');
    expect(state.phaseStartTick).toBe(1200);
    expect(events).toEqual([{ type: 'connected', tick: 1200 }]);
  });

  it('ignores startDownload while dialing', () => {
    const { state, events } = stepN(step, createRun({ seed: 1 }), 1200, {
      inputs: [1, 600, 1199].map((tick) => ({ tick, command: { type: 'startDownload' } })),
    });
    expect(state.phase).toBe('connected');
    expect(state.download).toBe(0);
    expect(events.map((e) => e.type)).toEqual(['connected']);
  });

  it('ignores startDownload on the tick the connection comes up, and accepts it on the next', () => {
    const { state: connected, events } = stepN(step, createRun({ seed: 1 }), 1200, {
      inputs: [{ tick: 1200, command: { type: 'startDownload' } }],
    });
    expect(connected.phase).toBe('connected');
    expect(events.map((e) => e.type)).toEqual(['connected']);

    const next = step(connected, [{ type: 'startDownload' }]);
    expect(next.state.phase).toBe('downloading');
    expect(next.events).toEqual([{ type: 'downloadStarted', tick: 1201 }]);
  });

  it('stays connected with no progress until startDownload arrives', () => {
    const { state } = stepN(step, createRun({ seed: 1 }), 3000);
    expect(state.phase).toBe('connected');
    expect(state.download).toBe(0);
  });
});

describe('step: winning and losing', () => {
  it('wins when the download reaches 100 and emits won once', () => {
    const { state, events } = stepN(step, createRun({ seed: 1 }), 9300, { inputs: [START] });
    expect(state.phase).toBe('won');
    expect(state.download).toBe(100);
    expect(events.filter((e) => e.type === 'won')).toEqual([{ type: 'won', tick: 9300 }]);
  });

  it.each([
    ['dialing', 300, []],
    ['connected', 1250, []],
    ['downloading', 2000, [START]],
  ] as const)('loses when integrity reaches 0 while %s', (phaseAtHit, tick, inputs) => {
    const { state: before } = stepN(step, createRun({ seed: 1 }), tick - 1, { inputs });
    expect(before.phase).toBe(phaseAtHit);

    const { state, events } = step(before, [], [scheduledDamage([{ tick, amount: 100 }])]);
    expect(state.phase).toBe('lost');
    expect(state.integrity).toBe(0);
    expect(state.phaseStartTick).toBe(tick);
    expect(events.at(-1)).toEqual({ type: 'lost', tick });
    expect(events.map((e) => e.type)).toContain('modemHit');
  });

  it('loses during dialing from accumulated damage and then stays lost', () => {
    const damage = scheduledDamage([
      { tick: 100, amount: 60 },
      { tick: 200, amount: 60 },
    ]);
    const { state, events } = stepN(step, createRun({ seed: 1 }), 400, { systems: [damage] });
    expect(state.phase).toBe('lost');
    expect(state.tick).toBe(200);
    expect(events.map((e) => [e.type, e.tick])).toEqual([
      ['modemHit', 100],
      ['modemHit', 200],
      ['integrityCritical', 200],
      ['lost', 200],
    ]);
  });

  // ad-pressure task 2.2: Line_Quality now reads integrity after this Tick's systems, so a lethal
  // hit on the last Tick would also slow that Tick to the floor and no tie would happen. Both tie
  // tests set `lineQualityFloor: 1` so they still pin the tie rule itself (Req 3.8).
  it('wins a same-tick tie between a full download and integrity 0', () => {
    const tieRun = createRun({ seed: 1, balance: { lineQualityFloor: 1 } });
    const { state: before } = stepN(step, tieRun, 9299, { inputs: [START] });
    expect(before.phase).toBe('downloading');

    const { state, events } = step(before, [], [scheduledDamage([{ tick: 9300, amount: 100 }])]);
    expect(state.phase).toBe('won');
    expect(state.integrity).toBe(0);
    expect(state.download).toBe(100);
    expect(events.map((e) => e.type)).toEqual(['modemHit', 'integrityCritical', 'won']);
  });

  it('wins a same-tick tie with a shortened balance as well', () => {
    // 1 s dial, 50 %/s: connects on 60, starts on 61, full on tick 61 + 120 - 1 = 180.
    const start = createRun({
      seed: 7,
      balance: { dialSeconds: 1, downloadPercentPerSecond: 50, lineQualityFloor: 1 },
    });
    const { state, events } = stepN(step, start, 500, {
      inputs: [{ tick: 61, command: { type: 'startDownload' } }],
      systems: [scheduledDamage([{ tick: 180, amount: 100 }])],
    });
    expect(state.phase).toBe('won');
    expect(state.tick).toBe(180);
    expect(events.some((e) => e.type === 'lost')).toBe(false);
  });
});

describe('step: download progress', () => {
  it('emits downloadHalfway once, even after a penalty drops progress below 50', () => {
    const { state: penalized, events: first } = stepN(step, createRun({ seed: 1 }), 5251, {
      inputs: [START],
      systems: [scheduledPenalty([{ tick: 5251, amount: 10 }])],
    });
    expect(first.filter((e) => e.type === 'downloadHalfway')).toEqual([
      { type: 'downloadHalfway', tick: 5250 },
    ]);
    expect(penalized.download).toBeLessThan(50);

    // Climb back past 50 and on to the win: no second halfway event.
    const { state, events } = stepN(step, penalized, 5000);
    expect(state.phase).toBe('won');
    expect(events.some((e) => e.type === 'downloadHalfway')).toBe(false);
  });

  it('stays paused until the last of several pause sources is removed, then resumes next tick', () => {
    const pauses: System = (_draft, ctx) => {
      if (ctx.tick === 1202) {
        ctx.addPauseSource('popup');
        ctx.addPauseSource('toolbar');
      }
      if (ctx.tick === 1210) ctx.removePauseSource('popup');
      if (ctx.tick === 1220) ctx.removePauseSource('toolbar');
    };
    const before = downloadingRun();
    const held = before.download;

    const { state: oneLeft } = stepN(step, before, 9, { systems: [pauses] }); // ticks 1202-1210
    expect(oneLeft.pauseSources).toEqual(['toolbar']);
    expect(oneLeft.download).toBe(held);

    const { state: removed } = stepN(step, oneLeft, 10, { systems: [pauses] }); // 1211-1220
    expect(removed.pauseSources).toEqual([]);
    expect(removed.download).toBe(held); // the removal tick itself makes no progress

    const { state: resumed } = step(removed, [], [pauses]); // tick 1221
    expect(resumed.download).toBeCloseTo(held + PER_TICK, 12);
  });
});
