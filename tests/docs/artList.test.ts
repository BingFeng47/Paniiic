// Keeps docs/art-list.md in step with the renderer tables and assets/sprites/ (final-art
// Req 1.3, 1.4). With ART_LIST_WRITE=1 (`npm run art:list`) it writes the file instead of
// failing. Read-only on assets/sprites/.
//
// The repo has no @types/node, so node:fs is imported dynamically with a minimal local type
// (the same approach as tests/helpers/repo.ts). Vitest runs from the repository root.
import { describe, expect, it } from 'vitest';
import { ANIMATION_TABLE } from '../../src/render/sprites/animationTable';
import { renderArtList } from '../../src/render/sprites/artList';
import { ENTITY_LOOKS } from '../../src/render/sprites/entities';
import { validateSprites, type SpriteFile } from '../../src/render/sprites/validate';

interface DirEntry {
  readonly name: string;
  isDirectory(): boolean;
  isFile(): boolean;
}
interface NodeFs {
  existsSync(path: string): boolean;
  readFileSync(path: string, encoding: 'utf8'): string;
  writeFileSync(path: string, data: string): void;
  readdirSync(path: string, options: { withFileTypes: true }): DirEntry[];
}

const SPRITES = 'assets/sprites';
const OUT = 'docs/art-list.md';

function readSprites(fs: NodeFs): SpriteFile[] {
  if (!fs.existsSync(SPRITES)) return [];
  const encoder = new TextEncoder();
  const walk = (dir: string): SpriteFile[] => {
    const files: SpriteFile[] = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith('.')) continue;
      const path = `${dir}/${entry.name}`;
      if (entry.isDirectory()) files.push(...walk(path));
      else if (entry.isFile()) {
        const text = fs.readFileSync(path, 'utf8');
        files.push({ path: `/${path}`, text, bytes: encoder.encode(text).byteLength });
      }
    }
    return files;
  };
  return walk(SPRITES);
}

describe('docs/art-list.md', () => {
  it('matches the tables and assets/sprites/ (Req 1.3, 1.4)', async () => {
    const fs = (await import('node:fs' as string)) as NodeFs;
    const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env;
    const expected = renderArtList(
      { animations: ANIMATION_TABLE, looks: ENTITY_LOOKS },
      validateSprites(readSprites(fs)),
    );
    if (env?.ART_LIST_WRITE === '1') {
      fs.writeFileSync(OUT, expected);
      return;
    }
    const actual = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : '';
    expect(actual === expected, `${OUT} is stale: run npm run art:list`).toBe(true);
  });
});
