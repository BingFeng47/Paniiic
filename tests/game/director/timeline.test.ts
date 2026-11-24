// Director timeline on the default Chapter_Table (pacing-and-economy Req 1.2, 9.1). The boss on
// download progress is pinned separately in bossTrigger.test.ts (task 1.3).
import { describe, expect, it } from 'vitest';
import { createRun } from '../../../src/game/state';
import { step } from '../../../src/game/step';
import { createGameSystems } from '../../../src/game/systems';
import { TICK_RATE, type GameEvent, type GameState } from '../../../src/game/types';

/** Plays a Run with no inputs on the full Game_Systems until it ends or `maxSeconds` passes. */
function playIdle(start: GameState, maxSeconds: number): { state: GameState; events: GameEvent[] } {
  const systems = createGameSystems();
  let state = start;
  const events: GameEvent[] = [];
  while (state.phase !== 'won' && state.phase !== 'lost' && state.tick < maxSeconds * TICK_RATE) {
    const r = step(state, [], systems);
    state = r.state;
    events.push(...r.events);
  }
  return { state, events };
}

describe('default timeline', () => {
  it('starts the chapters at 20, 55, 90, 115 and 145 s', () => {
    // A modem that can't die, so the idle Run lives long enough to see every chapter start.
    const { events } = playIdle(createRun({ seed: 1, balance: { maxIntegrity: 1_000_000 } }), 150);
    const starts = events.flatMap((e) => (e.type === 'chapterStarted' ? [[e.id, e.tick / TICK_RATE]] : []));
    expect(starts).toEqual([
      ['plotTurn1', 20],
      ['pinch1', 55],
      ['midpoint', 90],
      ['pinch2', 115],
      ['plotTurn2', 145],
    ]);
  });

  it('loses an idle Run before 120 s', () => {
    const { state } = playIdle(createRun({ seed: 1 }), 300);
    expect(state.phase).toBe('lost');
    expect(state.tick).toBeLessThan(120 * TICK_RATE);
  });
});
