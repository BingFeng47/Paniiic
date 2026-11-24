// Lane_View tests (Req 10.2, 10.4, 11.1, 11.4, 11.5, 14.2, 14.4). jsdom never loads images, so
// every test injects an atlas whose frames never rasterize and the view draws flat boxes.
import fc from 'fast-check';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createSession,
  type SessionContext,
  type SessionView,
  type ViewPrefs,
} from '../../src/dialup/session';
import type { WindowManager } from '../../src/desktop/windowManager';
import { createLaneSystems } from '../../src/game/lane';
import { step } from '../../src/game/step';
import type { GameEvent, GameState, InputCommand } from '../../src/game/types';
import { SHAKE_TICKS, shakeOffset } from '../../src/render/laneEffects';
import { LANE_CANVAS_H, LANE_CANVAS_W } from '../../src/render/laneLayout';
import { createLaneView, laneDpr, MAX_DPR, rumbleAt } from '../../src/render/laneView';
import { noSignalFrame } from '../../src/render/cctv/cctvDraw';
import type { SpriteAtlas } from '../../src/render/sprites/atlas';
import { ENTITY_LOOKS, type AnimationName } from '../../src/render/sprites/entities';
import { LANE_COPY } from '../../src/ui/laneCopy';
import { createFakeAudioEngine } from '../helpers/audio';
import { loadRepoFiles } from '../helpers/repo';
import { trackListeners, type ListenerTracker } from '../helpers/dom';
import {
  arbLaneRun,
  commandFor,
  FAST_CORE,
  laneRunSystems,
  laneWith,
  type LaneAction,
  type LaneRunSpec,
} from '../helpers/lane';
import { createManualLoop } from '../helpers/loop';

/** An atlas whose frames never finish rasterizing, so the view draws flat boxes. */
function boxAtlas(): SpriteAtlas {
  return {
    frameCount: () => 1,
    frame: () => null,
    colour: (entity) => ENTITY_LOOKS[entity].colour,
    ready: () => Promise.resolve(),
  };
}

/**
 * A 2D context stand-in that accepts every call and records fillRect colours, setTransform calls
 * and, in `calls`, every method name plus `fillRect:<colour>` and `set:<key>=<value>` entries in order.
 */
function recordingContext(): { ctx: CanvasRenderingContext2D; fills: string[]; transforms: number[][]; calls: string[] } {
  const fills: string[] = [];
  const transforms: number[][] = [];
  const calls: string[] = [];
  const state: Record<string | symbol, unknown> = {};
  const gradient = { addColorStop: () => {} };
  const ctx = new Proxy(state, {
    get(target, key) {
      if (key in target) return target[key];
      const name = String(key);
      if (key === 'createLinearGradient' || key === 'createRadialGradient') {
        return () => (calls.push(name), gradient);
      }
      if (key === 'createPattern') return () => (calls.push(name), gradient);
      if (key === 'fillRect') {
        return () => {
          fills.push(String(target.fillStyle));
          calls.push(`fillRect:${String(target.fillStyle)}`);
        };
      }
      if (key === 'setTransform') return (...args: number[]) => (calls.push(name), transforms.push(args));
      return () => {
        calls.push(name);
      };
    },
    set(target, key, value) {
      target[key] = value;
      calls.push(`set:${String(key)}=${String(value)}`);
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
  return { ctx, fills, transforms, calls };
}

function setup() {
  const laneHost = document.createElement('div');
  document.body.appendChild(laneHost);
  const sent: InputCommand[] = [];
  const audio = createFakeAudioEngine();
  const ctx: SessionContext = {
    laneHost,
    overlayHost: document.createElement('div'),
    windows: {} as WindowManager,
    audio,
    toScreenPoint: (x, y) => ({ x: x / 2, y: y / 2 }),
    send: (command) => sent.push(command),
  };
  return { laneHost, sent, audio, ctx };
}

/** Freeze a plain-data value and everything reachable from it. Writes then throw (strict mode). */
function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

/** A state one tick on, so the view sees a new frame without running the simulation. */
const later = (state: GameState, ticks: number): GameState => ({ ...state, tick: state.tick + ticks });

/** Played names without the camera's own sounds (lane-cctv), so lane-sound checks stay exact. */
const CAMERA_SOUNDS = new Set(['cameraHum', 'cameraStatic']);
const lanePlayed = (names: readonly string[]): string[] => names.filter((n) => !CAMERA_SOUNDS.has(n));

let trackers: ListenerTracker[] = [];

/**
 * Tracks listeners on document, window, laneHost and every element created while it is active
 * (the view builds its canvas and HUD inside `mount`).
 */
function trackAll(laneHost: HTMLElement): void {
  trackers.push(trackListeners(document), trackListeners(window), trackListeners(laneHost));
  const createElement = document.createElement.bind(document);
  vi.spyOn(document, 'createElement').mockImplementation(((tag: string, options?: ElementCreationOptions) => {
    const el = createElement(tag, options);
    trackers.push(trackListeners(el));
    return el;
  }) as typeof document.createElement);
}

const attachedListeners = (): number => trackers.reduce((n, t) => n + t.count(), 0);

afterEach(() => {
  for (const t of trackers) t.restore();
  trackers = [];
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe('createLaneView', () => {
  it('mounts a canvas and the HUD, turns a primary press into a hammer command and unmounts cleanly', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    const { laneHost, sent, ctx } = setup();
    const view = createLaneView({ atlas: boxAtlas, devicePixelRatio: () => 3 });
    view.mount(ctx);

    const canvas = laneHost.querySelector<HTMLCanvasElement>('.lane-view > canvas.lane-canvas');
    expect(canvas).not.toBeNull();
    expect(laneHost.querySelector('.lane-view > .lane-hud')).not.toBeNull();
    expect(canvas!.width).toBe(2048); // dpr capped at 2
    expect(canvas!.getAttribute('aria-label')).toBe(LANE_COPY.canvasLabel);

    vi.spyOn(canvas!, 'getBoundingClientRect').mockReturnValue({ left: 20, top: 40 } as DOMRect);
    // Client (20 + 2·(112 + 100), 40 + 2·(232 − 30)) → canvas (212, 202) → lane (100, 30).
    canvas!.dispatchEvent(new MouseEvent('pointerdown', { button: 0, clientX: 444, clientY: 444 }));
    canvas!.dispatchEvent(new MouseEvent('pointerdown', { button: 2, clientX: 444, clientY: 444 }));
    expect(sent).toEqual([{ type: 'hammer', x: 100, y: 30 }]);

    // No 2D context: the HUD still updates (Req 11.5).
    view.update({ ...laneWith([]), integrity: 15 }, []);
    expect(laneHost.querySelector('.lane-hud')!.classList.contains('is-critical')).toBe(true);

    view.unmount();
    expect(laneHost.childElementCount).toBe(0);
    canvas!.dispatchEvent(new MouseEvent('pointerdown', { button: 0, clientX: 444, clientY: 444 }));
    expect(sent).toHaveLength(1);
  });

  it('draws enemies and the hammer cursor as flat boxes while frames are not rasterized, and stops its voices', () => {
    const { ctx: g, fills } = recordingContext();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(g as never);
    const { laneHost, audio, ctx } = setup();
    const view = createLaneView({ atlas: boxAtlas, devicePixelRatio: () => 1 });
    view.mount(ctx);
    const canvas = laneHost.querySelector('canvas')!;
    canvas.dispatchEvent(new MouseEvent('pointermove', { clientX: 400, clientY: 300 }));

    const state = Object.freeze(laneWith([{ kind: 'tank', x: 300 }]));
    expect(() =>
      view.update(state, [{ tick: 0, type: 'mobKilled', id: 9, kind: 'default', x: 500, dropKb: 5 }]),
    ).not.toThrow();
    expect(fills).toContain(ENTITY_LOOKS.tank.colour);
    expect(fills).toContain(ENTITY_LOOKS.default.colour); // the corpse
    expect(fills).toContain(ENTITY_LOOKS.hammer.colour);
    // Camera_Hum on mount, then the lane sound and the Feed_Startup static on the first frame.
    expect(audio.played()).toEqual(['cameraHum', 'mobSplat', 'cameraStatic']);
    expect(lanePlayed(audio.played())).toEqual(['mobSplat']);

    view.unmount();
    expect(audio.activeVoices()).toEqual([]);
  });

  it('caps the device pixel ratio at 2 and falls back to 1', () => {
    expect(laneDpr(1.5)).toBe(1.5);
    expect(laneDpr(4)).toBe(2);
    expect(laneDpr(Number.NaN)).toBe(1);
    expect(laneDpr(0)).toBe(1);
  });

  it('sizes the backing store by the device pixel ratio, read from window by default', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    const a = setup();
    const fractional = createLaneView({ atlas: boxAtlas, devicePixelRatio: () => 1.5 });
    fractional.mount(a.ctx);
    const canvasA = a.laneHost.querySelector('canvas')!;
    expect([canvasA.width, canvasA.height]).toEqual([Math.round(LANE_CANVAS_W * 1.5), Math.round(LANE_CANVAS_H * 1.5)]);
    fractional.unmount();

    vi.spyOn(window, 'devicePixelRatio', 'get').mockReturnValue(4);
    const b = setup();
    const byWindow = createLaneView({ atlas: boxAtlas });
    byWindow.mount(b.ctx);
    const canvasB = b.laneHost.querySelector('canvas')!;
    expect([canvasB.width, canvasB.height]).toEqual([LANE_CANVAS_W * MAX_DPR, LANE_CANVAS_H * MAX_DPR]);
    byWindow.unmount();
  });

  it('sends nothing for pointer moves and leaves, and draws the hammer cursor only while the pointer is over the canvas', () => {
    const { ctx: g, fills } = recordingContext();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(g as never);
    const { laneHost, sent, ctx } = setup();
    const view = createLaneView({ atlas: boxAtlas, devicePixelRatio: () => 1 });
    view.mount(ctx);
    const canvas = laneHost.querySelector('canvas')!;
    const state = laneWith([]);
    const fillsOf = (draw: () => void): string[] => {
      const from = fills.length;
      draw();
      return fills.slice(from);
    };

    expect(fillsOf(() => view.update(state, []))).not.toContain(ENTITY_LOOKS.hammer.colour);
    canvas.dispatchEvent(new MouseEvent('pointermove', { clientX: 400, clientY: 300 }));
    expect(fillsOf(() => view.update(later(state, 1), []))).toContain(ENTITY_LOOKS.hammer.colour);
    canvas.dispatchEvent(new MouseEvent('pointerleave'));
    expect(fillsOf(() => view.update(later(state, 2), []))).not.toContain(ENTITY_LOOKS.hammer.colour);

    expect(sent).toEqual([]);
    view.unmount();
  });

  it('forwards a press that maps to a non-finite point as is, and the simulation ignores it', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    const { laneHost, sent, ctx } = setup();
    const view = createLaneView({ atlas: boxAtlas, devicePixelRatio: () => 1 });
    view.mount({ ...ctx, toScreenPoint: (x, y) => (x === 7 ? { x: Number.NaN, y: Number.NaN } : { x: x / 2, y: y / 2 }) });
    const canvas = laneHost.querySelector('canvas')!;

    expect(() => canvas.dispatchEvent(new MouseEvent('pointerdown', { button: 0, clientX: 7, clientY: 7 }))).not.toThrow();
    expect(sent).toHaveLength(1);
    const command = sent[0]!;
    expect(command.type).toBe('hammer');
    expect(command.type === 'hammer' && (Number.isFinite(command.x) || Number.isFinite(command.y))).toBe(false);

    const run = laneWith([{ kind: 'default', x: 100 }]);
    const swings = (inputs: readonly InputCommand[]) =>
      step(run, inputs, createLaneSystems()).events.filter((e) => e.type === 'hammerSwing');
    expect(swings(sent)).toEqual([]);
    expect(swings([{ type: 'hammer', x: 100, y: 10 }])).toHaveLength(1); // control: a finite press swings
    view.unmount();
  });

  it('draws a deep-frozen state and its events without changing them or sending commands (Req 11.4)', () => {
    const { ctx: g, fills } = recordingContext();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(g as never);
    const { laneHost, sent, ctx } = setup();
    const view = createLaneView({ atlas: boxAtlas, devicePixelRatio: () => 2 });
    view.mount(ctx);
    laneHost.querySelector('canvas')!.dispatchEvent(new MouseEvent('pointermove', { clientX: 300, clientY: 300 }));

    const plain = laneWith([
      { kind: 'default', x: 100, lastHitTick: 0 },
      { kind: 'fast', x: 250 },
      { kind: 'tank', x: 400 },
      { kind: 'ranged', x: 500, lastSpitTick: 0, nextSpitTick: 180 },
      { kind: 'boss', x: 700, summonsDone: 1 },
      { kind: 'glob', x: 450, sourceId: 4 },
    ]);
    const events: GameEvent[] = [
      { tick: 0, type: 'hammerSwing', x: 100, y: 10, targetId: 1 },
      { tick: 0, type: 'mobKilled', id: 9, kind: 'fast', x: 300, dropKb: 8 },
      { tick: 0, type: 'mobBit', id: 10, kind: 'tank', damage: 20 },
    ];
    const before = structuredClone({ plain, events });
    const state = deepFreeze(plain);
    deepFreeze(events);

    expect(() => view.update(state, events)).not.toThrow();
    expect(() => view.update(later(state, 1), [])).not.toThrow();
    expect({ plain: state, events }).toEqual(before);
    expect(fills).toContain(ENTITY_LOOKS.boss.colour);
    expect(sent).toEqual([]);
    view.unmount();
  });

  it('keeps the HUD, sounds and input working when the canvas has no 2D context (Req 11.5)', () => {
    for (const getContext of [() => null, () => { throw new Error('no canvas'); }]) {
      vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(getContext as never);
      const { laneHost, sent, audio, ctx } = setup();
      const view = createLaneView({ atlas: boxAtlas, devicePixelRatio: () => 1 });
      view.mount(ctx);
      const hud = laneHost.querySelector<HTMLElement>('.lane-hud')!;
      const state = laneWith([{ kind: 'tank', x: 300 }]);

      view.update({ ...state, integrity: 73 }, [{ tick: 0, type: 'hammerSwing', x: 300, y: 5, targetId: 1 }]);
      expect(hud.querySelector('.lane-hud-value')!.textContent).toBe('73%');
      expect(hud.querySelector<HTMLElement>('.lane-hud-fill')!.style.width).toBe('73%');
      expect(hud.classList.contains('is-critical')).toBe(false);
      expect(lanePlayed(audio.played())).toEqual(['hammerThud']);
      expect(audio.played()).toEqual(['cameraHum', 'hammerThud', 'cameraStatic']);

      view.update({ ...later(state, 1), integrity: 20 }, []);
      expect(hud.querySelector('.lane-hud-value')!.textContent).toBe('20%');
      expect(hud.classList.contains('is-critical')).toBe(true);
      expect(hud.querySelector('.lane-hud-note')!.textContent).toBe(LANE_COPY.criticalNote);

      laneHost.querySelector('canvas')!.dispatchEvent(new MouseEvent('pointerdown', { button: 0, clientX: 10, clientY: 10 }));
      expect(sent).toHaveLength(1);
      view.unmount();
      vi.restoreAllMocks();
    }
  });

  it('plays each lane sound once per frame and nothing on a frame without events (Req 14.2)', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    const { audio, ctx } = setup();
    const view = createLaneView({ atlas: boxAtlas, devicePixelRatio: () => 1 });
    view.mount(ctx);
    const state = laneWith([]);

    const swing = (tick: number, targetId: number | null): GameEvent => ({ tick, type: 'hammerSwing', x: 0, y: 0, targetId });
    view.update(state, [
      swing(0, 1),
      swing(0, null),
      swing(0, 2),
      { tick: 0, type: 'mobKilled', id: 1, kind: 'default', x: 10, dropKb: 5 },
      { tick: 0, type: 'mobKilled', id: 2, kind: 'fast', x: 20, dropKb: 8 },
      { tick: 0, type: 'mobBit', id: 3, kind: 'default', damage: 10 },
      { tick: 0, type: 'mobBit', id: 4, kind: 'tank', damage: 20 },
      { tick: 0, type: 'globSpat', id: 5, sourceId: 6, x: 400 },
      { tick: 0, type: 'globSpat', id: 7, sourceId: 8, x: 420 },
      { tick: 0, type: 'mobSpawned', id: 9, kind: 'default', x: 800, source: 'schedule' },
      { tick: 0, type: 'mobSpawned', id: 10, kind: 'fast', x: 800, source: 'schedule' },
      { tick: 0, type: 'mobSpawned', id: 11, kind: 'default', x: 700, source: 'bossSummon' },
      swing(0, 3),
    ]);
    expect(lanePlayed(audio.played())).toEqual(['hammerThud', 'hammerWhiff', 'mobSplat', 'modemCrunch', 'globSpit', '(anonymous)']);
    // The last one is the single per-kind spawn groan (juice Req 6.1), which replaced manholeClank.
    // Camera sounds: the hum from mount and one startup static on the first frame.
    expect(audio.played().filter((n) => CAMERA_SOUNDS.has(n))).toEqual(['cameraHum', 'cameraStatic']);
    const afterFirst = audio.voices.length; // 6 lane sounds + hum + static
    expect(afterFirst).toBe(8);

    // A frame with zero ticks repeats the state with no events: no new sounds.
    view.update(state, []);
    expect(audio.voices).toHaveLength(afterFirst);

    // The next frame plays again, once, and the camera adds nothing without a modem hit.
    view.update(later(state, 1), [swing(1, 1), swing(1, 2), swing(1, 3)]);
    expect(audio.played().slice(afterFirst)).toEqual(['hammerThud']);
    view.unmount();
  });

  it('unmount removes the DOM, every listener and every voice, and is safe to repeat (Req 11.1, 14.4)', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    const { laneHost, sent, audio, ctx } = setup();
    trackAll(laneHost);
    const view = createLaneView({ atlas: boxAtlas, devicePixelRatio: () => 1 });
    view.mount(ctx);
    const canvas = laneHost.querySelector('canvas')!;
    expect(attachedListeners()).toBeGreaterThan(0);

    const state = laneWith([]);
    view.update(state, [{ tick: 0, type: 'mobBit', id: 1, kind: 'default', damage: 10 }]);
    view.update(later(state, 1), [{ tick: 1, type: 'hammerSwing', x: 0, y: 0, targetId: null }]);
    // Two lane sounds plus Camera_Hum and the startup Camera_Static.
    expect(audio.activeVoices()).toHaveLength(4);
    expect(lanePlayed(audio.played())).toEqual(['modemCrunch', 'hammerWhiff']);

    view.unmount();
    expect(laneHost.childNodes).toHaveLength(0);
    expect(attachedListeners()).toBe(0);
    expect(audio.activeVoices()).toEqual([]);

    expect(() => view.unmount()).not.toThrow();
    view.update(later(state, 2), [{ tick: 2, type: 'mobKilled', id: 1, kind: 'default', x: 10, dropKb: 5 }]);
    canvas.dispatchEvent(new MouseEvent('pointerdown', { button: 0, clientX: 10, clientY: 10 }));
    expect(audio.voices).toHaveLength(4);
    expect(sent).toEqual([]);
  });
});

describe('createLaneView: CCTV camera layer (lane-cctv)', () => {
  /** Client point that maps to lane (100, 30) with setup()'s toScreenPoint and this rect. */
  const PRESS = { button: 0, clientX: 444, clientY: 444 } as const;
  const RECT = { left: 20, top: 40 } as DOMRect;

  it('shows the OSD with label, REC and timestamp through textContent (Req 2.1, 2.6)', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(recordingContext().ctx as never);
    const { laneHost, ctx } = setup();
    const view = createLaneView({ atlas: boxAtlas, devicePixelRatio: () => 1 });
    view.mount(ctx);
    const osd = laneHost.querySelector<HTMLElement>('.lane-view > .cctv-osd')!;
    expect(osd).not.toBeNull();
    const innerHTML = vi.spyOn(Element.prototype, 'innerHTML', 'set');

    view.update(later(laneWith([]), 420), []);
    expect(osd.querySelector('.cctv-label')!.textContent).toBe(LANE_COPY.cctv.label);
    expect(osd.querySelector('.cctv-rec')!.textContent).toBe(LANE_COPY.cctv.rec);
    expect(osd.querySelector('.cctv-rec')!.classList.contains('is-on')).toBe(true); // 420 mod 60 < 30
    expect(osd.querySelector('.cctv-time')!.textContent).toBe('11-23-98 11:59:07 PM');
    expect(osd.querySelector('.cctv-status')!.textContent).toBe(LANE_COPY.cctv.connecting);
    view.update(later(laneWith([]), 450), []);
    expect(osd.querySelector('.cctv-rec')!.classList.contains('is-on')).toBe(false);
    expect(innerHTML).not.toHaveBeenCalled();
    view.unmount();
  });

  it('keeps the OSD pointer-free in CSS (Req 7.3)', async () => {
    const css = (await loadRepoFiles()).read('src/styles/lane.css');
    const rule = /\.cctv-osd\s*\{([^}]*)\}/.exec(css);
    expect(rule).not.toBeNull();
    expect(rule![1]).toMatch(/pointer-events:\s*none/);
  });

  it('sends one hammer command at the same lane point during startup and during a dropout (Req 3.2, 5.3, 7.1)', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(recordingContext().ctx as never);
    const { laneHost, sent, ctx } = setup();
    const view = createLaneView({ atlas: boxAtlas, devicePixelRatio: () => 1 });
    view.mount(ctx);
    const canvas = laneHost.querySelector('canvas')!;
    vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue(RECT);
    const status = laneHost.querySelector('.cctv-status')!;
    const base = laneWith([]);

    view.update(base, []);
    expect(status.textContent).toBe(LANE_COPY.cctv.connecting);
    canvas.dispatchEvent(new MouseEvent('pointerdown', PRESS));
    expect(sent).toEqual([{ type: 'hammer', x: 100, y: 30 }]);

    // Critical from tick 40 (after startup); step one tick per frame until a dropout shows.
    let tick = 1;
    for (; tick < 2000 && status.textContent !== LANE_COPY.cctv.signalWeak; tick++) {
      view.update({ ...later(base, tick), integrity: tick >= 40 ? 10 : 100 }, []);
    }
    expect(status.textContent).toBe(LANE_COPY.cctv.signalWeak);
    canvas.dispatchEvent(new MouseEvent('pointerdown', PRESS));
    expect(sent).toEqual([
      { type: 'hammer', x: 100, y: 30 },
      { type: 'hammer', x: 100, y: 30 },
    ]);
    view.unmount();
  });

  it('draws the hammer cursor last, after the grade, and never reads pixels back (Req 1.3, 1.4)', () => {
    const { ctx: g, calls } = recordingContext();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(g as never);
    const { laneHost, ctx } = setup();
    const view = createLaneView({ atlas: boxAtlas, devicePixelRatio: () => 1 });
    view.mount(ctx);
    laneHost.querySelector('canvas')!.dispatchEvent(new MouseEvent('pointermove', { clientX: 400, clientY: 300 }));
    const state = laneWith([{ kind: 'default', x: 300 }]);
    // Startup frame plus a frame with a tear, so every camera effect draws.
    view.update(state, [{ tick: 0, type: 'mobSpawned', id: 1, kind: 'default', x: 300, source: 'schedule' }]);
    const from = calls.length;
    view.update(later(state, 1), [{ tick: 1, type: 'modemHit', amount: 4, integrity: 96 }]);
    const frame = calls.slice(from);

    expect(calls).not.toContain('getImageData');
    expect(calls).not.toContain('putImageData');
    const grade = frame.indexOf('set:globalCompositeOperation=color');
    const hammer = frame.lastIndexOf(`fillRect:${ENTITY_LOOKS.hammer.colour}`);
    expect(grade).toBeGreaterThanOrEqual(0);
    expect(hammer).toBeGreaterThan(grade);
    // Nothing from the camera (blends, noise images) comes after the cursor.
    const after = frame.slice(hammer + 1);
    expect(after.filter((c) => c === 'drawImage' || c.startsWith('set:globalCompositeOperation=c') || c.startsWith('set:globalCompositeOperation=m'))).toEqual([]);
    view.unmount();
  });

  it('keeps the OSD and HUD updating with no 2D context (Req 10.1)', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    const { laneHost, ctx } = setup();
    const view = createLaneView({ atlas: boxAtlas, devicePixelRatio: () => 1 });
    view.mount(ctx);
    view.update({ ...later(laneWith([]), 420), integrity: 55 }, []);
    expect(laneHost.querySelector('.cctv-time')!.textContent).toBe('11-23-98 11:59:07 PM');
    expect(laneHost.querySelector('.lane-hud-value')!.textContent).toBe('55%');
    view.update({ ...later(laneWith([]), 480), integrity: 15 }, []);
    expect(laneHost.querySelector('.cctv-time')!.textContent).toBe('11-23-98 11:59:08 PM');
    expect(laneHost.querySelector('.lane-hud-value')!.textContent).toBe('15%');
    expect(laneHost.querySelector('.lane-hud')!.classList.contains('is-critical')).toBe(true);
    view.unmount();
  });

  it('unmount stops the hum and every static voice and removes the OSD (Req 9.2, 10.2)', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(recordingContext().ctx as never);
    const { laneHost, audio, ctx } = setup();
    const view = createLaneView({ atlas: boxAtlas, devicePixelRatio: () => 1 });
    view.mount(ctx);
    const state = laneWith([]);
    view.update(state, []);
    view.update(later(state, 1), [{ tick: 1, type: 'modemHit', amount: 4, integrity: 96 }]);
    const camera = audio.voices.filter((v) => CAMERA_SOUNDS.has(v.name));
    expect(camera.map((v) => v.name)).toEqual(['cameraHum', 'cameraStatic', 'cameraStatic']);
    expect(camera.every((v) => !v.stopped())).toBe(true);

    view.unmount();
    expect(camera.every((v) => v.stopped())).toBe(true);
    expect(laneHost.querySelector('.cctv-osd')).toBeNull();
  });

  it('never sets .is-tearing with Screen_Shake off, and does during a tear with it on (Req 8.2)', () => {
    const tearing = (screenShake: boolean): boolean[] => {
      vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(recordingContext().ctx as never);
      const { laneHost, ctx } = setup();
      const view = createLaneView({ atlas: boxAtlas, devicePixelRatio: () => 1 });
      view.mount({ ...ctx, prefs: { screenShake } });
      const osd = laneHost.querySelector('.cctv-osd')!;
      const seen: boolean[] = [];
      const state = laneWith([]);
      for (let t = 0; t < 80; t++) {
        const events: GameEvent[] = t % 20 === 0 ? [{ tick: t, type: 'modemHit', amount: 4, integrity: 96 }] : [];
        view.update(later(state, t), events);
        seen.push(osd.classList.contains('is-tearing'));
      }
      view.unmount();
      vi.restoreAllMocks();
      return seen;
    };
    expect(tearing(false).some(Boolean)).toBe(false);
    expect(tearing(true).some(Boolean)).toBe(true); // control
  });
});

describe('createLaneView: screen shake preference (title-and-endings Req 7)', () => {
  /**
   * Mounts a Lane_View with `prefs` (none: the context has no `prefs` field), draws a frame with a
   * `modemHit` at tick 0 and then the frame at tick 1, and returns what the tick-1 frame drew.
   */
  function frameAfterModemHit(prefs: ViewPrefs | undefined) {
    const { ctx: g, fills, transforms } = recordingContext();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(g as never);
    const { ctx } = setup();
    const modem: AnimationName[] = [];
    const atlas = (): SpriteAtlas => ({
      ...boxAtlas(),
      frame: (entity, animation) => {
        if (entity === 'modem') modem.push(animation);
        return null;
      },
    });
    const view = createLaneView({ atlas, devicePixelRatio: () => 1 });
    view.mount(prefs === undefined ? ctx : { ...ctx, prefs });
    const state = laneWith([]);
    view.update(state, [{ tick: 0, type: 'modemHit', amount: 10, integrity: 90 }]);
    const from = { transforms: transforms.length, fills: fills.length, modem: modem.length };
    view.update(later(state, 1), []);
    view.unmount();
    vi.restoreAllMocks();
    return {
      transforms: transforms.slice(from.transforms),
      fills: fills.slice(from.fills),
      modem: modem.slice(from.modem),
    };
  }

  it('uses a zero transform offset right after a modemHit with shake off, while the modem still shows hit', () => {
    const off = frameAfterModemHit({ screenShake: false });
    const on = frameAfterModemHit({ screenShake: true });
    const byDefault = frameAfterModemHit(undefined);

    // Clear, lane (shaken or not), camera layer, cursor: the lane transform is the second call.
    // With shake off every transform, camera ones included, has a zero offset.
    expect(off.transforms.length).toBeGreaterThanOrEqual(3);
    for (const t of off.transforms) expect(t).toEqual([1, 0, 0, 1, 0, 0]);
    const { dx, dy } = shakeOffset(1, SHAKE_TICKS);
    expect(dx !== 0 || dy !== 0).toBe(true); // control: shake on really moves on this frame
    expect(on.transforms).toHaveLength(off.transforms.length);
    expect(on.transforms[1]).toEqual([1, 0, 0, 1, dx, dy]);
    // Shake on only adds the offset; every call is either unshaken or shaken by exactly (dx, dy).
    for (const t of on.transforms) expect([[1, 0, 0, 1, 0, 0], [1, 0, 0, 1, dx, dy]]).toContainEqual(t);
    expect(on.transforms.at(-1)).toEqual([1, 0, 0, 1, 0, 0]); // the cursor never shakes
    expect(byDefault.transforms).toEqual(on.transforms);

    // Only the offset changes: the modem still shows its hit frame and the same boxes are drawn.
    expect(off.modem).toEqual(['hit']);
    expect(on.modem).toEqual(['hit']);
    expect(off.fills).toEqual(on.fills);
  });

  /** Groups actions by tick for the script view. */
  function byTick(actions: readonly LaneAction[]): Map<number, LaneAction[]> {
    const map = new Map<number, LaneAction[]>();
    for (const action of actions) {
      const list = map.get(action.tick);
      if (list) list.push(action);
      else map.set(action.tick, [action]);
    }
    return map;
  }

  interface Played {
    readonly frames: { readonly state: GameState; readonly events: readonly GameEvent[] }[];
    final: GameState | null;
  }

  /**
   * Plays `spec` in a Session with the lane systems, the real Lane_View and a script view, driven
   * by a manual loop that hands over ticks in `frames` groupings (cycled) for at most `spec.ticks`
   * ticks. On every frame the script view records the state and events, then sends the commands
   * for every tick up to the next one, aimed on the state it was shown.
   */
  function play(spec: LaneRunSpec, frames: readonly number[], prefs: ViewPrefs): Played {
    const loop = createManualLoop();
    const actions = byTick(spec.actions);
    const played: Played = { frames: [], final: null };
    let send: SessionContext['send'] | null = null;
    let sentThrough = 0;
    const script: SessionView = {
      mount: (ctx) => {
        send = ctx.send;
      },
      update: (state, events) => {
        played.frames.push({ state, events });
        const next = state.tick + 1;
        for (let t = sentThrough + 1; t <= next; t++) {
          if (spec.downloadTick === t) send?.({ type: 'startDownload' });
          for (const action of actions.get(t) ?? []) {
            const command = commandFor(action.aim, state);
            if (command !== null) send?.(command);
          }
        }
        sentThrough = Math.max(sentThrough, next);
      },
      unmount: () => {
        send = null;
      },
    };
    const session = createSession({
      seed: spec.seed,
      balance: FAST_CORE,
      systems: laneRunSystems(spec),
      views: [createLaneView({ atlas: boxAtlas, devicePixelRatio: () => 1 }), script],
      startLoop: loop.start,
      onEnd: (final) => {
        played.final = final;
      },
    });
    const laneHost = document.createElement('div');
    document.body.appendChild(laneHost);
    session.start({
      laneHost,
      overlayHost: document.createElement('div'),
      windows: {} as WindowManager,
      audio: createFakeAudioEngine(),
      toScreenPoint: (x, y) => ({ x, y }),
      prefs,
    });
    let delivered = 0;
    for (let i = 0; session.isActive() && delivered < spec.ticks; i++) {
      const n = Math.min(frames[i % frames.length]!, spec.ticks - delivered);
      loop.frame(n);
      delivered += n;
    }
    session.stop();
    laneHost.remove();
    return played;
  }

  it('Property 11: the screen shake setting never changes the Run', () => {
    // Property: Req 7.4 same seed and tick-aligned commands give the same Run for either Screen_Shake
    // Feature: title-and-endings, Property 11: The screen shake setting never changes the Run
    const { ctx: g } = recordingContext();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(g as never);
    // Frame groupings of 0..15 ticks (the real loop's limit) with at least one non-empty frame.
    const arbFrames = fc
      .array(fc.integer({ min: 0, max: 15 }), { minLength: 1, maxLength: 40 })
      .map((frames) => (frames.some((n) => n > 0) ? frames : [...frames, 1]));
    fc.assert(
      fc.property(arbLaneRun(600), arbFrames, (spec, frames) => {
        const shaken = play(spec, frames, { screenShake: true });
        const still = play(spec, frames, { screenShake: false });
        expect(still.frames).toEqual(shaken.frames);
        expect(still.final).toEqual(shaken.final);
      }),
      { numRuns: 100 },
    );
  });
});

describe('juice lane sounds (juice-and-endings Req 5.2, 5.3, 6.1)', () => {
  const withDirector = (tick: number, bossDone = false): GameState =>
    ({ ...laneWith([]), tick, director: { table: { bossAtPercent: 65, bossLatestSecond: 10 }, bossDone } }) as unknown as GameState;

  it('plays one roar per boss spawn and one groan per frame', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    try {
      const { audio, ctx } = setup();
      const view = createLaneView({ atlas: boxAtlas, devicePixelRatio: () => 1 });
      view.mount(ctx);
      view.update(laneWith([]), [
        { tick: 0, type: 'mobSpawned', id: 1, kind: 'boss', x: 800, source: 'schedule' },
        { tick: 0, type: 'mobSpawned', id: 2, kind: 'boss', x: 800, source: 'schedule' },
        { tick: 0, type: 'mobSpawned', id: 3, kind: 'fast', x: 800, source: 'bossSummon' },
      ]);
      const names = lanePlayed(audio.played());
      expect(names.filter((n) => n === 'bossRoar')).toHaveLength(2);
      expect(names.filter((n) => n === '(anonymous)')).toHaveLength(1);
      expect(names).not.toContain('manholeClank');
      view.unmount();
    } finally {
      vi.restoreAllMocks();
    }
  });

  it('loops the rumble only inside the window, and stops it at the boss spawn and on unmount', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    try {
      const { audio, ctx } = setup();
      const view = createLaneView({ atlas: boxAtlas, devicePixelRatio: () => 1 });
      view.mount(ctx);
      const rumbles = () => audio.voices.filter((v) => v.name === 'bossRumble');
      view.update(laneWith([]), []); // no director
      view.update(withDirector(419), []);
      expect(rumbles()).toHaveLength(0);
      view.update(withDirector(420), []);
      view.update(withDirector(500), []);
      expect(rumbles()).toHaveLength(1);
      expect(rumbles()[0]!.stopped()).toBe(false);
      view.update(withDirector(600, true), []);
      expect(rumbles()[0]!.stopped()).toBe(true);
      view.update(withDirector(450), []);
      view.unmount();
      expect(rumbles()[1]!.stopped()).toBe(true);
    } finally {
      vi.restoreAllMocks();
    }
  });

  it('rumbles in the last 3 s of full-speed progress before bossAtPercent (pacing-and-economy Req 3.2)', () => {
    const at = (download: number, bossDone = false): GameState =>
      ({ ...withDirector(0, bossDone), director: { table: { bossAtPercent: 65, bossLatestSecond: 200 }, bossDone }, download }) as unknown as GameState;
    const lead = (laneWith([]).balance.downloadPercentPerSecond * 180) / 60;
    expect(rumbleAt(at(65 - lead - 0.01))).toBe(false);
    expect(rumbleAt(at(65 - lead))).toBe(true);
    expect(rumbleAt(at(64.9))).toBe(true);
    expect(rumbleAt(at(66, true))).toBe(false);
  });
});
describe('Lane_View endFrame (juice-and-endings Req 7.1)', () => {
  it('cuts to NO SIGNAL on a loss with the timestamp frozen, and changes the noise at most 3 times per second', () => {
    const { ctx: g, calls } = recordingContext();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(g as never);
    const { laneHost, ctx } = setup();
    const view = createLaneView({ atlas: boxAtlas, devicePixelRatio: () => 1 });
    view.mount(ctx);
    const final: GameState = { ...laneWith([{ kind: 'tank', x: 0 }]), phase: 'lost', tick: 4000 };
    view.update(final, []);
    const time = laneHost.querySelector('.cctv-time')!.textContent;
    calls.length = 0;
    for (let t = 1; t <= 30; t++) view.endFrame!(final, t);
    expect(laneHost.querySelector('.cctv-status')!.textContent).toBe(LANE_COPY.cctv.noSignal);
    expect(laneHost.querySelector('.cctv-time')!.textContent).toBe(time);
    expect(calls).toContain('fillRect:#000');
    const frames = new Set(Array.from({ length: 60 }, (_, i) => noSignalFrame(i + 1)));
    expect(frames.size).toBeLessThanOrEqual(3);
    view.unmount();
  });
  it('does nothing on a win', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    const { laneHost, ctx } = setup();
    const view = createLaneView({ atlas: boxAtlas, devicePixelRatio: () => 1 });
    view.mount(ctx);
    view.endFrame!({ ...laneWith([]), phase: 'won' }, 1);
    expect(laneHost.querySelector('.cctv-status')!.textContent).toBe('');
    view.unmount();
  });
});
