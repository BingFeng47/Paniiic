// Property 7 for lane-cctv (Req 5.4, 7.4): the camera state is deterministic and the CCTV layer
// never changes the Run.
import fc from 'fast-check';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { WindowManager } from '../../../src/desktop/windowManager';
import { createSession, type SessionContext, type SessionView } from '../../../src/dialup/session';
import type { GameEvent, GameState } from '../../../src/game/types';
import { applyCctvEvents, EMPTY_CCTV, type CctvState } from '../../../src/render/cctv/cctvState';
import { createLaneView } from '../../../src/render/laneView';
import type { SpriteAtlas } from '../../../src/render/sprites/atlas';
import { ENTITY_LOOKS } from '../../../src/render/sprites/entities';
import { createFakeAudioEngine } from '../../helpers/audio';
import {
  arbLaneRun,
  commandFor,
  FAST_CORE,
  laneRunSystems,
  type LaneAction,
  type LaneRunSpec,
} from '../../helpers/lane';
import { createManualLoop } from '../../helpers/loop';

afterEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

/** One rendered frame as the Lane_View feeds it to `applyCctvEvents`. */
interface CamFrame {
  readonly tick: number;
  readonly events: readonly GameEvent[];
  readonly critical: boolean;
  readonly liveIds: readonly number[] | undefined;
}

const arbEvent = (tick: number): fc.Arbitrary<GameEvent> =>
  fc.oneof(
    fc.record({ amount: fc.integer({ min: 1, max: 20 }), integrity: fc.integer({ min: 0, max: 100 }) }).map(
      (r): GameEvent => ({ type: 'modemHit', tick, ...r }),
    ),
    fc.integer({ min: 1, max: 20 }).map(
      (id): GameEvent => ({ type: 'mobSpawned', tick, id, kind: 'default', x: 100, source: 'schedule' }),
    ),
  );

/** Frames with strictly increasing ticks (steps of 0..15 ticks, like the real loop). */
const arbCamFrames: fc.Arbitrary<readonly CamFrame[]> = fc
  .array(
    fc.record({
      dt: fc.integer({ min: 0, max: 15 }),
      critical: fc.boolean(),
      liveIds: fc.option(fc.uniqueArray(fc.integer({ min: 1, max: 20 }), { maxLength: 6 }), { nil: undefined }),
      eventSeeds: fc.nat({ max: 3 }),
    }),
    { maxLength: 200 },
  )
  .chain((raw) => {
    let tick = 0;
    return fc.tuple(
      ...raw.map((r) => {
        tick += r.dt;
        const t = tick;
        return fc
          .array(arbEvent(t), { maxLength: r.eventSeeds })
          .map((events): CamFrame => ({ tick: t, events, critical: r.critical, liveIds: r.liveIds }));
      }),
    );
  });

function runCamera(frames: readonly CamFrame[]): CctvState[] {
  let s = EMPTY_CCTV;
  return frames.map((f) => (s = applyCctvEvents(s, f.events, f.tick, f.critical, f.liveIds)));
}

function boxAtlas(): SpriteAtlas {
  return {
    frameCount: () => 1,
    frame: () => null,
    colour: (entity) => ENTITY_LOOKS[entity].colour,
    ready: () => Promise.resolve(),
  };
}

/** A 2D context stand-in that accepts every call. */
function nullContext(): CanvasRenderingContext2D {
  const state: Record<string | symbol, unknown> = {};
  const gradient = { addColorStop: () => {} };
  return new Proxy(state, {
    get(target, key) {
      if (key in target) return target[key];
      if (key === 'createLinearGradient' || key === 'createRadialGradient') return () => gradient;
      if (key === 'createPattern') return () => ({});
      return () => {};
    },
    set(target, key, value) {
      target[key] = value;
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
}

const stubView = (): SessionView => ({ mount: () => {}, update: () => {}, unmount: () => {} });

interface Played {
  readonly frames: { readonly state: GameState; readonly events: readonly GameEvent[] }[];
  final: GameState | null;
}

function byTick(actions: readonly LaneAction[]): Map<number, LaneAction[]> {
  const map = new Map<number, LaneAction[]>();
  for (const a of actions) map.set(a.tick, [...(map.get(a.tick) ?? []), a]);
  return map;
}

/** Plays `spec` in a Session with `laneView` and a script view sending tick-aligned commands. */
function play(spec: LaneRunSpec, frames: readonly number[], laneView: SessionView): Played {
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
    views: [laneView, script],
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

describe('Property 7: camera state is deterministic and independent of the Run', () => {
  it('applying the same frames twice from EMPTY_CCTV gives equal states', () => {
    // Property: Req 5.4 camera state derives only from ticks, events and the critical flag
    // Feature: lane-cctv, Property 7: Camera state is deterministic and independent of the Run
    fc.assert(
      fc.property(arbCamFrames, (frames) => {
        expect(runCamera(frames)).toEqual(runCamera(frames));
      }),
      { numRuns: 200 },
    );
  });

  it('a Session with the CCTV Lane_View gives the same Run as with a stub view', () => {
    // Property: Req 7.4 the camera layer never changes the Run's states or events
    // Feature: lane-cctv, Property 7: Camera state is deterministic and independent of the Run
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation((() => nullContext()) as never);
    const arbFrames = fc
      .array(fc.integer({ min: 0, max: 15 }), { minLength: 1, maxLength: 40 })
      .map((frames) => (frames.some((n) => n > 0) ? frames : [...frames, 1]));
    fc.assert(
      fc.property(arbLaneRun(600), arbFrames, (spec, frames) => {
        const camera = play(spec, frames, createLaneView({ atlas: boxAtlas, devicePixelRatio: () => 1 }));
        const stub = play(spec, frames, stubView());
        expect(camera.frames).toEqual(stub.frames);
        expect(camera.final).toEqual(stub.final);
      }),
      { numRuns: 60 },
    );
  });
});
