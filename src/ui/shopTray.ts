// Lane_HUD shop tray (Req 11, 4.6, 8.6): KB counter, five shop slots, the weapon in the hand,
// fuel gauge, blocker and surge time left. Reads state only; clicks send commands.
//
// Each slot shows its key as a boxed key cap on the first line, apart from the price on the
// second line, so "1" and "30 KB" never read as "130 KB" (playtest 25 Nov).
//
// - Slots 1–3 are weapons. The main button equips the weapon when owned, else buys it. Below it
//   a separate upgrade button buys the weapon's upgrade (Shift + key on the keyboard). The
//   upgrade button shows only once the weapon is owned.
// - Slots 4–5 are one-use items: one button that buys.
import { h } from '../core/h';
import {
  maxFuel,
  nextItem,
  slotReadyTick,
  ownedWeapons,
  slotStatus,
  type EconomyCommand,
  type EconomyState,
  type ItemId,
  type ShopSlot,
  type SlotStatus,
} from '../game/economy';
import { TICK_RATE, type GameState } from '../game/types';
import { ECONOMY_COPY, kbText } from './economyCopy';
import { commandForSlot, isWeaponSlot, SLOT_WEAPON } from './weaponControls';

export type TraySender = (command: EconomyCommand) => void;
/** Kept for callers that only buy. */
export type BuySender = TraySender;

const SLOTS: readonly ShopSlot[] = [1, 2, 3, 4, 5];
const STATUS_CLASSES: readonly SlotStatus[] = ['affordable', 'tooExpensive', 'owned', 'held', 'cooldown'];
const UPGRADE_OF: Readonly<Record<1 | 2 | 3, 'heavyHead' | 'highRpm' | 'bigTank'>> = {
  1: 'heavyHead',
  2: 'highRpm',
  3: 'bigTank',
};

export interface UpgradeView {
  /** "+HEAVY". */
  readonly label: string;
  /** "30 KB", or "MAXED" once owned. */
  readonly price: string;
  readonly status: SlotStatus;
}

export interface SlotView {
  /** Key cap text, "1".."5". */
  readonly key: string;
  readonly name: string;
  /** Second line: a price, "IN HAND" or "READY". */
  readonly line: string;
  /** Status of the main button. A weapon that is owned is `owned` (equip, not greyed). */
  readonly status: SlotStatus;
  readonly isWeapon: boolean;
  /** True for the weapon in the hand. */
  readonly active: boolean;
  /** The upgrade button, for owned weapons only. */
  readonly upgrade: UpgradeView | null;
}

function price(e: EconomyState, item: ItemId): string {
  return `${e.balance.prices[item]}${ECONOMY_COPY.priceSuffix}`;
}

/** Pure view of one slot on `tick` (one-use items show their cooldown). */
export function slotView(slot: ShopSlot, e: EconomyState, tick = 0): SlotView {
  const key = String(slot);
  if (isWeaponSlot(slot)) {
    const weapon = SLOT_WEAPON[slot];
    const owned = ownedWeapons(e).includes(weapon);
    const name = ECONOMY_COPY.weapons[weapon];
    if (!owned) {
      // The slot's next item is the weapon itself (the hammer is always owned).
      return { key, name, line: price(e, weapon as ItemId), status: slotStatus(slot, e), isWeapon: true, active: false, upgrade: null };
    }
    const active = e.active === weapon;
    const up = UPGRADE_OF[slot];
    const upOwned = e.owned.includes(up);
    const upgrade: UpgradeView = {
      label: `${ECONOMY_COPY.upgradeMark}${ECONOMY_COPY.upgrades[up]}`,
      price: upOwned ? ECONOMY_COPY.soldOut : price(e, up),
      status: upOwned ? 'owned' : slotStatus(slot, e),
    };
    return {
      key,
      name,
      line: active ? ECONOMY_COPY.inHand : ECONOMY_COPY.stowed,
      status: 'owned',
      isWeapon: true,
      active,
      upgrade,
    };
  }
  const item = nextItem(slot, e);
  const status = slotStatus(slot, e, tick);
  const wait = secondsLeft(slotReadyTick(slot, e), tick);
  return {
    key,
    name: item === null ? '' : ECONOMY_COPY.items[item],
    line: item === null ? ECONOMY_COPY.soldOut : status === 'cooldown' && wait !== null ? ECONOMY_COPY.cooldownText(wait) : price(e, item),
    status,
    isWeapon: false,
    active: false,
    upgrade: null,
  };
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
  readonly root: HTMLElement;
  readonly name: HTMLElement;
  readonly line: HTMLElement;
  readonly upgrade: HTMLButtonElement | null;
  readonly upLabel: HTMLElement | null;
  readonly upPrice: HTMLElement | null;
}

/** Text setter that only writes when the value changed. */
function setText(el: HTMLElement, text: string): void {
  if (el.textContent !== text) el.textContent = text;
}

function toggleStatus(el: HTMLElement, status: SlotStatus): void {
  for (const c of STATUS_CLASSES) el.classList.toggle(`is-${c}`, c === status);
}

export function createShopTray(send: TraySender): ShopTray {
  const kb = h('span', { className: 'shop-kb' }, kbText(0));
  const slotEls = new Map<ShopSlot, SlotEls>();
  const fuelFill = h('div', { className: 'shop-fuel-fill' });
  const fuel = h(
    'div',
    { className: 'shop-fuel', attrs: { hidden: '' } },
    h('span', { className: 'shop-fuel-label' }, ECONOMY_COPY.fuelLabel),
    h('div', { className: 'shop-fuel-bar', attrs: { 'aria-hidden': 'true' } }, fuelFill),
  );
  const slotNodes = SLOTS.map((slot) => {
    const name = h('span', { className: 'shop-slot-name' });
    const line = h('span', { className: 'shop-slot-line' });
    const main = h(
      'button',
      {
        className: 'shop-slot-main',
        attrs: {
          type: 'button',
          ...(isWeaponSlot(slot) ? { title: ECONOMY_COPY.weaponTitle(slot) } : {}),
        },
      },
      h('span', { className: 'shop-slot-head' }, h('span', { className: 'shop-key', attrs: { 'aria-hidden': 'true' } }, String(slot)), name),
      line,
    );
    let upgrade: HTMLButtonElement | null = null;
    let upLabel: HTMLElement | null = null;
    let upPrice: HTMLElement | null = null;
    if (isWeaponSlot(slot)) {
      upLabel = h('span', { className: 'shop-upgrade-label' });
      upPrice = h('span', { className: 'shop-upgrade-price' });
      upgrade = h(
        'button',
        { className: 'shop-slot-upgrade', attrs: { type: 'button', hidden: '', title: ECONOMY_COPY.upgradeTitle(slot) } },
        upLabel,
        upPrice,
      );
    }
    const root = h(
      'div',
      { className: `shop-slot${isWeaponSlot(slot) ? ' is-weapon' : ''}`, attrs: { 'data-slot': String(slot) } },
      main,
      ...(upgrade === null ? [] : [upgrade]),
      // The fuel gauge lives in the flamethrower slot.
      ...(slot === 3 ? [fuel] : []),
    );
    slotEls.set(slot, { root, name, line, upgrade, upLabel, upPrice });
    return root;
  });
  const blocker = h('span', { className: 'shop-timer shop-blocker', attrs: { hidden: '' } });
  const surge = h('span', { className: 'shop-timer shop-surge', attrs: { hidden: '' } });
  const el = h(
    'div',
    { className: 'shop-tray shop-tray--top' },
    kb,
    h('div', { className: 'shop-slots' }, ...slotNodes),
    blocker,
    surge,
  );
  let economy: EconomyState | undefined;
  const onClick = (e: MouseEvent): void => {
    const target = e.target as Element | null;
    const slotEl = target?.closest<HTMLElement>('.shop-slot');
    if (!slotEl || !el.contains(slotEl)) return;
    const slot = Number(slotEl.dataset.slot);
    if (!(slot >= 1 && slot <= 5)) return;
    const upgrade = (target?.closest('.shop-slot-upgrade') ?? null) !== null;
    send(commandForSlot(slot as ShopSlot, economy, upgrade));
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
      economy = e;
      setText(kb, kbText(e.wallet));
      for (const slot of SLOTS) {
        const v = slotView(slot, e, state.tick);
        const s = slotEls.get(slot)!;
        setText(s.name, v.name);
        setText(s.line, v.line);
        toggleStatus(s.root, v.status);
        s.root.classList.toggle('is-active', v.active);
        if (s.upgrade !== null && s.upLabel !== null && s.upPrice !== null) {
          s.upgrade.hidden = v.upgrade === null;
          if (v.upgrade !== null) {
            setText(s.upLabel, v.upgrade.label);
            setText(s.upPrice, v.upgrade.price);
            toggleStatus(s.upgrade, v.upgrade.status);
          }
        }
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
