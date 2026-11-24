// Combo tests for pacing-and-economy (Req 5.1-5.4): example tests and design Properties 2-3.
// A scripted "killer" system emits mobKilled events at chosen ticks, then the real wallet runs.
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { DEFAULT_ECONOMY_BALANCE, type EconomyBalanceOverrides } from '../../../src/game/balance/economy';
import { DEFAULT_LANE_BALANCE, secondsToTicks } from '../../../src/game/balance/lane';
import type { System } from '../../../src/game/context';
import { createEconomySystems, PACKET_Y, type ShopSlot } from '../../../src/game/economy';
import type { EnemyKind } from '../../../src/game/laneTypes';
import { step } from '../../../src/game/step';
import type { GameEvent, GameState, InputCommand } from '../../../src/game/types';
import { laneWith } from '../../helpers/lane';

const B = DEFAULT_ECONOMY_BALANCE;
const WINDOW = secondsToTicks(B.comboWindowSeconds);

interface Kill {
  readonly tick: number;
  readonly kind: EnemyKind;
}

/** Emits one mobKilled per scripted kill on its tick, in script order. */
function killer(kills: readonly Kill[]): System {
  let nextId = 1;
  return (_draft, ctx) => {
    for (const k of kills) {
      if (k.tick !== ctx.tick) continue;
      ctx.emit({ type: 'mobKilled', id: nextId++, kind: k.kind, x: 400, dropKb: DEFAULT_LANE_BALANCE.enemies[k.kind].dropKb });
    }
  };
}

function run(
  kills: readonly Kill[],
  opts: {
    readonly ticks?: number;
    readonly balance?: EconomyBalanceOverrides;
    readonly inputs?: (s: GameState) => readonly InputCommand[];
  } = {},
) {
  const { weapons, wallet } = createEconomySystems({ balance: opts.balance });
  const systems: readonly System[] = [weapons, killer(kills), wallet];
  const ticks = opts.ticks ?? Math.max(0, ...kills.map((k) => k.tick));
  const events: GameEvent[] = [];
  const states: GameState[] = [];
  let s: GameState = laneWith([]);
  for (let i = 0; i < ticks; i++) {
    const r = step(s, opts.inputs?.(s) ?? [], systems);
    s = r.state;
    states.push(s);
    events.push(...r.events);
  }
  return { final: s, events, states };
}

const ofType = <T extends GameEvent['type']>(events: readonly GameEvent[], type: T) =>
  events.filter((e): e is Extract<GameEvent, { type: T }> => e.type === type);
const comboCounts = (events: readonly GameEvent[]) => ofType(events, 'combo').map((e) => e.count);
const d = (tick: number, kind: EnemyKind = 'default'): Kill => ({ tick, kind });

describe('combo examples', () => {
  it('defaults: 2 s window, start at 3, +1 KB', () => {
    expect(B.comboWindowSeconds).toBe(2);
    expect(B.comboStart).toBe(3);
    expect(B.comboBonusKb).toBe(1);
  });

  it('a chain of 3 within the window emits combo x3 and +1 KB', () => {
    const { final, events } = run([d(1), d(30), d(60)]);
    expect(comboCounts(events)).toEqual([3]);
    const combo = ofType(events, 'kbChanged').filter((e) => e.reason === 'combo');
    expect(combo).toEqual([expect.objectContaining({ delta: 1, tick: 60 })]);
    expect(final.economy).toMatchObject({ comboCount: 3, lastKillTick: 60, bestCombo: 3, wallet: 1, gained: 1 });
  });

  it('a gap past the window restarts the chain at 1', () => {
    const { final, events } = run([d(1), d(2), d(3 + WINDOW)]);
    expect(comboCounts(events)).toEqual([]);
    expect(final.economy).toMatchObject({ comboCount: 1, bestCombo: 2 });
  });

  it('a kill exactly at the window boundary still chains', () => {
    const { final, events } = run([d(1), d(1 + WINDOW), d(1 + 2 * WINDOW)]);
    expect(comboCounts(events)).toEqual([3]);
    expect(final.economy!.comboCount).toBe(3);
    const late = run([d(1), d(1 + WINDOW), d(2 + 2 * WINDOW)]);
    expect(late.final.economy!.comboCount).toBe(1);
  });

  it('same-tick kills count one by one', () => {
    const { events, final } = run([d(5), d(5), d(5), d(5)]);
    expect(comboCounts(events)).toEqual([3, 4]);
    expect(final.economy).toMatchObject({ comboCount: 4, bestCombo: 4, wallet: 2 });
  });

  it('glob kills neither extend nor break the chain and drop nothing', () => {
    const { events, final } = run([d(1), d(2), d(3, 'glob'), d(4, 'glob'), d(5)]);
    expect(comboCounts(events)).toEqual([3]);
    expect(final.economy).toMatchObject({ comboCount: 3, lastKillTick: 5 });
    expect(ofType(events, 'packetDropped')).toHaveLength(3);
    // A glob between two kills that are too far apart does not bridge them.
    const bridged = run([d(1), d(1 + WINDOW, 'glob'), d(1 + 2 * WINDOW)]);
    expect(bridged.final.economy).toMatchObject({ comboCount: 1, lastKillTick: 1 + 2 * WINDOW });
    // Globs alone never start a chain.
    const globs = run([d(1, 'glob'), d(2, 'glob'), d(3, 'glob')]);
    expect(globs.final.economy).toMatchObject({ comboCount: 0, lastKillTick: null, bestCombo: 0, wallet: 0 });
    expect(ofType(globs.events, 'packetDropped')).toHaveLength(0);
  });

  it('bestCombo keeps the longest chain after a shorter one', () => {
    const t2 = 10 + WINDOW + 1;
    const { final, events } = run([d(1), d(2), d(3), d(4), d(5), d(t2), d(t2 + 1), d(t2 + 2)]);
    expect(comboCounts(events)).toEqual([3, 4, 5, 3]);
    expect(final.economy).toMatchObject({ comboCount: 3, bestCombo: 5, wallet: 4 });
  });

  it('a comboBonusKb of 0 still emits combo but adds no KB', () => {
    const { final, events } = run([d(1), d(2), d(3)], { balance: { comboBonusKb: 0 } });
    expect(comboCounts(events)).toEqual([3]);
    expect(ofType(events, 'kbChanged').filter((e) => e.reason === 'combo')).toEqual([]);
    expect(final.economy).toMatchObject({ wallet: 0, gained: 0 });
  });

  it('overrides of comboStart, comboBonusKb and comboWindowSeconds apply', () => {
    const start2 = run([d(1), d(2), d(3)], { balance: { comboStart: 2, comboBonusKb: 5 } });
    expect(comboCounts(start2.events)).toEqual([2, 3]);
    expect(start2.final.economy!.wallet).toBe(10);
    const wide = run([d(1), d(1 + 2 * WINDOW), d(1 + 4 * WINDOW)], { balance: { comboWindowSeconds: 2 * B.comboWindowSeconds } });
    expect(comboCounts(wide.events)).toEqual([3]);
  });
});

// ---------------------------------------------------------------------------------------------
// Properties

const arbKills = fc
  .array(
    fc.record({
      gap: fc.oneof(fc.integer({ min: 0, max: WINDOW + 2 }), fc.integer({ min: 0, max: 3 * WINDOW })),
      kind: fc.constantFrom<EnemyKind>('default', 'default', 'fast', 'tank', 'ranged', 'glob'),
    }),
    { maxLength: 40 },
  )
  .map((items) => {
    let tick = 1;
    return items.map(({ gap, kind }): Kill => {
      tick += gap;
      return { tick, kind };
    });
  });

/** Reference fold: chain lengths after each non-glob kill, from the gaps alone. */
function referenceChains(kills: readonly Kill[], window: number): number[] {
  const chains: number[] = [];
  let last: number | null = null;
  let chain = 0;
  for (const k of kills) {
    if (k.kind === 'glob') continue;
    chain = last !== null && k.tick - last <= window ? chain + 1 : 1;
    last = k.tick;
    chains.push(chain);
  }
  return chains;
}

describe('combo properties', () => {
  // Property: Req 5.2-5.4 combo counts follow the kill gaps (design Property 2)
  // **Validates: Requirements 5.2, 5.3, 5.4**
  it('Property 2: combo counts match a reference fold and bestCombo is the longest chain', () => {
    fc.assert(
      fc.property(arbKills, fc.integer({ min: 2, max: 5 }), (kills, comboStart) => {
        const { final, events } = run(kills, { balance: { comboStart } });
        const chains = referenceChains(kills, WINDOW);
        expect(comboCounts(events)).toEqual(chains.filter((c) => c >= comboStart));
        const e = final.economy;
        if (chains.length === 0) {
          // No non-glob kill: the state, if created, never left its start values.
          if (e !== undefined) expect(e).toMatchObject({ comboCount: 0, bestCombo: 0, lastKillTick: null });
          return;
        }
        expect(e!.bestCombo).toBe(Math.max(...chains));
        expect(e!.comboCount).toBe(chains[chains.length - 1]);
        const lastKill = [...kills].reverse().find((k) => k.kind !== 'glob')!;
        expect(e!.lastKillTick).toBe(lastKill.tick);
      }),
      { numRuns: 100 },
    );
  });

  // Property: Req 5.3 gained - spent - lost = wallet with combos (design Property 3)
  // **Validates: Requirements 5.3**
  it('Property 3: gained − spent − lost = wallet with combos, pickups, purchases and expiries', () => {
    const arbInput = fc.oneof(
      fc.record({ kind: fc.constant('pick' as const), index: fc.nat(10) }),
      fc.record({ kind: fc.constant('buy' as const), slot: fc.constantFrom<ShopSlot>(1, 2, 3, 4, 5) }),
    );
    fc.assert(
      fc.property(
        arbKills,
        fc.array(fc.record({ tick: fc.integer({ min: 1, max: 400 }), input: arbInput }), { maxLength: 60 }),
        fc.integer({ min: 0, max: 3 }),
        (kills, script, comboBonusKb) => {
          const ticks = Math.max(400, ...kills.map((k) => k.tick)) + secondsToTicks(B.packetLifetimeSeconds);
          const inputs = (s: GameState): readonly InputCommand[] => {
            const next = s.tick + 1;
            const out: InputCommand[] = [];
            for (const { tick, input } of script) {
              if (tick !== next) continue;
              if (input.kind === 'buy') out.push({ type: 'buy', slot: input.slot });
              else {
                const packets = s.economy?.packets ?? [];
                if (packets.length === 0) continue;
                const p = packets[input.index % packets.length]!;
                out.push({ type: 'lanePointer', x: p.x, y: PACKET_Y, down: false });
              }
            }
            return out;
          };
          const { states, events } = run(kills, { ticks, balance: { comboBonusKb }, inputs });
          for (const s of states) {
            const e = s.economy!;
            expect(e.wallet).toBe(e.gained - e.spent - e.lost);
            expect(e.wallet).toBeGreaterThanOrEqual(0);
          }
          const comboKb = ofType(events, 'kbChanged')
            .filter((e) => e.reason === 'combo')
            .reduce((sum, e) => sum + e.delta, 0);
          expect(comboKb).toBe(comboBonusKb * ofType(events, 'combo').length);
        },
      ),
      { numRuns: 50 },
    );
  });
});
