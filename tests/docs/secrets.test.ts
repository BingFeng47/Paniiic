// Fails if a Supabase secret key is committed or built into dist/ (leaderboard Req 8.3).
// The bare prefix `sb_secret_` may appear in docs and code; a prefix followed by 16 or more key
// characters is treated as a real key. The pattern below does not match itself, because the `[`
// after the prefix is not a key character.
//
// The repo has no @types/node, so node:fs and node:child_process are imported dynamically with
// minimal local types (the same approach as tests/helpers/repo.ts). Vitest runs from the
// repository root.
import { describe, expect, it } from 'vitest';

interface DirEntry {
  readonly name: string;
  isDirectory(): boolean;
  isFile(): boolean;
}
interface NodeFs {
  existsSync(path: string): boolean;
  statSync(path: string): { isFile(): boolean };
  readFileSync(path: string, encoding: 'utf8'): string;
  readdirSync(path: string, options: { withFileTypes: true }): DirEntry[];
}
interface NodeChildProcess {
  execFileSync(file: string, args: readonly string[], options: { encoding: 'utf8' }): string;
}

const SECRET_KEY = /sb_secret_[A-Za-z0-9_-]{16,}/;
const DIST = 'dist';

async function loadNode(): Promise<{ fs: NodeFs; cp: NodeChildProcess }> {
  const fs = (await import('node:fs' as string)) as NodeFs;
  const cp = (await import('node:child_process' as string)) as NodeChildProcess;
  return { fs, cp };
}

function listDir(fs: NodeFs, dir: string): string[] {
  const files: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) files.push(...listDir(fs, path));
    else if (entry.isFile()) files.push(path);
  }
  return files;
}

/** Text of `path`, or null for a missing file, a non-file or a binary file (contains NUL). */
function readText(fs: NodeFs, path: string): string | null {
  if (!fs.existsSync(path) || !fs.statSync(path).isFile()) return null;
  const text = fs.readFileSync(path, 'utf8');
  return text.includes('\0') ? null : text;
}

/** `path:line` for every line of every file that holds a secret key. */
function findSecrets(fs: NodeFs, paths: readonly string[]): string[] {
  const hits: string[] = [];
  for (const path of paths) {
    const text = readText(fs, path);
    if (text === null || !SECRET_KEY.test(text)) continue;
    text.split('\n').forEach((line, i) => {
      if (SECRET_KEY.test(line)) hits.push(`${path}:${i + 1}`);
    });
  }
  return hits;
}

describe('secret keys', () => {
  it('the pattern catches a key but not the bare prefix or itself', () => {
    const prefix = ['sb', 'secret', ''].join('_');
    expect(SECRET_KEY.test(prefix + 'AbC123_-xyz789QWERTY')).toBe(true);
    expect(SECRET_KEY.test(prefix)).toBe(false);
    expect(SECRET_KEY.test(`${prefix}...`)).toBe(false);
    expect(SECRET_KEY.test(prefix + 'short123')).toBe(false);
    expect(SECRET_KEY.test(SECRET_KEY.source)).toBe(false);
  });

  it('no file tracked in git holds a secret key', async () => {
    const { fs, cp } = await loadNode();
    const tracked = cp
      .execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' })
      .split('\0')
      .filter((path) => path.length > 0);
    expect(tracked.length).toBeGreaterThan(0);
    expect(findSecrets(fs, tracked)).toEqual([]);
  });

  it('no file in dist/ holds a secret key', async () => {
    const { fs } = await loadNode();
    if (!fs.existsSync(DIST)) return;
    expect(findSecrets(fs, listDir(fs, DIST))).toEqual([]);
  });
});
