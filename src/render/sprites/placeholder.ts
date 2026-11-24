// Placeholder_Generator: one generated SVG per entity, animation and frame, used until the team's
// frames land in assets/sprites/ (Req 13.4, 13.5). Pure string building, no DOM.
//
// Every frame of an entity has `viewBox="0 0 w h"` plus `width`/`height` from ENTITY_LOOKS, the
// silhouette stands on y = h centred on x = w / 2, Enemies face left, and the two-digit frame
// number is drawn in monospace so animation timing can be checked by eye. The markup is built only
// from ENTITY_LOOKS constants and numbers; it never holds game or ad text and is only ever turned
// into an image URL, never inserted into the DOM.

import { ENTITY_LOOKS, type AnimationName, type SpriteEntity } from './entities';

/** Placeholder frames per animation. */
export const PLACEHOLDER_FRAME_COUNT: Readonly<Record<AnimationName, number>> = Object.freeze({
  idle: 2,
  walk: 4,
  attack: 3,
  hit: 1,
  die: 4,
  use: 2,
});

const DATA_URL_PREFIX = 'data:image/svg+xml;charset=utf-8,';

/** data:image/svg+xml URLs, one per placeholder frame. */
export function placeholderFrames(entity: SpriteEntity, animation: AnimationName): readonly string[] {
  const urls: string[] = [];
  for (let frame = 0; frame < PLACEHOLDER_FRAME_COUNT[animation]; frame++) {
    urls.push(DATA_URL_PREFIX + encodeURIComponent(placeholderSvg(entity, animation, frame)));
  }
  return Object.freeze(urls);
}

/** SVG markup built only from ENTITY_LOOKS constants and integers. */
export function placeholderSvg(entity: SpriteEntity, animation: AnimationName, frame: number): string {
  const look = ENTITY_LOOKS[entity];
  if (look === undefined) throw new RangeError(`Unknown sprite entity: ${String(entity)}`);
  if (!Number.isInteger(frame) || frame < 0 || frame > 99) {
    throw new RangeError(`Placeholder frame must be an integer from 0 to 99, got ${frame}`);
  }
  const { w, h } = look.box;
  const pose = poseFor(animation, frame);
  const draw = BODIES[entity];
  const palette = paletteFor(look.colour);

  let figure = draw(w, h, palette, pose);
  // hit: the same silhouette again in white on top.
  if (pose.flash) figure += `<g opacity="0.6">${draw(w, h, WHITE, pose)}</g>`;
  // idle bobs 1 unit; die sinks into the ground and fades.
  const dy = pose.bob + pose.sink * h * 0.6;
  if (dy !== 0 || pose.sink > 0) {
    const opacity = pose.sink > 0 ? ` opacity="${fmt(1 - pose.sink * 0.75)}"` : '';
    figure = `<g transform="translate(0 ${fmt(dy)})"${opacity}>${figure}</g>`;
  }

  const size = Math.min(12, Math.max(6, Math.round(Math.min(w, h) / 5)));
  const label =
    `<text x="${fmt(w - 1)}" y="${size}" font-family="monospace" font-size="${size}" ` +
    `text-anchor="end" fill="#ffffff" stroke="#000000" stroke-width="1.5" paint-order="stroke">` +
    `${String(frame).padStart(2, '0')}</text>`;

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">` +
    figure +
    label +
    '</svg>'
  );
}

// ---------------------------------------------------------------------------------------------
// Pose: the per-animation variation, derived from the animation and frame number only.

interface Pose {
  readonly animation: AnimationName;
  /** Frame number wrapped into the animation's placeholder count. */
  readonly frame: number;
  /** walk stride, -1..1: legs shift in opposite directions. */
  readonly leg: number;
  /** attack mouth opening, 0..1 (0 means "use the entity's resting mouth"). */
  readonly mouth: number;
  /** idle vertical bob in viewBox units. */
  readonly bob: number;
  /** die progress, 0 (alive) to 1 (gone). */
  readonly sink: number;
  /** hit: white overlay. */
  readonly flash: boolean;
}

const STRIDE = [-1, 0, 1, 0] as const;

function poseFor(animation: AnimationName, frame: number): Pose {
  const count = PLACEHOLDER_FRAME_COUNT[animation];
  const f = frame % count;
  return {
    animation,
    frame: f,
    leg: animation === 'walk' ? STRIDE[f % STRIDE.length] : 0,
    mouth: animation === 'attack' ? (f + 1) / count : 0,
    bob: animation === 'idle' && f % 2 === 1 ? -1 : 0,
    sink: animation === 'die' ? (f + 1) / count : 0,
    flash: animation === 'hit',
  };
}

// ---------------------------------------------------------------------------------------------
// Palette and tiny SVG element helpers.

interface Palette {
  readonly body: string;
  readonly dark: string;
  readonly light: string;
  readonly eye: string;
  readonly mouth: string;
  readonly bone: string;
  readonly metal: string;
  readonly hole: string;
}

const WHITE: Palette = Object.freeze({
  body: '#ffffff',
  dark: '#ffffff',
  light: '#ffffff',
  eye: '#ffffff',
  mouth: '#ffffff',
  bone: '#ffffff',
  metal: '#ffffff',
  hole: '#ffffff',
});

function paletteFor(colour: string): Palette {
  return {
    body: colour,
    dark: shade(colour, 0.6),
    light: shade(colour, 1.35),
    eye: '#ffe14d',
    mouth: '#2a0a0a',
    bone: '#efe6cf',
    metal: '#8f949a',
    hole: '#141414',
  };
}

/** Scales each channel of a `#rrggbb` colour; other formats are returned unchanged. */
function shade(hex: string, factor: number): string {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return hex;
  let out = '#';
  for (let i = 1; i < 7; i += 2) {
    const v = Math.min(255, Math.max(0, Math.round(parseInt(hex.slice(i, i + 2), 16) * factor)));
    out += v.toString(16).padStart(2, '0');
  }
  return out;
}

/** Short decimal form: at most two decimals, never "-0". */
function fmt(n: number): string {
  const r = Math.round(n * 100) / 100;
  return String(r === 0 ? 0 : r);
}

function rect(x: number, y: number, w: number, h: number, fill: string, rx = 0): string {
  const round = rx > 0 ? ` rx="${fmt(rx)}"` : '';
  return `<rect x="${fmt(x)}" y="${fmt(y)}" width="${fmt(w)}" height="${fmt(h)}"${round} fill="${fill}"/>`;
}

function circle(cx: number, cy: number, r: number, fill: string): string {
  return `<circle cx="${fmt(cx)}" cy="${fmt(cy)}" r="${fmt(r)}" fill="${fill}"/>`;
}

function ellipse(cx: number, cy: number, rx: number, ry: number, fill: string, rotate = 0): string {
  const turn = rotate !== 0 ? ` transform="rotate(${fmt(rotate)} ${fmt(cx)} ${fmt(cy)})"` : '';
  return `<ellipse cx="${fmt(cx)}" cy="${fmt(cy)}" rx="${fmt(rx)}" ry="${fmt(ry)}" fill="${fill}"${turn}/>`;
}

function line(x1: number, y1: number, x2: number, y2: number, stroke: string, width: number): string {
  return (
    `<line x1="${fmt(x1)}" y1="${fmt(y1)}" x2="${fmt(x2)}" y2="${fmt(y2)}" stroke="${stroke}" ` +
    `stroke-width="${fmt(width)}" stroke-linecap="round"/>`
  );
}

function polygon(points: readonly (readonly [number, number])[], fill: string): string {
  return `<polygon points="${points.map(([x, y]) => `${fmt(x)},${fmt(y)}`).join(' ')}" fill="${fill}"/>`;
}

// ---------------------------------------------------------------------------------------------
// Silhouettes. Coordinates are fractions of the entity box so a box change in ENTITY_LOOKS keeps
// the feet on y = h. Enemies keep their head and mouth on the left.

type Body = (w: number, h: number, c: Palette, pose: Pose) => string;

/** Hunched body, round head on the left, arms reaching left. */
const defaultZombie: Body = (w, h, c, pose) => {
  const s = pose.leg * w * 0.08;
  const m = pose.mouth > 0 ? pose.mouth : 0.2;
  return [
    rect(w * 0.36 + s, h * 0.7, w * 0.12, h * 0.3, c.dark),
    rect(w * 0.52 - s, h * 0.7, w * 0.12, h * 0.3, c.dark),
    ellipse(w * 0.54, h * 0.55, w * 0.26, h * 0.22, c.body, -20),
    line(w * 0.48, h * 0.48, w * 0.06, h * 0.52, c.dark, w * 0.08),
    line(w * 0.42, h * 0.4, w * 0.04, h * 0.42, c.body, w * 0.08),
    circle(w * 0.3, h * 0.24, w * 0.18, c.body),
    circle(w * 0.22, h * 0.21, w * 0.04, c.eye),
    ellipse(w * 0.2, h * 0.3, w * 0.07, h * (0.01 + 0.03 * m), c.mouth),
  ].join('');
};

/** Low crawler: long flat body, head forward, spiky back, raised tail. */
const fastZombie: Body = (w, h, c, pose) => {
  const s = pose.leg * w * 0.06;
  const m = pose.mouth > 0 ? pose.mouth : 0.25;
  return [
    rect(w * 0.22 + s, h * 0.78, w * 0.08, h * 0.22, c.dark),
    rect(w * 0.42 - s, h * 0.78, w * 0.08, h * 0.22, c.dark),
    rect(w * 0.62 + s, h * 0.78, w * 0.08, h * 0.22, c.dark),
    rect(w * 0.8 - s, h * 0.78, w * 0.08, h * 0.22, c.dark),
    line(w * 0.88, h * 0.72, w * 0.96, h * 0.5, c.body, w * 0.06),
    polygon(
      [
        [w * 0.36, h * 0.64],
        [w * 0.43, h * 0.52],
        [w * 0.5, h * 0.63],
        [w * 0.57, h * 0.5],
        [w * 0.64, h * 0.63],
        [w * 0.71, h * 0.53],
        [w * 0.78, h * 0.65],
      ],
      c.dark,
    ),
    ellipse(w * 0.56, h * 0.72, w * 0.4, h * 0.11, c.body),
    ellipse(w * 0.16, h * 0.68, w * 0.15, h * 0.09, c.body),
    circle(w * 0.1, h * 0.65, w * 0.035, c.eye),
    polygon(
      [
        [w * 0.02, h * 0.71],
        [w * 0.18, h * 0.71],
        [w * 0.02, h * (0.72 + 0.07 * m)],
      ],
      c.mouth,
    ),
  ].join('');
};

/** Wide block body, small head, thick legs. */
const tankZombie: Body = (w, h, c, pose) => {
  const s = pose.leg * w * 0.05;
  const m = pose.mouth > 0 ? pose.mouth : 0.2;
  return [
    rect(w * 0.2 + s, h * 0.74, w * 0.22, h * 0.26, c.dark),
    rect(w * 0.58 - s, h * 0.74, w * 0.22, h * 0.26, c.dark),
    rect(w * 0.12, h * 0.28, w * 0.78, h * 0.5, c.body, w * 0.08),
    rect(w * 0.12, h * 0.66, w * 0.78, h * 0.05, c.dark),
    rect(w * 0.01, h * 0.36, w * 0.24, h * 0.12, c.dark, w * 0.04),
    circle(w * 0.34, h * 0.2, w * 0.1, c.body),
    circle(w * 0.29, h * 0.19, w * 0.025, c.eye),
    rect(w * 0.26, h * 0.235, w * 0.08, h * (0.01 + 0.025 * m), c.mouth),
  ].join('');
};

/** Tall body, spit sac and a big open mouth pointing left. */
const rangedZombie: Body = (w, h, c, pose) => {
  const s = pose.leg * w * 0.06;
  const m = pose.mouth > 0 ? pose.mouth : 0.4;
  return [
    rect(w * 0.4 + s, h * 0.78, w * 0.09, h * 0.22, c.dark),
    rect(w * 0.56 - s, h * 0.78, w * 0.09, h * 0.22, c.dark),
    rect(w * 0.32, h * 0.3, w * 0.42, h * 0.5, c.body, w * 0.14),
    line(w * 0.4, h * 0.42, w * 0.14, h * 0.54, c.dark, w * 0.08),
    circle(w * 0.42, h * 0.32, w * 0.11, c.light),
    ellipse(w * 0.5, h * 0.2, w * 0.24, h * 0.13, c.body),
    ellipse(w * 0.2, h * 0.21, w * 0.14, h * (0.05 + 0.04 * m), c.body),
    ellipse(w * 0.16, h * 0.21, w * 0.09, h * (0.03 + 0.035 * m), c.mouth),
    circle(w * 0.46, h * 0.13, w * 0.04, c.eye),
  ].join('');
};

/** Huge body with two horns and a dropping jaw. */
const bossZombie: Body = (w, h, c, pose) => {
  const s = pose.leg * w * 0.05;
  const m = pose.mouth > 0 ? pose.mouth : 0.25;
  const gap = h * (0.005 + 0.04 * m);
  const jawY = h * 0.31 + gap;
  return [
    rect(w * 0.3 + s, h * 0.8, w * 0.16, h * 0.2, c.dark),
    rect(w * 0.56 - s, h * 0.8, w * 0.16, h * 0.2, c.dark),
    ellipse(w * 0.56, h * 0.56, w * 0.36, h * 0.28, c.body),
    line(w * 0.42, h * 0.56, w * 0.1, h * 0.72, c.dark, w * 0.08),
    line(w * 0.36, h * 0.48, w * 0.06, h * 0.62, c.dark, w * 0.08),
    polygon(
      [
        [w * 0.2, h * 0.18],
        [w * 0.12, h * 0.02],
        [w * 0.3, h * 0.14],
      ],
      c.bone,
    ),
    polygon(
      [
        [w * 0.4, h * 0.13],
        [w * 0.48, h * 0.01],
        [w * 0.5, h * 0.18],
      ],
      c.bone,
    ),
    circle(w * 0.34, h * 0.25, w * 0.18, c.body),
    circle(w * 0.24, h * 0.22, w * 0.025, c.eye),
    circle(w * 0.34, h * 0.21, w * 0.025, c.eye),
    rect(w * 0.17, h * 0.31, w * 0.22, gap, c.mouth),
    rect(w * 0.16, jawY, w * 0.24, h * 0.06, c.dark, w * 0.02),
    polygon(
      [
        [w * 0.18, jawY],
        [w * 0.21, jawY - h * 0.025],
        [w * 0.24, jawY],
        [w * 0.27, jawY - h * 0.025],
        [w * 0.3, jawY],
        [w * 0.33, jawY - h * 0.025],
        [w * 0.36, jawY],
      ],
      c.bone,
    ),
  ].join('');
};

/** Drip-shaped blob, round end leading left, tail trailing up and right. */
const glob: Body = (w, h, c, pose) => {
  const r = Math.min(w, h) * 0.34;
  const cx = w * 0.44;
  const cy = h - r;
  return [
    polygon(
      [
        [cx - r * 0.2, cy - r * 0.95],
        [w * 0.94, h * (0.12 + 0.05 * pose.leg)],
        [cx + r, cy + r * 0.1],
      ],
      c.body,
    ),
    circle(cx, cy, r, c.body),
    circle(cx - r * 0.35, cy - r * 0.35, r * 0.25, c.light),
  ].join('');
};

/** Handle with a grey head; `use` frame 00 tips the hammer 30°. */
const hammer: Body = (w, h, c, pose) => {
  const angle = pose.animation === 'use' && pose.frame % 2 === 0 ? -30 : 0;
  const parts = [
    rect(w * 0.45, h * 0.3, w * 0.1, h * 0.62, c.body),
    rect(w * 0.44, h * 0.74, w * 0.12, h * 0.18, c.dark, w * 0.02),
    rect(w * 0.2, h * 0.12, w * 0.6, h * 0.22, c.metal, w * 0.04),
    rect(w * 0.2, h * 0.12, w * 0.08, h * 0.22, c.dark),
  ].join('');
  return angle === 0
    ? parts
    : `<g transform="rotate(${angle} ${fmt(w / 2)} ${fmt(h / 2)})">${parts}</g>`;
};

/** Grey blade disc on a handle; `use` frames shift the teeth. */
const saw: Body = (w, h, c, pose) => {
  const spin = pose.animation === 'use' ? 15 + (pose.frame % 2) * 22 : 0;
  return [
    rect(w * 0.55, h * 0.45, w * 0.4, h * 0.2, c.dark, w * 0.04),
    rect(w * 0.7, h * 0.6, w * 0.12, h * 0.38, c.body),
    `<g transform="rotate(${spin} ${fmt(w * 0.32)} ${fmt(h * 0.5)})">`,
    rect(w * 0.08, h * 0.26, w * 0.48, h * 0.48, c.metal, w * 0.06),
    `</g>`,
    circle(w * 0.32, h * 0.5, w * 0.24, c.metal),
    circle(w * 0.32, h * 0.5, w * 0.06, c.dark),
  ].join('');
};

/** Tank and nozzle pointing right (toward the manhole); `use` adds a flicker at the tip. */
const flamethrower: Body = (w, h, c, pose) => {
  const parts = [
    rect(w * 0.04, h * 0.3, w * 0.3, h * 0.55, c.body, w * 0.06),
    rect(w * 0.3, h * 0.45, w * 0.5, h * 0.18, c.metal),
    rect(w * 0.4, h * 0.6, w * 0.1, h * 0.38, c.dark),
  ];
  if (pose.animation === 'use') {
    parts.push(circle(w * 0.88, h * 0.54, h * (pose.frame % 2 === 0 ? 0.14 : 0.1), '#ffb020'));
  }
  return parts.join('');
};

/** Data packet: a small floppy-like square with a label strip. */
const drop: Body = (w, h, c) =>
  [rect(w * 0.08, h * 0.08, w * 0.84, h * 0.84, c.body, w * 0.08), rect(w * 0.25, h * 0.12, w * 0.5, h * 0.3, c.light), rect(w * 0.25, h * 0.6, w * 0.5, h * 0.3, c.dark)].join('');

const LIGHT_ON = '#3dff6e';
const LIGHT_OFF = '#1d3a24';
const LIGHT_HIT = '#ff3b3b';
const IDLE_LIGHTS: readonly (readonly boolean[])[] = [
  [true, false, true],
  [true, true, false],
];

/** Flat box with three status lights; idle blinks them, hit turns them red. */
const modem: Body = (w, h, c, pose) => {
  const pattern = IDLE_LIGHTS[pose.frame % IDLE_LIGHTS.length];
  const lights = [0.3, 0.42, 0.54].map((x, i) => {
    const fill = pose.flash ? LIGHT_HIT : pattern[i] ? LIGHT_ON : LIGHT_OFF;
    return circle(w * x, h * 0.7, w * 0.025, c === WHITE ? c.body : fill);
  });
  return [
    rect(w * 0.12, h * 0.9, w * 0.1, h * 0.1, c.dark),
    rect(w * 0.78, h * 0.9, w * 0.1, h * 0.1, c.dark),
    rect(w * 0.04, h * 0.42, w * 0.92, h * 0.5, c.body, w * 0.04),
    rect(w * 0.04, h * 0.42, w * 0.92, h * 0.08, c.light, w * 0.04),
    rect(w * 0.1, h * 0.6, w * 0.8, h * 0.2, c.dark, w * 0.02),
    ...lights,
    rect(w * 0.66, h * 0.65, w * 0.18, h * 0.03, c.body),
    rect(w * 0.66, h * 0.72, w * 0.18, h * 0.03, c.body),
  ].join('');
};

/** attack lift per frame (fraction of h) and lid tilt in degrees: the rattle. */
const LID_RATTLE: readonly (readonly [number, number])[] = [
  [0.15, -4],
  [0.35, 3],
  [0.2, -2],
];

/** Lid ellipse over a dark hole; `attack` lifts and tilts it, with eyes in the gap. */
const manhole: Body = (w, h, c, pose) => {
  const [liftFrac, tilt] =
    pose.animation === 'attack' ? LID_RATTLE[pose.frame % LID_RATTLE.length] : [0, 0];
  const lift = liftFrac * h;
  const cx = w / 2;
  const cy = h * 0.66;
  const lid = [
    ellipse(cx, cy, w * 0.45, h * 0.24, c.body),
    ellipse(cx, cy, w * 0.34, h * 0.16, c.dark),
    ellipse(cx, cy - h * 0.02, w * 0.3, h * 0.12, c.body),
    rect(cx - w * 0.2, cy - h * 0.03, w * 0.4, h * 0.04, c.dark),
  ].join('');
  const parts = [ellipse(cx, h * 0.78, w * 0.47, h * 0.22, c.hole)];
  if (lift > 0) {
    parts.push(circle(cx - w * 0.05, h * 0.74, h * 0.05, c.eye), circle(cx + w * 0.03, h * 0.74, h * 0.05, c.eye));
    parts.push(`<g transform="translate(0 ${fmt(-lift)}) rotate(${tilt} ${fmt(cx)} ${fmt(cy)})">${lid}</g>`);
  } else {
    parts.push(lid);
  }
  return parts.join('');
};

const BODIES: Readonly<Record<SpriteEntity, Body>> = Object.freeze({
  default: defaultZombie,
  fast: fastZombie,
  tank: tankZombie,
  ranged: rangedZombie,
  boss: bossZombie,
  glob,
  hammer,
  saw,
  flamethrower,
  modem,
  manhole,
  drop,
});
