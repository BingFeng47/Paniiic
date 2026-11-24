// Hint_View (player-guide Req 2.2, 2.5, 2.6, 3.2-3.6) and Property 5 (Req 3.4).
import fc from 'fast-check';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { WindowManager } from '../../../src/desktop/windowManager';
import type { AudioEngine } from '../../../src/core/audio';
import { createSession, type SessionContext, type SessionView } from '../../../src/dialup/session';
import { createRun } from '../../../src/game/state';
import type { GameEvent, GameState } from '../../../src/game/types';
import { GUIDE_COPY } from '../../../src/ui/guideCopy';
import { HINT_TIMEOUT_TICKS } from '../../../src/ui/hints/hintQueue';
import { balloonPop } from '../../../src/ui/hints/hintSounds';
import { createHintView } from '../../../src/ui/hints/hintView';
import { createFakeAudioEngine, type FakeAudioEngine } from '../../helpers/audio';
import { arbLaneRun, commandFor, FAST_CORE, laneRunSystems, type LaneAction, type LaneRunSpec } from '../../helpers/lane';
import { createManualLoop } from '../../helpers/loop';

afterEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

interface Fixture {
  readonly view: SessionView;
  readonly overlay: HTMLElement;
  readonly audio: FakeAudioEngine;
  readonly send: ReturnType<typeof vi.fn>;
}

function mountView(opts: { hintsEnabled?: boolean; noOverlay?: boolean } = {}): Fixture {
  const overlay = document.createElement('div');
  document.body.appendChild(overlay);
  const audio = createFakeAudioEngine();
  const send = vi.fn();
  const view = createHintView();
  const ctx = {
    laneHost: document.createElement('div'),
    overlayHost: opts.noOverlay ? (null as unknown as HTMLElement) : overlay,
    windows: {} as WindowManager,
    audio: audio as unknown as AudioEngine,
    toScreenPoint: (x: number, y: number) => ({ x, y }),
    prefs: { screenShake: true, hintsEnabled: opts.hintsEnabled ?? true },
    send,
  } satisfies SessionContext;
  view.mount(ctx);
  return { view, overlay, audio, send };
}

/** A connected-phase state at `tick`, so the sessionStart (lane) Hint never fires. */
const base = createRun({ seed: 1 });
const at = (tick: number): GameState => ({ ...base, phase: 'connected', tick });
const CONNECTED: GameEvent[] = [{ type: 'connected' } as GameEvent];
const PACKET: GameEvent[] = [{ type: 'packetDropped' } as unknown as GameEvent];

const balloon = (f: Fixture): HTMLElement | null => f.overlay.querySelector('.hint-balloon');
const pops = (f: Fixture): number => f.audio.voices.filter((v) => v.recipe === (balloonPop as unknown)).length;

describe('createHintView', () => {
  it('shows the realLink balloon on connected, with copy set as text', () => {
    const f = mountView();
    f.view.update(at(1), CONNECTED);
    const b = balloon(f)!;
    expect(b.dataset.hint).toBe('realLink');
    const body = b.querySelector('.hint-body')!;
    expect(body.textContent).toBe(GUIDE_COPY.hints.realLink.body);
    expect(body.children.length).toBe(0);
    expect(b.querySelector('.hint-title')!.textContent).toBe(GUIDE_COPY.hints.realLink.title);
    expect(pops(f)).toBe(1);
  });

  it('shows the hatch balloon on the first adHatched only, once per Run (ad-pressure Req 8.2)', () => {
    const f = mountView();
    const HATCHED: GameEvent[] = [{ type: 'adHatched', id: 3, mobId: 7, tick: 1 }];
    f.view.update(at(1), HATCHED);
    const b = balloon(f)!;
    expect(b.dataset.hint).toBe('hatch');
    expect(b.querySelector('.hint-title')!.textContent).toBe(GUIDE_COPY.hints.hatch.title);
    expect(b.querySelector('.hint-body')!.textContent).toBe(GUIDE_COPY.hints.hatch.body);
    expect(pops(f)).toBe(1);
    (b.querySelector('.hint-close') as HTMLButtonElement).click();
    expect(balloon(f)).toBeNull();
    f.view.update(at(2), [{ type: 'adHatched', id: 3, mobId: 8, tick: 2 }]);
    expect(balloon(f)).toBeNull();
    expect(pops(f)).toBe(1);
  });

  it('clutter copy says open pop-ups slow the download and let zombies out (ad-pressure Req 8.1)', () => {
    expect(GUIDE_COPY.hints.clutter.body).toMatch(/slow the download/i);
    expect(GUIDE_COPY.hints.clutter.body).toMatch(/let zombies out/i);
  });

  it('✕ closes the balloon and the queued hint appears next', () => {
    const f = mountView();
    f.view.update(at(1), CONNECTED);
    f.view.update(at(2), PACKET);
    expect(balloon(f)!.dataset.hint).toBe('realLink');
    f.view.update(at(3), []);
    expect(pops(f)).toBe(1);
    (balloon(f)!.querySelector('.hint-close') as HTMLButtonElement).click();
    expect(balloon(f)!.dataset.hint).toBe('packet');
    expect(pops(f)).toBe(2);
    (balloon(f)!.querySelector('.hint-close') as HTMLButtonElement).click();
    expect(balloon(f)).toBeNull();
  });

  it('closes after 360 ticks', () => {
    const f = mountView();
    f.view.update(at(1), CONNECTED);
    f.view.update(at(1 + HINT_TIMEOUT_TICKS - 1), []);
    expect(balloon(f)).not.toBeNull();
    f.view.update(at(1 + HINT_TIMEOUT_TICKS), []);
    expect(balloon(f)).toBeNull();
  });

  it('shows nothing when hints are off', () => {
    const f = mountView({ hintsEnabled: false });
    f.view.update(at(1), CONNECTED);
    expect(f.overlay.children.length).toBe(0);
    expect(pops(f)).toBe(0);
  });

  it('mounts nothing and warns once without an overlayHost', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const f = mountView({ noOverlay: true });
    f.view.update(at(1), CONNECTED);
    expect(document.querySelector('.hint-layer')).toBeNull();
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('unmount removes the layer and stops its sounds', () => {
    const f = mountView();
    f.view.update(at(1), CONNECTED);
    expect(f.audio.activeVoices().length).toBe(1);
    f.view.unmount();
    expect(f.overlay.querySelector('.hint-layer')).toBeNull();
    expect(f.audio.activeVoices().length).toBe(0);
    expect(f.send).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------------------------
// Property 5

interface Played {
  readonly frames: { readonly state: GameState; readonly events: readonly GameEvent[] }[];
  final: GameState | null;
}

function play(spec: LaneRunSpec, frames: readonly number[], extra: SessionView | null): Played {
  const loop = createManualLoop();
  const actions = new Map<number, LaneAction[]>();
  for (const a of spec.actions) actions.set(a.tick, [...(actions.get(a.tick) ?? []), a]);
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
    views: extra ? [extra, script] : [script],
    startLoop: loop.start,
    onEnd: (final) => {
      played.final = final;
    },
  });
  const overlayHost = document.createElement('div');
  document.body.appendChild(overlayHost);
  session.start({
    laneHost: document.createElement('div'),
    overlayHost,
    windows: {} as WindowManager,
    audio: createFakeAudioEngine() as unknown as AudioEngine,
    toScreenPoint: (x, y) => ({ x, y }),
  });
  let delivered = 0;
  for (let i = 0; session.isActive() && delivered < spec.ticks; i++) {
    const n = Math.min(frames[i % frames.length]!, spec.ticks - delivered);
    loop.frame(n);
    delivered += n;
  }
  session.stop();
  overlayHost.remove();
  return played;
}

/** Wraps the Hint_View so any ctx.send call is recorded. */
function spiedHintView(sends: unknown[]): SessionView {
  const inner = createHintView();
  return {
    mount: (ctx) => inner.mount({ ...ctx, send: (c) => sends.push(c) }),
    update: (s, e) => inner.update(s, e),
    unmount: () => inner.unmount(),
  };
}

describe('Property 5: the guide never changes the Run', () => {
  it('a Session with the Hint_View gives the same states and events, and it sends nothing', () => {
    // Feature: player-guide, Property 5: The guide never changes the Run
    // **Validates: Requirements 3.4**
    const arbFrames = fc
      .array(fc.integer({ min: 0, max: 15 }), { minLength: 1, maxLength: 40 })
      .map((frames) => (frames.some((n) => n > 0) ? frames : [...frames, 1]));
    fc.assert(
      fc.property(arbLaneRun(600), arbFrames, (spec, frames) => {
        const sends: unknown[] = [];
        const withHints = play(spec, frames, spiedHintView(sends));
        const without = play(spec, frames, null);
        expect(withHints.frames).toEqual(without.frames);
        expect(withHints.final).toEqual(without.final);
        expect(sends).toEqual([]);
      }),
      { numRuns: 60 },
    );
  });
});
