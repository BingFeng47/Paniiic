// Lane_HUD shop tray (Req 11, 4.6, 8.6): KB counter, five shop slots, active weapon ring,
// fuel gauge, blocker and surge time left. Reads state only; clicking a slot sends a `buy`.
import { h } from '../core/h';
import {
  maxFuel,
  nextItem,
  slotStatus,
  type BuyCommand,
  type EconomyState,
  type ShopSlot,
  type SlotStatus,
  type WeaponId,
} from '../game/economy';
import { TICK_RATE, type GameState } from '../game/types';
import { ECONOMY_COPY, kbText } from './economyCopy';

export type BuySender = (command: BuyCommand) => void;

const SLOTS: readonly ShopSlot[] = [1, 2, 3, 4, 5];
const STATUS_CLASSES: readonly SlotStatus[] = ['affordable', 'tooExpensive', 'owned', 'held'];
/** Which slot's weapon an active weapon belongs to. */
const WEAPON_SLOT: Readonly<Record<WeaponId, ShopSlot>> = { hammer: 1, saw: 2, flamethrower: 3 };

export interface SlotView {
  readonly name: string;
  readonly price: string;
  readonly status: SlotStatus;
  readonly active: boolean;
}

/** Pure view of one slot. */
export function slotView(slot: ShopSlot, e: EconomyState): SlotView {
  const item = nextItem(slot, e);
  const status = slotStatus(slot, e);
  const name =
    item !== null
      ? ECONOMY_COPY.items[item]
      : slot === 1 || slot === 2 || slot === 3
        ? ECONOMY_COPY.ownedSlotNames[slot]
        : '';
  const price = item === null ? ECONOMY_COPY.soldOut : `${e.balance.prices[item]}${ECONOMY_COPY.priceSuffix}`;
  return { name, price, status, active: WEAPON_SLOT[e.active] === slot };
}

/** Whole seconds left until `untilTick`, rounded up; null when not running. */
export function secondsLeft(untilTick: number | null, tick: number): number | null {
  if (untilTick === null || untilTick <= tick) return null;
  return Math.ceil((untilTick - tick) / TICK_RATE);
}

export interface ShopTray {
  readonly el: HTMLElement;
  mount(parent: HTMLElement): void;
  unmount(): void;
  update(state: GameState): void;
}

interface SlotEls {
  readonly root: HTMLButtonElement;
  readonly name: HTMLElement;
  readonly price: HTMLElement;
  readonly status: HTMLElement;
}

/** Text setter that only writes when the value changed. */
function setText(el: HTMLElement, text: string): void {
  if (el.textContent !== text) el.textContent = text;
}

export function createShopTray(send: BuySender): ShopTray {
  const kb = h('span', { className: 'shop-kb' }, kbText(0));
  const slotEls = new Map<ShopSlot, SlotEls>();
  const slotNodes = SLOTS.map((slot) => {
    const name = h('span', { className: 'shop-slot-name' });
    const price = h('span', { className: 'shop-slot-price' });
    const status = h('span', { className: 'shop-slot-status' });
    const root = h(
      'button',
      { className: 'shop-slot', attrs: { type: 'button', 'data-slot': String(slot) } },
      h('span', { className: 'shop-slot-key' }, String(slot)),
      name,
      price,
      status,
    );
    slotEls.set(slot, { root, name, price, status });
    return root;
  });
  const fuelFill = h('div', { className: 'shop-fuel-fill' });
  const fuel = h(
    'div',
    { className: 'shop-fuel', attrs: { hidden: '' } },
    h('span', { className: 'shop-fuel-label' }, ECONOMY_COPY.fuelLabel),
    h('div', { className: 'shop-fuel-bar', attrs: { 'aria-hidden': 'true' } }, fuelFill),
  );
  const blocker = h('span', { className: 'shop-timer shop-blocker', attrs: { hidden: '' } });
  const surge = h('span', { className: 'shop-timer shop-surge', attrs: { hidden: '' } });
  const el = h(
    'div',
    { className: 'shop-tray shop-tray--top' },
    kb,
    h('div', { className: 'shop-slots' }, ...slotNodes),
    fuel,
    blocker,
    surge,
  );

  const onClick = (e: MouseEvent): void => {
    const target = (e.target as Element | null)?.closest<HTMLElement>('.shop-slot');
    if (!target || !el.contains(target)) return;
    const slot = Number(target.dataset.slot);
    if (slot >= 1 && slot <= 5) send({ type: 'buy', slot: slot as ShopSlot });
  };
  // Keep the click from reaching the lane canvas underneath.
  const stop = (e: Event): void => e.stopPropagation();

  let mounted = false;
  return {
    el,
    mount(parent) {
      if (mounted) return;
      mounted = true;
      el.addEventListener('click', onClick);
      el.addEventListener('pointerdown', stop);
      parent.appendChild(el);
    },
    unmount() {
      if (!mounted) return;
      mounted = false;
      el.removeEventListener('click', onClick);
      el.removeEventListener('pointerdown', stop);
      el.remove();
    },
    update(state) {
      const e = state.economy;
      if (e === undefined) return;
      setText(kb, kbText(e.wallet));
      for (const slot of SLOTS) {
        const v = slotView(slot, e);
        const s = slotEls.get(slot)!;
        setText(s.name, v.name);
        setText(s.price, v.price);
        setText(s.status, ECONOMY_COPY.status[v.status]);
        for (const c of STATUS_CLASSES) s.root.classList.toggle(`is-${c}`, c === v.status);
        s.root.classList.toggle('is-active', v.active);
      }
      const hasFlamer = e.owned.includes('flamethrower');
      fuel.hidden = !hasFlamer;
      if (hasFlamer) {
        const pct = `${Math.round(Math.min(1, Math.max(0, e.fuel / maxFuel(e))) * 100)}%`;
        if (fuelFill.style.width !== pct) fuelFill.style.width = pct;
        fuel.classList.toggle('is-latched', e.flameLatched);
      }
      const b = secondsLeft(e.blockerUntilTick, state.tick);
      blocker.hidden = b === null;
      if (b !== null) setText(blocker, `${ECONOMY_COPY.blockerLabel} ${b}${ECONOMY_COPY.secondsSuffix}`);
      const sLeft = secondsLeft(e.surgeUntilTick, state.tick);
      surge.hidden = sLeft === null && !e.surgeHeld;
      if (sLeft !== null) setText(surge, `${ECONOMY_COPY.surgeLabel} ${sLeft}${ECONOMY_COPY.secondsSuffix}`);
      else if (e.surgeHeld) setText(surge, `${ECONOMY_COPY.surgeLabel} ${ECONOMY_COPY.surgeHeld}`);
    },
  };
}
