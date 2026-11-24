import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { h } from '../../src/core/h';

/** Pieces that a naive `innerHTML` would turn into elements, entities or comments. */
const MARKUP_PIECES = [
  '<',
  '>',
  '&',
  '"',
  "'",
  '<b>bold</b>',
  '<img src=x onerror="alert(1)">',
  '<script>alert(1)</script>',
  '&amp;',
  '&lt;div&gt;',
  '<!-- note -->',
  "<a href='#'>FREE!!</a>",
] as const;

/** A string built from random text and markup pieces, so `<`, `>`, `&` and quotes show up often. */
const markupString = fc
  .array(fc.oneof(fc.string(), fc.constantFrom(...MARKUP_PIECES)), { maxLength: 6 })
  .map((parts) => parts.join(''));

describe('h()', () => {
  // Property: Req 14.3 string children become text nodes, so markup characters stay literal
  // Feature: retro-shell, Property 13: h() never turns strings into markup
  it('never turns strings into markup', () => {
    fc.assert(
      fc.property(fc.array(markupString, { maxLength: 8 }), (strings) => {
        const el = h('div', null, ...strings);
        expect(el.children.length).toBe(0);
        expect(el.childNodes.length).toBe(strings.length);
        for (const node of el.childNodes) expect(node.nodeType).toBe(Node.TEXT_NODE);
        expect(el.textContent).toBe(strings.join(''));
      }),
      { numRuns: 200 },
    );
  });

  it('builds text from strings and numbers and skips null, undefined and false', () => {
    const child = h('span', null, 7);
    const el = h('div', null, '<b>hi</b>', null, undefined, false, child, 0);
    expect(el.tagName).toBe('DIV');
    expect(el.childNodes.length).toBe(3);
    expect(el.children.length).toBe(1);
    expect(el.firstElementChild).toBe(child);
    expect(el.textContent).toBe('<b>hi</b>70');
  });

  it('applies className and attrs', () => {
    const el = h('button', {
      className: 'btn btn--primary',
      attrs: { title: 'Dial <now>', 'aria-label': 'Dial', 'data-id': 'x&y' },
    });
    expect(el.className).toBe('btn btn--primary');
    expect(el.classList.contains('btn--primary')).toBe(true);
    expect(el.getAttribute('title')).toBe('Dial <now>');
    expect(el.getAttribute('aria-label')).toBe('Dial');
    expect(el.getAttribute('data-id')).toBe('x&y');
  });

  it('attaches `on` listeners to the element', () => {
    const seen: string[] = [];
    const el = h('div', {
      on: {
        click: (e) => seen.push(`click:${e.type}`),
        keydown: (e) => seen.push(`key:${e.key}`),
      },
    });
    el.click();
    el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(seen).toEqual(['click:click', 'key:Enter']);
  });

  it('throws on attrs whose name starts with "on", in any case', () => {
    expect(() => h('div', { attrs: { onclick: 'alert(1)' } })).toThrow(Error);
    expect(() => h('img', { attrs: { ONERROR: 'alert(1)' } })).toThrow(Error);
    expect(() => h('div', { attrs: { onMouseOver: 'x' } })).toThrow(Error);
  });
});
