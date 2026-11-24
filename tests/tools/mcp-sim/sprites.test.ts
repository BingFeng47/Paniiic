// @vitest-environment node
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { ANIMATION_TABLE } from '../../../src/render/sprites/animationTable';
import { validateSpriteFiles } from '../../../tools/mcp-sim/src/sprites';

// No @types/node in the repo: node modules are loaded dynamically with minimal local types.
interface NodeFs {
  mkdtempSync(prefix: string): string;
  mkdirSync(path: string, options: { recursive: true }): void;
  writeFileSync(path: string, text: string): void;
  symlinkSync(target: string, path: string): void;
  rmSync(path: string, options: { recursive: true; force: true }): void;
}
let mkdtempSync: NodeFs['mkdtempSync'];
let mkdirSync: NodeFs['mkdirSync'];
let writeFileSync: NodeFs['writeFileSync'];
let symlinkSync: NodeFs['symlinkSync'];
let rmSync: NodeFs['rmSync'];
let tmpdir: () => string;
let join: (...parts: string[]) => string;
beforeAll(async () => {
  const fs = (await import('node:fs' as string)) as NodeFs;
  ({ mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync } = fs);
  ({ tmpdir } = (await import('node:os' as string)) as { tmpdir: () => string });
  ({ join } = (await import('node:path' as string)) as { join: (...parts: string[]) => string });
});

const dirs: string[] = [];
const tmp = (): string => {
  const d = mkdtempSync(join(tmpdir(), 'sprites-'));
  dirs.push(d);
  return d;
};
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

const allKeys = Object.entries(ANIMATION_TABLE as Record<string, Record<string, unknown>>).flatMap(
  ([e, anims]) => Object.keys(anims).map((a) => `${e}/${a}`),
);

describe('validateSpriteFiles', () => {
  it('missing assets/sprites folder: no problems, everything missing', async () => {
    const r = await validateSpriteFiles({ root: tmp() });
    expect(r.problems).toEqual([]);
    expect([...r.missing].sort()).toEqual([...allKeys].sort());
  });

  it('reports present frames, problems, and rejects paths outside the folder', async () => {
    const root = tmp();
    const [entity, animation] = (allKeys[0] as string).split('/') as [string, string];
    const animDir = join(root, 'assets', 'sprites', entity, animation);
    mkdirSync(animDir, { recursive: true });
    writeFileSync(join(animDir, '00.svg'), '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect/></svg>');
    writeFileSync(join(animDir, '01.svg'), '<svg viewBox="0 0 32 32"><script>x()</script></svg>');
    const outside = join(tmp(), 'secret.svg');
    writeFileSync(outside, '<svg/>');
    symlinkSync(outside, join(animDir, '02.svg'));

    const r = await validateSpriteFiles({ root });
    expect(r.missing).not.toContain(`${entity}/${animation}`);
    expect(r.missing.length).toBe(allKeys.length - 1);
    expect(r.problems.some((p) => p.rule === 'script' && p.path.endsWith('/01.svg'))).toBe(true);
    expect(r.problems.some((p) => p.path.endsWith('/02.svg') && /outside/.test(p.detail))).toBe(true);
  });
});

import { validateSprites } from '../../../src/render/sprites/validate';

describe('validateSpriteFiles (Req 5.1–5.3)', () => {
  it('empty assets/sprites folder: no problems, everything missing', async () => {
    const root = tmp();
    mkdirSync(join(root, 'assets', 'sprites'), { recursive: true });
    const r = await validateSpriteFiles({ root });
    expect(r.problems).toEqual([]);
    expect([...r.missing].sort()).toEqual([...allKeys].sort());
  });

  it('rejects a symlinked directory that escapes the folder and never reads it', async () => {
    const root = tmp();
    const sprites = join(root, 'assets', 'sprites');
    mkdirSync(sprites, { recursive: true });
    const outside = tmp();
    const [entity, animation] = (allKeys[0] as string).split('/') as [string, string];
    mkdirSync(join(outside, animation), { recursive: true });
    writeFileSync(join(outside, animation, '00.svg'), '<svg viewBox="0 0 32 32"/>');
    symlinkSync(outside, join(sprites, entity));
    const r = await validateSpriteFiles({ root });
    expect(r.problems).toEqual([
      { path: `/assets/sprites/${entity}`, rule: 'path', detail: expect.stringMatching(/outside/) },
    ]);
    expect(r.missing).toContain(`${entity}/${animation}`);
  });

  it('passes the final-art validator results through unchanged', async () => {
    const root = tmp();
    const [entity, animation] = (allKeys[0] as string).split('/') as [string, string];
    const animDir = join(root, 'assets', 'sprites', entity, animation);
    mkdirSync(animDir, { recursive: true });
    const files = [
      { name: '00.svg', text: '<svg viewBox="0 0 32 32"><image href="x.png"/></svg>' },
      { name: '02.svg', text: '<svg viewBox="0 0 16 16"><use href="http://e.com/a.svg#b"/></svg>' },
    ];
    for (const f of files) writeFileSync(join(animDir, f.name), f.text);
    const r = await validateSpriteFiles({ root });
    const expected = validateSprites(
      files.map((f) => ({
        path: `/assets/sprites/${entity}/${animation}/${f.name}`,
        text: f.text,
        bytes: new TextEncoder().encode(f.text).byteLength,
      })),
    );
    expect(r.problems.length).toBeGreaterThan(0);
    expect([...r.problems].sort((a, b) => (a.path + a.rule + a.detail).localeCompare(b.path + b.rule + b.detail))).toEqual(
      [...expected.problems].sort((a, b) => (a.path + a.rule + a.detail).localeCompare(b.path + b.rule + b.detail)),
    );
    expect(r.present).toEqual(expected.present);
  });
});
