// Property tests for economy-weapons (design: Correctness Properties 1-8).
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { AdBalanceOverrides } from '../../../src/game/balance/ads';
import { DEFAULT_ECONOMY_BALANCE, type EconomyBalanceOverrides } from '../../../src/game/balance/economy';
import { secondsToTicks } from '../../../src/game/balance/lane';
import { createAdSystems } from '../../../src/game/ads/adSystems';
import type { AdControl } from '../../../src/game/ads/adTypes';
import type { System } from '../../../src/game/context';
import {
  createEconomyState,
  createEconomySystems,
  maxFuel,
  nextItem,
  ownedWeapons,
  PACKET_Y,
  type EconomyState,
  type ItemId,
  type ShopSlot,
  type WeaponId,
} from '../../../src/game/economy';
import { createLaneSystems } from '../../../src/game/lane';
import { createRun } from '../../../src/game/state';
import { step } from '../../../src/game/step';
import type { GameEvent, GameState, InputCommand } from '../../../src/game/types';
import { FAST_CORE, fastSchedule, hitBoxCentre, laneWith } from '../../helpers/lane';

const RUNS = 25;
const PACKET_TICKS = secondsToTicks(DEFAULT_ECONOMY_BALANCE.packetLifetimeSeconds);
const SURGE_TICKS = secondsToTicks(DEFAULT_ECONOMY_BALANCE.surgeSeconds);
const noSpawns: System = () => {};

// ---------------------------------------------------------------------------------------------
// Full-run script: lane + ads + economy with a random player.

type Action =
  | { readonly kind: 'hammer'; readonly index: number }
  | { readonly kind: 'pointer'; readonly target: 'enemy' | 'packet' | 'point'; readonly index: number; readonly x: number; readonly y: number; readonly down: boolean }
  | { readonly kind: 'buy'; readonly slot: ShopSlot }
  | { readonly kind: 'switch'; readonly direction: 'next' | 'previous' }
  | { readonly kind: 'ad'; readonly index: number; readonly control: AdControl };

interface Script {
  readonly seed: number;
  readonly ticks: number;
  readonly startWallet: number;
  readonly actions: readonly { readonly tick: number; readonly action: Action }[];
}

const CONTROLS: readonly AdControl[] = [
  'close', 'bigClose', 'tinyClose', 'ok', 'cancel', 'noThanks', 'skip', 'confirmYes', 'confirmNo', 'fakeButton', 'body',
];

const arbAction = (slots: readonly ShopSlot[]): fc.Arbitrary<Action> =>
  fc.oneof(
    { weight: 3, arbitrary: fc.record({ kind: fc.constant('hammer' as const), index: fc.nat(20) }) },
    {
      weight: 4,
      arbitrary: fc.record({
        kind: fc.constant('pointer' as const),
        target: fc.constantFrom('enemy' as const, 'packet' as const, 'point' as const),
        index: fc.nat(20),
        x: fc.integer({ min: -20, max: 900 }),
        y: fc.integer({ min: -20, max: 150 }),
        down: fc.boolean(),
      }),
    },
    { weight: 1, arbitrary: fc.record({ kind: fc.constant('buy' as const), slot: fc.constantFrom(...slots) }) },
    { weight: 1, arbitrary: fc.record({ kind: fc.constant('switch' as const), direction: fc.constantFrom('next' as const, 'previous' as const) }) },
    { weight: 3, arbitrary: fc.record({ kind: fc.constant('ad' as const), index: fc.nat(10), control: fc.constantFrom(...CONTROLS) }) },
  );

const arbScript = (
  opts: { maxTicks?: number; slots?: readonly ShopSlot[]; maxWallet?: number } = {},
): fc.Arbitrary<Script> => {
  const maxTicks = opts.maxTicks ?? 700;
  return fc.integer({ min: 200, max: maxTicks }).chain((ticks) =>
    fc.record({
      seed: fc.nat(),
      ticks: fc.constant(ticks),
      startWallet: fc.integer({ min: 0, max: opts.maxWallet ?? 300 }),
      actions: fc.array(
        fc.record({ tick: fc.integer({ min: 1, max: ticks }), action: arbAction(opts.slots ?? [1, 2, 3, 4, 5]) }),
        { maxLength: 400 },
      ),
    }),
  );
};

const AD_OVERRIDES: AdBalanceOverrides = {
  firstClutterDelaySeconds: 0.5,
  schedule: [
    { kind: 'clutter', startSecond: 2.5, endSecond: 60, everySeconds: 1, patterns: ['plain', 'decoy'], laneCover: false },
    { kind: 'fake', startSecond: 3, endSecond: 60, everySeconds: 2, patterns: [], laneCover: false },
    { kind: 'interrupter', startSecond: 3.5, endSecond: 60, everySeconds: 3, patterns: ['plain'], laneCover: false },
  ],
};

function fullSystems(economy: EconomyBalanceOverrides = {}): readonly System[] {
  const { weapons, wallet } = createEconomySystems({ balance: economy });
  return [
    ...createLaneSystems({ balance: { spawns: fastSchedule() }, weapons }),
    ...createAdSystems({ balance: AD_OVERRIDES }),
    wallet,
  ];
}

function commandFor(action: Action, s: GameState): InputCommand | null {
  const enemies = s.lane?.enemies ?? [];
  switch (action.kind) {
    case 'hammer': {
      if (enemies.length === 0) return null;
      return { type: 'hammer', ...hitBoxCentre(s, enemies[action.index % enemies.length]!) };
    }
    case 'pointer': {
      const packets = s.economy?.packets ?? [];
      if (action.target === 'enemy' && enemies.length > 0) {
        return { type: 'lanePointer', ...hitBoxCentre(s, enemies[action.index % enemies.length]!), down: action.down };
      }
      if (action.target === 'packet' && packets.length > 0) {
        const p = packets[action.index % packets.length]!;
        return { type: 'lanePointer', x: p.x, y: PACKET_Y, down: action.down };
      }
      return { type: 'lanePointer', x: action.x, y: action.y, down: action.down };
    }
    case 'buy':
      return { type: 'buy', slot: action.slot };
    case 'switch':
      return { type: 'switchWeapon', direction: action.direction };
    case 'ad': {
      const ads = s.ads?.ads ?? [];
      if (ads.length === 0) return null;
      return { type: 'adClick', adId: ads[action.index % ads.length]!.id, control: action.control };
    }
  }
}

interface Trace {
  readonly states: readonly GameState[];
  readonly inputs: readonly (readonly InputCommand[])[];
  readonly tickEvents: readonly (readonly GameEvent[])[];
}

function startState(script: Script, economy: EconomyBalanceOverrides = {}): GameState {
  const e = createEconomyState({ ...DEFAULT_ECONOMY_BALANCE, ...economy } as EconomyState['balance']);
  return {
    ...createRun({ seed: script.seed, balance: FAST_CORE }),
    economy: { ...e, wallet: script.startWallet, gained: script.startWallet },
  };
}

function runScript(script: Script, systems: readonly System[], start: GameState = startState(script)): Trace {
  const byTick = new Map<number, Action[]>();
  for (const { tick, action } of script.actions) byTick.set(tick, [...(byTick.get(tick) ?? []), action]);
  let s = start;
  const states = [s];
  const inputs: InputCommand[][] = [];
  const tickEvents: GameEvent[][] = [];
  const downloadTick = secondsToTicks(FAST_CORE.dialSeconds!) + 5;
  for (let i = 0; i < script.ticks; i++) {
    if (s.phase === 'won' || s.phase === 'lost') break;
    const tick = s.tick + 1;
    const cmds: InputCommand[] = tick === downloadTick ? [{ type: 'startDownload' }] : [];
    for (const a of byTick.get(tick) ?? []) {
      const c = commandFor(a, s);
      if (c !== null) cmds.push(c);
    }
    const r = step(s, cmds, systems);
    s = r.state;
    states.push(s);
    inputs.push(cmds);
    tickEvents.push([...r.events]);
  }
  return { states, inputs, tickEvents };
}

const ofType = <T extends GameEvent['type']>(events: readonly GameEvent[], type: T) =>
  events.filter((e): e is Extract<GameEvent, { type: T }> => e.type === type);

// ---------------------------------------------------------------------------------------------

describe('economy properties', () => {
  // Property 1: Req 1.1, 1.2, 1.3, 1.4, 3.1, 3.2 KB is conserved
  it('Property 1: KB is conserved', () => {
    fc.assert(
      fc.property(arbScript(), (script) => {
        const { states, tickEvents } = runScript(script, fullSystems());
        let running = script.startWallet;
        for (let i = 1; i < states.length; i++) {
          const e = states[i]!.economy!;
          expect(e.wallet).toBe(e.gained - e.spent - e.lost);
          expect(Number.isInteger(e.wallet)).toBe(true);
          expect(e.wallet).toBeGreaterThanOrEqual(0);
          expect(e.spent).toBeLessThanOrEqual(e.gained);
          for (const ev of ofType(tickEvents[i - 1]!, 'kbChanged')) {
            running += ev.delta;
            expect(ev.wallet).toBe(running);
          }
          expect(running).toBe(e.wallet);
          // Each ad close pays its reward and each fake click costs min(5, wallet) (Req 3.1, 3.2).
          const closes = ofType(tickEvents[i - 1]!, 'adClosed').length;
          const paid = ofType(tickEvents[i - 1]!, 'kbChanged').filter((k) => k.reason === 'adClosed').length;
          expect(paid).toBe(closes);
        }
      }),
      { numRuns: RUNS },
    );
  });

  // Property 2: Req 2.1, 2.2, 2.3 packets are collected at most once
  it('Property 2: packets are collected at most once', () => {
    fc.assert(
      fc.property(arbScript(), (script) => {
        const { states, tickEvents } = runScript(script, fullSystems());
        const lastTick = states[states.length - 1]!.tick;
        const dropped = new Map<number, { tick: number; kb: number }>();
        const ended = new Map<number, number>();
        let killDrops = 0;
        let packetKb = 0;
        let collectedKb = 0;
        for (const events of tickEvents) {
          for (const ev of events) {
            if (ev.type === 'mobKilled' && ev.dropKb > 0) killDrops++;
            if (ev.type === 'packetDropped') {
              expect(dropped.has(ev.id)).toBe(false);
              dropped.set(ev.id, { tick: ev.tick, kb: ev.kb });
            }
            if (ev.type === 'packetCollected' || ev.type === 'packetExpired') {
              expect(dropped.has(ev.id)).toBe(true);
              expect(ended.has(ev.id)).toBe(false);
              ended.set(ev.id, ev.tick);
              if (ev.type === 'packetCollected') {
                expect(ev.kb).toBe(dropped.get(ev.id)!.kb);
                collectedKb += ev.kb;
              } else {
                expect(ev.tick).toBe(dropped.get(ev.id)!.tick + PACKET_TICKS);
              }
            }
            if (ev.type === 'kbChanged' && ev.reason === 'packet') packetKb += ev.delta;
          }
        }
        expect(dropped.size).toBe(killDrops);
        for (const [id, d] of dropped) {
          if (lastTick >= d.tick + PACKET_TICKS) expect(ended.has(id)).toBe(true);
        }
        expect(packetKb).toBe(collectedKb);
      }),
      { numRuns: RUNS },
    );
  });

  // Property 3: Req 4.2, 4.3, 4.4, 5.3, 10.4 the shop matches its model
  it('Property 3: the shop matches its model', () => {
    const CYCLE: readonly WeaponId[] = ['hammer', 'saw', 'flamethrower'];
    fc.assert(
      fc.property(arbScript({ maxTicks: 300, maxWallet: 500 }), (script) => {
        const { states, inputs, tickEvents } = runScript(script, fullSystems());
        for (let i = 0; i < inputs.length; i++) {
          // Model from the economy before the step (weaponSystem runs before the wallet).
          const before = states[i]!.economy!;
          let owned: ItemId[] = [...before.owned];
          let wallet = before.wallet;
          let active = before.active;
          let held = before.surgeHeld;
          const expected: unknown[] = [];
          for (const c of inputs[i]!) {
            if (c.type === 'buy') {
              const item = nextItem(c.slot, { ...before, owned });
              if (item === null) expected.push({ type: 'buyRejected', slot: c.slot, reason: 'owned' });
              else if (item === 'surge' && held) expected.push({ type: 'buyRejected', slot: c.slot, reason: 'held' });
              else if (before.balance.prices[item] > wallet) {
                expected.push({ type: 'buyRejected', slot: c.slot, reason: 'tooExpensive' });
              } else {
                wallet -= before.balance.prices[item];
                expected.push({ type: 'itemBought', item, price: before.balance.prices[item] });
                if (item === 'surge') held = true;
                else if (item !== 'blocker') owned = [...owned, item];
                if (item === 'saw' || item === 'flamethrower') {
                  active = item;
                  expected.push({ type: 'weaponSwitched', weapon: item });
                }
              }
            } else if (c.type === 'switchWeapon') {
              const ws = CYCLE.filter((w) => w === 'hammer' || owned.includes(w));
              if (ws.length > 1) {
                const j = ws.indexOf(active);
                active = ws[(j + (c.direction === 'next' ? 1 : ws.length - 1)) % ws.length]!;
                expected.push({ type: 'weaponSwitched', weapon: active });
              }
            }
          }
          const actual = tickEvents[i]!
            .filter((e) => e.type === 'itemBought' || e.type === 'buyRejected' || e.type === 'weaponSwitched')
            .map(({ tick: _t, ...rest }) => rest);
          expect(actual).toEqual(expected);
          const after = states[i + 1]!.economy!;
          expect(after.active).toBe(active);
          expect(after.owned).toEqual(owned);
          expect(ownedWeapons(after)).toContain(after.active);
        }
      }),
      { numRuns: RUNS },
    );
  });

  // Property 4: Req 7.1, 7.2, 7.3 saw kills a tank on time
  it('Property 4: saw kills a tank on time', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 300, max: 800 }),
        fc.integer({ min: 0, max: 5000 }),
        fc.boolean(),
        (x, startTick, highRpm) => {
          const { weapons } = createEconomySystems();
          const systems = createLaneSystems({ weapons, spawner: noSpawns });
          const base = laneWith([{ kind: 'tank', x }]);
          const owned: ItemId[] = highRpm ? ['saw', 'highRpm'] : ['saw'];
          let s: GameState = { ...base, tick: startTick, economy: { ...createEconomyState(), owned, active: 'saw' } };
          const limit = (highRpm ? 32 : 48) + 1;
          const hp = s.lane!.enemies[0]!.hp;
          let removed = 0;
          let killedAt: number | null = null;
          for (let i = 1; i <= limit && killedAt === null; i++) {
            const tank = s.lane!.enemies[0]!;
            const r = step(s, [{ type: 'lanePointer', ...hitBoxCentre(s, tank), down: true }], systems);
            removed += ofType(r.events, 'mobHit').reduce((sum, h) => sum + h.damage, 0);
            if (ofType(r.events, 'mobKilled').length > 0) killedAt = i;
            s = r.state;
          }
          expect(killedAt).not.toBeNull();
          expect(removed).toBe(hp);
        },
      ),
      { numRuns: 50 },
    );
  });

  // Property 5: Req 8.3, 8.4, 8.5 fuel stays in range and latches at empty
  it('Property 5: fuel stays in range and latches at empty', () => {
    const economy: EconomyBalanceOverrides = { fuelSeconds: 0.5 };
    fc.assert(
      fc.property(
        fc.array(
          fc.record({ onEnemy: fc.boolean(), index: fc.nat(3), down: fc.boolean(), repeat: fc.integer({ min: 1, max: 40 }) }),
          { minLength: 1, maxLength: 30 },
        ),
        fc.boolean(),
        (moves, bigTank) => {
          const { weapons } = createEconomySystems({ balance: economy });
          const systems = createLaneSystems({ weapons, spawner: noSpawns });
          const base = laneWith([
            { kind: 'boss', x: 500 }, { kind: 'boss', x: 600 }, { kind: 'tank', x: 700 }, { kind: 'boss', x: 800 },
          ]);
          const e0 = createEconomyState({ ...DEFAULT_ECONOMY_BALANCE, ...economy } as EconomyState['balance']);
          const owned: ItemId[] = bigTank ? ['flamethrower', 'bigTank'] : ['flamethrower'];
          const start = { ...e0, owned, active: 'flamethrower' as const };
          let s: GameState = { ...base, economy: { ...start, fuel: maxFuel(start) } };
          const max = maxFuel(start);
          for (const m of moves) {
            for (let k = 0; k < m.repeat; k++) {
              const enemies = s.lane!.enemies;
              const at = m.onEnemy && enemies.length > 0
                ? hitBoxCentre(s, enemies[m.index % enemies.length]!)
                : { x: 100, y: 40 };
              const before = s.economy!;
              const latchedNow = before.flameLatched && m.down;
              const firing = m.down && before.fuel > 0 && !latchedNow;
              const burning = new Set(before.burns.filter((b) => b.untilTick > s.tick + 1).map((b) => b.enemyId));
              const r = step(s, [{ type: 'lanePointer', ...at, down: m.down }], systems);
              const after = r.state.economy!;
              expect(after.fuel).toBeGreaterThanOrEqual(0);
              expect(after.fuel).toBeLessThanOrEqual(max + 1e-9);
              if (after.fuel < before.fuel) expect(firing).toBe(true);
              if (after.fuel > before.fuel) expect(firing).toBe(false);
              if (!firing) {
                // No flame damage: only Enemies already burning take hits, and no burn is refreshed.
                for (const h of ofType(r.events, 'mobHit')) expect(burning.has(h.id)).toBe(true);
                for (const b of after.burns) {
                  const old = before.burns.find((o) => o.enemyId === b.enemyId);
                  expect(old?.untilTick).toBe(b.untilTick);
                }
              }
              if (after.fuel === 0 && m.down) expect(after.flameLatched).toBe(true);
              s = r.state;
            }
          }
        },
      ),
      { numRuns: RUNS },
    );
  });

  // Property 6: Req 10.1, 10.2, 10.3 surge blocks a 5 s window that starts at a hit
  it('Property 6: surge blocks a 5 s window that starts at a hit', () => {
    fc.assert(
      fc.property(arbScript({ maxTicks: 900, slots: [5], maxWallet: 400 }), (script) => {
        const { states, tickEvents } = runScript(script, fullSystems());
        let held = states[0]!.economy!.surgeHeld;
        let until: number | null = null;
        for (let i = 0; i < tickEvents.length; i++) {
          const tick = states[i + 1]!.tick;
          if (until !== null && tick >= until) until = null;
          let integrity = states[i]!.integrity;
          for (const ev of tickEvents[i]!) {
            if (ev.type === 'itemBought' && ev.item === 'surge') held = true;
            if (ev.type === 'modemHit' || ev.type === 'modemHitBlocked') {
              if (held && until === null) {
                held = false;
                until = tick + SURGE_TICKS;
              }
              const blocked = until !== null && tick < until;
              expect(ev.type).toBe(blocked ? 'modemHitBlocked' : 'modemHit');
              if (ev.type === 'modemHit') {
                integrity = Math.max(0, integrity - ev.amount);
                expect(ev.integrity).toBe(integrity);
              }
            }
          }
          expect(states[i + 1]!.integrity).toBe(integrity);
          expect(ofType(tickEvents[i]!, 'surgeStarted').length).toBe(until === tick + SURGE_TICKS ? 1 : 0);
          expect(states[i + 1]!.economy!.surgeHeld).toBe(held);
        }
      }),
      { numRuns: RUNS },
    );
  });

  // Property 7: Req 9.2, 9.3 the blocker clears clutter only
  it('Property 7: the blocker clears clutter only', () => {
    fc.assert(
      fc.property(arbScript({ maxTicks: 900, slots: [4], maxWallet: 200 }), (script) => {
        const { states, tickEvents } = runScript(script, fullSystems());
        const blocked = new Set<number>();
        for (let i = 0; i < tickEvents.length; i++) {
          const prev = states[i]!;
          const next = states[i + 1]!;
          const events = tickEvents[i]!;
          const opened = new Map(ofType(events, 'adOpened').map((o) => [o.id, o.kind]));
          for (const b of ofType(events, 'adBlocked')) {
            const kind = prev.ads?.ads.find((a) => a.id === b.id)?.kind ?? opened.get(b.id);
            expect(kind).toBe('clutter');
            blocked.add(b.id);
          }
          for (const c of ofType(events, 'adClosed')) expect(blocked.has(c.id)).toBe(false);
          const until = next.economy!.blockerUntilTick;
          if (until !== null && next.tick < until) {
            expect(next.ads?.ads.some((a) => a.kind === 'clutter') ?? false).toBe(false);
          }
        }
      }),
      { numRuns: RUNS },
    );
  });

  // Property 8: Req 13.1, 13.2 economy runs are deterministic and plain data
  it('Property 8: economy runs are deterministic and plain data', () => {
    fc.assert(
      fc.property(arbScript({ maxTicks: 400 }), (script) => {
        const a = runScript(script, fullSystems());
        const b = runScript(script, fullSystems());
        expect(b.states).toEqual(a.states);
        expect(b.tickEvents).toEqual(a.tickEvents);
        for (const s of a.states) {
          expect(JSON.parse(JSON.stringify(s.economy))).toEqual(s.economy);
        }
      }),
      { numRuns: 15 },
    );
  });
});
