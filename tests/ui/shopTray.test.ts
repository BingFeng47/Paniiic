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

  it('an owned weapon slot equips; its upgrade button buys the upgrade', () => {
    const { sent, tray, slot } = setup();
    tray.update(stateWith({ wallet: 100, owned: ['saw'], active: 'saw' }));
    (slot(1).querySelector('.shop-slot-main') as HTMLElement).click();
    (slot(1).querySelector('.shop-slot-upgrade') as HTMLElement).click();
    (slot(2).querySelector('.shop-key') as HTMLElement).click();
    expect(sent).toEqual([
      { type: 'equipWeapon', weapon: 'hammer' },
      { type: 'buy', slot: 1 },
      { type: 'equipWeapon', weapon: 'saw' },
    ]);
  });

  it('shows the key in its own key cap, apart from the price (playtest 25 Nov)', () => {
    const { tray, slot } = setup();
    tray.update(stateWith({ wallet: 0 }));
    const s4 = slot(4);
    expect(s4.querySelector('.shop-key')?.textContent).toBe('4');
    expect(s4.querySelector('.shop-slot-line')?.textContent).toBe('40 KB');
    // The key and the price are different elements on different lines.
    expect(s4.querySelector('.shop-slot-head')?.contains(s4.querySelector('.shop-slot-line'))).toBe(false);
    for (const n of [1, 2, 3, 4, 5]) {
      expect(slot(n).querySelector('.shop-key')?.textContent).toBe(String(n));
      // The key never shares a text node with the price line.
      expect(slot(n).querySelector('.shop-slot-line')?.querySelector('.shop-key')).toBeNull();
    }
  });

  it('shows slot states, the weapon in the hand and upgrade buttons (Req 11.2)', () => {
    const { tray, slot } = setup();
    tray.update(stateWith({ wallet: 60, owned: ['saw'], active: 'saw', surgeHeld: true }));
    expect(slot(2).classList.contains('is-active')).toBe(true);
    expect(slot(1).classList.contains('is-active')).toBe(false);
    expect(slot(2).querySelector('.shop-slot-line')?.textContent).toBe('IN HAND');
    expect(slot(1).querySelector('.shop-slot-line')?.textContent).toBe('READY');
    // Owned weapons are equippable, so they are not greyed out.
    expect(slot(1).classList.contains('is-owned')).toBe(true);
    const up1 = slot(1).querySelector('.shop-slot-upgrade') as HTMLButtonElement;
    expect(up1.hidden).toBe(false);
    expect(up1.classList.contains('is-affordable')).toBe(true); // heavy head 30
    expect(up1.textContent).toBe('UPG HEAVY30 KB');
    const up2 = slot(2).querySelector('.shop-slot-upgrade') as HTMLButtonElement;
    expect(up2.classList.contains('is-affordable')).toBe(true); // high RPM 50 <= 60
    // Flamethrower not owned: its slot sells it and shows no upgrade button.
    expect(slot(3).classList.contains('is-tooExpensive')).toBe(true); // flamer 150
    expect((slot(3).querySelector('.shop-slot-upgrade') as HTMLButtonElement).hidden).toBe(true);
    expect(slot(5).classList.contains('is-held')).toBe(true);
    for (const n of [1, 2, 3, 4, 5]) {
      expect(slot(n).className.match(/is-(affordable|tooExpensive|owned|held)/g)).toHaveLength(1);
    }
  });

  it('shows "WAIT Ns" on a one-use item while it cools down, then its price again', () => {
    const { tray, slot } = setup();
    tray.update(stateWith({ wallet: 100, blockerReadyTick: 600 }, 0));
    expect(slot(4).querySelector('.shop-slot-line')?.textContent).toBe('WAIT 10s');
    expect(slot(4).classList.contains('is-cooldown')).toBe(true);
    tray.update(stateWith({ wallet: 100, blockerReadyTick: 600 }, 600));
    expect(slot(4).querySelector('.shop-slot-line')?.textContent).toBe('40 KB');
    expect(slot(4).classList.contains('is-affordable')).toBe(true);
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
