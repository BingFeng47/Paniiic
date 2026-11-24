// Pure sprite validator (see .kiro/steering/sprites.md and the final-art design). Text checks on
// the SVG source only, no DOM, so the tests, the art-list generator and zombie-sim-mcp can all
// run it in Node.
import { ANIMATION_TABLE } from './animationTable';
import { SPRITE_PATH } from './manifest';

export interface SpriteFile {
  readonly path: string;
  readonly text: string;
  readonly bytes: number;
}
export type SpriteRule =
  | 'path'
  | 'frameGap'
  | 'viewBox'
  | 'script'
  | 'externalRef'
  | 'raster'
  | 'webFont'
  | 'size'
  | 'unknownEntity'
  | 'unknownAnimation'
  | 'budget';
export interface SpriteProblem {
  readonly path: string;
  readonly rule: SpriteRule;
  readonly detail: string;
}
export interface SpriteValidation {
  readonly problems: readonly SpriteProblem[];
  /** "entity/animation" → frame names ("00", "01", …) in order. */
  readonly present: Readonly<Record<string, readonly string[]>>;
}

/** Each file must be under this many bytes. */
export const MAX_FILE_BYTES = 20 * 1024;
/** All files together must stay within this many bytes (Requirement 3.3). */
export const MAX_TOTAL_BYTES = 1.5 * 1024 * 1024;

const GENERIC_FONTS = new Set([
  'serif',
  'sans-serif',
  'monospace',
  'cursive',
  'fantasy',
  'system-ui',
  'inherit',
  'initial',
  'unset',
]);

const VIEWBOX = /\bviewBox\s*=\s*["']([^"']*)["']/;

export function validateSprites(files: readonly SpriteFile[]): SpriteValidation {
  const problems: SpriteProblem[] = [];
  const add = (path: string, rule: SpriteRule, detail: string): void => {
    problems.push(Object.freeze({ path, rule, detail }));
  };
  const frames = new Map<string, Set<number>>();
  const viewBoxes = new Map<string, { readonly viewBox: string; readonly path: string }>();
  const table = ANIMATION_TABLE as Readonly<Record<string, Readonly<Record<string, unknown>>>>;
  let total = 0;

  for (const file of [...files].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))) {
    const { path, text, bytes } = file;
    total += bytes;
    if (bytes >= MAX_FILE_BYTES) add(path, 'size', `${bytes} bytes; must be under ${MAX_FILE_BYTES}`);
    checkContent(path, text, add);

    const match = SPRITE_PATH.exec(path);
    if (match === null) {
      add(path, 'path', 'does not match /assets/sprites/<entity>/<animation>/<NN>.svg');
      continue;
    }
    const entity = match[1] as string;
    const animation = match[2] as string;
    const frame = Number(match[3]);
    const animations = Object.prototype.hasOwnProperty.call(table, entity) ? table[entity] : undefined;
    if (animations === undefined) {
      add(path, 'unknownEntity', `entity "${entity}" is not in the Animation_Table`);
    } else if (!Object.prototype.hasOwnProperty.call(animations, animation)) {
      add(path, 'unknownAnimation', `"${entity}" has no "${animation}" animation`);
    }

    const key = `${entity}/${animation}`;
    let set = frames.get(key);
    if (set === undefined) {
      set = new Set();
      frames.set(key, set);
    }
    set.add(frame);

    const viewBox = VIEWBOX.exec(text)?.[1]?.trim() ?? '';
    const first = viewBoxes.get(entity);
    if (first === undefined) viewBoxes.set(entity, { viewBox, path });
    else if (first.viewBox !== viewBox) {
      add(path, 'viewBox', `viewBox "${viewBox}" differs from "${first.viewBox}" in ${first.path}`);
    }
  }

  const present: Record<string, readonly string[]> = {};
  for (const key of [...frames.keys()].sort()) {
    const set = frames.get(key) as Set<number>;
    for (let i = 0; i < set.size; i += 1) {
      if (!set.has(i)) {
        add(`/assets/sprites/${key}/`, 'frameGap', `frame ${pad(i)} is missing`);
        break;
      }
    }
    present[key] = Object.freeze([...set].sort((a, b) => a - b).map(pad));
  }

  if (total > MAX_TOTAL_BYTES) {
    add('/assets/sprites/', 'budget', `${total} bytes in total; budget is ${MAX_TOTAL_BYTES}`);
  }
  return Object.freeze({ problems: Object.freeze(problems), present: Object.freeze(present) });
}

function checkContent(
  path: string,
  text: string,
  add: (path: string, rule: SpriteRule, detail: string) => void,
): void {
  if (/<script\b/i.test(text)) add(path, 'script', 'contains <script>');
  if (/\son[a-z]+\s*=/i.test(text)) add(path, 'script', 'contains an on* event attribute');
  if (/javascript:/i.test(text)) add(path, 'script', 'contains javascript:');

  for (const m of text.matchAll(/(?:xlink:)?href\s*=\s*["']([^"']*)["']/gi)) {
    const target = (m[1] as string).trim();
    if (!/^#[^\s#]+$/.test(target)) add(path, 'externalRef', `href "${target}" is not a #id`);
  }
  for (const m of text.matchAll(/url\(\s*["']?([^"')]*)["']?\s*\)/gi)) {
    const target = (m[1] as string).trim();
    if (!target.startsWith('#') && !/^data:image\//i.test(target)) {
      add(path, 'externalRef', `url(${target}) is not a #id`);
    }
  }

  if (/<image\b/i.test(text)) add(path, 'raster', 'contains <image>');
  if (/data:image\//i.test(text)) add(path, 'raster', 'contains data:image/');

  if (/@font-face/i.test(text)) add(path, 'webFont', 'contains @font-face');
  if (/@import/i.test(text)) add(path, 'webFont', 'contains @import');
  for (const m of text.matchAll(/font-family\s*(?:=\s*["']([^"']*)["']|:\s*([^;"'}>]*(?:["'][^"']*["'][^;"'}>]*)*))/gi)) {
    const value = (m[1] ?? m[2] ?? '').trim();
    const families = value
      .split(',')
      .map((f) => f.trim().replace(/^["']|["']$/g, '').toLowerCase())
      .filter((f) => f !== '');
    const named = families.filter((f) => !GENERIC_FONTS.has(f));
    if (named.length > 0) add(path, 'webFont', `font-family "${named.join(', ')}" is not generic`);
  }
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}
