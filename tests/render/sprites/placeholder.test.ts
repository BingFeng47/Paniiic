import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { ENTITY_LOOKS, type SpriteEntity } from '../../../src/render/sprites/entities';
import {
  PLACEHOLDER_FRAME_COUNT,
  placeholderFrames,
  placeholderSvg,
} from '../../../src/render/sprites/placeholder';

const ENTITIES = Object.keys(ENTITY_LOOKS) as SpriteEntity[];

describe('placeholderSvg', () => {
  it('sizes the frame from the entity box and labels the frame number', () => {
    const svg = placeholderSvg('tank', 'walk', 3);
    expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg" width="72" height="96" viewBox="0 0 72 96">')).toBe(true);
    expect(svg).toContain('font-family="monospace"');
    expect(svg).toContain('>03</text>');
  });

  it('varies the frames of an animation', () => {
    for (const entity of ENTITIES) {
      for (const animation of ENTITY_LOOKS[entity].animations) {
        const frames = Array.from({ length: PLACEHOLDER_FRAME_COUNT[animation] }, (_, i) =>
          placeholderSvg(entity, animation, i).replace(/>\d\d<\/text>/, ''),
        );
        if (frames.length > 1) expect(new Set(frames).size, `${entity}/${animation}`).toBeGreaterThan(1);
      }
    }
  });

  it('gives each entity a different silhouette', () => {
    const shapes = ENTITIES.map((e) => placeholderSvg(e, 'idle', 0).replace(/fill="#[0-9a-f]{6}"/g, ''));
    expect(new Set(shapes).size).toBe(ENTITIES.length);
  });

  it('rejects frame numbers that are not 0..99 integers', () => {
    expect(() => placeholderSvg('default', 'walk', -1)).toThrow(RangeError);
    expect(() => placeholderSvg('default', 'walk', 1.5)).toThrow(RangeError);
    expect(() => placeholderSvg('default', 'walk', 100)).toThrow(RangeError);
  });
});

describe('placeholderFrames', () => {
  it('returns one encoded data URL per placeholder frame', () => {
    const urls = placeholderFrames('boss', 'die');
    expect(urls).toHaveLength(PLACEHOLDER_FRAME_COUNT.die);
    urls.forEach((url, i) => {
      expect(url.startsWith('data:image/svg+xml;charset=utf-8,')).toBe(true);
      const svg = decodeURIComponent(url.slice('data:image/svg+xml;charset=utf-8,'.length));
      expect(svg).toBe(placeholderSvg('boss', 'die', i));
    });
  });
});

// ---------------------------------------------------------------------------------------------
// Property 17 helpers: parse the SVG, walk its elements and measure shapes in viewBox units.

const SVG_NS = 'http://www.w3.org/2000/svg';
const MAX_BYTES = 20 * 1024;
const DATA_URL_PREFIX = 'data:image/svg+xml;charset=utf-8,';
/** Every element the generator is allowed to emit. No image, use, foreignObject, style, script. */
const ALLOWED_TAGS = new Set(['svg', 'g', 'rect', 'circle', 'ellipse', 'line', 'polygon', 'text']);
/** fmt() rounds to two decimals, so measured edges may overshoot by a rounding step. */
const EPS = 0.02;

const sample = fc.constantFrom(...ENTITIES).chain((entity) =>
  fc.record({
    entity: fc.constant(entity),
    animation: fc.constantFrom(...ENTITY_LOOKS[entity].animations),
    // placeholderSvg accepts every two-digit frame number and wraps it into the animation.
    frame: fc.integer({ min: 0, max: 99 }),
  }),
);

function parseSvg(svg: string): SVGSVGElement {
  const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
  expect(doc.getElementsByTagName('parsererror')).toHaveLength(0);
  const root = doc.documentElement;
  expect(root.namespaceURI).toBe(SVG_NS);
  expect(root.localName).toBe('svg');
  return root as unknown as SVGSVGElement;
}

function allElements(root: Element): Element[] {
  return [root, ...Array.from(root.getElementsByTagName('*'))];
}

/** 2D affine matrix [a c e; b d f]. */
type Matrix = readonly [number, number, number, number, number, number];
const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

function multiply(m: Matrix, n: Matrix): Matrix {
  return [
    m[0] * n[0] + m[2] * n[1],
    m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3],
    m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4],
    m[1] * n[4] + m[3] * n[5] + m[5],
  ];
}

function translate(x: number, y: number): Matrix {
  return [1, 0, 0, 1, x, y];
}

/** Parses the translate()/rotate() lists the generator writes; anything else fails the test. */
function parseTransform(value: string | null): Matrix {
  let m = IDENTITY;
  if (value === null) return m;
  const re = /(\w+)\(([^)]*)\)/g;
  let rest = value;
  for (let match = re.exec(value); match !== null; match = re.exec(value)) {
    rest = rest.replace(match[0], '');
    const args = match[2].trim().split(/[\s,]+/).map(Number);
    expect(args.every(Number.isFinite), value).toBe(true);
    if (match[1] === 'translate') {
      m = multiply(m, translate(args[0], args[1] ?? 0));
    } else if (match[1] === 'rotate') {
      const rad = (args[0] * Math.PI) / 180;
      const turn: Matrix = [Math.cos(rad), Math.sin(rad), -Math.sin(rad), Math.cos(rad), 0, 0];
      const [cx, cy] = [args[1] ?? 0, args[2] ?? 0];
      m = multiply(m, multiply(translate(cx, cy), multiply(turn, translate(-cx, -cy))));
    } else {
      throw new Error(`Unexpected transform function in ${value}`);
    }
  }
  expect(rest.trim(), `leftover transform text in ${value}`).toBe('');
  return m;
}

function apply(m: Matrix, x: number, y: number): [number, number] {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}

function num(el: Element, name: string): number {
  const raw = el.getAttribute(name);
  const value = raw === null ? 0 : Number(raw);
  expect(Number.isFinite(value), `${el.localName} ${name}="${raw}"`).toBe(true);
  return value;
}

interface Box {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** Bounds of one shape after its own and its ancestors' transforms; null for svg, g and text. */
function shapeBounds(el: Element, m: Matrix): Box | null {
  const box: Box = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  const add = (x: number, y: number, pad = 0): void => {
    box.minX = Math.min(box.minX, x - pad);
    box.minY = Math.min(box.minY, y - pad);
    box.maxX = Math.max(box.maxX, x + pad);
    box.maxY = Math.max(box.maxY, y + pad);
  };
  // Exact bounds of an affine-transformed ellipse.
  const addEllipse = (cx: number, cy: number, rx: number, ry: number): void => {
    const [x, y] = apply(m, cx, cy);
    const hw = Math.hypot(m[0] * rx, m[2] * ry);
    const hh = Math.hypot(m[1] * rx, m[3] * ry);
    add(x - hw, y - hh);
    add(x + hw, y + hh);
  };
  switch (el.localName) {
    case 'rect': {
      const [x, y, w, h] = ['x', 'y', 'width', 'height'].map((a) => num(el, a));
      expect(w).toBeGreaterThan(0);
      expect(h).toBeGreaterThanOrEqual(0);
      for (const [px, py] of [[x, y], [x + w, y], [x, y + h], [x + w, y + h]]) add(...apply(m, px, py));
      return box;
    }
    case 'circle': {
      const r = num(el, 'r');
      addEllipse(num(el, 'cx'), num(el, 'cy'), r, r);
      return box;
    }
    case 'ellipse':
      addEllipse(num(el, 'cx'), num(el, 'cy'), num(el, 'rx'), num(el, 'ry'));
      return box;
    case 'line': {
      // Round caps: the outline reaches stroke-width / 2 past each end (transforms are rigid).
      const pad = num(el, 'stroke-width') / 2;
      add(...apply(m, num(el, 'x1'), num(el, 'y1')), pad);
      add(...apply(m, num(el, 'x2'), num(el, 'y2')), pad);
      return box;
    }
    case 'polygon': {
      const coords = (el.getAttribute('points') ?? '').trim().split(/[\s,]+/).map(Number);
      expect(coords.length % 2).toBe(0);
      expect(coords.every(Number.isFinite)).toBe(true);
      for (let i = 0; i < coords.length; i += 2) add(...apply(m, coords[i], coords[i + 1]));
      return box;
    }
    default:
      return null;
  }
}

/** Union of all shape bounds in the frame, with every transform applied. */
function frameBounds(root: Element): Box {
  const total: Box = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  const visit = (el: Element, parent: Matrix): void => {
    const m = multiply(parent, parseTransform(el.getAttribute('transform')));
    const b = shapeBounds(el, m);
    if (b !== null) {
      total.minX = Math.min(total.minX, b.minX);
      total.minY = Math.min(total.minY, b.minY);
      total.maxX = Math.max(total.maxX, b.maxX);
      total.maxY = Math.max(total.maxY, b.maxY);
    }
    for (const child of Array.from(el.children)) visit(child, m);
  };
  visit(root, IDENTITY);
  return total;
}

describe('Property 17: placeholders follow the sprite rules', () => {
  // Feature: connection-lane, Property 17: Placeholders follow the sprite rules
  // Property: Req 13.5 every placeholder frame parses, is self-contained, labelled and small
  it('parses as SVG with no scripts, external references, raster images or web fonts', () => {
    fc.assert(
      fc.property(sample, ({ entity, animation, frame }) => {
        const svg = placeholderSvg(entity, animation, frame);
        const where = `${entity}/${animation}/${frame}`;

        // Raw-text guards, so nothing slips past through an element the parser drops.
        for (const banned of ['<script', 'href', '<image', '@font-face', 'url(', '<style', '<foreignObject', '<use']) {
          expect(svg.includes(banned), `${where} contains ${banned}`).toBe(false);
        }
        expect(new TextEncoder().encode(svg).length, where).toBeLessThan(MAX_BYTES);

        const root = parseSvg(svg);
        for (const el of allElements(root)) {
          expect(ALLOWED_TAGS.has(el.localName), `${where} <${el.localName}>`).toBe(true);
          expect(el.namespaceURI).toBe(SVG_NS);
          for (const attr of Array.from(el.attributes)) {
            expect(attr.name.toLowerCase().startsWith('on'), `${where} ${attr.name}`).toBe(false);
            expect(attr.localName === 'href', `${where} ${attr.name}`).toBe(false);
            expect(attr.name === 'style', `${where} style attribute`).toBe(false);
            expect(attr.value.includes('url('), `${where} ${attr.name}`).toBe(false);
            if (attr.name === 'font-family') expect(attr.value).toBe('monospace');
          }
        }

        // One monospace label showing the two-digit frame number.
        const texts = Array.from(root.getElementsByTagName('text'));
        expect(texts).toHaveLength(1);
        expect(texts[0].getAttribute('font-family')).toBe('monospace');
        expect(texts[0].children).toHaveLength(0);
        expect(texts[0].textContent).toBe(String(frame).padStart(2, '0'));

        // The entity's own colour is in the frame.
        expect(svg).toContain(`fill="${ENTITY_LOOKS[entity].colour}"`);
      }),
      { numRuns: 200 },
    );
  });

  // Feature: connection-lane, Property 17: Placeholders follow the sprite rules
  // Property: Req 13.5 all frames of one entity share width, height and viewBox from its box
  it('gives every frame of an entity the same width, height and viewBox', () => {
    const pair = fc.constantFrom(...ENTITIES).chain((entity) => {
      const anim = fc.constantFrom(...ENTITY_LOOKS[entity].animations);
      const frame = fc.integer({ min: 0, max: 99 });
      return fc.tuple(fc.constant(entity), anim, frame, anim, frame);
    });
    fc.assert(
      fc.property(pair, ([entity, animA, frameA, animB, frameB]) => {
        const { w, h } = ENTITY_LOOKS[entity].box;
        const a = parseSvg(placeholderSvg(entity, animA, frameA));
        const b = parseSvg(placeholderSvg(entity, animB, frameB));
        for (const root of [a, b]) {
          expect(root.getAttribute('width')).toBe(String(w));
          expect(root.getAttribute('height')).toBe(String(h));
          expect(root.getAttribute('viewBox')).toBe(`0 0 ${w} ${h}`);
        }
      }),
      { numRuns: 100 },
    );
  });

  // Feature: connection-lane, Property 17: Placeholders follow the sprite rules
  // Property: Req 13.5 every shape stays inside the viewBox, outline included
  // Exception: `die` sinks the figure into the ground, so only its bottom edge may pass y = h
  // (the overflow is clipped by the viewBox, which is the sinking effect).
  it('keeps every shape inside the viewBox', () => {
    fc.assert(
      fc.property(sample, ({ entity, animation, frame }) => {
        const { w, h } = ENTITY_LOOKS[entity].box;
        const where = `${entity}/${animation}/${frame}`;
        const b = frameBounds(parseSvg(placeholderSvg(entity, animation, frame)));
        expect([b.minX, b.minY, b.maxX, b.maxY].every(Number.isFinite), `${where} has shapes`).toBe(true);
        expect(b.minX, `${where} left`).toBeGreaterThanOrEqual(-EPS);
        expect(b.maxX, `${where} right`).toBeLessThanOrEqual(w + EPS);
        expect(b.minY, `${where} top`).toBeGreaterThanOrEqual(-EPS);
        if (animation !== 'die') expect(b.maxY, `${where} bottom`).toBeLessThanOrEqual(h + EPS);
      }),
      { numRuns: 200 },
    );
  });

  // Feature: connection-lane, Property 17: Placeholders follow the sprite rules
  // Property: Req 13.5 placeholder data URLs decode back to the same SVG
  it('encodes each frame as a data URL that decodes to the same SVG', () => {
    const pick = fc.constantFrom(...ENTITIES).chain((entity) =>
      fc.constantFrom(...ENTITY_LOOKS[entity].animations).map((animation) => ({ entity, animation })),
    );
    fc.assert(
      fc.property(pick, ({ entity, animation }) => {
        const urls = placeholderFrames(entity, animation);
        expect(urls).toHaveLength(PLACEHOLDER_FRAME_COUNT[animation]);
        urls.forEach((url, i) => {
          expect(url.startsWith(DATA_URL_PREFIX)).toBe(true);
          expect(decodeURIComponent(url.slice(DATA_URL_PREFIX.length))).toBe(placeholderSvg(entity, animation, i));
        });
      }),
      { numRuns: 100 },
    );
  });

  // Feature: connection-lane, Property 17: Placeholders follow the sprite rules
  // Property: Req 13.5 no two entities share a colour
  it('gives every entity its own colour', () => {
    const colours = ENTITIES.map((e) => ENTITY_LOOKS[e].colour.toLowerCase());
    expect(new Set(colours).size).toBe(ENTITIES.length);
  });
});
