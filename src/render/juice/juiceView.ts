/**
 * Juice_View (juice-and-endings Requirements 1, 2, 3, 6.2, 6.3, 9.1).
 *
 *   div.screen-content (the Monitor's `.screen`)  ← Screen_Shake_Offset as a CSS transform
 *     div.scene-desktop
 *       ... div.session-overlay (z 3)
 *       div.juice-layer (z 5: above the session overlay, below the Result_Screen at z 6)
 *         div.crack-overlay[data-stage]           constant SVG from crackArt.ts
 *         div.corruption-overlay[data-level][data-front] > div.corruption-text
 *
 * The shake moves the whole `.screen` element, and the Monitor's `toScreenPoint` reads that
 * element's bounding rect, so clicks during a shake land on what is shown (Req 1.4).
 * Crack markup is parsed with DOMParser from constant SVG (no game text).
 * The view only reads state; all juice data lives in this closure (Req 9.2).
 */
import type { SessionContext, SessionView } from '../../dialup/session';
import { h } from '../../core/h';
import type { Voice } from '../../core/audio';
import type { GameEvent, GameState } from '../../game/types';
import { createFlashBudget, type FlashBudget } from '../flashBudget';
import { CRACK_SVG } from './crackArt';
import { JUICE_TUNING } from './juiceTuning';
import { applyJuiceEvents, EMPTY_JUICE, fadeOpacity, shakeOffset, type JuiceState } from './juiceState';
import { chapterSting, glassCrack, JUICE_LOOP_SEC, JUICE_SOUND_SEC, modemAlarm } from './juiceSounds';

/** Constant garbled strip; set through textContent, never innerHTML. */
const GARBLED_TEXT =
  '�#@!% C0NN3CT10N L0ST ▒▒▓ 0xDEADBEEF ░░ HOMEW0RK.Z1P ▓▒ ERR#666 ░▒▓ ¿¿¿ NO CARRIER ▒░ ';

const STING_CHAPTERS: ReadonlySet<string> = new Set(['midpoint', 'pinch2', 'plotTurn2']);

/** Parses the compile-time constant crack markup from crackArt.ts (never game or ad text). */
function crackSvg(stage: 1 | 2 | 3): Node {
  const doc = new DOMParser().parseFromString(CRACK_SVG[stage], 'image/svg+xml');
  return document.importNode(doc.documentElement, true);
}

export interface JuiceViewDeps {
  /** The Session's shared flash budget (Req 8.1). A private one is made when absent. */
  readonly flashBudget?: FlashBudget;
}

export function createJuiceView(deps: JuiceViewDeps = {}): SessionView {
  let ctx: SessionContext | null = null;
  let layer: HTMLElement | null = null;
  let crack: HTMLElement | null = null;
  let corruption: HTMLElement | null = null;
  let shakeTarget: HTMLElement | null = null;
  let alarm: Voice | null = null;
  let juice: JuiceState = EMPTY_JUICE;
  let shakeOn = true;
  let budget: FlashBudget = deps.flashBudget ?? createFlashBudget();

  const stopAlarm = (): void => {
    alarm?.stop();
    alarm = null;
  };

  const flash = (tick: number): void => {
    if (layer) layer.dataset.flash = budget.requestFlash(tick);
  };

  return {
    mount(context) {
      ctx = context;
      juice = EMPTY_JUICE;
      budget = deps.flashBudget ?? createFlashBudget();
      shakeOn = context.prefs?.screenShake ?? true;
      crack = h('div', { className: 'crack-overlay', attrs: { 'data-stage': '0', 'aria-hidden': 'true' } });
      const text = h('div', { className: 'corruption-text' });
      text.textContent = GARBLED_TEXT.repeat(4);
      corruption = h(
        'div',
        { className: 'corruption-overlay', attrs: { 'data-level': '0', 'data-front': 'browser', 'aria-hidden': 'true' } },
        text,
      );
      layer = h('div', { className: shakeOn ? 'juice-layer' : 'juice-layer is-still' }, crack, corruption);
      const host = context.overlayHost.parentElement ?? context.overlayHost;
      host.appendChild(layer);
      shakeTarget = (context.overlayHost.closest('.screen-content') as HTMLElement | null) ?? null;
    },

    update(state: GameState, events: readonly GameEvent[]) {
      if (!ctx || !layer || !crack || !corruption) return;
      const prev = juice;
      juice = applyJuiceEvents(prev, events, state, shakeOn);
      const tick = state.tick;
      delete layer.dataset.flash;

      // Cracks (Req 2.1, 2.4): highest stage, one sound per rise.
      if (juice.crackStage !== prev.crackStage) {
        crack.dataset.stage = String(juice.crackStage);
        const stage = juice.crackStage;
        if (stage !== 0) crack.replaceChildren(crackSvg(stage));
        flash(tick);
      }
      if (juice.pendingCrackSound) ctx.audio.play(glassCrack, JUICE_SOUND_SEC.glassCrack, 'sfx');

      // Corruption (Req 3.1, 3.2).
      if (juice.corruption !== prev.corruption) {
        corruption.dataset.level = String(juice.corruption);
        corruption.dataset.front = juice.corruption === 2 ? 'both' : 'browser';
        if (juice.corruption === 2) flash(tick);
      }

      // Alarm loop while critical (Req 6.2).
      if (juice.critical && !alarm) alarm = ctx.audio.play(modemAlarm, JUICE_LOOP_SEC, 'sfx', { keep: true });
      else if (!juice.critical && alarm) stopAlarm();

      // One sting per chapter event (Req 6.3).
      for (const e of events) {
        if (e.type === 'chapterStarted' && STING_CHAPTERS.has(e.id)) {
          ctx.audio.play(chapterSting, JUICE_SOUND_SEC.chapterSting, 'sfx');
        }
      }

      // Win fade (Req 7.2).
      const opacity = fadeOpacity(juice, tick);
      layer.style.opacity = opacity < 1 ? String(opacity) : '';

      // Shake (Req 1.1–1.3).
      if (shakeTarget) {
        const { dx, dy } = shakeOn ? shakeOffset(juice, tick) : { dx: 0, dy: 0 };
        shakeTarget.style.transform = dx === 0 && dy === 0 ? '' : `translate(${dx}px, ${dy}px)`;
      }
    },

    endFrame(final, t) {
      // Win fade (Req 7.2): crack and corruption overlays go from opacity 1 to 0 over the
      // End_Transition. The shake is cleared so the result opens on a still screen.
      if (!layer || final.phase !== 'won') return;
      const n = JUICE_TUNING.transitionTicks;
      layer.style.opacity = String(Math.max(0, Math.min(1, 1 - t / n)));
      if (shakeTarget) shakeTarget.style.transform = '';
    },
    unmount() {
      stopAlarm();
      if (shakeTarget) shakeTarget.style.transform = '';
      layer?.remove();
      layer = crack = corruption = shakeTarget = null;
      ctx = null;
      juice = EMPTY_JUICE;
    },
  };
}
