import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createSpriteAtlas,
  defaultTargetHeight,
  rasterSize,
  type AtlasDeps,
  type LoadedImage,
  type SpriteAtlas,
} from '../../../src/render/sprites/atlas';
import {
  ENTITY_LOOKS,
  type AnimationName,
  type SpriteEntity,
} from '../../../src/render/sprites/entities';
import { PLACEHOLDER_FRAME_COUNT, placeholderFrames } from '../../../src/render/sprites/placeholder';
import type { SpriteManifest } from '../../../src/render/sprites/manifest';

const ENTITIES = Object.keys(ENTITY_LOOKS) as SpriteEntity[];

/** Every (entity, animation) pair the Lane_View asks for. */
function allSlots(): [SpriteEntity, AnimationName][] {
  return ENTITIES.flatMap((entity) =>
    ENTITY_LOOKS[entity].animations.map((animation): [SpriteEntity, AnimationName] => [entity, animation]),
  );
}

function fakeDeps(manifest: SpriteManifest, failing: ReadonlySet<string> = new Set()) {
  const loaded: string[] = [];
  const deps: AtlasDeps = {
    manifest,
    loadImage: async (url) => {
      loaded.push(url);
      if (failing.has(url)) throw new Error('broken');
      return { image: {} as CanvasImageSource, width: 0, height: 0 };
    },
    createRaster: () => ({
      canvas: {} as CanvasImageSource,
      ctx: { drawImage: () => undefined } as unknown as CanvasRenderingContext2D,
    }),
    targetHeight: defaultTargetHeight,
  };
  return { deps, loaded };
}

interface Deferred {
  readonly resolve: (loaded: LoadedImage) => void;
  readonly reject: (error: Error) => void;
}

/**
 * Fake deps where every load waits until the test settles it. Each image and raster carries the
 * URL it came from, so a test can tell which frames were drawn.
 */
function controlledDeps(manifest: SpriteManifest) {
  const loads = new Map<string, Deferred>();
  const drawn: string[] = [];
  const deps: AtlasDeps = {
    manifest,
    loadImage: (url) =>
      new Promise<LoadedImage>((resolve, reject) => {
        loads.set(url, { resolve, reject });
      }),
    createRaster: () => {
      const canvas = { from: '' };
      const ctx = {
        drawImage: (image: { url: string }) => {
          canvas.from = image.url;
          drawn.push(image.url);
        },
      };
      return {
        canvas: canvas as unknown as CanvasImageSource,
        ctx: ctx as unknown as CanvasRenderingContext2D,
      };
    },
    targetHeight: defaultTargetHeight,
  };
  const image = (url: string): LoadedImage => ({
    image: { url } as unknown as CanvasImageSource,
    width: 0,
    height: 0,
  });
  const settle = (url: string, outcome: 'ok' | 'fail') => {
    const load = loads.get(url);
    if (load === undefined) throw new Error(`not requested: ${url}`);
    if (outcome === 'ok') load.resolve(image(url));
    else load.reject(new Error('broken'));
  };
  return { deps, loads, drawn, settle };
}

/** Lets queued promise callbacks run. */
async function flush(): Promise<void> {
  for (let i = 0; i < 10; i += 1) await Promise.resolve();
}

function sourceOf(atlas: SpriteAtlas, entity: SpriteEntity, animation: AnimationName, index: number) {
  return (atlas.frame(entity, animation, index)?.image as unknown as { from: string } | undefined)?.from;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('createSpriteAtlas', () => {
  it('uses placeholders, rasterizes each frame once and is null before ready()', async () => {
    const { deps, loaded } = fakeDeps({});
    const atlas = createSpriteAtlas(deps);
    expect(atlas.frameCount('tank', 'walk')).toBe(PLACEHOLDER_FRAME_COUNT.walk);
    expect(atlas.frame('tank', 'walk', 0)).toBeNull();
    await atlas.ready();
    expect(atlas.frame('tank', 'walk', 0)?.aspect).toBeCloseTo(72 / 96, 2);
    expect(loaded.every((url) => url.startsWith('data:image/svg+xml'))).toBe(true);
    expect(new Set(loaded).size).toBe(loaded.length);
  });

  it('with an empty manifest every entity and animation uses placeholder counts and URLs (Req 13.4)', async () => {
    const { deps, loaded } = fakeDeps({});
    const atlas = createSpriteAtlas(deps);
    const expected = allSlots().flatMap(([entity, animation]) => {
      expect(atlas.frameCount(entity, animation)).toBe(PLACEHOLDER_FRAME_COUNT[animation]);
      return placeholderFrames(entity, animation);
    });
    await atlas.ready();
    expect([...loaded].sort()).toEqual([...expected].sort());
    for (const [entity, animation] of allSlots()) {
      for (let i = 0; i < atlas.frameCount(entity, animation); i += 1) {
        expect(atlas.frame(entity, animation, i)).not.toBeNull();
      }
    }
  });

  it('frame() is null for every frame before ready() and set for every frame after (Req 13.6)', async () => {
    const { deps } = fakeDeps({ tank: { walk: ['/t/00.svg', '/t/01.svg', '/t/02.svg'] } });
    const atlas = createSpriteAtlas(deps);
    for (const [entity, animation] of allSlots()) {
      for (let i = 0; i < atlas.frameCount(entity, animation); i += 1) {
        expect(atlas.frame(entity, animation, i)).toBeNull();
      }
    }
    await atlas.ready();
    for (let i = 0; i < 3; i += 1) expect(atlas.frame('tank', 'walk', i)).not.toBeNull();
  });

  it('loads each URL once however often frame() is called (Req 13.6)', async () => {
    const { deps, loaded } = fakeDeps({ tank: { walk: ['/t/00.svg', '/t/01.svg'] } });
    const atlas = createSpriteAtlas(deps);
    const total = allSlots().reduce((sum, [e, a]) => sum + atlas.frameCount(e, a), 0);
    const pound = () => {
      for (let n = 0; n < 50; n += 1) {
        for (const [entity, animation] of allSlots()) {
          for (let i = 0; i < atlas.frameCount(entity, animation); i += 1) atlas.frame(entity, animation, i);
        }
      }
    };
    pound();
    await atlas.ready();
    pound();
    await atlas.ready();
    expect(loaded).toHaveLength(total);
    expect(new Set(loaded).size).toBe(total);
  });

  it('team frames for tank/walk replace only that animation (Req 13.7)', async () => {
    const team = ['/t/00.svg', '/t/01.svg'];
    const { deps, loaded } = fakeDeps({ tank: { walk: team } });
    const atlas = createSpriteAtlas(deps);
    await atlas.ready();
    expect(atlas.frameCount('tank', 'walk')).toBe(2);
    for (const [entity, animation] of allSlots()) {
      if (entity === 'tank' && animation === 'walk') continue;
      expect(atlas.frameCount(entity, animation)).toBe(PLACEHOLDER_FRAME_COUNT[animation]);
    }
    expect(loaded.filter((url) => !url.startsWith('data:'))).toEqual(team);
    expect(loaded.some((url) => placeholderFrames('tank', 'walk').includes(url))).toBe(false);
  });

  it('draws team frames, not placeholders, into the tank/walk rasters (Req 13.7)', async () => {
    const { deps, settle, loads } = controlledDeps({ tank: { walk: ['/t/00.svg'] } });
    const atlas = createSpriteAtlas(deps);
    for (const url of loads.keys()) settle(url, 'ok');
    await atlas.ready();
    expect(sourceOf(atlas, 'tank', 'walk', 0)).toBe('/t/00.svg');
    expect(sourceOf(atlas, 'tank', 'idle', 0)).toBe(placeholderFrames('tank', 'idle')[0]);
  });

  it('uses team frames for one animation and falls back when one fails', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { deps } = fakeDeps(
      { tank: { walk: ['/t/00.svg', '/t/01.svg'] }, fast: { walk: ['/f/00.svg'] } },
      new Set(['/f/00.svg']),
    );
    const atlas = createSpriteAtlas(deps);
    expect(atlas.frameCount('tank', 'walk')).toBe(2);
    expect(atlas.frameCount('tank', 'idle')).toBe(PLACEHOLDER_FRAME_COUNT.idle);
    await atlas.ready();
    expect(atlas.frame('tank', 'walk', 1)).not.toBeNull();
    expect(atlas.frameCount('fast', 'walk')).toBe(PLACEHOLDER_FRAME_COUNT.walk);
    expect(atlas.frame('fast', 'walk', 3)).not.toBeNull();
    expect(warn).toHaveBeenCalledWith('sprite failed: /f/00.svg');
    warn.mockRestore();
  });

  it('falls back when loadImage throws synchronously', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { deps } = fakeDeps({ boss: { die: ['/b/00.svg'] } });
    const inner = deps.loadImage;
    const atlas = createSpriteAtlas({
      ...deps,
      loadImage: (url) => {
        if (url === '/b/00.svg') throw new Error('sync boom');
        return inner(url);
      },
    });
    await atlas.ready();
    expect(atlas.frameCount('boss', 'die')).toBe(PLACEHOLDER_FRAME_COUNT.die);
    expect(atlas.frame('boss', 'die', 0)).not.toBeNull();
    expect(warn).toHaveBeenCalledWith('sprite failed: /b/00.svg');
  });

  it('ready() waits for the fallback placeholders to load', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { deps, loads, settle } = controlledDeps({ ranged: { attack: ['/r/00.svg'] } });
    const atlas = createSpriteAtlas(deps);
    for (const url of loads.keys()) if (url !== '/r/00.svg') settle(url, 'ok');
    let done = false;
    const ready = atlas.ready().then(() => {
      done = true;
    });
    settle('/r/00.svg', 'fail');
    await flush();
    const fallback = placeholderFrames('ranged', 'attack');
    expect(fallback.every((url) => loads.has(url))).toBe(true);
    expect(done).toBe(false);
    for (const url of fallback) settle(url, 'ok');
    await ready;
    expect(done).toBe(true);
    for (let i = 0; i < fallback.length; i += 1) {
      expect(sourceOf(atlas, 'ranged', 'attack', i)).toBe(fallback[i]);
    }
  });

  it('ignores team frames that finish loading after the animation fell back', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { deps, loads, settle, drawn } = controlledDeps({
      tank: { walk: ['/t/00.svg', '/t/01.svg'] },
    });
    const atlas = createSpriteAtlas(deps);
    settle('/t/00.svg', 'fail');
    await flush();
    for (const url of loads.keys()) if (!url.startsWith('/t/')) settle(url, 'ok');
    settle('/t/01.svg', 'ok');
    await atlas.ready();
    expect(drawn).not.toContain('/t/01.svg');
    expect(atlas.frameCount('tank', 'walk')).toBe(PLACEHOLDER_FRAME_COUNT.walk);
    expect(sourceOf(atlas, 'tank', 'walk', 1)).toBe(placeholderFrames('tank', 'walk')[1]);
  });

  it('warns once per animation and never shows team frames mixed with placeholders (Req 2.3)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { deps, loads, settle } = controlledDeps({
      tank: { walk: ['/t/00.svg', '/t/01.svg', '/t/02.svg'] },
    });
    const atlas = createSpriteAtlas(deps);
    settle('/t/00.svg', 'ok');
    await flush();
    // One team frame is ready but the animation is not complete: nothing team is shown yet.
    expect(atlas.frame('tank', 'walk', 0)).toBeNull();
    settle('/t/01.svg', 'fail');
    settle('/t/02.svg', 'fail');
    await flush();
    for (const url of loads.keys()) if (!url.startsWith('/t/')) settle(url, 'ok');
    await atlas.ready();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith('sprite failed: /t/01.svg');
    const fallback = placeholderFrames('tank', 'walk');
    for (let i = 0; i < fallback.length; i += 1) expect(sourceOf(atlas, 'tank', 'walk', i)).toBe(fallback[i]);
  });

  it('falls back when a team frame fails to rasterize (Req 2.3)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { deps } = fakeDeps({ fast: { walk: ['/f/00.svg', '/f/01.svg'] } });
    let calls = 0;
    const atlas = createSpriteAtlas({
      ...deps,
      createRaster: () => ({
        canvas: {} as CanvasImageSource,
        ctx: {
          drawImage: (image: { bad?: boolean }) => {
            calls += 1;
            if (image.bad) throw new Error('raster boom');
          },
        } as unknown as CanvasRenderingContext2D,
      }),
      loadImage: async (url) => ({
        image: { bad: url === '/f/01.svg' } as unknown as CanvasImageSource,
        width: 0,
        height: 0,
      }),
    });
    await atlas.ready();
    expect(calls).toBeGreaterThan(0);
    expect(atlas.frameCount('fast', 'walk')).toBe(PLACEHOLDER_FRAME_COUNT.walk);
    expect(atlas.frame('fast', 'walk', 0)).not.toBeNull();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith('sprite failed: /f/01.svg');
  });

  it('keeps frame() null when the raster has no 2D context', async () => {
    const { deps } = fakeDeps({});
    const atlas = createSpriteAtlas({
      ...deps,
      createRaster: () => ({ canvas: {} as CanvasImageSource, ctx: null }),
    });
    await atlas.ready();
    expect(atlas.frameCount('default', 'walk')).toBe(PLACEHOLDER_FRAME_COUNT.walk);
    expect(atlas.frame('default', 'walk', 0)).toBeNull();
  });

  it('returns null for an out-of-range frame index', async () => {
    const { deps } = fakeDeps({});
    const atlas = createSpriteAtlas(deps);
    await atlas.ready();
    const n = atlas.frameCount('tank', 'walk');
    expect(atlas.frame('tank', 'walk', n - 1)).not.toBeNull();
    expect(atlas.frame('tank', 'walk', n)).toBeNull();
    expect(atlas.frame('tank', 'walk', -1)).toBeNull();
  });

  it('sizes each raster with rasterSize at the target height and keeps the natural aspect', async () => {
    const sizes: [number, number][] = [];
    const { deps } = fakeDeps({ tank: { walk: ['/t/00.svg'] } });
    const atlas = createSpriteAtlas({
      ...deps,
      loadImage: async (url) => ({
        image: {} as CanvasImageSource,
        width: url === '/t/00.svg' ? 300 : 0,
        height: url === '/t/00.svg' ? 100 : 0,
      }),
      createRaster: (w, h) => {
        sizes.push([w, h]);
        return deps.createRaster(w, h);
      },
    });
    await atlas.ready();
    const tankH = defaultTargetHeight('tank');
    expect(sizes).toContainEqual([tankH * 3, tankH]);
    expect(atlas.frame('tank', 'walk', 0)?.aspect).toBe(3);
    expect(atlas.frame('tank', 'idle', 0)?.aspect).toBeCloseTo(72 / 96, 2);
  });

  it('colour() comes from ENTITY_LOOKS', () => {
    const atlas = createSpriteAtlas(fakeDeps({}).deps);
    for (const entity of ENTITIES) expect(atlas.colour(entity)).toBe(ENTITY_LOOKS[entity].colour);
  });
});

describe('rasterSize', () => {
  it('keeps the natural aspect and falls back to the box when natural size is 0', () => {
    expect(rasterSize({ w: 100, h: 50 }, { w: 10, h: 10 }, 40)).toEqual({ w: 80, h: 40 });
    expect(rasterSize({ w: 0, h: 0 }, { w: 44, h: 72 }, 144)).toEqual({ w: 88, h: 144 });
  });

  it('uses the box when only one natural side is 0 and never returns less than 1 × 1', () => {
    expect(rasterSize({ w: 120, h: 0 }, { w: 44, h: 72 }, 144)).toEqual({ w: 88, h: 144 });
    expect(rasterSize({ w: 0, h: 120 }, { w: 44, h: 72 }, 144)).toEqual({ w: 88, h: 144 });
    expect(rasterSize({ w: 1, h: 1000 }, { w: 10, h: 10 }, 0)).toEqual({ w: 1, h: 1 });
  });
});

describe('getDefaultAtlas', () => {
  const MODULES = {
    '/assets/sprites/tank/walk/00.svg': '/built/tank-walk-00.svg',
    '/assets/sprites/tank/walk/01.svg': '/built/tank-walk-01.svg',
    '/assets/sprites/tank/bad-name.svg': '/built/bad.svg',
    '/assets/sprites/fast/walk/01.svg': '/built/fast-walk-01.svg',
  };

  afterEach(() => {
    vi.doUnmock('../../../src/render/sprites/spriteModules');
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  /** Counts `new Image()` and the URLs given to it. jsdom never fires load, so ready() is not awaited. */
  function stubImage() {
    const sources: string[] = [];
    class FakeImage {
      decoding = '';
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      naturalWidth = 0;
      naturalHeight = 0;
      set src(url: string) {
        sources.push(url);
      }
    }
    vi.stubGlobal('Image', FakeImage);
    return sources;
  }

  async function importWithModules() {
    vi.resetModules();
    vi.doMock('../../../src/render/sprites/spriteModules', () => ({ SPRITE_MODULES: MODULES }));
    return import('../../../src/render/sprites/atlas');
  }

  it('loads nothing and logs nothing at import time', async () => {
    const sources = stubImage();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    await importWithModules();
    await flush();
    expect(sources).toEqual([]);
    expect(warn).not.toHaveBeenCalled();
  });

  it('is a singleton over SPRITE_MODULES that logs manifest problems once', async () => {
    const sources = stubImage();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { getDefaultAtlas } = await importWithModules();
    const first = getDefaultAtlas();
    const problems = warn.mock.calls.length;
    expect(problems).toBe(2);
    expect(warn.mock.calls.every(([message]) => String(message).startsWith('Sprite manifest:'))).toBe(true);
    expect(warn.mock.calls.some(([message]) => String(message).includes('bad-name.svg'))).toBe(true);
    expect(warn.mock.calls.some(([message]) => String(message).includes('fast'))).toBe(true);
    const second = getDefaultAtlas();
    expect(second).toBe(first);
    expect(warn).toHaveBeenCalledTimes(problems);
    expect(first.frameCount('tank', 'walk')).toBe(2);
    expect(first.frameCount('fast', 'walk')).toBe(PLACEHOLDER_FRAME_COUNT.walk);
    expect(first.frame('tank', 'walk', 0)).toBeNull();
    const total = allSlots().reduce((sum, [e, a]) => sum + first.frameCount(e, a), 0);
    expect(sources).toHaveLength(total);
    expect(sources).toContain('/built/tank-walk-00.svg');
    expect(sources).not.toContain('/built/fast-walk-01.svg');
  });
});
