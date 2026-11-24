// Sprite_Atlas: for every entity and animation the Lane_View asks for, the team's frames from the
// Sprite_Manifest when present (Req 13.7), else generated placeholders (Req 13.4). Each frame URL
// is loaded and drawn into its own offscreen canvas once (Req 13.6); the view then draws those
// canvases with `drawImage`. `frame()` is `null` until a frame is rasterized, and the view draws a
// flat box in the entity colour in its place.
//
// Image loading and canvas creation are injected so jsdom tests need neither. `getDefaultAtlas()`
// wires the real browser versions and is lazy: nothing loads at module import time.
import { ENTITY_LOOKS, type AnimationName, type SpriteEntity } from './entities';
import { buildManifest, type SpriteManifest } from './manifest';
import { placeholderFrames } from './placeholder';
import { SPRITE_MODULES } from './spriteModules';

export interface RasterFrame {
  readonly image: CanvasImageSource;
  /** Raster width / height. */
  readonly aspect: number;
}

export interface SpriteAtlas {
  frameCount(entity: SpriteEntity, animation: AnimationName): number;
  /** null until the frame is rasterized (Req 13.6). */
  frame(entity: SpriteEntity, animation: AnimationName, index: number): RasterFrame | null;
  colour(entity: SpriteEntity): string;
  /** Resolves once every load has finished or failed (for tests). */
  ready(): Promise<void>;
}

export interface LoadedImage {
  readonly image: CanvasImageSource;
  readonly width: number;
  readonly height: number;
}

export interface Raster {
  readonly canvas: CanvasImageSource;
  readonly ctx: CanvasRenderingContext2D | null;
}

export interface AtlasDeps {
  readonly manifest: SpriteManifest;
  readonly loadImage: (url: string) => Promise<LoadedImage>;
  readonly createRaster: (w: number, h: number) => Raster;
  /** Raster height in px for an entity (box height × RASTER_SCALE by default). */
  readonly targetHeight: (entity: SpriteEntity) => number;
}

/**
 * Raster px per placeholder box unit. The Lane_View caps devicePixelRatio at 2 and the default
 * layout maps one Lane_Unit to one canvas px, so 2× keeps frames sharp on high-DPI screens.
 */
export const RASTER_SCALE = 2;

/** Default raster height: the entity's box height × RASTER_SCALE. */
export function defaultTargetHeight(entity: SpriteEntity): number {
  return ENTITY_LOOKS[entity].box.h * RASTER_SCALE;
}

/**
 * Whole-pixel raster size `targetH` px tall. Keeps the natural aspect when the natural size is
 * above 0, else the box aspect (an SVG without width/height can report 0). At least 1 × 1.
 */
export function rasterSize(
  natural: { readonly w: number; readonly h: number },
  box: { readonly w: number; readonly h: number },
  targetH: number,
): { w: number; h: number } {
  const aspect = natural.w > 0 && natural.h > 0 ? natural.w / natural.h : box.w / box.h;
  const h = Math.max(1, Math.round(targetH));
  const w = Math.max(1, Math.round(h * aspect));
  return { w, h };
}

type Source = 'team' | 'placeholder';

interface Slot {
  readonly source: Source;
  readonly urls: readonly string[];
  /** What frame() returns. Team frames are published all at once, so no mix is ever shown. */
  frames: (RasterFrame | null)[];
  /** Team frames rasterized so far, kept hidden until every frame of the animation is done. */
  readonly staged: (RasterFrame | null)[];
  done: number;
}

const ENTITIES = Object.keys(ENTITY_LOOKS) as SpriteEntity[];

function slotKey(entity: SpriteEntity, animation: AnimationName): string {
  return `${entity}/${animation}`;
}

export function createSpriteAtlas(deps: AtlasDeps): SpriteAtlas {
  const slots = new Map<string, Slot>();
  const pending = new Set<Promise<void>>();

  /** Throws when drawing fails, so a broken team frame falls back like a failed load. */
  const rasterize = (entity: SpriteEntity, loaded: LoadedImage): RasterFrame | null => {
    const size = rasterSize(
      { w: loaded.width, h: loaded.height },
      ENTITY_LOOKS[entity].box,
      deps.targetHeight(entity),
    );
    const raster = deps.createRaster(size.w, size.h);
    // No 2D context (old browser, jsdom): the frame stays null and the view draws a flat box.
    if (raster.ctx === null) return null;
    raster.ctx.drawImage(loaded.image, 0, 0, size.w, size.h);
    return Object.freeze({ image: raster.canvas, aspect: size.w / size.h });
  };

  const loadFrame = (entity: SpriteEntity, animation: AnimationName, slot: Slot, index: number) => {
    const url = slot.urls[index] as string;
    const key = slotKey(entity, animation);
    const current = () => slots.get(key) === slot;
    // `new Promise` turns a synchronous throw in loadImage into a rejection.
    const task: Promise<void> = new Promise<LoadedImage>((resolve) => resolve(deps.loadImage(url)))
      .then((loaded) => {
        // A fallback may have replaced this slot while the image was loading.
        if (!current()) return;
        const frame = rasterize(entity, loaded);
        if (slot.source === 'placeholder') {
          slot.frames[index] = frame;
          return;
        }
        slot.staged[index] = frame;
        slot.done += 1;
        if (slot.done === slot.urls.length) slot.frames = [...slot.staged];
      })
      .catch(() => {
        // The first failure in a team animation warns once and swaps the whole slot; later
        // failures in the same animation find the slot already replaced and stay quiet.
        if (slot.source === 'team' && current()) {
          console.warn(`sprite failed: ${url}`);
          usePlaceholders(entity, animation);
        }
        // A failed placeholder frame stays null and the view draws a flat box.
      });
    pending.add(task);
    void task.then(() => pending.delete(task));
  };

  const fill = (entity: SpriteEntity, animation: AnimationName, source: Source, urls: readonly string[]) => {
    const slot: Slot = {
      source,
      urls,
      frames: urls.map(() => null),
      staged: urls.map(() => null),
      done: 0,
    };
    slots.set(slotKey(entity, animation), slot);
    for (let i = 0; i < urls.length; i += 1) loadFrame(entity, animation, slot, i);
  };

  const usePlaceholders = (entity: SpriteEntity, animation: AnimationName) => {
    fill(entity, animation, 'placeholder', placeholderFrames(entity, animation));
  };

  for (const entity of ENTITIES) {
    for (const animation of ENTITY_LOOKS[entity].animations) {
      const team = deps.manifest[entity]?.[animation];
      if (team !== undefined && team.length > 0) fill(entity, animation, 'team', team);
      else usePlaceholders(entity, animation);
    }
  }

  return {
    frameCount(entity, animation) {
      return slots.get(slotKey(entity, animation))?.frames.length ?? 0;
    },
    frame(entity, animation, index) {
      return slots.get(slotKey(entity, animation))?.frames[index] ?? null;
    },
    colour(entity) {
      return ENTITY_LOOKS[entity].colour;
    },
    async ready() {
      // A failing team frame adds placeholder loads, so wait until nothing is left in flight.
      while (pending.size > 0) await Promise.all([...pending]);
    },
  };
}

/** Real browser image loading. */
function loadBrowserImage(url: string): Promise<LoadedImage> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = 'async';
    image.onload = () =>
      resolve({ image, width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = () => reject(new Error(`Could not load image ${url}`));
    image.src = url;
  });
}

/** An offscreen `<canvas>` of the given size; `ctx` is null where 2D canvas is unavailable. */
function createBrowserRaster(w: number, h: number): Raster {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  let ctx: CanvasRenderingContext2D | null = null;
  try {
    ctx = canvas.getContext('2d');
  } catch {
    ctx = null;
  }
  return { canvas, ctx };
}

let defaultAtlas: SpriteAtlas | null = null;

/** Lazy singleton over SPRITE_MODULES, real Image loading and offscreen canvases. Logs manifest problems once. */
export function getDefaultAtlas(): SpriteAtlas {
  if (defaultAtlas === null) {
    const { manifest, problems } = buildManifest(SPRITE_MODULES);
    for (const problem of problems) console.warn(`Sprite manifest: ${problem}`);
    defaultAtlas = createSpriteAtlas({
      manifest,
      loadImage: loadBrowserImage,
      createRaster: createBrowserRaster,
      targetHeight: defaultTargetHeight,
    });
  }
  return defaultAtlas;
}
