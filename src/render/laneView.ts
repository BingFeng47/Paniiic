/**
 * Lane_View: the Session_View for the connection lane (Req 10.2, 10.4, 11, 13.4, 13.6, 14.1, 14.4).
 *
 * DOM (see src/styles/lane.css): `div.lane-view > canvas.lane-canvas + div.lane-hud`, mounted into
 * the Session's `laneHost` (the Lane_Dock).
 *
 * - Input: the pointer over the canvas is batched into at most one `lanePointer` per frame, sent
 *   from `update()` only when the Lane_Units position or the primary button changed
 *   (economy-weapons Req 2.4). A primary press also sends one `hammer` command while the hammer
 *   is the Active_Weapon; with the saw or flamethrower active it sends only `lanePointer`
 *   (Req 5.4). Leaving the canvas, for example onto a Lane_Cover Ad in the Ad_Layer (a sibling
 *   subtree stacked over the Lane_Dock, so its presses never reach the canvas), sends one
 *   `lanePointer` with `down: false` parked off the feed (ad-pressure Req 6.4).
 *   On `document`: keys 1–5 send `buy`, Q / wheel up `switchWeapon previous`, E / wheel down
 *   `next` (Req 4.5, 5.1, 5.2), ignored while focus is in a text field.
 *   The view never writes to the state; `ctx.send` is its only way to change the Run (Req 11.4).
 * - Every frame (`update`, also on frames with zero ticks): fold the events into the render-only
 *   Lane_Effects, update the Lane_HUD, play each matching lane sound once, and, when the canvas
 *   has a 2D context, draw scenery, the draw list and the hammer cursor. Without a 2D context the
 *   HUD, sounds and input keep working (Req 11.5).
 * - Sprites come from the Sprite_Atlas: a rasterized frame when ready, else a flat box in the
 *   entity colour at the same size (Req 13.6). With no team art every frame is a placeholder
 *   (Req 13.4).
 */
import type { Point } from '../core/monitor';
import type { SessionContext, SessionView } from '../dialup/session';
import type { Voice } from '../core/audio';
import { h } from '../core/h';
import { DEFAULT_LANE_BALANCE, secondsToTicks } from '../game/balance/lane';
import type { DirectorState } from '../game/director/directorTypes';
import { bossRoar, bossRumble, GROAN_SEC, JUICE_LOOP_SEC, JUICE_SOUND_SEC, kindGroans } from './juice/juiceSounds';
import { laneOf } from '../game/laneState';
import { TICK_RATE, type GameEvent, type GameState } from '../game/types';
import { createLaneHud, integrityView, type LaneHud } from '../ui/laneHud';
import { createShopTray, type ShopTray } from '../ui/shopTray';
import { createCctvOsd, type CctvOsd } from './cctv/cctvOsd';
import { cameraHum, cameraStatic, CCTV_SOUND_SEC } from './cctv/cctvSounds';
import { createFlashBudget, type FlashBudget } from './flashBudget';
import { applyCctvEvents, dropoutActive, EMPTY_CCTV, startupActive, tearActive, type CctvState } from './cctv/cctvState';
import { CCTV_TOKENS, CCTV_TUNING } from './cctv/cctvTuning';
import {
  DEFAULT_CCTV_COLORS,
  drawDropout,
  drawGrade,
  drawMotionBoxes,
  drawNoSignal,
  drawOverlay,
  drawStartup,
  drawTear,
  type CctvColors,
} from './cctv/cctvDraw';
import { createNoiseTiles, createOverlayCache, NOISE_SEED, releaseCanvases } from './cctv/noiseTiles';
import { LANE_COPY } from '../ui/laneCopy';
import { buildDrawList } from './laneDrawList';
import {
  applyEvents,
  BOSS_RUMBLE_TICKS,
  bossRumbleActive,
  dieTicksFrom,
  EMPTY_EFFECTS,
  KB_LABEL_RISE_PX,
  KB_LABEL_TICKS,
  KILL_POP_TICKS,
  laneShake,
  type LaneEffects,
} from './laneEffects';
import {
  clientToLane,
  createLaneLayout,
  LANE_CANVAS_H,
  LANE_CANVAS_W,
  laneToCanvas,
  MODEM_AREA_W,
  offFeedLaneY,
  type LaneLayout,
} from './laneLayout';
import {
  drawAimMark,
  drawDriftingFog,
  drawManholeGlow,
  drawScenery,
  readLanePalette,
  SCENERY_MARGIN,
  type LanePalette,
  type SceneryAnchors,
} from './laneScenery';
import { LANE_SOUND_SEC, LANE_SOUNDS, laneSoundsFor } from './laneSounds';
import { getDefaultAtlas, type SpriteAtlas } from './sprites/atlas';
import { ENTITY_LOOKS, SWING_TICKS, type AnimationName, type SpriteEntity } from './sprites/entities';
import { frameIndex } from './sprites/frames';
import { animationSpec } from './sprites/animationTable';
import {
  COMBO_BLIP_SEC,
  comboBlip,
  comboBlipCount,
  createEconomyLoops,
  ECONOMY_SOUND_SEC,
  ECONOMY_SOUNDS,
  economySoundsFor,
  type EconomyLoops,
} from './economySounds';
import { comboTextAt, latestCombo, type ComboShow } from './comboDisplay';
import { DEFAULT_ECONOMY_BALANCE } from '../game/balance/economy';
import { PACKET_Y, type EconomyState, type ShopSlot, type WeaponId } from '../game/economy';

export interface LaneViewDeps {
  /** Defaults to `getDefaultAtlas`. Tests inject an atlas, since real images never load in jsdom. */
  readonly atlas?: () => SpriteAtlas;
  /** Defaults to `window.devicePixelRatio`; capped at MAX_DPR. */
  readonly devicePixelRatio?: () => number;
  /** The Session's shared flash budget (juice-and-endings Req 8.1). Defaults to one per mount. */
  readonly flashBudget?: () => FlashBudget;
}

/** Highest backing-store scale. Beyond 2× the sprites (rasterized at 2×) gain nothing. */
export const MAX_DPR = 2;

/** Backing-store scale for a raw device pixel ratio: in (0, MAX_DPR], 1 when unusable. */
export function laneDpr(raw: number): number {
  return Number.isFinite(raw) && raw > 0 ? Math.min(raw, MAX_DPR) : 1;
}

/**
 * The hammer cursor's hotspot, as a share of its height from the top: the middle of the head in
 * the placeholder art, so the head lands where the click is tested.
 */
export const HAMMER_HOTSPOT = 0.23;

function defaultDpr(): number {
  return typeof window === 'undefined' ? 1 : window.devicePixelRatio;
}

function context2d(canvas: HTMLCanvasElement): CanvasRenderingContext2D | null {
  try {
    return canvas.getContext('2d');
  } catch {
    return null;
  }
}

/** Draws one sprite by its feet, or a flat box in the entity colour while it is not rasterized. */
function drawSprite(
  g: CanvasRenderingContext2D,
  atlas: SpriteAtlas,
  entity: SpriteEntity,
  animation: AnimationName,
  frame: number,
  feet: Point,
  height: number,
  flash = false,
): void {
  const raster = atlas.frame(entity, animation, frame);
  const once = (): void => {
    if (raster !== null) {
      const w = height * raster.aspect;
      g.drawImage(raster.image, feet.x - w / 2, feet.y - height, w, height);
      return;
    }
    const box = ENTITY_LOOKS[entity].box;
    const w = (height * box.w) / box.h;
    g.fillStyle = atlas.colour(entity);
    g.fillRect(feet.x - w / 2, feet.y - height, w, height);
  };
  once();
  if (!flash) return;
  // Hit flash (juice Req 4.1): the same sprite again, additive, at HIT_FLASH_ALPHA.
  g.save();
  g.globalCompositeOperation = 'lighter';
  g.globalAlpha = HIT_FLASH_ALPHA;
  once();
  g.restore();
}

const HIT_FLASH_ALPHA = 0.6;
const OSD_FALLBACK = '#e6f2e8';

/** The director state, or null before the director runs or in Runs without one. */
export function currentDirector(state: GameState): DirectorState | null {
  return state.director ?? null;
}

/** The Boss_Rise clock-fallback Tick from the Chapter_Table, or null without a director. */
export function bossLatestTickOf(state: GameState): number | null {
  const d = currentDirector(state);
  return d === null ? null : secondsToTicks(d.table.bossLatestSecond);
}

/**
 * Boss_Rumble at this state (juice Req 5.1), boss not yet out. The boss rises on download
 * progress (pacing-and-economy Req 3.2), so its Tick is not known ahead: the rumble plays once
 * the download is within BOSS_RUMBLE_TICKS of full-speed progress of `bossAtPercent`, or within
 * BOSS_RUMBLE_TICKS before the `bossLatestSecond` fallback.
 */
export function rumbleAt(state: GameState): boolean {
  const d = currentDirector(state);
  if (d === null || d.bossDone) return false;
  const lead = (state.balance.downloadPercentPerSecond * BOSS_RUMBLE_TICKS) / TICK_RATE;
  if (state.download >= d.table.bossAtPercent - lead - 1e-9) return true;
  return bossRumbleActive(state.tick, bossLatestTickOf(state), false);
}

/** Kill_Pop: an expanding ring and eight debris specks, fading over KILL_POP_TICKS (Req 4.2). */
function drawKillPop(g: CanvasRenderingContext2D, at: Point, age: number, colour: string): void {
  const t = age / KILL_POP_TICKS;
  g.save();
  g.globalAlpha = Math.max(0, 1 - t);
  g.strokeStyle = colour;
  g.fillStyle = colour;
  g.lineWidth = 2;
  g.beginPath();
  g.arc(at.x, at.y, 4 + 22 * t, 0, Math.PI * 2);
  g.stroke();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + 0.4;
    const d = 6 + 26 * t;
    g.fillRect(at.x + Math.cos(a) * d - 1.5, at.y + Math.sin(a) * d * 0.6 - 1.5 + 10 * t * t, 3, 3);
  }
  g.restore();
}

/** Dust rising from the shaking Manhole during the Boss_Rumble (Req 5.1). Deterministic. */
function drawRumbleDust(g: CanvasRenderingContext2D, at: Point, tick: number, colour: string): void {
  g.save();
  g.fillStyle = colour;
  for (let i = 0; i < 6; i++) {
    const life = (tick + i * 7) % 40;
    g.globalAlpha = 0.35 * (1 - life / 40);
    g.fillRect(at.x + ((i * 13) % 50) - 25 + Math.sin(tick * 0.1 + i) * 3, at.y - life * 0.9, 3, 3);
  }
  g.restore();
}

/** One theme token from `el`'s computed style, or `fallback`. */
function readToken(el: Element, token: string, fallback: string): string {
  try {
    const v = el.ownerDocument.defaultView?.getComputedStyle(el).getPropertyValue(token).trim() ?? '';
    return v === '' ? fallback : v;
  } catch {
    return fallback;
  }
}

/** Camera colours from the theme tokens, falling back to DEFAULT_CCTV_COLORS (lane-cctv Req 10.3). */
function readCctvColors(el: Element): CctvColors {
  let style: CSSStyleDeclaration | null = null;
  try {
    style = el.ownerDocument.defaultView?.getComputedStyle(el) ?? null;
  } catch {
    style = null;
  }
  const read = (token: string, fallback: string): string => {
    const v = style?.getPropertyValue(token).trim() ?? '';
    return v === '' ? fallback : v;
  };
  return Object.freeze({
    grade: read(CCTV_TOKENS.grade, DEFAULT_CCTV_COLORS.grade),
    motion: read(CCTV_TOKENS.motion, DEFAULT_CCTV_COLORS.motion),
  });
}

const LANE_RECT = Object.freeze({ width: LANE_CANVAS_W, height: LANE_CANVAS_H });

interface PlayedVoice {
  readonly voice: Voice;
  /** Tick after which the sound has certainly finished. */
  readonly untilTick: number;
}

interface Scenery {
  readonly laneLength: number;
  /** Cached scenery, or null to draw it every frame. */
  readonly image: HTMLCanvasElement | null;
}

interface Mounted {
  readonly ctx: SessionContext;
  readonly el: HTMLElement;
  readonly canvas: HTMLCanvasElement;
  readonly g: CanvasRenderingContext2D | null;
  readonly palette: LanePalette | null;
  readonly hud: LaneHud;
  readonly tray: ShopTray;
  readonly atlas: SpriteAtlas;
  readonly dpr: number;
  /** View_Prefs Screen_Shake, read once at mount (title-and-endings Req 7.2, 7.3). */
  readonly shakeEnabled: boolean;
  readonly dieTicks: ReturnType<typeof dieTicksFrom>;
  readonly frameCount: (entity: SpriteEntity, animation: AnimationName) => number;
  readonly onPointerDown: (e: PointerEvent) => void;
  readonly onPointerMove: (e: PointerEvent) => void;
  readonly onPointerLeave: () => void;
  readonly onPointerUp: (e: PointerEvent) => void;
  readonly onKeyDown: (e: KeyboardEvent) => void;
  readonly onWheel: (e: WheelEvent) => void;
  /** Latest pointer in Lane_Units and button state, waiting to be batched into `lanePointer`. */
  lanePointer: { x: number; y: number; down: boolean } | null;
  /** The last `lanePointer` sent, to skip unchanged Ticks. */
  lastSent: { x: number; y: number; down: boolean } | null;
  readonly loops: EconomyLoops;
  /** Active weapon seen in the last update, so a press knows whether to swing the hammer. */
  active: WeaponId;
  layout: LaneLayout;
  laneLength: number;
  effects: LaneEffects;
  /** Pointer in canvas px while it is over the canvas, else null. */
  pointer: Point | null;
  voices: PlayedVoice[];
  scenery: Scenery | null;
  readonly osd: CctvOsd;
  readonly cctvColors: CctvColors;
  readonly tiles: HTMLCanvasElement[];
  readonly overlayCache: HTMLCanvasElement | null;
  readonly humVoice: Voice;
  cctv: CctvState;
  flashBudget: FlashBudget;
  /** OSD colour for "+N KB" labels (juice Req 4.3). */
  readonly osdColour: string;
  /** Packet positions seen last frame, for labels of packets collected this frame. */
  packetPos: Map<number, { x: number; y: number }>;
  /** The Boss_Rumble loop while it plays (juice Req 5.2). */
  rumbleVoice: Voice | null;
  /** Noise alpha of the NO SIGNAL cut, set from the flash budget on its first tick. */
  noSignalAlpha: number;
  /** Last `combo` event and its Tick, shown on the OSD (pacing-and-economy Req 5.5). */
  combo: ComboShow | null;
}

/** Shop slot for a `1`–`5` key, else null. */
export function slotForKey(key: string): ShopSlot | null {
  return key === '1' || key === '2' || key === '3' || key === '4' || key === '5' ? (Number(key) as ShopSlot) : null;
}

/** True while focus is in a text field, where game keys must not fire. */
function inTextField(target: EventTarget | null): boolean {
  if (typeof HTMLElement === 'undefined' || !(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}

/** Saw / flamethrower firing as the simulation sees it (weapons.ts), for cursors and loops. */
export function weaponFiring(e: EconomyState | undefined): { readonly saw: boolean; readonly flame: boolean } {
  const down = e !== undefined && e.pointer !== null && e.pointer.down;
  return {
    saw: down && e.active === 'saw',
    flame: down && e.active === 'flamethrower' && e.fuel > 0 && !e.flameLatched,
  };
}

/** Packet opacity: 1, then a linear fade over the last second of its lifetime (Req 2.5). */
export function packetAlpha(ageTicks: number, lifetimeSeconds: number): number {
  const left = lifetimeSeconds - ageTicks / TICK_RATE;
  return Math.max(0, Math.min(1, left));
}

const FLAME_ALPHA = 0.35;

/** Moved to laneLayout.ts so the zombie-sim bots share it; re-exported for existing callers. */
export { offFeedLaneY };

export function createLaneView(deps: LaneViewDeps = {}): SessionView {
  let m: Mounted | null = null;

  const layoutFor = (laneLength: number): LaneLayout =>
    createLaneLayout(LANE_CANVAS_W, LANE_CANVAS_H, laneLength);

  const anchorsFor = (layout: LaneLayout, laneLength: number): SceneryAnchors => ({
    width: LANE_CANVAS_W,
    height: LANE_CANVAS_H,
    modemX: layout.originX - MODEM_AREA_W / 2,
    manholeX: laneToCanvas({ x: laneLength, y: 0 }, layout).x,
  });

  /** Scenery cached in an offscreen canvas, rebuilt only when the lane length changes. */
  const sceneryFor = (s: Mounted, palette: LanePalette): Scenery => {
    if (s.scenery !== null && s.scenery.laneLength === s.laneLength) return s.scenery;
    const pad = SCENERY_MARGIN;
    const image = document.createElement('canvas');
    image.width = Math.round((LANE_CANVAS_W + 2 * pad) * s.dpr);
    image.height = Math.round((LANE_CANVAS_H + 2 * pad) * s.dpr);
    const bg = context2d(image);
    if (bg !== null) {
      bg.setTransform(s.dpr, 0, 0, s.dpr, pad * s.dpr, pad * s.dpr);
      drawScenery(bg, s.layout, anchorsFor(s.layout, s.laneLength), palette);
    }
    s.scenery = { laneLength: s.laneLength, image: bg === null ? null : image };
    return s.scenery;
  };

  const draw = (s: Mounted, g: CanvasRenderingContext2D, palette: LanePalette, state: GameState): void => {
    const { dpr, layout, effects, atlas } = s;
    const tick = state.tick;
    const anchors = anchorsFor(layout, s.laneLength);
    const pad = SCENERY_MARGIN;

    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, s.canvas.width, s.canvas.height);

    // Everything on the lane shakes together after a modem hit (Req 11.7); the cursor does not.
    // With screen shake off the offset is zero (title-and-endings Req 7.2).
    const { dx, dy } = laneShake(s.shakeEnabled, tick, effects.shakeUntilTick);
    g.setTransform(dpr, 0, 0, dpr, dx * dpr, dy * dpr);
    const scenery = sceneryFor(s, palette);
    if (scenery.image !== null) {
      g.drawImage(scenery.image, -pad, -pad, LANE_CANVAS_W + 2 * pad, LANE_CANVAS_H + 2 * pad);
    } else {
      drawScenery(g, layout, anchors, palette);
    }
    drawManholeGlow(g, layout, anchors, palette, tick);

    const rumble = rumbleAt(state);
    for (const item of buildDrawList(state, effects, layout, s.frameCount, rumble)) {
      drawSprite(g, atlas, item.entity, item.animation, item.frame, item.feet, item.height, item.flash === true);
    }
    if (rumble) drawRumbleDust(g, laneToCanvas({ x: s.laneLength, y: 0 }, layout), tick, palette.groundSpeck);
    for (const pop of effects.pops) {
      const age = tick - pop.tick;
      if (age < 0 || age >= KILL_POP_TICKS) continue;
      const feet = laneToCanvas({ x: pop.x, y: 0 }, layout);
      drawKillPop(g, { x: feet.x, y: feet.y - 14 }, age, s.osdColour);
    }
    const economy = state.economy;
    if (economy !== undefined) {
      const dropFrames = atlas.frameCount('drop', 'idle');
      for (const packet of economy.packets) {
        const alpha = packetAlpha(tick - packet.dropTick, economy.balance.packetLifetimeSeconds);
        if (alpha <= 0) continue;
        g.globalAlpha = alpha;
        const feet = laneToCanvas({ x: packet.x, y: PACKET_Y }, layout);
        drawSprite(g, atlas, 'drop', 'idle', frameIndex(animationSpec('drop', 'idle'), tick, dropFrames), feet, ENTITY_LOOKS.drop.box.h);
      }
      g.globalAlpha = 1;
    }
    // "+N KB" labels rise KB_LABEL_RISE_PX over KB_LABEL_TICKS in the OSD colour (Req 4.3).
    for (const label of effects.kbLabels) {
      const age = tick - label.tick;
      if (age < 0 || age >= KB_LABEL_TICKS) continue;
      const at = laneToCanvas({ x: label.x, y: label.y }, layout);
      g.save();
      g.globalAlpha = 1 - age / KB_LABEL_TICKS;
      g.fillStyle = s.osdColour;
      g.font = 'bold 12px monospace';
      g.textAlign = 'center';
      g.fillText(LANE_COPY.kbLabel(label.kb), at.x, at.y - 8 - (KB_LABEL_RISE_PX * age) / KB_LABEL_TICKS);
      g.restore();
    }
    drawDriftingFog(g, layout, anchors, palette, tick);

    // Camera layer (lane-cctv): grade and overlay over the lane, motion boxes in the shaken
    // transform, signal effects in the lane's unshaken transform. Paint only; geometry unchanged.
    const cctv = s.cctv;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawGrade(g, LANE_RECT, s.cctvColors);
    drawOverlay(g, LANE_RECT, s.tiles, s.overlayCache, tick);
    g.setTransform(dpr, 0, 0, dpr, dx * dpr, dy * dpr);
    drawMotionBoxes(g, cctv.motionBoxes, laneOf(state), layout, tick, LANE_COPY.cctv.motion, s.cctvColors);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (tearActive(cctv, tick)) drawTear(g, LANE_RECT, s.tiles, tick, cctv.tearDim ? 0.5 : 1);
    if (dropoutActive(cctv, tick)) drawDropout(g, LANE_RECT, s.tiles, tick);
    if (startupActive(cctv, tick) && cctv.startTick !== null) {
      drawStartup(g, LANE_RECT, s.tiles, (tick - cctv.startTick) / CCTV_TUNING.startupTicks, tick);
    }

    // Hammer cursor at the pointer, swinging for SWING_TICKS after each accepted swing (Req 11.8).
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const pointer = s.pointer;
    const firing = weaponFiring(economy);
    if (pointer !== null && economy !== undefined && economy.active !== 'hammer') {
      // Flame cone: a translucent wedge from the pointer toward the Manhole (+x), Req 7.4 / 8.1.
      if (firing.flame) {
        const b = economy.balance;
        const reach = b.flameReach * layout.scale;
        const half = (b.flameHalfAngleDeg * Math.PI) / 180;
        g.save();
        g.globalAlpha = FLAME_ALPHA;
        g.fillStyle = atlas.colour('flamethrower');
        g.beginPath();
        g.moveTo(pointer.x, pointer.y);
        g.arc(pointer.x, pointer.y, reach, -half, half);
        g.closePath();
        g.fill();
        g.restore();
      }
      const entity: SpriteEntity = economy.active === 'saw' ? 'saw' : 'flamethrower';
      const using = economy.active === 'saw' ? firing.saw : firing.flame;
      const animation: AnimationName = using ? 'use' : 'idle';
      const frame = frameIndex(animationSpec(entity, animation), tick, atlas.frameCount(entity, animation));
      const height = ENTITY_LOOKS[entity].box.h;
      drawSprite(g, atlas, entity, animation, frame, { x: pointer.x, y: pointer.y + height / 2 }, height);
      drawAimMark(g, pointer.x, pointer.y, palette);
    } else if (pointer !== null) {
      const swingAge = effects.swingTick === null ? -1 : tick - effects.swingTick;
      const swinging = swingAge >= 0 && swingAge < SWING_TICKS;
      const animation: AnimationName = swinging ? 'use' : 'idle';
      const frame = frameIndex(animationSpec('hammer', animation), swinging ? swingAge : tick, atlas.frameCount('hammer', animation));
      const height = ENTITY_LOOKS.hammer.box.h;
      const feet = { x: pointer.x, y: pointer.y + height * (1 - HAMMER_HOTSPOT) };
      drawSprite(g, atlas, 'hammer', animation, frame, feet, height);
      drawAimMark(g, pointer.x, pointer.y, palette);
    }
  };

  const playSounds = (s: Mounted, events: readonly GameEvent[], tick: number): void => {
    // Forget voices that have certainly finished, so the list stays short over a long run.
    s.voices = s.voices.filter((v) => v.untilTick >= tick);
    for (const id of laneSoundsFor(events)) {
      if (id === 'manholeClank') continue; // replaced by the per-kind groan (juice Req 6.1)
      const sec = LANE_SOUND_SEC[id];
      const voice = s.ctx.audio.play(LANE_SOUNDS[id], sec);
      s.voices.push({ voice, untilTick: tick + Math.ceil(sec * TICK_RATE) + 1 });
    }
    for (const id of economySoundsFor(events)) {
      const sec = ECONOMY_SOUND_SEC[id];
      const voice = s.ctx.audio.play(ECONOMY_SOUNDS[id], sec);
      s.voices.push({ voice, untilTick: tick + Math.ceil(sec * TICK_RATE) + 1 });
    }
    const push = (voice: Voice, sec: number): void => {
      s.voices.push({ voice, untilTick: tick + Math.ceil(sec * TICK_RATE) + 1 });
    };
    // One combo blip per frame, pitched for the longest chain (pacing-and-economy Req 5.5).
    const chain = comboBlipCount(events);
    if (chain !== null) push(s.ctx.audio.play(comboBlip(chain), COMBO_BLIP_SEC), COMBO_BLIP_SEC);
    // One groan per frame, for the first spawn's kind (juice Req 6.1); one roar per boss (5.3).
    let groaned = false;
    for (const e of events) {
      if (e.type !== 'mobSpawned') continue;
      if (!groaned) {
        groaned = true;
        push(s.ctx.audio.play(kindGroans[e.kind], GROAN_SEC[e.kind], 'sfx'), GROAN_SEC[e.kind]);
      }
      if (e.kind === 'boss') push(s.ctx.audio.play(bossRoar, JUICE_SOUND_SEC.bossRoar, 'sfx'), JUICE_SOUND_SEC.bossRoar);
    }
  };

  /** Starts or stops the Boss_Rumble loop to match the state (juice Req 5.2). */
  const syncRumble = (s: Mounted, state: GameState): void => {
    const on = rumbleAt(state);
    if (on && s.rumbleVoice === null) {
      s.rumbleVoice = s.ctx.audio.play(bossRumble, JUICE_LOOP_SEC, 'sfx', { keep: true });
    } else if (!on && s.rumbleVoice !== null) {
      s.rumbleVoice.stop();
      s.rumbleVoice = null;
    }
  };

  return {
    mount(ctx) {
      if (m !== null) return;
      const atlas = (deps.atlas ?? getDefaultAtlas)();
      const dpr = laneDpr((deps.devicePixelRatio ?? defaultDpr)());

      const canvas = h('canvas', {
        className: 'lane-canvas',
        attrs: { role: 'img', 'aria-label': LANE_COPY.canvasLabel },
      });
      canvas.width = Math.round(LANE_CANVAS_W * dpr);
      canvas.height = Math.round(LANE_CANVAS_H * dpr);
      const hud = createLaneHud();
      const osd = createCctvOsd();
      const el = h('div', { className: 'lane-view' }, canvas, osd.el, hud.el);

      /** Canvas px of a client point; Screen px offsets equal canvas px (laneLayout.ts). */
      const toCanvas = (e: MouseEvent): Point => {
        const rect = canvas.getBoundingClientRect();
        const p = ctx.toScreenPoint(e.clientX, e.clientY);
        const o = ctx.toScreenPoint(rect.left, rect.top);
        return { x: p.x - o.x, y: p.y - o.y };
      };

      const laneLength = DEFAULT_LANE_BALANCE.laneLength;
      const frameCount = (entity: SpriteEntity, animation: AnimationName): number =>
        atlas.frameCount(entity, animation);

      const laneAt = (e: PointerEvent): Point =>
        clientToLane(e.clientX, e.clientY, canvas.getBoundingClientRect(), ctx.toScreenPoint, (m as Mounted).layout);
      const onPointerDown = (e: PointerEvent): void => {
        if (m === null) return;
        m.pointer = toCanvas(e);
        const p = laneAt(e);
        const down = e.button === 0 ? true : (m.lanePointer?.down ?? false);
        m.lanePointer = { x: p.x, y: p.y, down };
        if (e.button !== 0) return; // Req 10.4
        // Only the hammer swings on a press; other weapons fire from lanePointer (Req 5.4).
        if (m.active === 'hammer') ctx.send({ type: 'hammer', x: p.x, y: p.y }); // Req 10.2
      };
      const onPointerMove = (e: PointerEvent): void => {
        if (m === null) return;
        m.pointer = toCanvas(e);
        const p = laneAt(e);
        m.lanePointer = { x: p.x, y: p.y, down: m.lanePointer?.down ?? false };
      };
      const onPointerUp = (e: PointerEvent): void => {
        if (m === null || e.button !== 0 || m.lanePointer === null) return;
        m.lanePointer = { ...m.lanePointer, down: false };
      };
      const onPointerLeave = (): void => {
        if (m === null) return;
        m.pointer = null;
        // Leaving the canvas (onto a Lane_Cover Ad, the shop tray or off the Lane_Dock) releases
        // the button, so the saw and flamethrower stop, and parks the reported pointer off the
        // feed, so no packet is collected under whatever covers the canvas (ad-pressure Req 6.4).
        // `update` sends it once, as one `lanePointer` with `down: false`.
        if (m.lanePointer !== null) m.lanePointer = { x: m.lanePointer.x, y: offFeedLaneY(m.layout), down: false };
      };
      const onKeyDown = (e: KeyboardEvent): void => {
        if (m === null || e.ctrlKey || e.metaKey || e.altKey || inTextField(e.target)) return;
        const slot = slotForKey(e.key);
        if (slot !== null) {
          ctx.send({ type: 'buy', slot }); // Req 4.5
          return;
        }
        const key = e.key.toLowerCase();
        if (key === 'q') ctx.send({ type: 'switchWeapon', direction: 'previous' }); // Req 5.1
        else if (key === 'e') ctx.send({ type: 'switchWeapon', direction: 'next' }); // Req 5.2
      };
      const onWheel = (e: WheelEvent): void => {
        if (m === null || e.deltaY === 0) return;
        ctx.send({ type: 'switchWeapon', direction: e.deltaY < 0 ? 'previous' : 'next' });
      };
      canvas.addEventListener('pointerup', onPointerUp);
      document.addEventListener('keydown', onKeyDown);
      document.addEventListener('wheel', onWheel, { passive: true });
      canvas.addEventListener('pointerdown', onPointerDown);
      canvas.addEventListener('pointermove', onPointerMove);
      canvas.addEventListener('pointerleave', onPointerLeave);

      // Lane_HUD shop tray next to `hud.el`; its slot clicks send `buy` (Req 11.1, 4.6).
      const tray = createShopTray((command) => ctx.send(command));
      tray.mount(el);
      ctx.laneHost.appendChild(el);
      const g = context2d(canvas);
      const tiles = g === null ? [] : createNoiseTiles(CCTV_TUNING.grainTiles, CCTV_TUNING.grainTileSize, NOISE_SEED);
      const overlayCache = g === null ? null : createOverlayCache(LANE_RECT);
      const humVoice = ctx.audio.play(cameraHum, CCTV_SOUND_SEC.cameraHum, 'sfx'); // Req 9.1

      m = {
        ctx,
        el,
        canvas,
        g,
        // Read after appending, so the theme tokens resolve against the document.
        palette: g === null ? null : readLanePalette(canvas),
        hud,
        tray,
        atlas,
        dpr,
        shakeEnabled: ctx.prefs?.screenShake ?? true,
        dieTicks: dieTicksFrom(frameCount),
        frameCount,
        onPointerDown,
        onPointerMove,
        onPointerLeave,
        onPointerUp,
        onKeyDown,
        onWheel,
        lanePointer: null,
        lastSent: null,
        loops: createEconomyLoops(ctx.audio),
        active: 'hammer',
        layout: layoutFor(laneLength),
        laneLength,
        effects: EMPTY_EFFECTS,
        pointer: null,
        voices: [],
        scenery: null,
        osd,
        cctvColors: readCctvColors(canvas),
        tiles,
        overlayCache,
        humVoice,
        cctv: EMPTY_CCTV,
        flashBudget: (deps.flashBudget ?? createFlashBudget)(),
        osdColour: readToken(canvas, CCTV_TOKENS.osd, OSD_FALLBACK),
        packetPos: new Map(),
        rumbleVoice: null,
        noSignalAlpha: CCTV_TUNING.noSignalAlpha,
        combo: null,
      };
    },

    update(state, events) {
      const s = m;
      if (s === null) return;
      const laneLength = laneOf(state)?.balance.laneLength ?? DEFAULT_LANE_BALANCE.laneLength;
      if (laneLength !== s.laneLength) {
        s.laneLength = laneLength;
        s.layout = layoutFor(laneLength);
      }
      s.active = state.economy?.active ?? 'hammer';
      // At most one lanePointer per frame, only on change (Req 2.4). Without economy systems in
      // the Run nothing reads it, so nothing is sent.
      const lp = s.lanePointer;
      const last = s.lastSent;
      if (state.economy !== undefined && lp !== null && (last === null || last.x !== lp.x || last.y !== lp.y || last.down !== lp.down)) {
        s.ctx.send({ type: 'lanePointer', x: lp.x, y: lp.y, down: lp.down });
        s.lastSent = { ...lp };
      }
      const firing = weaponFiring(state.economy);
      s.loops.update({ sawWhine: firing.saw, flameRoar: firing.flame }); // Req 12.2
      const prevPackets = s.packetPos;
      s.effects = applyEvents(s.effects, events, state.tick, s.dieTicks, (id) => prevPackets.get(id) ?? null);
      s.packetPos = new Map((state.economy?.packets ?? []).map((p) => [p.id, { x: p.x, y: PACKET_Y }]));
      syncRumble(s, state);
      s.hud.update(state);
      s.tray.update(state);
      const firstFrame = s.cctv.startTick === null;
      const lane = laneOf(state);
      const liveIds = lane === null ? [] : lane.enemies.map((e) => e.id);
      s.cctv = applyCctvEvents(s.cctv, events, state.tick, integrityView(state).critical, liveIds, s.flashBudget);
      s.combo = latestCombo(s.combo, events, state.tick);
      const comboBonusKb = state.economy?.balance.comboBonusKb ?? DEFAULT_ECONOMY_BALANCE.comboBonusKb;
      s.osd.update(
        { tick: state.tick, combo: comboTextAt(s.combo, state.tick, comboBonusKb) },
        s.cctv,
        { shakeEnabled: s.shakeEnabled },
      );
      playSounds(s, events, state.tick); // Req 14.1, 14.2
      // Camera_Static once for Feed_Startup and once per frame with a modem hit (lane-cctv Req 3.3, 4.1).
      if (firstFrame || events.some((e) => e.type === 'modemHit')) {
        const sec = CCTV_SOUND_SEC.cameraStatic;
        const voice = s.ctx.audio.play(cameraStatic, sec, 'sfx');
        s.voices.push({ voice, untilTick: state.tick + Math.ceil(sec * TICK_RATE) + 1 });
      }
      if (s.g !== null && s.palette !== null) draw(s, s.g, s.palette, state);
    },

    endFrame(final, t) {
      // Feed cut on a loss (juice Req 7.1). No osd.update, so the timestamp stays frozen.
      const s = m;
      if (s === null || final.phase !== 'lost') return;
      if (t === 1) {
        s.osd.cut();
        s.noSignalAlpha =
          s.flashBudget.requestFlash(final.tick) === 'full' ? CCTV_TUNING.noSignalAlpha : CCTV_TUNING.noSignalDimAlpha;
      }
      if (s.g === null) return;
      s.g.setTransform(s.dpr, 0, 0, s.dpr, 0, 0);
      drawNoSignal(s.g, LANE_RECT, s.tiles, t, s.noSignalAlpha);
    },
    unmount() {
      const s = m;
      if (s === null) return;
      m = null;
      s.canvas.removeEventListener('pointerdown', s.onPointerDown);
      s.canvas.removeEventListener('pointermove', s.onPointerMove);
      s.canvas.removeEventListener('pointerleave', s.onPointerLeave);
      s.canvas.removeEventListener('pointerup', s.onPointerUp);
      document.removeEventListener('keydown', s.onKeyDown);
      document.removeEventListener('wheel', s.onWheel);
      s.loops.stopAll();
      s.tray.unmount();
      s.el.remove();
      for (const { voice } of s.voices) voice.stop(); // Req 14.4
      s.voices = [];
      s.humVoice.stop(); // lane-cctv Req 9.2
      s.rumbleVoice?.stop(); // juice Req 5.2
      s.rumbleVoice = null;
      releaseCanvases([...s.tiles, s.overlayCache]); // Req 10.2
      s.osd.el.remove();
      s.scenery = null;
    },
  };
}
