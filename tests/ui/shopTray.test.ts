// Lane_HUD shop tray and economy sounds (economy-weapons Req 4.6, 11.2, 11.3, 12.1).
import { afterEach, describe, expect, it } from 'vitest';
import { createEconomyState, type EconomyState } from '../../src/game/economy';
import type { GameEvent, GameState, InputCommand } from '../../src/game/types';
import { economySoundsFor } from '../../src/render/economySounds';
import { createShopTray, secondsLeft } from '../../src/ui/shopTray';
import { laneWith } from '../helpers/lane';

function stateWith(economy: Partial<EconomyState>, tick = 0): GameState {
  return { ...laneWith([]), tick, economy: { ...createEconomyState(), ...economy } };
}

function setup() {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  const sent: InputCommand[] = [];
  const tray = createShopTray((c) => sent.push(c));
  tray.mount(parent);
  const slot = (n: number) => parent.querySelector(`.shop-slot[data-slot="${n}"]`) as HTMLButtonElement;
  return { parent, sent, tray, slot };
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('shop tray', () => {
  it('clicking a slot sends one buy for that slot; nothing after unmount (Req 4.6)', () => {
    const { sent, tray, slot } = setup();
    slot(3).click();
    (slot(4).querySelector('.shop-slot-name') as HTMLElement).click();
    expect(sent).toEqual([
      { type: 'buy', slot: 3 },
      { type: 'buy', slot: 4 },
    ]);
    const s1 = slot(1);
    tray.unmount();
    s1.click();
    expect(sent).toHaveLength(2);
  });

  it('shows slot states and the active ring (Req 11.2)', () => {
    const { tray, slot } = setup();
    tray.update(stateWith({ wallet: 60, owned: ['saw'], active: 'saw', surgeHeld: true }));
    expect(slot(2).classList.contains('is-active')).toBe(true);
    expect(slot(1).classList.contains('is-active')).toBe(false);
    expect(slot(1).classList.contains('is-affordable')).toBe(true); // heavy head 30
    expect(slot(3).classList.contains('is-tooExpensive')).toBe(true); // flamer 120
    expect(slot(5).classList.contains('is-held')).toBe(true);
    for (const n of [1, 2, 3, 4, 5]) {
      expect(slot(n).className.match(/is-(affordable|tooExpensive|owned|held)/g)).toHaveLength(1);
    }
  });

  it('shows the fuel gauge only with the flamethrower, and blocker and surge time left (Req 11.3)', () => {
    const { tray, parent } = setup();
    const fuel = parent.querySelector('.shop-fuel') as HTMLElement;
    const blocker = parent.querySelector('.shop-blocker') as HTMLElement;
    const surge = parent.querySelector('.shop-surge') as HTMLElement;
    tray.update(stateWith({}));
    expect(fuel.hidden).toBe(true);
    expect(blocker.hidden).toBe(true);
    expect(surge.hidden).toBe(true);

    const e = createEconomyState();
    tray.update(stateWith({ owned: ['flamethrower'], fuel: e.fuel / 2, blockerUntilTick: 100, surgeUntilTick: 400 }, 10));
    expect(fuel.hidden).toBe(false);
    expect((parent.querySelector('.shop-fuel-fill') as HTMLElement).style.width).toBe('50%');
    expect(blocker.hidden).toBe(false);
    expect(blocker.textContent).toBe('BLOCK 2s');
    expect(surge.textContent).toBe('SURGE 7s');
  });

  it('secondsLeft rounds up and is null once over', () => {
    expect(secondsLeft(null, 0)).toBeNull();
    expect(secondsLeft(60, 60)).toBeNull();
    expect(secondsLeft(61, 0)).toBe(2);
  });
});

describe('economy sounds (Req 12.1)', () => {
  it('maps events to sounds once per frame, in order of first occurrence', () => {
    const events = [
      { type: 'itemBought', item: 'saw', price: 60 },
      { type: 'packetCollected', id: 1, kb: 5 },
      { type: 'packetCollected', id: 2, kb: 5 },
      { type: 'buyRejected', slot: 3, reason: 'tooExpensive' },
      { type: 'modemHit', kind: 'default', amount: 4 },
      { type: 'modemHitBlocked', kind: 'default', amount: 4 },
      { type: 'surgeStarted' },
      { type: 'blockerStarted' },
    ] as unknown as GameEvent[];
    expect(economySoundsFor(events)).toEqual(['buyChime', 'coinBlip', 'rejectBuzz', 'zap', 'surgeHum', 'blockerSweep']);
    expect(economySoundsFor([])).toEqual([]);
  });
});
