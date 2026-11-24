// The surge guard: every modem hit from a Mob or a Glob goes through hitModem (economy-weapons
// Req 10.1, 10.2). Without an EconomyState it is exactly ctx.damageModem(amount).
import { secondsToTicks } from '../balance/lane';
import type { TickContext } from '../context';
import type { EnemyKind } from '../laneTypes';
import type { MutableGameState } from '../types';

/**
 * A held surge protector switches on at this hit and blocks every modem hit for surgeSeconds,
 * this one included. A blocked hit emits `modemHitBlocked` instead of damaging the modem.
 */
export function hitModem(
  draft: MutableGameState,
  ctx: TickContext,
  kind: EnemyKind,
  amount: number,
): void {
  let e = draft.economy;
  // A window that ends on this tick is over before the hit lands, even though walletSystem
  // (which runs later in the tick) has not cleared it yet. End it here so a held surge can
  // switch on at this hit.
  if (e !== undefined && e.surgeUntilTick !== null && ctx.tick >= e.surgeUntilTick) {
    e = { ...e, surgeUntilTick: null };
    draft.economy = e;
    ctx.emit({ type: 'surgeEnded' });
  }
  if (e !== undefined && e.surgeUntilTick === null && e.surgeHeld) {
    e = { ...e, surgeHeld: false, surgeUntilTick: ctx.tick + secondsToTicks(e.balance.surgeSeconds) };
    draft.economy = e;
    ctx.emit({ type: 'surgeStarted' });
  }
  if (e !== undefined && e.surgeUntilTick !== null && ctx.tick < e.surgeUntilTick) {
    ctx.emit({ type: 'modemHitBlocked', kind, amount });
    return;
  }
  ctx.damageModem(amount);
}
