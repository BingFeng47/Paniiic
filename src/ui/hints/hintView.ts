/**
 * Hint_View (player-guide Req 2.2, 2.5, 2.6, 3.2-3.6): a read-only Session_View that shows one
 * Hint_Balloon at a time in the session overlay.
 *
 * DOM:
 *   div.hint-layer (in overlayHost, above .ad-layer, below the Result_Screen; pointer-events none)
 *     div.hint-balloon (pointer-events auto, absolutely placed in Screen pixels)
 *       span.hint-title, p.hint-body, button.hint-close "✕", svg.hint-tail (constant markup)
 *
 * The view never calls `ctx.send`, so a Run is the same with or without it (Req 3.4). The queue
 * lives in this closure, never in GameState.
 */
import type { Voice } from '../../core/audio';
import { h } from '../../core/h';
import type { SessionContext, SessionView } from '../../dialup/session';
import type { GameEvent, GameState } from '../../game/types';
import { GUIDE_COPY } from '../guideCopy';
import { BALLOON_POP_SEC, balloonPop } from './hintSounds';
import { anchorPoint, BALLOON_SIZE, placeBalloon, realLinkRect } from './hintPlacement';
import { createHintQueue, dismiss, pushDue, tickQueue, type CurrentHint, type HintQueue } from './hintQueue';
import { dueHints } from './hintTriggers';

const SVG_NS = 'http://www.w3.org/2000/svg';
/** Tail size in pixels; the constant triangle points down (+y) before rotation. */
const TAIL_W = 16;
const TAIL_H = 12;

/** Constant tail markup, built with DOM calls (no game text involved). */
function tailSvg(): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'hint-tail');
  svg.setAttribute('width', String(TAIL_W));
  svg.setAttribute('height', String(TAIL_H));
  svg.setAttribute('viewBox', `0 0 ${TAIL_W} ${TAIL_H}`);
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('d', `M0 0 L${TAIL_W / 2} ${TAIL_H} L${TAIL_W} 0`);
  svg.appendChild(path);
  return svg;
}

export function createHintView(): SessionView {
  let layer: HTMLDivElement | null = null;
  let queue: HintQueue | null = null;
  let shownCurrent: CurrentHint | null = null;
  let prev: GameState | null = null;
  let lastTick = 0;
  let ctx: SessionContext | null = null;
  let voices: Voice[] = [];
  let warned = false;

  const clearBalloon = (): void => {
    layer?.replaceChildren();
  };

  const buildBalloon = (current: CurrentHint, state: GameState): void => {
    if (!layer) return;
    const copy = GUIDE_COPY.hints[current.id];
    const anchor = anchorPoint(current.anchor, state);
    const { rect, tail } = placeBalloon(anchor, BALLOON_SIZE, [realLinkRect(state)]);

    const title = h('span', { className: 'hint-title' });
    title.textContent = copy.title;
    const body = h('p', { className: 'hint-body' });
    body.textContent = copy.body;
    const close = h('button', {
      className: 'hint-close',
      attrs: { type: 'button', 'aria-label': 'Close hint' },
      on: {
        click: (e) => {
          e.stopPropagation();
          if (queue) queue = dismiss(queue, lastTick);
          sync(prev);
        },
      },
    });
    close.textContent = '✕';

    const svg = tailSvg();
    const angle = (Math.atan2(tail.to.y - tail.from.y, tail.to.x - tail.from.x) * 180) / Math.PI - 90;
    svg.style.left = `${tail.from.x - rect.x - TAIL_W / 2}px`;
    svg.style.top = `${tail.from.y - rect.y}px`;
    svg.style.transform = `rotate(${angle}deg)`;

    const balloon = h('div', { className: 'hint-balloon', attrs: { role: 'status', 'data-hint': current.id } }, title, close, body, svg);
    balloon.style.left = `${rect.x}px`;
    balloon.style.top = `${rect.y}px`;
    balloon.style.width = `${rect.w}px`;
    balloon.style.height = `${rect.h}px`;
    layer.replaceChildren(balloon);

    if (ctx) {
      voices.push(ctx.audio.play(balloonPop, BALLOON_POP_SEC, 'sfx'));
      if (voices.length > 16) voices = voices.slice(-16);
    }
  };

  /** Rebuilds the DOM only when the current Hint changed. */
  const sync = (state: GameState | null): void => {
    const current = queue?.current ?? null;
    if (current === shownCurrent) return;
    shownCurrent = current;
    if (current && state) buildBalloon(current, state);
    else clearBalloon();
  };

  return {
    mount(context) {
      ctx = context;
      prev = null;
      shownCurrent = null;
      queue = null;
      if (!context.overlayHost) {
        if (!warned) {
          warned = true;
          console.warn('Hint_View: no overlayHost; hints are off for this Session.');
        }
        return;
      }
      // Missing means true (Req 4.6); off means no queue and no balloons.
      if (context.prefs?.hintsEnabled === false) return;
      queue = createHintQueue();
      layer = h('div', { className: 'hint-layer', attrs: { 'aria-live': 'polite' } });
      context.overlayHost.appendChild(layer);
    },
    update(state: GameState, events: readonly GameEvent[]) {
      if (!queue) return;
      lastTick = state.tick;
      queue = pushDue(queue, dueHints(prev, state, events), state.tick);
      queue = tickQueue(queue, state.tick);
      prev = state;
      sync(state);
    },
    unmount() {
      for (const v of voices) v.stop();
      voices = [];
      layer?.remove();
      layer = null;
      queue = null;
      shownCurrent = null;
      prev = null;
      ctx = null;
    },
  };
}
