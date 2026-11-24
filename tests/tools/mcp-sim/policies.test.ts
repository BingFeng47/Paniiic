import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { createAdSystems } from '../../../src/game/ads/adSystems';
import { createDirector } from '../../../src/game/director';
import { createEconomySystems } from '../../../src/game/economy';
import { createLaneSystems } from '../../../src/game/lane';
import { createRun } from '../../../src/game/state';
import { step } from '../../../src/game/step';
import type { GameState, InputCommand } from '../../../src/game/types';
import {
  BOT_TABLE,
  createBotMemory,
  createBotRng,
  getPolicy,
  type PolicyName,
} from '../../../tools/mcp-sim/src/policies';

function systems() {
  const director = createDirector();
  const economy = createEconomySystems();
  return [
    ...createLaneSystems({ spawner: director.laneSpawner, weapons: economy.weapons }),
    ...createAdSystems({ scheduler: director.adScheduler }),
    economy.wallet,
  ];
}

function play(seed: number, name: PolicyName, maxTicks: number, check?: (s: GameState, c: readonly InputCommand[]) => void) {
  const sys = systems();
  const policy = getPolicy(name);
  const memory = createBotMemory();
  const rng = createBotRng(seed);
  let state = createRun({ seed });
  const sent: InputCommand[] = [];
  while (state.phase !== 'won' && state.phase !== 'lost' && state.tick < maxTicks) {
    const before = JSON.stringify(state);
    const cmds = policy.decide(state, memory, rng);
    check?.(state, cmds);
    expect(JSON.stringify(state)).toBe(before);
    JSON.parse(JSON.stringify(memory));
    sent.push(...cmds);
    state = step(state, cmds, sys).state;
  }
  return { state, sent };
}

const PLAYER_TYPES = new Set(['startDownload', 'hammer', 'adClick', 'adHover', 'lanePointer', 'buy', 'switchWeapon']);

describe('policies', () => {
  it('has the skill table from the design', () => {
    // cursorPxPerSecond added by pacing-and-economy Req 6.2.
    expect(BOT_TABLE.casual).toEqual({ reactionDelay: 30, actionInterval: 18, mistakeRate: 0.2, fakeRate: 0.15, cursorPxPerSecond: 1400 });
    expect(BOT_TABLE.competent).toEqual({ reactionDelay: 15, actionInterval: 10, mistakeRate: 0.05, fakeRate: 0.03, cursorPxPerSecond: 2200 });
    expect(BOT_TABLE.perfect).toEqual({ reactionDelay: 0, actionInterval: 1, mistakeRate: 0, fakeRate: 0, cursorPxPerSecond: 1_000_000 });
  });

  it('idle sends nothing', () => {
    expect(play(1, 'idle', 60 * 40).sent).toEqual([]);
  });

  it('perfect starts the download, kills mobs and buys the saw first', () => {
    const { state, sent } = play(3, 'perfect', 60 * 300);
    expect(sent.some((c) => c.type === 'startDownload')).toBe(true);
    expect(sent.find((c) => c.type === 'buy')).toEqual({ type: 'buy', slot: 2 });
    expect(state.phase).toBe('won');
  });

  it('bots send only player commands and never change the state', () => {
    // Property: Req 2.1 bots send only player commands and never change the state
    // **Validates: Requirements 2.1, 2.2**
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 0xffffffff }), fc.constantFrom<PolicyName>('casual', 'competent', 'perfect'), (seed, name) => {
        play(seed, name, 60 * 50, (_s, cmds) => {
          for (const c of cmds) expect(PLAYER_TYPES.has(c.type)).toBe(true);
        });
      }),
      { numRuns: 6 },
    );
  });
});

// pacing-and-economy Req 6: the Bot_Cursor.
import { adContains, adControlCentre } from '../../../src/render/browser/adGeometry';
import { DEFAULT_AD_BALANCE } from '../../../src/game/balance/ads';
import { DEFAULT_LANE_BALANCE } from '../../../src/game/balance/lane';
import { TICK_RATE } from '../../../src/game/types';
import {
  createLaneLayout,
  LANE_CANVAS_H,
  LANE_CANVAS_W,
  LANE_DOCK_RECT,
  screenToLane,
} from '../../../src/render/laneLayout';
import { CURSOR_START, type BotMemory, type CursorPoint } from '../../../tools/mcp-sim/src/policies';

const CURSOR_BOTS: readonly PolicyName[] = ['casual', 'competent', 'perfect'];

interface TickView {
  readonly state: GameState;
  readonly cmds: readonly InputCommand[];
  readonly before: CursorPoint;
  readonly after: CursorPoint;
  readonly memory: BotMemory;
}

/** Plays a bot Run and shows each Tick's state, commands and cursor before and after `decide`. */
function playWithCursor(seed: number, name: PolicyName, maxTicks: number, check: (t: TickView) => void) {
  const sys = systems();
  const policy = getPolicy(name);
  const memory = createBotMemory();
  const rng = createBotRng(seed);
  let state = createRun({ seed });
  const sent: InputCommand[][] = [];
  while (state.phase !== 'won' && state.phase !== 'lost' && state.tick < maxTicks) {
    const before = { ...memory.cursor };
    const rngBefore = state.rng;
    const cmds = policy.decide(state, memory, rng);
    // Req 6.6: deciding never draws from (or moves) the Run RNG.
    expect(state.rng).toBe(rngBefore);
    check({ state, cmds, before, after: { ...memory.cursor }, memory });
    sent.push([...cmds]);
    state = step(state, cmds, sys).state;
  }
  return { state, sent };
}

const layout = createLaneLayout(LANE_CANVAS_W, LANE_CANVAS_H, DEFAULT_LANE_BALANCE.laneLength);

function inDock(p: CursorPoint): boolean {
  const r = LANE_DOCK_RECT;
  return p.x >= r.x && p.x < r.x + r.w && p.y >= r.y && p.y < r.y + r.h;
}

describe('Bot_Cursor (pacing-and-economy Req 6)', () => {
  it('starts at the centre of the Lane_Dock', () => {
    // Req 6.1
    const m = createBotMemory();
    expect(m.cursor).toEqual({ x: LANE_DOCK_RECT.x + LANE_DOCK_RECT.w / 2, y: LANE_DOCK_RECT.y + LANE_DOCK_RECT.h / 2 });
    expect(CURSOR_START).toEqual(m.cursor);
  });

  it('Design Property 4 (pacing-and-economy): bot cursor speed', () => {
    // Design Property 4 (pacing-and-economy): Req 6.3 between two Ticks the Bot_Cursor moves at
    // most cursorPxPerSecond / TICK_RATE px, for any seed and each cursor policy.
    // **Validates: Requirements 6.3**
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 0xffffffff }), fc.constantFrom(...CURSOR_BOTS), (seed, name) => {
        const maxStep = BOT_TABLE[name as Exclude<PolicyName, 'idle'>].cursorPxPerSecond / TICK_RATE;
        let moved = false;
        playWithCursor(seed, name, 60 * 50, ({ before, after }) => {
          const d = Math.hypot(after.x - before.x, after.y - before.y);
          expect(d).toBeLessThanOrEqual(maxStep * (1 + 1e-9));
          if (d > 0) moved = true;
        });
        expect(moved).toBe(true);
      }),
      { numRuns: 6 },
    );
  });

  it('clicks only where the cursor is, and sends lanePointer at the cursor while over the lane', () => {
    // Req 6.3, 6.4, 6.5
    for (const name of CURSOR_BOTS) {
      const kinds = new Set<string>();
      playWithCursor(7, name, 60 * 120, ({ state, cmds, after }) => {
        for (const c of cmds) {
          kinds.add(c.type);
          if (c.type === 'startDownload') {
            const link = DEFAULT_AD_BALANCE.realLink;
            expect(after).toEqual({ x: link.x + link.w / 2, y: link.y + link.h / 2 });
          } else if (c.type === 'adClick') {
            const ad = state.ads!.ads.find((a) => a.id === c.adId)!;
            expect(after).toEqual(adControlCentre(ad, c.control));
          } else if (c.type === 'adHover') {
            const ad = state.ads!.ads.find((a) => a.id === c.adId)!;
            expect(after).toEqual(adControlCentre(ad, 'close'));
          } else if (c.type === 'hammer') {
            expect({ x: c.x, y: c.y }).toEqual(screenToLane(after, layout));
          }
        }
        const overLane = inDock(after) && !(state.ads?.ads ?? []).some((a) => adContains(a, after));
        const pointers = cmds.filter((c) => c.type === 'lanePointer');
        if (overLane) {
          expect(pointers).toHaveLength(1);
          const lp = pointers[0]!;
          if (lp.type === 'lanePointer') expect({ x: lp.x, y: lp.y }).toEqual(screenToLane(after, layout));
        }
      });
      expect(kinds.has('startDownload')).toBe(true);
      expect(kinds.has('hammer')).toBe(true);
      expect(kinds.has('lanePointer')).toBe(true);
    }
  }, 60_000);

  it('a slow cursor takes several Ticks to reach the real link and clicks on arrival only', () => {
    // Req 6.3: casual moves 1,400 / 60 px per Tick, so the trip from the dock takes many Ticks.
    const link = DEFAULT_AD_BALANCE.realLink;
    const target = { x: link.x + link.w / 2, y: link.y + link.h / 2 };
    let arrivedTick: number | null = null;
    let clickTick: number | null = null;
    playWithCursor(11, 'casual', 60 * 40, ({ state, cmds, after }) => {
      if (arrivedTick === null && after.x === target.x && after.y === target.y) arrivedTick = state.tick;
      if (clickTick === null && cmds.some((c) => c.type === 'startDownload')) clickTick = state.tick;
    });
    expect(clickTick).not.toBeNull();
    expect(arrivedTick).not.toBeNull();
    expect(clickTick!).toBeGreaterThanOrEqual(arrivedTick!);
    const trip = Math.hypot(target.x - CURSOR_START.x, target.y - CURSOR_START.y);
    expect(trip / (BOT_TABLE.casual.cursorPxPerSecond / TICK_RATE)).toBeGreaterThan(1);
  });

  it('bots never read the Run RNG: replaying their commands gives the same Run', () => {
    // Req 6.6
    for (const name of CURSOR_BOTS) {
      const { state: botEnd, sent } = playWithCursor(5, name, 60 * 60, () => {});
      const sys = systems();
      let replay = createRun({ seed: 5 });
      for (const cmds of sent) replay = step(replay, cmds, sys).state;
      expect(replay.rng).toBe(botEnd.rng);
      expect(JSON.stringify(replay)).toBe(JSON.stringify(botEnd));
    }
  }, 60_000);
});
