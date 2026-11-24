/**
 * Lane scenery: the night behind the connection lane, drawn on a Canvas 2D. Moon, stars, a hill
 * with tombstones, telephone poles with sagging wires, a drop wire into the modem, the ground,
 * the phone cable along the lane and the dark Manhole pit. The modem, Manhole lid, zombies and
 * the hammer come from the sprite atlas (laneView.ts); this module only draws what sprites stand
 * on and in front of.
 *
 * Colours live in theme.css as `--c-lane-*` tokens and are read once per mount with
 * `readLanePalette`, so the canvas follows the same one-file theme rule as the CSS.
 *
 * Render-only: nothing here reads or writes game state. Star and tuft positions come from a fixed
 * hash, so the scenery is the same on every run (and in the demo video).
 */
import { MAX_SHAKE_PX } from './laneEffects';
import type { LaneLayout } from './laneLayout';
import { ENTITY_LOOKS } from './sprites/entities';

const TOKENS = {
  skyTop: '--c-lane-sky-top',
  skyBottom: '--c-lane-sky-bottom',
  star: '--c-lane-star',
  moon: '--c-lane-moon',
  moonShadow: '--c-lane-moon-shadow',
  moonGlow: '--c-lane-moon-glow',
  hill: '--c-lane-hill',
  pole: '--c-lane-pole',
  poleEdge: '--c-lane-pole-edge',
  wire: '--c-lane-wire',
  ground: '--c-lane-ground',
  groundEdge: '--c-lane-ground-edge',
  groundSpeck: '--c-lane-ground-speck',
  cable: '--c-lane-cable',
  cableShine: '--c-lane-cable-shine',
  fog: '--c-lane-fog',
  manholeHole: '--c-lane-manhole-hole',
  manholeGlow: '--c-lane-manhole-glow',
  modemGlow: '--c-lane-modem-glow',
  aim: '--c-lane-aim',
} as const;

export type LanePalette = Readonly<Record<keyof typeof TOKENS, string>>;

/** Used for a token that is missing (stylesheet not loaded, as in jsdom). */
const MISSING = 'rgba(0, 0, 0, 0)';

/** Resolves every `--c-lane-*` token on `el`, which must be in the document. */
export function readLanePalette(el: Element): LanePalette {
  let style: CSSStyleDeclaration | null = null;
  try {
    style = el.ownerDocument.defaultView?.getComputedStyle(el) ?? null;
  } catch {
    style = null;
  }
  const palette = {} as Record<keyof typeof TOKENS, string>;
  for (const [key, token] of Object.entries(TOKENS) as [keyof typeof TOKENS, string][]) {
    const value = style?.getPropertyValue(token).trim() ?? '';
    palette[key] = value === '' ? MISSING : value;
  }
  return Object.freeze(palette);
}

/** Where the scenery's landmarks sit, all in canvas px. */
export interface SceneryAnchors {
  readonly width: number;
  readonly height: number;
  /** Canvas x of the modem's centre. */
  readonly modemX: number;
  /** Canvas x of the Manhole's centre (Lane_Length). */
  readonly manholeX: number;
}

/** Extra px drawn on every side of the cached scenery so a shaken lane shows no gaps. */
export const SCENERY_MARGIN = MAX_SHAKE_PX + 1;

/** Deterministic value in [0, 1) for an integer, for star and tuft placement. */
function hash01(n: number): number {
  const s = Math.sin(n * 12.9898 + 78.233) * 43758.5453;
  return s - Math.floor(s);
}

const GROUND_RISE = 6;
const POLE_TOP = 58;
const CROSSBAR_Y = 68;
const ARM = 22;
const MOON = { x: 0.8, y: 50, r: 17 } as const;

/** Height of the far hill line above the phone line at canvas x. */
function hillRise(x: number): number {
  return 34 + 10 * Math.sin(x / 97) + 6 * Math.sin(x / 41 + 1.3) + 4 * Math.sin(x / 23 + 0.4);
}

function disc(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

function glow(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, colour: string, clear: string): void {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, colour);
  g.addColorStop(1, clear);
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
}

function tombstone(ctx: CanvasRenderingContext2D, x: number, baseY: number, w: number, h: number): void {
  ctx.beginPath();
  ctx.moveTo(x - w / 2, baseY);
  ctx.lineTo(x - w / 2, baseY - h + w / 2);
  ctx.arc(x, baseY - h + w / 2, w / 2, Math.PI, 0);
  ctx.lineTo(x + w / 2, baseY);
  ctx.closePath();
  ctx.fill();
}

function cross(ctx: CanvasRenderingContext2D, x: number, baseY: number, h: number): void {
  ctx.fillRect(x - 1.5, baseY - h, 3, h);
  ctx.fillRect(x - 5, baseY - h * 0.72, 10, 3);
}

/** Pole x positions between the modem and the Manhole. */
function poleXs(a: SceneryAnchors): readonly number[] {
  const span = a.manholeX - a.modemX;
  return [0.27, 0.6, 0.9].map((f) => Math.round(a.modemX + span * f));
}

function sagWire(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, sag: number): void {
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.quadraticCurveTo((x0 + x1) / 2, Math.max(y0, y1) + sag, x1, y1);
  ctx.stroke();
}

/**
 * Draws the static scenery in canvas px, covering `SCENERY_MARGIN` px beyond every edge. Called
 * once per layout into a cached offscreen canvas, or every frame if no cache could be made.
 */
export function drawScenery(
  ctx: CanvasRenderingContext2D,
  layout: LaneLayout,
  anchors: SceneryAnchors,
  p: LanePalette,
): void {
  const { width: W, height: H, modemX, manholeX } = anchors;
  const m = SCENERY_MARGIN;
  const lineY = layout.lineY;
  const groundY = lineY - GROUND_RISE;

  // Sky.
  const sky = ctx.createLinearGradient(0, -m, 0, groundY);
  sky.addColorStop(0, p.skyTop);
  sky.addColorStop(1, p.skyBottom);
  ctx.fillStyle = sky;
  ctx.fillRect(-m, -m, W + 2 * m, groundY + m);

  // Stars, thinning toward the horizon.
  ctx.fillStyle = p.star;
  for (let i = 0; i < 46; i += 1) {
    const x = hash01(i) * W;
    const y = 6 + hash01(i + 101) ** 1.6 * (lineY * 0.5);
    const size = hash01(i + 211) > 0.85 ? 2 : 1;
    ctx.fillRect(Math.round(x), Math.round(y), size, size);
  }

  // Crescent moon with a halo.
  const moonX = W * MOON.x;
  glow(ctx, moonX, MOON.y, MOON.r * 4, p.moonGlow, MISSING);
  ctx.fillStyle = p.moon;
  disc(ctx, moonX, MOON.y, MOON.r);
  ctx.save();
  ctx.beginPath();
  ctx.arc(moonX, MOON.y, MOON.r, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = p.moonShadow;
  disc(ctx, moonX + MOON.r * 0.55, MOON.y - MOON.r * 0.3, MOON.r * 0.95);
  ctx.restore();

  // Far hill with a small graveyard on it.
  ctx.fillStyle = p.hill;
  ctx.beginPath();
  ctx.moveTo(-m, groundY);
  for (let x = -m; x <= W + m; x += 8) ctx.lineTo(x, groundY - hillRise(x));
  ctx.lineTo(W + m, groundY);
  ctx.closePath();
  ctx.fill();
  for (const [f, kind, size] of [
    [0.34, 'stone', 1],
    [0.37, 'cross', 1.1],
    [0.4, 'stone', 0.8],
    [0.66, 'cross', 0.9],
    [0.7, 'stone', 1.2],
    [0.73, 'stone', 0.7],
  ] as const) {
    const x = Math.round(W * f);
    const base = groundY - hillRise(x) + 2;
    if (kind === 'stone') tombstone(ctx, x, base, 10 * size, 14 * size);
    else cross(ctx, x, base, 16 * size);
  }

  // Ground-level mist.
  const mist = ctx.createLinearGradient(0, groundY - 46, 0, groundY);
  mist.addColorStop(0, MISSING);
  mist.addColorStop(1, p.fog);
  ctx.fillStyle = mist;
  ctx.fillRect(-m, groundY - 46, W + 2 * m, 46);

  // Modem glow on the wall of night behind it.
  const modemTop = lineY - ENTITY_LOOKS.modem.box.h;
  glow(ctx, modemX, lineY - ENTITY_LOOKS.modem.box.h / 2, 84, p.modemGlow, MISSING);

  // Telephone poles and their wires.
  const poles = poleXs(anchors);
  ctx.strokeStyle = p.wire;
  ctx.lineWidth = 1;
  // One wire per insulator, each with its own sag so they don't sit on top of each other.
  for (const [offset, sag] of [
    [-ARM + 3, 16],
    [-8, 20],
    [8, 13],
    [ARM - 3, 18],
  ] as const) {
    const y = CROSSBAR_Y - 3;
    let prevX = -m;
    let prevY = y + 6;
    for (const px of poles) {
      sagWire(ctx, prevX, prevY, px + offset, y, sag);
      prevX = px + offset;
      prevY = y;
    }
    sagWire(ctx, prevX, prevY, W + m, y + 6, sag);
  }
  // Drop wire from the first pole down into the modem.
  ctx.lineWidth = 1.5;
  sagWire(ctx, poles[0] - ARM + 3, CROSSBAR_Y - 3, modemX + ENTITY_LOOKS.modem.box.w * 0.35, modemTop + 8, 4);
  for (const px of poles) {
    ctx.fillStyle = p.pole;
    ctx.fillRect(px - 3, POLE_TOP, 6, groundY - POLE_TOP + 2);
    ctx.fillRect(px - ARM, CROSSBAR_Y, ARM * 2, 4);
    ctx.fillStyle = p.poleEdge;
    ctx.fillRect(px - 3, POLE_TOP, 1, groundY - POLE_TOP + 2);
    ctx.fillRect(px - ARM, CROSSBAR_Y, ARM * 2, 1);
    for (const ix of [-ARM + 3, -8, 8, ARM - 3]) ctx.fillRect(px + ix - 1, CROSSBAR_Y - 4, 3, 4);
  }

  // Ground.
  ctx.fillStyle = p.ground;
  ctx.fillRect(-m, groundY, W + 2 * m, H - groundY + m);
  ctx.fillStyle = p.groundEdge;
  ctx.fillRect(-m, groundY, W + 2 * m, 2);
  for (let i = 0; i < 90; i += 1) {
    const x = Math.round(hash01(i + 401) * W);
    const tall = 2 + Math.round(hash01(i + 503) * 4);
    ctx.fillRect(x, groundY - tall, 1, tall);
  }
  ctx.fillStyle = p.groundSpeck;
  for (let i = 0; i < 120; i += 1) {
    const x = Math.round(hash01(i + 607) * W);
    const y = Math.round(groundY + 4 + hash01(i + 709) * (H - groundY - 4));
    ctx.fillRect(x, y, 2, 1);
  }

  // The Manhole pit, under its lid sprite.
  ctx.fillStyle = p.manholeHole;
  ctx.beginPath();
  ctx.ellipse(manholeX, lineY - 3, ENTITY_LOOKS.manhole.box.w * 0.55, 8, 0, 0, Math.PI * 2);
  ctx.fill();

  // The phone cable the zombies walk along, modem to Manhole.
  const cableX0 = modemX + ENTITY_LOOKS.modem.box.w * 0.4;
  const cableX1 = manholeX - ENTITY_LOOKS.manhole.box.w * 0.3;
  ctx.fillStyle = p.cable;
  ctx.fillRect(cableX0, lineY - 4, cableX1 - cableX0, 4);
  ctx.fillStyle = p.cableShine;
  ctx.fillRect(cableX0, lineY - 4, cableX1 - cableX0, 1);
  for (let x = cableX0 + 60; x < cableX1 - 20; x += 120) ctx.fillRect(x, lineY - 5, 3, 6);
}

/** Pulsing glow out of the Manhole, drawn every frame behind the sprites. */
export function drawManholeGlow(
  ctx: CanvasRenderingContext2D,
  layout: LaneLayout,
  anchors: SceneryAnchors,
  p: LanePalette,
  tick: number,
): void {
  ctx.save();
  ctx.globalAlpha = 0.75 + 0.25 * Math.sin(tick / 23);
  glow(ctx, anchors.manholeX, layout.lineY - 6, 78, p.manholeGlow, MISSING);
  ctx.restore();
}

/** Slow mist drifting over the feet of the zombies, drawn every frame in front of the sprites. */
export function drawDriftingFog(
  ctx: CanvasRenderingContext2D,
  layout: LaneLayout,
  anchors: SceneryAnchors,
  p: LanePalette,
  tick: number,
): void {
  const span = anchors.width + 360;
  ctx.fillStyle = p.fog;
  for (let i = 0; i < 4; i += 1) {
    const speed = 0.18 + 0.07 * i;
    const x = ((hash01(i + 811) * span + tick * speed) % span) - 180;
    ctx.beginPath();
    ctx.ellipse(x, layout.lineY - 4 - 3 * i, 150 + 30 * i, 9 + 2 * i, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** A tiny aim mark at the hammer hotspot, so clicks land where the player expects. */
export function drawAimMark(ctx: CanvasRenderingContext2D, x: number, y: number, p: LanePalette): void {
  ctx.fillStyle = p.aim;
  ctx.fillRect(Math.round(x) - 3, Math.round(y), 2, 1);
  ctx.fillRect(Math.round(x) + 2, Math.round(y), 2, 1);
  ctx.fillRect(Math.round(x), Math.round(y) - 3, 1, 2);
  ctx.fillRect(Math.round(x), Math.round(y) + 2, 1, 2);
}
