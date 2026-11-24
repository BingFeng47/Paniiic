// Lane_View economy input and drawing (economy-weapons Req 2.4, 2.5, 4.5, 5.1, 5.2, 5.4).
import fc from 'fast-check';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SessionContext } from '../../src/dialup/session';
import type { WindowManager } from '../../src/desktop/windowManager';
import { DEFAULT_ECONOMY_BALANCE } from '../../src/game/balance/economy';
import { createEconomyState, PACKET_Y, type EconomyState } from '../../src/game/economy';
import type { GameState, InputCommand } from '../../src/game/types';
import { createLaneLayout, LANE_CANVAS_H, LANE_CANVAS_W } from '../../src/render/laneLayout';
import { createLaneView, offFeedLaneY, packetAlpha, slotForKey } from '../../src/render/laneView';
import type { SpriteAtlas } from '../../src/render/sprites/atlas';
import { ENTITY_LOOKS } from '../../src/render/sprites/entities';
import { createFakeAudioEngine } from '../helpers/audio';
import { trackListeners, type ListenerTracker } from '../helpers/dom';
import { laneWith } from '../helpers/lane';

const atlas = (): SpriteAtlas => ({
  frameCount: () => 1,
  frame: () => null,
  colour: (entity) => ENTITY_LOOKS[entity].colour,
  ready: () => Promise.resolve(),
});

function setup(economy: Partial<EconomyState> = {}) {
  const laneHost = document.createElement('div');
  document.body.appendChild(laneHost);
  const sent: InputCommand[] = [];
  const audio = createFakeAudioEngine();
  const ctx: SessionContext = {
    laneHost,
    overlayHost: document.createElement('div'),
    windows: {} as WindowManager,
    audio,
    toScreenPoint: (x, y) => ({ x, y }),
    send: (command) => sent.push(command),
  };
  const view = createLaneView({ atlas, devicePixelRatio: () => 1 });
  view.mount(ctx);
  const canvas = laneHost.querySelector('canvas') as HTMLCanvasElement;
  const state: GameState = { ...laneWith([]), economy: { ...createEconomyState(), ...economy } };
  return { view, canvas, sent, state, audio };
}

const pointer = (type: string, x: number, y: number, button = 0) =>
  new MouseEvent(type, { clientX: x, clientY: y, button, bubbles: true }) as PointerEvent;

afterEach(() => {
  document.body.innerHTML = '';
});

describe('Lane_View economy input', () => {
  it('batches a pointer burst into one lanePointer per frame, only on change (Req 2.4)', () => {
    const { view, canvas, sent, state } = setup();
    for (let x = 100; x < 110; x += 1) canvas.dispatchEvent(pointer('pointermove', x, 50));
    view.update(state, []);
    view.update({ ...state, tick: state.tick + 1 }, []);
    const lp = sent.filter((c) => c.type === 'lanePointer');
    expect(lp).toHaveLength(1);
    expect(lp[0]).toMatchObject({ down: false });
    view.unmount();
  });

  it('sends hammer on press only while the hammer is active (Req 5.4)', () => {
    const hammer = setup();
    hammer.view.update(hammer.state, []);
    hammer.canvas.dispatchEvent(pointer('pointerdown', 200, 60));
    expect(hammer.sent.some((c) => c.type === 'hammer')).toBe(true);
    hammer.view.unmount();

    const saw = setup({ active: 'saw', owned: ['saw'] });
    saw.view.update(saw.state, []);
    saw.canvas.dispatchEvent(pointer('pointerdown', 200, 60));
    saw.view.update({ ...saw.state, tick: 1 }, []);
    expect(saw.sent.some((c) => c.type === 'hammer')).toBe(false);
    expect(saw.sent.filter((c) => c.type === 'lanePointer').at(-1)).toMatchObject({ down: true });
    saw.view.unmount();
  });

  it('stops the saw, swings no hammer and collects nothing while the pointer is over a Lane_Cover Ad (ad-pressure Req 6.4)', () => {
    for (const active of ['saw', 'hammer'] as const) {
      const { view, canvas, sent, state } = setup({ active, owned: active === 'saw' ? ['saw'] : [] });
      // The Ad_Layer is a sibling of the Lane_Dock stacked over it, as in the Desktop scene.
      const ad = document.createElement('div');
      ad.className = 'ad ad-clutter ad-lane-cover';
      document.body.appendChild(ad);

      canvas.dispatchEvent(pointer('pointermove', 300, 220));
      canvas.dispatchEvent(pointer('pointerdown', 300, 220));
      view.update(state, []);
      const before = sent.length;
      // The browser fires pointerleave on the canvas as the pointer moves onto the Ad.
      canvas.dispatchEvent(new MouseEvent('pointerleave') as PointerEvent);
      ad.dispatchEvent(pointer('pointermove', 310, 220));
      ad.dispatchEvent(pointer('pointerdown', 310, 220));
      for (let t = 1; t <= 3; t++) view.update({ ...state, tick: t }, []);

      const after = sent.slice(before);
      expect(after.filter((c) => c.type === 'hammer')).toEqual([]);
      const lp = after.filter((c) => c.type === 'lanePointer');
      expect(lp).toHaveLength(1); // once, not every frame
      expect(lp[0]).toMatchObject({ down: false });
      const y = lp[0]!.type === 'lanePointer' ? lp[0]!.y : 0;
      expect(Math.abs(y - PACKET_Y)).toBeGreaterThan(DEFAULT_ECONOMY_BALANCE.pickupRadius);
      view.unmount();
      ad.remove();
    }
  });

  it('on pointerleave without a held button sends one lanePointer off the feed, then the real position on the next move (ad-pressure Req 6.4)', () => {
    const { view, canvas, sent, state } = setup();
    const layout = createLaneLayout(LANE_CANVAS_W, LANE_CANVAS_H, state.lane!.balance.laneLength);
    const lanePointers = (from: number) => sent.slice(from).filter((c) => c.type === 'lanePointer');
    let tick = 0;
    const frame = (): void => view.update({ ...state, tick: tick++ }, []);

    canvas.dispatchEvent(pointer('pointermove', 300, 220));
    frame();
    const real = lanePointers(0).at(-1)!;
    expect(real).toMatchObject({ down: false });

    let mark = sent.length;
    canvas.dispatchEvent(new MouseEvent('pointerleave') as PointerEvent);
    for (let i = 0; i < 4; i++) frame(); // no repeats on later frames
    const x = real.type === 'lanePointer' ? real.x : NaN;
    expect(lanePointers(mark)).toEqual([{ type: 'lanePointer', x, y: offFeedLaneY(layout), down: false }]);
    expect(sent.slice(mark).filter((c) => c.type === 'hammer')).toEqual([]);

    mark = sent.length;
    canvas.dispatchEvent(pointer('pointermove', 300, 220));
    frame();
    frame();
    expect(lanePointers(mark)).toEqual([real]);
    view.unmount();
  });

  it('removes the pointerleave listener on unmount (ad-pressure Req 6.4)', () => {
    const trackers: ListenerTracker[] = [];
    const createElement = document.createElement.bind(document);
    const spy = vi.spyOn(document, 'createElement').mockImplementation(((tag: string, options?: ElementCreationOptions) => {
      const el = createElement(tag, options);
      if (tag === 'canvas') trackers.push(trackListeners(el));
      return el;
    }) as typeof document.createElement);
    try {
      const { view, canvas, sent, state } = setup();
      const tracker = trackers.find((t) => t.count('pointerleave') > 0);
      expect(tracker).toBeDefined();
      canvas.dispatchEvent(pointer('pointermove', 300, 220));
      view.update(state, []);
      view.unmount();
      expect(tracker!.count('pointerleave')).toBe(0);
      const mark = sent.length;
      canvas.dispatchEvent(new MouseEvent('pointerleave') as PointerEvent);
      view.update({ ...state, tick: 1 }, []);
      expect(sent.slice(mark)).toEqual([]);
    } finally {
      for (const t of trackers) t.restore();
      spy.mockRestore();
    }
  });

  it('maps 1–5, Q/E and the wheel on document, ignores text fields and stops on unmount (Req 4.5, 5.1, 5.2)', () => {
    const { view, sent } = setup();
    for (const key of ['1', '5', 'q', 'E']) document.dispatchEvent(new KeyboardEvent('keydown', { key }));
    document.dispatchEvent(new WheelEvent('wheel', { deltaY: -1 }));
    document.dispatchEvent(new WheelEvent('wheel', { deltaY: 1 }));
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.dispatchEvent(new KeyboardEvent('keydown', { key: '2', bubbles: true }));
    expect(sent).toEqual([
      { type: 'buy', slot: 1 },
      { type: 'buy', slot: 5 },
      { type: 'switchWeapon', direction: 'previous' },
      { type: 'switchWeapon', direction: 'next' },
      { type: 'switchWeapon', direction: 'previous' },
      { type: 'switchWeapon', direction: 'next' },
    ]);
    view.unmount();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: '1' }));
    expect(sent).toHaveLength(6);
  });

  it('starts the saw loop while firing and stops it on unmount (Req 12.2)', () => {
    const { view, state, audio } = setup({ active: 'saw', owned: ['saw'], pointer: { x: 1, y: 1, down: true } });
    view.update(state, []);
    expect(audio.played()).toContain('sawWhine');
    view.unmount();
    expect(audio.activeVoices()).toEqual([]);
  });

  it('mounts the shop tray, updates it and sends a slot click as buy (Req 4.6, 11.1)', () => {
    const { view, sent, state } = setup({ wallet: 42 });
    view.update(state, []);
    const tray = document.querySelector('.lane-view .shop-tray') as HTMLElement;
    expect(tray).not.toBeNull();
    expect(tray.querySelector('.shop-kb')?.textContent).toContain('042');
    (tray.querySelector('.shop-slot[data-slot="2"]') as HTMLElement).click();
    expect(sent.filter((c) => c.type === 'buy')).toEqual([{ type: 'buy', slot: 2 }]);
    view.unmount();
    expect(document.querySelector('.shop-tray')).toBeNull();
  });

  it('mounts the shop tray inside .lane-view at the top centre (Req 11.5)', () => {
    const { view } = setup();
    const tray = document.querySelector('.shop-tray') as HTMLElement;
    expect(tray.parentElement?.closest('.lane-view')).not.toBeNull();
    expect(tray.classList.contains('shop-tray--top')).toBe(true);
    view.unmount();
  });

  it('slotForKey only maps 1–5', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 2 }), (key) => {
        const slot = slotForKey(key);
        expect(slot === null ? !['1', '2', '3', '4', '5'].includes(key) : String(slot) === key).toBe(true);
      }),
    );
  });

  it('shows "COMBO xN +1 KB" on the OSD for 60 Ticks and plays one rising blip (pacing-and-economy Req 5.5)', () => {
    const { view, state, audio } = setup();
    const at = (tick: number) => ({ ...state, tick });
    const text = () => document.querySelector('.cctv-osd .cctv-combo')?.textContent;
    view.update(at(0), []);
    expect(text()).toBe('');
    const before = audio.voices.length;
    view.update(at(100), [{ type: 'combo', count: 12, tick: 100 }]);
    const blips = audio.voices.slice(before).filter((v) => v.name === 'comboBlipRecipe');
    expect(blips).toHaveLength(1);
    expect(text()).toBe(`COMBO x12 +${DEFAULT_ECONOMY_BALANCE.comboBonusKb} KB`);
    view.update(at(159), []);
    expect(text()).toBe(`COMBO x12 +${DEFAULT_ECONOMY_BALANCE.comboBonusKb} KB`);
    view.update(at(160), []);
    expect(text()).toBe('');
    view.unmount();
  });
  it('packets are opaque until the last second, then fade to 0 (Req 2.5)', () => {
    expect(packetAlpha(0, 4)).toBe(1);
    expect(packetAlpha(210, 4)).toBeCloseTo(0.5, 5); // 3.5 s at 60 Hz
    expect(packetAlpha(240, 4)).toBe(0);
  });
});
