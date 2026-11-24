// walletSystem: KB in and out, packets, the pop-up blocker and the item timers (design
// "walletSystem"). Runs after the ad systems and reads this tick's events once, in order.
// Does nothing until an EconomyState exists. Pure: no DOM, timers or Math.random.
import { secondsToTicks } from '../balance/lane';
import type { System, TickContext } from '../context';
import { removeAd } from '../ads/adSystems';
import type { EconomyState, KbReason, Packet } from './economyTypes';

/** Packets sit on the line at this height (design: packet at (x, 12)). */
export const PACKET_Y = 12;

type Mutable<T> = { -readonly [K in keyof T]: T[K] };

function addKb(e: Mutable<EconomyState>, ctx: TickContext, delta: number, reason: KbReason): void {
  if (delta === 0) return;
  if (delta > 0) e.gained += delta;
  else e.lost += -delta;
  e.wallet += delta;
  ctx.emit({ type: 'kbChanged', delta, reason, wallet: e.wallet });
}

export const walletSystem: System = (draft, ctx) => {
  if (draft.economy === undefined) return;
  const e: Mutable<EconomyState> = { ...draft.economy };
  let packets: Packet[] = [...e.packets];

  const b = e.balance;
  const comboWindow = secondsToTicks(b.comboWindowSeconds);
  for (const ev of ctx.eventsSoFar()) {
    if (ev.type === 'mobKilled') {
      if (ev.dropKb > 0) {
        const id = e.nextPacketId++;
        packets.push({ id, x: ev.x, kb: ev.dropKb, dropTick: ctx.tick });
        ctx.emit({ type: 'packetDropped', id, x: ev.x, kb: ev.dropKb });
      }
      // Combo (Req 5.2-5.4): non-glob kills chain one by one, same-tick kills included.
      if (ev.kind !== 'glob') {
        e.comboCount =
          e.lastKillTick !== null && ctx.tick - e.lastKillTick <= comboWindow ? e.comboCount + 1 : 1;
        e.lastKillTick = ctx.tick;
        e.bestCombo = Math.max(e.bestCombo, e.comboCount);
        if (e.comboCount >= b.comboStart) {
          ctx.emit({ type: 'combo', count: e.comboCount });
          addKb(e, ctx, b.comboBonusKb, 'combo');
        }
      }
    } else if (ev.type === 'adClosed') {
      addKb(e, ctx, ev.rewardKb, 'adClosed');
    } else if (ev.type === 'fakeButtonClicked') {
      addKb(e, ctx, -Math.min(e.balance.fakeLossKb, e.wallet), 'fakeButton');
    }
  }

  // Pickups, in id order (packets are kept sorted by id).
  const p = e.pointer;
  if (p !== null) {
    const r2 = e.balance.pickupRadius * e.balance.pickupRadius;
    const kept: Packet[] = [];
    for (const pk of packets) {
      const dx = p.x - pk.x;
      const dy = p.y - PACKET_Y;
      if (dx * dx + dy * dy <= r2) {
        ctx.emit({ type: 'packetCollected', id: pk.id, kb: pk.kb });
        addKb(e, ctx, pk.kb, 'packet');
      } else kept.push(pk);
    }
    packets = kept;
  }

  // Expiry: exactly packetLifetimeSeconds after the drop.
  const life = secondsToTicks(e.balance.packetLifetimeSeconds);
  packets = packets.filter((pk) => {
    if (ctx.tick - pk.dropTick < life) return true;
    ctx.emit({ type: 'packetExpired', id: pk.id });
    return false;
  });
  e.packets = packets;

  // Blocker: clear every clutter ad (existing and newly opened) while it runs, then end it.
  if (e.blockerUntilTick !== null) {
    if (ctx.tick < e.blockerUntilTick) {
      if (draft.ads !== undefined) {
        let ads = draft.ads;
        for (const ad of draft.ads.ads) {
          if (ad.kind !== 'clutter') continue;
          ads = removeAd(ads, ad.id);
          ctx.emit({ type: 'adBlocked', id: ad.id });
        }
        draft.ads = ads;
      }
    } else {
      e.blockerUntilTick = null;
      ctx.emit({ type: 'blockerEnded' });
    }
  }

  if (e.surgeUntilTick !== null && ctx.tick >= e.surgeUntilTick) {
    e.surgeUntilTick = null;
    ctx.emit({ type: 'surgeEnded' });
  }

  draft.economy = e;
};
