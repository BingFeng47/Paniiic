/**
 * Window_Manager (retro-shell design, "src/desktop/windowManager.ts"; Req 6, 14.1, 14.2).
 *
 * A thin DOM layer over the pure window stack: every z-order, focus and minimize change goes
 * through `applyStackOp`, and one `render()` then writes z-index, `.is-active` and `hidden` and
 * notifies subscribers. Positions live here and are always passed through `clampWindow`, so the
 * title bar stays reachable (Req 6.7, 6.8).
 *
 * DOM follows the contract in src/styles/desktop.css:
 *   div.window-layer > div.window[data-window-id]
 *     > div.title-bar > span.icon + span.title-bar-text
 *                      + div.title-bar-controls > button.title-bar-minimize + button.title-bar-close
 *     > div.window-body (holds spec.content)
 *
 * Drag listeners: `pointermove` / `pointerup` / `pointercancel` sit on each title bar (that is
 * where pointer capture sends them) and, only while a drag is running, on `document` in the
 * capture phase as a fallback when capture is unavailable (jsdom). The document listeners are
 * removed when the drag ends, when the window closes and on unmount.
 */
import { h } from '../core/h';
import type { Monitor } from '../core/monitor';
import type { Mountable } from '../core/scene';
import type { IconName } from './iconArt';
import { iconEl } from './iconArt';
import type { Point, Size } from './layout';
import { cascadePosition, clampWindow } from './layout';
import type { StackOp, WindowStack } from './windowStack';
import { applyStackOp, EMPTY_STACK } from './windowStack';

export interface WindowSpec {
  readonly id: string;
  readonly title: string;
  readonly icon: IconName;
  /** Owned by the caller. */
  readonly content: HTMLElement;
  readonly size: Size;
  /** Default: the next cascade slot (Req 6.12). */
  readonly position?: Point;
  /** `false` keeps the window open (Req 6.10, 6.11). Missing means "yes". */
  readonly onCloseRequest?: () => boolean;
  /** Called after the window has been removed by `close` or an accepted `requestClose`. */
  readonly onClosed?: () => void;
}

export interface WindowInfo {
  readonly id: string;
  readonly title: string;
  readonly icon: IconName;
}

export type WindowListener = (stack: WindowStack, windows: ReadonlyMap<string, WindowInfo>) => void;

export interface WindowManager extends Mountable {
  /** Already open → focus. */
  open(spec: WindowSpec): void;
  /** Asks `onCloseRequest`; closes only on a yes. */
  requestClose(id: string): void;
  /** Closes without asking. */
  close(id: string): void;
  focus(id: string): void;
  minimize(id: string): void;
  taskbarClick(id: string): void;
  setTitle(id: string, title: string): void;
  setContent(id: string, content: HTMLElement): void;
  isOpen(id: string): boolean;
  /** Current title and icon of an open window; `undefined` when it is not open. */
  info(id: string): WindowInfo | undefined;
  stack(): WindowStack;
  /** Re-clamps every window (Req 6.8). */
  setArea(area: Size): void;
  /** Returns an unsubscribe function. */
  subscribe(listener: WindowListener): () => void;
}

export interface WindowManagerDeps {
  readonly toScreenPoint: Monitor['toScreenPoint'];
  readonly area: Size;
}

/** Title-bar control glyphs and accessible names (UI chrome, not game copy). */
const MINIMIZE_GLYPH = '_';
const CLOSE_GLYPH = '✕';
const MINIMIZE_LABEL = 'Minimize';
const CLOSE_LABEL = 'Close';

/** z-index of the bottom window; the top one gets `Z_BASE + order.length - 1`. */
const Z_BASE = 10;

interface WindowRecord {
  readonly spec: WindowSpec;
  info: WindowInfo;
  pos: Point;
  readonly el: HTMLDivElement;
  readonly titleBar: HTMLDivElement;
  readonly titleText: HTMLSpanElement;
  readonly body: HTMLDivElement;
}

interface Drag {
  readonly id: string;
  readonly pointerId: number | undefined;
  readonly titleBar: HTMLDivElement;
  readonly startPoint: Point;
  readonly startPos: Point;
}

const DRAG_EVENTS = ['pointermove', 'pointerup', 'pointercancel'] as const;

function pointerIdOf(e: Event): number | undefined {
  const id = (e as Partial<PointerEvent>).pointerId;
  return typeof id === 'number' ? id : undefined;
}

export function createWindowManager(deps: WindowManagerDeps): WindowManager {
  const layer = h('div', { className: 'window-layer' });
  const doc = layer.ownerDocument;
  const records = new Map<string, WindowRecord>();
  const listeners = new Set<WindowListener>();
  let stack: WindowStack = EMPTY_STACK;
  let area: Size = deps.area;
  let cascadeCount = 0;
  let drag: Drag | null = null;
  /** The same event can reach both the title bar and the document fallback; handle it once. */
  let lastDragEvent: Event | null = null;
  let disposed = false;

  /* ---- Rendering ---------------------------------------------------------------------------- */

  function snapshot(): ReadonlyMap<string, WindowInfo> {
    const map = new Map<string, WindowInfo>();
    for (const id of stack.opened) {
      const rec = records.get(id);
      if (rec) map.set(id, rec.info);
    }
    return map;
  }

  function notify(): void {
    if (listeners.size === 0) return;
    const windows = snapshot();
    for (const listener of [...listeners]) listener(stack, windows);
  }

  /** Writes the stack to the DOM (Req 6.1–6.5, 6.9), then notifies subscribers. */
  function render(): void {
    stack.order.forEach((id, i) => {
      const rec = records.get(id);
      if (!rec) return;
      rec.el.style.zIndex = String(Z_BASE + i);
      rec.el.classList.toggle('is-active', id === stack.focused);
      rec.el.hidden = stack.minimized.includes(id);
    });
    notify();
  }

  /** The single entry point for stack changes. A no-op op leaves the DOM and subscribers alone. */
  function apply(op: StackOp): void {
    const next = applyStackOp(stack, op);
    if (next === stack) return;
    stack = next;
    if (drag && (stack.minimized.includes(drag.id) || !stack.order.includes(drag.id))) endDrag();
    render();
  }

  function place(rec: WindowRecord, pos: Point): void {
    rec.pos = clampWindow(pos, rec.spec.size, area);
    rec.el.style.left = `${rec.pos.x}px`;
    rec.el.style.top = `${rec.pos.y}px`;
  }

  /* ---- Dragging (Req 6.6, 6.7) -------------------------------------------------------------- */

  function onDragEvent(e: Event): void {
    if (!drag || e === lastDragEvent) return;
    const pid = pointerIdOf(e);
    if (drag.pointerId !== undefined && pid !== undefined && pid !== drag.pointerId) return;
    lastDragEvent = e;
    if (e.type === 'pointermove') {
      const rec = records.get(drag.id);
      if (!rec) return;
      const m = e as MouseEvent;
      const point = deps.toScreenPoint(m.clientX, m.clientY);
      place(rec, {
        x: drag.startPos.x + (point.x - drag.startPoint.x),
        y: drag.startPos.y + (point.y - drag.startPoint.y),
      });
    } else {
      endDrag();
    }
  }

  function endDrag(): void {
    const d = drag;
    if (!d) return;
    drag = null;
    lastDragEvent = null;
    for (const type of DRAG_EVENTS) doc.removeEventListener(type, onDragEvent, true);
    if (d.pointerId !== undefined && typeof d.titleBar.releasePointerCapture === 'function') {
      try {
        d.titleBar.releasePointerCapture(d.pointerId);
      } catch {
        // The capture was never taken or is already gone.
      }
    }
  }

  function startDrag(id: string, titleBar: HTMLDivElement, e: MouseEvent): void {
    if (e.button !== 0) return;
    if (e.target instanceof Element && e.target.closest('.title-bar-controls')) return;
    const rec = records.get(id);
    if (!rec) return;
    endDrag();
    const pointerId = pointerIdOf(e);
    drag = {
      id,
      pointerId,
      titleBar,
      startPoint: deps.toScreenPoint(e.clientX, e.clientY),
      startPos: rec.pos,
    };
    if (pointerId !== undefined && typeof titleBar.setPointerCapture === 'function') {
      try {
        titleBar.setPointerCapture(pointerId);
      } catch {
        // Synthetic or already-released pointer; the document fallback still sees the moves.
      }
    }
    for (const type of DRAG_EVENTS) doc.addEventListener(type, onDragEvent, true);
  }

  /* ---- Window elements ---------------------------------------------------------------------- */

  function build(spec: WindowSpec): WindowRecord {
    const { id } = spec;
    const titleText = h('span', { className: 'title-bar-text' });
    titleText.textContent = spec.title;

    const minimizeBtn = h(
      'button',
      {
        className: 'title-bar-button title-bar-minimize',
        attrs: { type: 'button', 'aria-label': MINIMIZE_LABEL },
        on: { click: () => api.minimize(id) },
      },
      MINIMIZE_GLYPH,
    );
    const closeBtn = h(
      'button',
      {
        className: 'title-bar-button title-bar-close',
        attrs: { type: 'button', 'aria-label': CLOSE_LABEL },
        on: { click: () => api.requestClose(id) },
      },
      CLOSE_GLYPH,
    );

    const titleBar: HTMLDivElement = h(
      'div',
      {
        className: 'title-bar',
        on: { pointerdown: (e) => startDrag(id, titleBar, e) },
      },
      iconEl(spec.icon),
      titleText,
      h('div', { className: 'title-bar-controls' }, minimizeBtn, closeBtn),
    );
    for (const type of DRAG_EVENTS) titleBar.addEventListener(type, onDragEvent);

    const body = h('div', { className: 'window-body' }, spec.content);
    const el = h('div', { className: 'window', attrs: { 'data-window-id': id } }, titleBar, body);
    el.style.width = `${spec.size.w}px`;
    el.style.height = `${spec.size.h}px`;
    // Capture phase, so a press anywhere in the window (even on content that stops
    // propagation) raises and focuses it first (Req 6.2).
    el.addEventListener('pointerdown', () => api.focus(id), true);

    return {
      spec,
      info: { id, title: spec.title, icon: spec.icon },
      pos: { x: 0, y: 0 },
      el,
      titleBar,
      titleText,
      body,
    };
  }

  /* ---- Public API --------------------------------------------------------------------------- */

  const api: WindowManager = {
    mount(root) {
      if (disposed) return;
      root.appendChild(layer);
    },

    unmount() {
      if (disposed) return;
      disposed = true;
      endDrag();
      for (const rec of records.values()) rec.el.remove();
      records.clear();
      listeners.clear();
      stack = EMPTY_STACK;
      layer.remove();
    },

    open(spec) {
      if (disposed) return;
      if (!records.has(spec.id)) {
        const rec = build(spec);
        const pos = spec.position ?? cascadePosition(cascadeCount++, spec.size, area);
        place(rec, pos);
        records.set(spec.id, rec);
        layer.appendChild(rec.el);
      }
      apply({ type: 'open', id: spec.id });
    },

    requestClose(id) {
      const rec = records.get(id);
      if (!rec) return;
      const allowed = rec.spec.onCloseRequest ? rec.spec.onCloseRequest() : true;
      // The owner may have closed the window itself while answering.
      if (allowed && records.get(id) === rec) api.close(id);
    },

    close(id) {
      const rec = records.get(id);
      if (!rec) return;
      if (drag?.id === id) endDrag();
      records.delete(id);
      rec.el.remove();
      apply({ type: 'close', id });
      rec.spec.onClosed?.();
    },

    focus(id) {
      apply({ type: 'focus', id });
    },

    minimize(id) {
      apply({ type: 'minimize', id });
    },

    taskbarClick(id) {
      apply({ type: 'taskbar', id });
    },

    setTitle(id, title) {
      const rec = records.get(id);
      if (!rec || rec.info.title === title) return;
      rec.info = { ...rec.info, title };
      rec.titleText.textContent = title;
      notify();
    },

    setContent(id, content) {
      records.get(id)?.body.replaceChildren(content);
    },

    isOpen(id) {
      return records.has(id);
    },

    info(id) {
      return records.get(id)?.info;
    },

    stack() {
      return stack;
    },

    setArea(next) {
      area = next;
      for (const rec of records.values()) place(rec, rec.pos);
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };

  return api;
}
