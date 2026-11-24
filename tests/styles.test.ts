// Repository scan for the title-and-endings stylesheets (title-and-endings Req 12.5): colours come
// only from the custom properties in src/styles/theme.css. Files are read from disk with node:fs
// (see tests/helpers/repo.ts) and comments are stripped first, so prose in a comment never counts.
import { beforeAll, describe, expect, it } from 'vitest';
import { loadRepoFiles, stripComments, type RepoFiles } from './helpers/repo';

const THEME = 'src/styles/theme.css';
const SHEETS = ['src/styles/title.css', 'src/styles/result.css'] as const;

/**
 * Every declaration value (`prop: value` ended by `;` or `}`). Selectors such as `a:hover {` or
 * `#id {` and `@media (...) {` preludes are skipped because they end in `{`.
 */
function declarationValues(css: string): string[] {
  return [...css.matchAll(/[-\w]+\s*:\s*([^;{}]+)(?=[;}])/g)].map((m) => m[1]!.trim());
}

const HEX = /#[0-9a-f]{3,8}(?![\w-])/i;
const FUNCTION_COLOUR = /(?<![\w-])(rgba?|hsla?)\s*\(/i;

/** Colour literals found in a stylesheet's declaration values. */
function colourLiterals(css: string): string[] {
  return declarationValues(css).filter((v) => HEX.test(v) || FUNCTION_COLOUR.test(v));
}

/** Every `--c-…` custom property a stylesheet reads with `var()`, sorted and unique. */
function colourVarsUsed(css: string): string[] {
  return [...new Set([...css.matchAll(/var\(\s*(--c-[\w-]+)/g)].map((m) => m[1]!))].sort();
}

/** Every `--c-…` custom property a stylesheet defines. */
function colourVarsDefined(css: string): Set<string> {
  return new Set([...css.matchAll(/(--c-[\w-]+)\s*:/g)].map((m) => m[1]!));
}

let repo: RepoFiles;
beforeAll(async () => {
  repo = await loadRepoFiles();
});

const css = (path: string): string => stripComments(repo.read(path), 'css');

describe('stylesheet scan helpers', () => {
  it('find colour literals in values and ignore selectors and comments', () => {
    const sample = stripComments(
      '/* color: #fff */ #abc, a:hover { color: #A0b1C2; background: rgba(0, 0, 0, 0.5); }\n' +
        '.x { border-color: hsl(10 20% 30%); fill: var(--c-ink); width: calc(100% - 2px); }',
      'css',
    );
    expect(colourLiterals(sample)).toEqual(['#A0b1C2', 'rgba(0, 0, 0, 0.5)', 'hsl(10 20% 30%)']);
    expect(colourVarsUsed(sample)).toEqual(['--c-ink']);
  });
});

describe('title and result styles read colours from theme.css (Req 12.5)', () => {
  it.each(SHEETS)('%s has no hex, rgb()/rgba() or hsl()/hsla() literals', (path) => {
    expect(colourLiterals(css(path))).toEqual([]);
  });

  it.each(SHEETS)('%s uses only --c-… tokens defined in theme.css', (path) => {
    const used = colourVarsUsed(css(path));
    expect(used.length).toBeGreaterThan(0);
    const defined = colourVarsDefined(css(THEME));
    expect(used.filter((name) => !defined.has(name))).toEqual([]);
  });
});
