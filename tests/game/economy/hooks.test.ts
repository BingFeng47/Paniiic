// Lane hook tests (economy-weapons Req 6.1, 6.2, 10.1, 10.2): the weapons slot in
// createLaneSystems, the hitModem surge guard and the hammer's economy reads. Without an
// EconomyState the lane behaves exactly as before.
import { describe, expect, it } from 'vitest';
import { DEFAULT_LANE_BALANCE, secondsToTicks } from '../../../src/game/balance/lane';
import { DEFAULT_ECONOMY_BALANCE } from '../../../src/game/balance/economy';
import type { System } from '../../../src/game/context';
import type { EconomyState } from '../../../src/game/economy/economyTypes';
import { createEconomyState } from '../../../src/game/economy/shop';
import { createLaneSystems } from '../../../src/game/lane';
import { step } from '../../../src/game/step';
import type { GameEvent, GameState, InputCommand } from '../../../src/game/types';
import { attackerAt, hitBoxCentre, laneWith, type EnemySpec } from '../../helpers/lane';

const COOLDOWN_TICKS = secondsToTicks(DEFAULT_LANE_BALANCE.hammer.cooldownSeconds);
const SURGE_TICKS = secondsToTicks(DEFAULT_ECONOMY_BALANCE.surgeSeconds);

function withEconomy(enemies: readonly EnemySpec[], patch: Partial<EconomyState> | null): GameState {
  const state = laneWith(enemies);
  return patch === null ? state : { ...state, economy: { ...createEconomyState(), ...patch } };
}

function run(
  state: GameState,
  ticks: number,
  inputs: (s: GameState) => readonly InputCommand[] = () => [],
  systems: readonly System[] = createLaneSystems(),
) {
  const events: GameEvent[] = [];
  let s = state;
  for (let i = 0; i < ticks; i++) {
    const r = step(s, inputs(s), systems);
    s = r.state;
    events.push(...r.events);
  }
  return { final: s, events };
}

const ofType = <T extends GameEvent['type']>(events: readonly GameEvent[], type: T) =>
  events.filter((e): e is Extract<GameEvent, { type: T }> => e.type === type);

describe('createLaneSystems({ weapons })', () => {
  it('runs the weapons system after the hammer and before the mobs', () => {
    const order: string[] = [];
    const weapons: System = (draft) => {
      order.push(`weapons:${draft.lane!.enemies[0].hp}:${draft.lane!.enemies[0].x}`);
    };
    const start = laneWith([{ kind: 'default', x: 400 }]);
    const { x, y } = hitBoxCentre(start, start.lane!.enemies[0]);
    const systems = createLaneSystems({ weapons });
    expect(systems).toHaveLength(createLaneSystems().length + 1);
    step(start, [{ type: 'hammer', x, y }], systems);
    // The hammer already hit (hp 1) and the mob has not moved yet (x 400).
    expect(order).toEqual(['weapons:1:400']);
  });
});

describe('hitModem', () => {
  it('without an EconomyState deals plain damage', () => {
    const { final, events } = run(withEconomy([attackerAt('default')], null), 1);
    expect(ofType(events, 'modemHit')).toHaveLength(1);
    expect(final.integrity).toBe(100 - DEFAULT_LANE_BALANCE.enemies.default.damage);
    expect(final.economy).toBeUndefined();
  });

  it('with an economy but no surge deals plain damage', () => {
    const { final } = run(withEconomy([attackerAt('default')], {}), 1);
    expect(final.integrity).toBe(100 - DEFAULT_LANE_BALANCE.enemies.default.damage);
  });

  it('a held surge starts at the next hit and blocks that hit', () => {
    const { final, events } = run(withEconomy([attackerAt('default')], { surgeHeld: true }), 1);
    expect(events.map((e) => e.type)).toEqual(
      expect.arrayContaining(['mobBit', 'surgeStarted', 'modemHitBlocked']),
    );
    const types = events.map((e) => e.type);
    expect(types.indexOf('mobBit')).toBeLessThan(types.indexOf('surgeStarted'));
    expect(types.indexOf('surgeStarted')).toBeLessThan(types.indexOf('modemHitBlocked'));
    expect(ofType(events, 'modemHit')).toHaveLength(0);
    expect(ofType(events, 'modemHitBlocked')[0]).toMatchObject({
      kind: 'default',
      amount: DEFAULT_LANE_BALANCE.enemies.default.damage,
    });
    expect(final.integrity).toBe(100);
    expect(final.economy).toMatchObject({ surgeHeld: false, surgeUntilTick: 1 + SURGE_TICKS });
  });

  it('blocks every hit inside the window and none after it', () => {
    const every = secondsToTicks(DEFAULT_LANE_BALANCE.melee.default.hitEverySeconds);
    const ticks = 1 + SURGE_TICKS + every;
    const { events } = run(withEconomy([attackerAt('default')], { surgeHeld: true }), ticks);
    const bites = ofType(events, 'mobBit').length;
    const blocked = ofType(events, 'modemHitBlocked').length;
    const hits = ofType(events, 'modemHit').length;
    expect(ofType(events, 'surgeStarted')).toHaveLength(1);
    expect(blocked).toBe(Math.ceil(SURGE_TICKS / every));
    expect(hits).toBeGreaterThan(0);
    expect(blocked + hits).toBe(bites);
  });

  it('blocks a glob impact', () => {
    const { final, events } = run(withEconomy([{ kind: 'glob', x: 0.5 }], { surgeHeld: true }), 5);
    expect(ofType(events, 'modemHitBlocked')).toHaveLength(1);
    expect(ofType(events, 'modemHitBlocked')[0].kind).toBe('glob');
    expect(final.integrity).toBe(100);
  });
});

describe('hammer economy hooks', () => {
  const click = (s: GameState): readonly InputCommand[] => {
    const enemy = s.lane!.enemies.find((e) => e.kind === 'boss');
    if (enemy === undefined) return [];
    const { x, y } = hitBoxCentre(s, enemy);
    return [{ type: 'hammer', x, y }];
  };
  const target: EnemySpec = { kind: 'boss', x: 400 };

  it('does nothing while another weapon is active', () => {
    const { final, events } = run(withEconomy([target], { active: 'saw', owned: ['saw'] }), 1, click);
    expect(ofType(events, 'hammerSwing')).toHaveLength(0);
    expect(final.lane!.enemies[0].hp).toBe(DEFAULT_LANE_BALANCE.enemies.boss.hp);
  });

  it('deals 1 damage with the plain hammer', () => {
    const { final } = run(withEconomy([target], {}), 1, click);
    expect(final.lane!.enemies[0].hp).toBe(DEFAULT_LANE_BALANCE.enemies.boss.hp - 1);
  });

  it('deals 2 damage with the heavy head at the same 0.3 s cooldown', () => {
    expect(COOLDOWN_TICKS).toBe(18);
    const start = withEconomy([target], { owned: ['heavyHead'] });
    // Clicks every tick: hits land on tick 1 and tick 1 + cooldown only.
    const { final, events } = run(start, COOLDOWN_TICKS, click);
    expect(ofType(events, 'hammerSwing')).toHaveLength(1);
    expect(final.lane!.enemies[0].hp).toBe(DEFAULT_LANE_BALANCE.enemies.boss.hp - 2);
    const next = run(final, 1, click);
    expect(next.final.lane!.enemies[0].hp).toBe(DEFAULT_LANE_BALANCE.enemies.boss.hp - 4);
  });
});
