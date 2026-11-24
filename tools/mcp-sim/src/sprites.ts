// validate_sprites handler (zombie-sim-mcp Requirement 5). Reads only files under
// <root>/assets/sprites/ and never writes anything.
// The repo has no @types/node, so node modules are imported dynamically with minimal local
// types (the same approach as tests/helpers/repo.ts).
import { ANIMATION_TABLE } from '../../../src/render/sprites/animationTable';
import {
  validateSprites,
  type SpriteFile,
  type SpriteProblem,
} from '../../../src/render/sprites/validate';

interface DirEntry {
  readonly name: string;
  isDirectory(): boolean;
  isSymbolicLink(): boolean;
}
interface NodeFsPromises {
  readdir(path: string, options: { withFileTypes: true }): Promise<DirEntry[]>;
  readFile(path: string): Promise<{ readonly byteLength: number; toString(encoding: 'utf8'): string }>;
  realpath(path: string): Promise<string>;
}
interface NodePath {
  join(...parts: string[]): string;
  relative(from: string, to: string): string;
  resolve(...parts: string[]): string;
  isAbsolute(path: string): boolean;
  readonly sep: string;
}
declare const process: { cwd(): string };

let fs: NodeFsPromises;
let path: NodePath;
async function loadNode(): Promise<void> {
  const fsName = 'node:fs/promises';
  const pathName = 'node:path';
  fs = (await import(/* @vite-ignore */ fsName)) as NodeFsPromises;
  path = (await import(/* @vite-ignore */ pathName)) as NodePath;
}

export interface ValidateSpritesInput {
  /** Repo root. Defaults to the current working directory. */
  readonly root?: string;
}

export interface ValidateSpritesResult {
  readonly problems: readonly SpriteProblem[];
  readonly present: Readonly<Record<string, readonly string[]>>;
  /** "entity/animation" keys from ANIMATION_TABLE with no team frames yet. */
  readonly missing: readonly string[];
}

/** True when `target` is `base` or lies inside it. */
export function isInside(base: string, target: string): boolean {
  const rel = path.relative(base, target);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

async function collect(base: string, dir: string, out: SpriteFile[], rejected: SpriteProblem[]): Promise<void> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    const web = '/assets/sprites/' + path.relative(base, full).split(path.sep).join('/');
    // Resolve symlinks so nothing outside assets/sprites/ is ever read.
    let real: string;
    try {
      real = await fs.realpath(full);
    } catch {
      continue;
    }
    if (!isInside(base, real)) {
      rejected.push(Object.freeze({ path: web, rule: 'path', detail: 'resolves outside assets/sprites/; not read' }));
      continue;
    }
    if (entry.isDirectory() || (entry.isSymbolicLink() && (await isDir(real)))) {
      await collect(base, full, out, rejected);
    } else {
      const buf = await fs.readFile(real);
      out.push({ path: web, text: buf.toString('utf8'), bytes: buf.byteLength });
    }
  }
}

async function isDir(p: string): Promise<boolean> {
  try {
    await fs.readdir(p, { withFileTypes: true });
    return true;
  } catch {
    return false;
  }
}

export async function validateSpriteFiles(input: ValidateSpritesInput = {}): Promise<ValidateSpritesResult> {
  await loadNode();
  const dir = path.resolve(input.root ?? process.cwd(), 'assets', 'sprites');
  const files: SpriteFile[] = [];
  const rejected: SpriteProblem[] = [];
  let base: string | null = null;
  try {
    base = await fs.realpath(dir);
  } catch {
    base = null; // No assets/sprites/ folder yet: no problems, everything missing.
  }
  if (base !== null) await collect(base, base, files, rejected);

  const result = validateSprites(files);
  const missing: string[] = [];
  const table = ANIMATION_TABLE as Readonly<Record<string, Readonly<Record<string, unknown>>>>;
  for (const entity of Object.keys(table).sort()) {
    for (const animation of Object.keys(table[entity] ?? {}).sort()) {
      const key = `${entity}/${animation}`;
      if ((result.present[key]?.length ?? 0) === 0) missing.push(key);
    }
  }
  return { problems: [...rejected, ...result.problems], present: result.present, missing };
}
