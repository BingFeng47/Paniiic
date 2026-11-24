import { beforeAll, describe, expect, it } from 'vitest';
import { ICON_NAMES, ICON_SVG, iconEl, type IconName } from '../../src/desktop/iconArt';

// The repo has no @types/node, and Vitest stubs CSS imports to '', so theme.css is read from
// disk through a dynamically imported node:fs with a minimal local type.
interface NodeFs {
  readFileSync(path: string, encoding: 'utf8'): string;
}
let THEME_CSS = '';
beforeAll(async () => {
  const fs = (await import('node:fs' as string)) as NodeFs;
  // Vitest runs from the repository root.
  THEME_CSS = fs.readFileSync('src/styles/theme.css', 'utf8');
});

const EXPECTED: readonly IconName[] = [
  'dialer',
  'text',
  'wastebasket',
  'file',
  'start',
  'speaker',
  'speakerMuted',
  'computer',
  'browser',
];

function parse(markup: string): Document {
  return new DOMParser().parseFromString(markup, 'image/svg+xml');
}

describe('ICON_SVG', () => {
  it('has exactly the design icon list', () => {
    expect([...ICON_NAMES].sort()).toEqual([...EXPECTED].sort());
    expect(Object.keys(ICON_SVG).sort()).toEqual([...EXPECTED].sort());
  });

  it.each(EXPECTED)('%s is a parseable 32 × 32 SVG made only of paths', (name) => {
    const doc = parse(ICON_SVG[name]);
    expect(doc.getElementsByTagName('parsererror')).toHaveLength(0);
    const svg = doc.documentElement;
    expect(svg.localName).toBe('svg');
    expect(svg.getAttribute('viewBox')).toBe('0 0 32 32');
    expect(svg.getAttribute('width')).toBe('32');
    expect(svg.getAttribute('height')).toBe('32');

    const children = Array.from(svg.querySelectorAll('*'));
    expect(children.length).toBeGreaterThan(0);
    for (const el of children) {
      expect(el.localName).toBe('path');
      for (const attr of Array.from(el.attributes)) {
        expect(attr.name.toLowerCase().startsWith('on')).toBe(false);
      }
    }
  });

  it.each(EXPECTED)('%s only uses colours defined in theme.css', (name) => {
    const markup = ICON_SVG[name];
    expect(markup).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i);
    const vars = [...markup.matchAll(/var\((--[\w-]+)\)/g)].map((m) => m[1]);
    expect(vars.length).toBeGreaterThan(0);
    for (const v of vars) expect(THEME_CSS).toContain(`${v}:`);
  });

  it('gives every icon distinct art', () => {
    expect(new Set(Object.values(ICON_SVG)).size).toBe(EXPECTED.length);
  });
});

describe('iconEl()', () => {
  it('returns a fresh span.icon holding the SVG', () => {
    const a = iconEl('speaker');
    const b = iconEl('speaker');
    expect(a).not.toBe(b);
    expect(a.tagName).toBe('SPAN');
    expect(a.className).toBe('icon');
    expect(a.dataset.icon).toBe('speaker');
    expect(a.getAttribute('aria-hidden')).toBe('true');
    expect(a.children).toHaveLength(1);
    expect(a.firstElementChild?.localName).toBe('svg');
    expect(a.firstElementChild?.getAttribute('viewBox')).toBe('0 0 32 32');
  });

  it('swaps art between speaker and speakerMuted', () => {
    expect(iconEl('speaker').innerHTML).not.toBe(iconEl('speakerMuted').innerHTML);
  });
});
