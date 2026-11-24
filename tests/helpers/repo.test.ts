import { describe, expect, it } from 'vitest';
import { loadRepoFiles, stripComments } from './repo';

describe('stripComments()', () => {
  it('blanks line and block comments but keeps length and newlines', () => {
    const src = 'a = 1; // el.innerHTML = x\n/* innerHTML\n here */ b = 2;';
    const out = stripComments(src);
    expect(out).toHaveLength(src.length);
    expect(out.split('\n')).toHaveLength(3);
    expect(out).not.toContain('innerHTML');
    expect(out).toContain('a = 1;');
    expect(out).toContain('b = 2;');
  });

  it('keeps comment markers inside strings and templates', () => {
    const src = "const u = 'http://x'; const t = `/* ${'//'} */`; el.innerHTML = u;";
    expect(stripComments(src)).toBe(src);
  });

  it('resumes the template after a nested ${} with braces', () => {
    const src = 'const t = `a ${f({ k: 1 })} // not a comment`; // gone';
    const out = stripComments(src);
    expect(out).toContain('// not a comment`;');
    expect(out).not.toContain('gone');
  });

  it('does not read quotes or slashes inside a regex literal as strings or comments', () => {
    const src = "const r = /[\"'/]+\\/\\//g; // innerHTML\nx = a / b; // c";
    const out = stripComments(src);
    expect(out).toContain("/[\"'/]+\\/\\//g;");
    expect(out).not.toContain('innerHTML');
    expect(out).toContain('x = a / b;');
    expect(out).not.toContain('// c');
  });

  it('in CSS mode keeps // and strips only block comments', () => {
    const src = '/* x.mp3 */ a { background: url(http://e/x.png); }';
    const out = stripComments(src, 'css');
    expect(out).not.toContain('x.mp3');
    expect(out).toContain('url(http://e/x.png)');
  });
});

describe('loadRepoFiles()', () => {
  it('lists files recursively with repo-relative paths and reads them', async () => {
    const repo = await loadRepoFiles();
    const files = repo.list('src');
    expect(files).toContain('src/main.ts');
    expect(files).toContain('src/core/h.ts');
    expect(files.every((f) => f.startsWith('src/'))).toBe(true);
    expect(repo.read('src/main.ts')).toContain('createSceneDirector');
  });
});
