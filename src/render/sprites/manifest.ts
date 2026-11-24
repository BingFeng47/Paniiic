// Pure builder for the Sprite_Manifest: entity → animation → frame URLs. It takes the result of
// the one `import.meta.glob` call (see spriteModules.ts) so it can be tested with made-up paths
// and works with zero files. No DOM.

import type { AnimationName } from './entities';

export type SpriteManifest = Readonly<
  Record<string, Readonly<Partial<Record<AnimationName, readonly string[]>>>>
>;

export interface ManifestResult {
  readonly manifest: SpriteManifest;
  readonly problems: readonly string[];
}

/** `/assets/sprites/<entity>/<animation>/<NN>.svg` (see .kiro/steering/sprites.md). */
export const SPRITE_PATH =
  /^\/assets\/sprites\/([a-z][a-z0-9-]*)\/(idle|walk|attack|hit|die|use)\/(\d{2})\.svg$/;

/**
 * Groups frame URLs by entity and animation, ordered by frame number (Req 13.2). A path that
 * breaks the naming rule, or an animation whose frames do not run 00..n−1 without gaps, is left
 * out with one problem each (Req 13.3).
 */
export function buildManifest(modules: Readonly<Record<string, string>>): ManifestResult {
  const problems: string[] = [];
  const grouped = new Map<string, Map<AnimationName, Map<number, string>>>();

  for (const path of Object.keys(modules).sort()) {
    const match = SPRITE_PATH.exec(path);
    if (match === null) {
      problems.push(`${path}: does not match assets/sprites/<entity>/<animation>/<NN>.svg`);
      continue;
    }
    const entity = match[1] as string;
    const animation = match[2] as AnimationName;
    const frame = Number(match[3]);
    let animations = grouped.get(entity);
    if (animations === undefined) {
      animations = new Map();
      grouped.set(entity, animations);
    }
    let frames = animations.get(animation);
    if (frames === undefined) {
      frames = new Map();
      animations.set(animation, frames);
    }
    // Two-digit names make each path's frame number unique within its folder.
    frames.set(frame, modules[path] as string);
  }

  const manifest: Record<string, Partial<Record<AnimationName, readonly string[]>>> = {};
  for (const [entity, animations] of grouped) {
    const kept: Partial<Record<AnimationName, readonly string[]>> = {};
    for (const [animation, frames] of animations) {
      const missing = firstMissing(frames);
      if (missing !== null) {
        problems.push(
          `/assets/sprites/${entity}/${animation}/: frame ${pad(missing)} is missing; animation skipped`,
        );
        continue;
      }
      const urls: string[] = [];
      for (let i = 0; i < frames.size; i += 1) urls.push(frames.get(i) as string);
      kept[animation] = Object.freeze(urls);
    }
    if (Object.keys(kept).length > 0) manifest[entity] = Object.freeze(kept);
  }

  return Object.freeze({ manifest: Object.freeze(manifest), problems: Object.freeze(problems) });
}

/** The lowest number in 0..n−1 (n = frame count) with no file, or null when complete. */
function firstMissing(frames: ReadonlyMap<number, string>): number | null {
  for (let i = 0; i < frames.size; i += 1) {
    if (!frames.has(i)) return i;
  }
  return null;
}

function pad(n: number): string {
  return n.toString().padStart(2, '0');
}
