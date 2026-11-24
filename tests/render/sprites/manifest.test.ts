import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { AnimationName } from '../../../src/render/sprites/entities';
import { buildManifest, SPRITE_PATH } from '../../../src/render/sprites/manifest';
import { SPRITE_MODULES } from '../../../src/render/sprites/spriteModules';

describe('buildManifest', () => {
  it('groups by entity and animation and orders frames by number', () => {
    const { manifest, problems } = buildManifest({
      '/assets/sprites/tank/walk/01.svg': 'u1',
      '/assets/sprites/tank/walk/00.svg': 'u0',
      '/assets/sprites/tank/idle/00.svg': 'i0',
      '/assets/sprites/spark-fx/die/00.svg': 's0',
    });
    expect(problems).toEqual([]);
    expect(manifest).toEqual({
      tank: { walk: ['u0', 'u1'], idle: ['i0'] },
      'spark-fx': { die: ['s0'] },
    });
  });

  it('drops bad paths and gapped animations with one problem each', () => {
    const { manifest, problems } = buildManifest({
      '/assets/sprites/tank/walk/00.svg': 'w0',
      '/assets/sprites/tank/walk/02.svg': 'w2',
      '/assets/sprites/tank/idle/00.svg': 'i0',
      '/assets/sprites/tank/dance/00.svg': 'x',
      '/assets/sprites/Tank/idle/00.svg': 'x',
      '/assets/sprites/tank/idle/1.svg': 'x',
    });
    expect(manifest).toEqual({ tank: { idle: ['i0'] } });
    expect(problems).toHaveLength(4);
    expect(problems.some((p) => p.includes('tank/walk') && p.includes('01'))).toBe(true);
  });

  it('gives an empty manifest for no files', () => {
    expect(buildManifest({})).toEqual({ manifest: {}, problems: [] });
  });

  it('SPRITE_PATH captures entity, animation and frame', () => {
    expect(SPRITE_PATH.exec('/assets/sprites/boss/hit/07.svg')?.slice(1)).toEqual(['boss', 'hit', '07']);
  });

  it('leaves out an entity whose animations are all broken and names the first missing frame', () => {
    const { manifest, problems } = buildManifest({
      '/assets/sprites/ghoul/walk/00.svg': 'w0',
      '/assets/sprites/ghoul/walk/03.svg': 'w3',
      '/assets/sprites/ghoul/walk/05.svg': 'w5',
      '/assets/sprites/fast/idle/00.svg': 'i0',
    });
    expect(manifest).toEqual({ fast: { idle: ['i0'] } });
    expect('ghoul' in manifest).toBe(false);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('/assets/sprites/ghoul/walk/');
    expect(problems[0]).toContain('01');
  });

  it('freezes the result, the manifest, each entity and each frame list', () => {
    const result = buildManifest({
      '/assets/sprites/boss/die/00.svg': 'd0',
      'bad.svg': 'x',
    });
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.manifest)).toBe(true);
    expect(Object.isFrozen(result.problems)).toBe(true);
    expect(Object.isFrozen(result.manifest.boss)).toBe(true);
    expect(Object.isFrozen(result.manifest.boss?.die)).toBe(true);
  });
});

const ANIMATIONS: readonly AnimationName[] = ['idle', 'walk', 'attack', 'hit', 'die', 'use'];

const pad = (n: number): string => n.toString().padStart(2, '0');
const framePath = (entity: string, animation: string, frame: number): string =>
  `/assets/sprites/${entity}/${animation}/${pad(frame)}.svg`;
const frameUrl = (entity: string, animation: string, frame: number): string =>
  `/hashed/${entity}-${animation}-${frame}.svg?url`;

interface AnimationSpec {
  readonly animation: AnimationName;
  readonly count: number;
  /** When set, this non-final frame number (< count − 1) is removed, breaking the animation. */
  readonly removed: number | null;
}
interface EntitySpec {
  readonly entity: string;
  readonly animations: readonly AnimationSpec[];
}

const arbEntityName = fc.stringMatching(/^[a-z][a-z0-9-]{0,9}$/);

const arbAnimationSpec = (animation: AnimationName, breakIt: boolean): fc.Arbitrary<AnimationSpec> =>
  fc.integer({ min: breakIt ? 2 : 1, max: 8 }).chain((count): fc.Arbitrary<AnimationSpec> =>
    breakIt
      ? fc.integer({ min: 0, max: count - 2 }).map((removed) => ({ animation, count, removed }))
      : fc.constant({ animation, count, removed: null }),
  );

const arbEntitySpec: fc.Arbitrary<EntitySpec> = fc
  .record({
    entity: arbEntityName,
    picks: fc.subarray([...ANIMATIONS], { minLength: 1 }),
  })
  .chain(({ entity, picks }) =>
    fc
      .tuple(...picks.map((a) => fc.boolean().chain((breakIt) => arbAnimationSpec(a, breakIt))))
      .map((animations) => ({ entity, animations })),
  );

/** Paths that break the naming rule by construction; none can match SPRITE_PATH. */
const arbMalformedPath: fc.Arbitrary<string> = fc
  .tuple(arbEntityName, fc.constantFrom(...ANIMATIONS), fc.integer({ min: 0, max: 99 }))
  .chain(([e, a, n]) =>
    fc.constantFrom(
      `/assets/sprites/${e}/dance/${pad(n)}.svg`,
      `/assets/sprites/${e.toUpperCase()}/${a}/${pad(n)}.svg`,
      `/assets/sprites/9${e}/${a}/${pad(n)}.svg`,
      `/assets/sprites/${e}/${a}/${n % 10}.svg`,
      `/assets/sprites/${e}/${a}/0${pad(n)}.svg`,
      `/assets/sprites/${e}/${a}/${pad(n)}.png`,
      `assets/sprites/${e}/${a}/${pad(n)}.svg`,
      `/assets/sprites/${e}/${a}/extra/${pad(n)}.svg`,
      `/assets/sprites/${e}/${pad(n)}.svg`,
    ),
  );

/** Entity specs, malformed paths, and a permutation seed for the key order of the input. */
const arbScenario = fc.record({
  entities: fc.uniqueArray(arbEntitySpec, { selector: (s) => s.entity, maxLength: 6 }),
  malformed: fc.uniqueArray(arbMalformedPath, { maxLength: 6 }),
  order: fc.array(fc.nat(), { minLength: 400, maxLength: 400 }),
});

/** Inserts entries into a fresh object in an order given by `order` (a shuffle of the keys). */
function shuffledModules(
  entries: readonly (readonly [string, string])[],
  order: readonly number[],
): Record<string, string> {
  const keyed = entries.map((entry, i) => ({ entry, key: order[i % order.length] ?? 0, i }));
  keyed.sort((x, y) => x.key - y.key || x.i - y.i);
  const modules: Record<string, string> = {};
  for (const { entry } of keyed) modules[entry[0]] = entry[1];
  return modules;
}

describe('Property 16', () => {
  it('the manifest keeps valid animations and reports broken ones', () => {
    // Feature: connection-lane, Property 16: The manifest keeps valid animations and reports broken ones
    // Property: Req 13.2 complete animations in shuffled order come back grouped by entity and
    // animation, with frames in number order, URLs unchanged and no problems
    fc.assert(
      fc.property(arbScenario, ({ entities, order }) => {
        const entries: [string, string][] = [];
        const expected: Record<string, Record<string, string[]>> = {};
        for (const { entity, animations } of entities) {
          const kept: Record<string, string[]> = {};
          for (const { animation, count } of animations) {
            kept[animation] = [];
            for (let f = 0; f < count; f += 1) {
              entries.push([framePath(entity, animation, f), frameUrl(entity, animation, f)]);
              kept[animation].push(frameUrl(entity, animation, f));
            }
          }
          expected[entity] = kept;
        }
        const { manifest, problems } = buildManifest(shuffledModules(entries, order));
        expect(problems).toEqual([]);
        expect(manifest).toEqual(expected);
      }),
      { numRuns: 200 },
    );

    // Property: Req 13.2, 13.3 after removing one non-final frame from some animations and adding
    // malformed paths, exactly the complete animations survive (entities with none left are
    // omitted) and there is exactly one problem per broken animation and per malformed path
    fc.assert(
      fc.property(arbScenario, ({ entities, malformed, order }) => {
        const entries: [string, string][] = [];
        const expected: Record<string, Record<string, string[]>> = {};
        const broken: { entity: string; animation: string; missing: number }[] = [];
        for (const { entity, animations } of entities) {
          const kept: Record<string, string[]> = {};
          for (const { animation, count, removed } of animations) {
            for (let f = 0; f < count; f += 1) {
              if (f === removed) continue;
              entries.push([framePath(entity, animation, f), frameUrl(entity, animation, f)]);
            }
            if (removed === null) {
              kept[animation] = Array.from({ length: count }, (_, f) => frameUrl(entity, animation, f));
            } else {
              broken.push({ entity, animation, missing: removed });
            }
          }
          if (Object.keys(kept).length > 0) expected[entity] = kept;
        }
        for (const path of malformed) entries.push([path, `/hashed/bad.svg?url`]);

        const { manifest, problems } = buildManifest(shuffledModules(entries, order));

        expect(manifest).toEqual(expected);
        expect(problems).toHaveLength(broken.length + malformed.length);
        for (const path of malformed) {
          expect(problems.filter((p) => p.startsWith(`${path}: `))).toHaveLength(1);
        }
        for (const { entity, animation, missing } of broken) {
          const prefix = `/assets/sprites/${entity}/${animation}/: `;
          const mine = problems.filter((p) => p.startsWith(prefix));
          expect(mine).toHaveLength(1);
          // The message after the folder names the first missing frame number.
          expect(mine[0]?.slice(prefix.length)).toContain(pad(missing));
        }
      }),
      { numRuns: 200 },
    );
  });
});

describe('SPRITE_MODULES', () => {
  it('is {} while assets/sprites/ is absent', () => {
    expect(SPRITE_MODULES).toEqual({});
  });
});
