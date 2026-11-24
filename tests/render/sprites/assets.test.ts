// Runs the sprite validator over the real team-owned assets/sprites/ folder (Requirements 3.2,
// 3.3). Read-only: this test never writes to assets/sprites/. An empty or missing folder is valid.
//
// The repo has no @types/node, so node:fs is imported dynamically with a minimal local type
// (the same approach as tests/helpers/repo.ts). Vitest runs from the repository root.
import { describe, expect, it } from 'vitest';
import {
  MAX_TOTAL_BYTES,
  validateSprites,
  type SpriteFile,
} from '../../../src/render/sprites/validate';

interface DirEntry {
  readonly name: string;
  isDirectory(): boolean;
  isFile(): boolean;
}
interface NodeFs {
  existsSync(path: string): boolean;
  readFileSync(path: string, encoding: 'utf8'): string;
  readdirSync(path: string, options: { withFileTypes: true }): DirEntry[];
}

const SPRITES = 'assets/sprites';

async function readSprites(): Promise<SpriteFile[]> {
  const fs = (await import('node:fs' as string)) as NodeFs;
  if (!fs.existsSync(SPRITES)) return [];
  const encoder = new TextEncoder();
  const walk = (dir: string): SpriteFile[] => {
    const files: SpriteFile[] = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith('.')) continue; // .DS_Store, .gitkeep
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

describe('assets/sprites', () => {
  it('passes every sprite rule (Req 3.2)', async () => {
    const files = await readSprites();
    expect(validateSprites(files).problems).toEqual([]);
  });

  it('stays within the 1.5 MB budget (Req 3.3)', async () => {
    const files = await readSprites();
    const total = files.reduce((sum, f) => sum + f.bytes, 0);
    expect(total).toBeLessThanOrEqual(MAX_TOTAL_BYTES);
  });
});
