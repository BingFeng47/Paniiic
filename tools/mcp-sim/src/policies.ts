// Bot_Policies for the zombie-sim tool (zombie-sim-mcp Req 2.1-2.5, pacing-and-economy Req 6).
// A bot reads the Run state and returns the InputCommands a real player could send that Tick.
// It never changes the state and never draws from the Run's RNG: its randomness comes from its
// own mulberry32 stream, and everything it remembers lives in plain-data BotMemory.
//
// Bot_Cursor (pacing-and-economy Req 6): the bot has a mouse in Screen px. Each Tick it picks
// an Intent as before, turns it into a Screen point, moves the cursor toward it in a straight
// line by at most `cursorPxPerSecond / TICK_RATE` px, and sends the Intent's commands only on a
// Tick the cursor is on the point. While the cursor is over the lane canvas it sends
// `lanePointer` every Tick, so packets are collected only along the cursor's path. Keyboard
// actions (buy, switchWeapon) need no cursor.
import { countdownReadyTick, rowFor } from '../../../src/game/ads/closePatterns';
import type { Ad, AdControl } from '../../../src/game/ads/adTypes';
import { DEFAULT_AD_BALANCE } from '../../../src/game/balance/ads';
import { DEFAULT_LANE_BALANCE } from '../../../src/game/balance/lane';
import { slotStatus } from '../../../src/game/economy/shop';
import type { ShopSlot, WeaponId } from '../../../src/game/economy/economyTypes';
import { PACKET_Y } from '../../../src/game/economy/wallet';
import type { Enemy } from '../../../src/game/laneTypes';
import { nextRandom } from '../../../src/game/rng';
import { TICK_RATE, type GameState, type InputCommand } from '../../../src/game/types';
import { adContains, adControlCentre } from '../../../src/render/browser/adGeometry';
import {
  createLaneLayout,
  LANE_CANVAS_H,
  LANE_CANVAS_W,
  LANE_DOCK_RECT,
  laneToScreen,
  offFeedLaneY,
  screenToLane,
  type LaneLayout,
} from '../../../src/render/laneLayout';

export type PolicyName = 'idle' | 'casual' | 'competent' | 'perfect';
export const POLICY_NAMES: readonly PolicyName[] = ['idle', 'casual', 'competent', 'perfect'];

export interface BotParams {
  /** Ticks something must exist before the bot reacts to it. */
  readonly reactionDelay: number;
  /** At most one action per this many Ticks. */
  readonly actionInterval: number;
  /** Chance per Ad that the bot first clicks a wrong control. */
  readonly mistakeRate: number;
  /** Chance per fake button that the bot clicks it. */
  readonly fakeRate: number;
  /** Bot_Cursor speed in Screen px per second (pacing-and-economy Req 6.2). */
  readonly cursorPxPerSecond: number;
}

/** Bot skill table (zombie-sim-mcp Req 2.3, 2.4; pacing-and-economy Req 6.2). */
export const BOT_TABLE: Readonly<Record<Exclude<PolicyName, 'idle'>, BotParams>> = {
  casual: { reactionDelay: 30, actionInterval: 18, mistakeRate: 0.2, fakeRate: 0.15, cursorPxPerSecond: 1400 },
  competent: { reactionDelay: 15, actionInterval: 10, mistakeRate: 0.05, fakeRate: 0.03, cursorPxPerSecond: 2200 },
  perfect: { reactionDelay: 0, actionInterval: 1, mistakeRate: 0, fakeRate: 0, cursorPxPerSecond: 1_000_000 },
};

export interface CursorPoint {
  x: number;
  y: number;
}

/** Plain data the bot keeps between Ticks of one Run. JSON-safe. */
export interface BotMemory {
  /** Tick of the last action, or null before the first. */
  lastActionTick: number | null;
  /** Key ('connected', 'ad:<id>', 'mob:<id>', 'pk:<id>') → first Tick it was seen. */
  seen: Record<string, number>;
  /**
   * Ad id → planned mistake: a bot-RNG draw in [0, 1) that picks the wrong control from the
   * Ad's current row, or null when the bot clicks correctly. Rolled once per Ad.
   */
  adMistake: Record<string, number | null>;
  /** Fake button id → whether the bot decided to click it. */
  fakeClick: Record<string, boolean>;
  /** Runaway ✕ hover state: the interrupter being hovered and its jumps when last seen. */
  runaway: { adId: number; jumps: number } | null;
  /** Bot_Cursor in Screen px (Req 6.1). Starts at the centre of the Lane_Dock. */
  cursor: CursorPoint;
  /** Screen point the cursor is heading for, or null when it has nowhere to go. */
  goal: CursorPoint | null;
  /** Whether the last Tick's cursor was over the lane canvas (not off the dock, not on an Ad). */
  onLane: boolean;
}

/** Centre of the Lane_Dock in Screen px, where every Bot_Cursor starts (Req 6.1). */
export const CURSOR_START: Readonly<CursorPoint> = Object.freeze({
  x: LANE_DOCK_RECT.x + LANE_DOCK_RECT.w / 2,
  y: LANE_DOCK_RECT.y + LANE_DOCK_RECT.h / 2,
});

export function createBotMemory(): BotMemory {
  return {
    lastActionTick: null,
    seen: {},
    adMistake: {},
    fakeClick: {},
    runaway: null,
    cursor: { x: CURSOR_START.x, y: CURSOR_START.y },
    goal: null,
    onLane: false,
  };
}

/** The bot's own mulberry32 stream, seeded from `seed ^ 0x9e3779b9` (Req 2.5). */
export function createBotRng(seed: number): () => number {
  let s = (seed ^ 0x9e3779b9) >>> 0;
  return () => {
    const r = nextRandom(s);
    s = r.next;
    return r.value;
  };
}

export interface Policy {
  decide(state: GameState, memory: BotMemory, rng: () => number): readonly InputCommand[];
}

/**
 * Moves `from` toward `to` by at most `maxStep` px in a straight line. Lands exactly on `to` when
 * it is within reach, so "arrived" is an exact comparison (Req 6.3).
 */
export function moveCursor(from: CursorPoint, to: CursorPoint, maxStep: number): CursorPoint {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const d = Math.hypot(dx, dy);
  if (d <= maxStep) return { x: to.x, y: to.y };
  const k = maxStep / d;
  return { x: from.x + dx * k, y: from.y + dy * k };
}

const BUY_ORDER: readonly ShopSlot[] = [2, 3, 1, 5, 4];
const WEAPON_CYCLE: readonly WeaponId[] = ['hammer', 'saw', 'flamethrower'];

/** What the bot wants to do this Tick. */
interface Intent {
  /** Screen point to move to; null for keyboard actions, which leave the cursor where it heads. */
  readonly point: CursorPoint | null;
  /** Sent once the cursor is on `point` (at once when `point` is null) and the interval allows. */
  readonly commands: readonly InputCommand[];
  /** Hold the primary button while the cursor is on `point` (saw, flamethrower). */
  readonly hold?: boolean;
  /** Memory updates that happen only when the commands are actually sent. */
  readonly commit?: () => void;
}

/** Refreshes first-seen Ticks for what exists now and drops what is gone. */
function updateSeen(state: GameState, memory: BotMemory): void {
  const keys: string[] = [];
  if (state.phase !== 'dialing') keys.push('connected');
  for (const ad of state.ads?.ads ?? []) keys.push(`ad:${ad.id}`);
  for (const en of state.lane?.enemies ?? []) keys.push(`mob:${en.id}`);
  for (const pk of state.economy?.packets ?? []) keys.push(`pk:${pk.id}`);
  const next: Record<string, number> = {};
  for (const k of keys) next[k] = memory.seen[k] ?? state.tick;
  memory.seen = next;
  const adIds = new Set((state.ads?.ads ?? []).map((a) => String(a.id)));
  for (const id of Object.keys(memory.adMistake)) if (!adIds.has(id)) delete memory.adMistake[id];
  for (const id of Object.keys(memory.fakeClick)) if (!adIds.has(id)) delete memory.fakeClick[id];
  if (memory.runaway !== null && !adIds.has(String(memory.runaway.adId))) memory.runaway = null;
}

/** The Lane_View's layout for this Run's Lane_Length (Req 6.5). */
function layoutOf(state: GameState): LaneLayout {
  const laneLength = state.lane?.balance.laneLength ?? DEFAULT_LANE_BALANCE.laneLength;
  return createLaneLayout(LANE_CANVAS_W, LANE_CANVAS_H, laneLength);
}

/** The top Ad under a Screen point (later ids draw on top), only among ids above `aboveId`. */
function adAt(state: GameState, p: CursorPoint, aboveId = -Infinity): Ad | null {
  const ads = state.ads?.ads ?? [];
  for (let i = ads.length - 1; i >= 0; i--) {
    const ad = ads[i]!;
    if (ad.id <= aboveId) break;
    if (adContains(ad, p)) return ad;
  }
  return null;
}

/** Over the lane canvas: inside the Lane_Dock and not on an Ad drawn over it. */
function overLane(state: GameState, p: CursorPoint): boolean {
  const r = LANE_DOCK_RECT;
  const inDock = p.x >= r.x && p.x < r.x + r.w && p.y >= r.y && p.y < r.y + r.h;
  return inDock && adAt(state, p) === null;
}

function makeBot(p: BotParams): Policy {
  const maxStep = p.cursorPxPerSecond / TICK_RATE;
  return {
    decide(state, memory, rng) {
      updateSeen(state, memory);
      if (state.phase === 'won' || state.phase === 'lost') return [];
      const seen = (key: string): boolean => {
        const t = memory.seen[key];
        return t !== undefined && state.tick - t >= p.reactionDelay;
      };
      const layout = layoutOf(state);
      const ctx: Ctx = { state, memory, rng, p, seen, layout };
      const intent =
        startDownload(ctx) ?? interrupter(ctx) ?? attack(ctx) ?? collect(ctx) ?? clutter(ctx) ?? shop(ctx);

      if (intent !== null && intent.point !== null) memory.goal = { x: intent.point.x, y: intent.point.y };
      if (memory.goal !== null) memory.cursor = moveCursor(memory.cursor, memory.goal, maxStep);
      const cursor = memory.cursor;
      const arrived = intent !== null
        && (intent.point === null || (cursor.x === intent.point.x && cursor.y === intent.point.y));

      const out: InputCommand[] = [];
      // The lane sees the cursor every Tick it is over the canvas (Req 6.4). Leaving the canvas
      // parks the pointer off the feed with the button up, like the Lane_View's pointerleave.
      if (overLane(state, cursor)) {
        const lp = screenToLane(cursor, layout);
        const down = arrived && intent?.hold === true && intent.point !== null;
        out.push({ type: 'lanePointer', x: lp.x, y: lp.y, down });
        memory.onLane = true;
      } else if (memory.onLane) {
        out.push({ type: 'lanePointer', x: screenToLane(cursor, layout).x, y: offFeedLaneY(layout), down: false });
        memory.onLane = false;
      }

      const intervalOk = memory.lastActionTick === null || state.tick - memory.lastActionTick >= p.actionInterval;
      if (intent !== null && arrived && intervalOk && intent.commands.length > 0) {
        out.push(...intent.commands);
        intent.commit?.();
        memory.lastActionTick = state.tick;
      }
      return out;
    },
  };
}

interface Ctx {
  readonly state: GameState;
  readonly memory: BotMemory;
  readonly rng: () => number;
  readonly p: BotParams;
  readonly seen: (key: string) => boolean;
  readonly layout: LaneLayout;
}

function startDownload({ state, seen }: Ctx): Intent | null {
  if (state.phase !== 'connected' || !seen('connected')) return null;
  const link = (state.ads?.balance ?? DEFAULT_AD_BALANCE).realLink;
  return { point: { x: link.x + link.w / 2, y: link.y + link.h / 2 }, commands: [{ type: 'startDownload' }] };
}

/**
 * A click on one control of an Ad. When a later Ad covers that control the click would land on
 * the cover, so the bot deals with the cover first (or waits if it can't close it yet).
 */
function clickAd(ctx: Ctx, ad: Ad, control: AdControl, commit?: () => void): Intent | null {
  const point = adControlCentre(ad, control);
  const cover = adAt(ctx.state, point, ad.id);
  if (cover !== null) return cover.kind === 'fake' || !ctx.seen(`ad:${cover.id}`) ? null : closeIntent(ctx, cover);
  return { point, commands: [{ type: 'adClick', adId: ad.id, control }], commit };
}

/** The click that answers an Ad, with a mistake roll made once per Ad; null when waiting. */
function closeIntent(ctx: Ctx, ad: Ad): Intent | null {
  const { state, memory, rng, p } = ctx;
  if (ad.pattern === 'runaway' && state.ads && ad.jumps < state.ads.balance.runawayJumps) {
    // Hover the ✕ until it stops jumping: the hover fires when the cursor reaches it.
    return {
      point: adControlCentre(ad, 'close'),
      commands: [{ type: 'adHover', adId: ad.id }],
      commit: () => { memory.runaway = { adId: ad.id, jumps: ad.jumps }; },
    };
  }
  const key = String(ad.id);
  const row = rowFor(ad);
  if (memory.adMistake[key] === undefined) {
    memory.adMistake[key] = p.mistakeRate > 0 && rng() < p.mistakeRate ? rng() : null;
  }
  const pick = memory.adMistake[key];
  if (pick !== null && pick !== undefined && row.wrong.length > 0) {
    const control = row.wrong[Math.floor(pick * row.wrong.length)]!;
    return clickAd(ctx, ad, control, () => { memory.adMistake[key] = null; });
  }
  let control: AdControl | null = row.correct;
  if (ad.pattern === 'confirm' && ad.stage === 'main') control = 'close';
  if (control === null) return null;
  if (ad.pattern === 'countdown' && state.ads && state.tick < countdownReadyTick(ad, state.ads.balance)) return null;
  return clickAd(ctx, ad, control);
}

function interrupter(ctx: Ctx): Intent | null {
  const { state, seen } = ctx;
  for (const ad of state.ads?.ads ?? []) {
    if (ad.kind !== 'interrupter' || !seen(`ad:${ad.id}`)) continue;
    const intent = closeIntent(ctx, ad);
    if (intent !== null) return intent;
  }
  return null;
}

function bestWeapon(state: GameState, target: Enemy): WeaponId {
  const e = state.economy!;
  const owns = (w: WeaponId): boolean => w === 'hammer' || e.owned.includes(w);
  const enemies = state.lane?.enemies ?? [];
  const flameReady = owns('flamethrower') && !e.flameLatched && e.fuel > 0;
  if ((target.kind === 'tank' || target.kind === 'boss') && owns('saw')) return 'saw';
  if (flameReady && enemies.length >= 3) return 'flamethrower';
  if (owns('saw')) return 'saw';
  return 'hammer';
}

function attack(ctx: Ctx): Intent | null {
  const { state, seen, layout } = ctx;
  const lane = state.lane;
  if (!lane) return null;
  let target: Enemy | null = null;
  for (const en of lane.enemies) {
    if (!seen(`mob:${en.id}`)) continue;
    if (target === null || en.x < target.x) target = en;
  }
  if (target === null) return null;
  const stats = lane.balance.enemies[target.kind];
  const cy = stats.height / 2;
  const e = state.economy;
  const want: WeaponId = e ? bestWeapon(state, target) : 'hammer';
  // Saw and hammer aim at the Hit_Box centre; the flame cone points +x, so stand just left.
  const laneX = want === 'flamethrower' ? target.x - stats.width / 2 - lane.balance.hitPadding - 4 : target.x;
  const point = laneToScreen({ x: laneX, y: cy }, layout);
  // A Lane_Cover Ad over the aim point takes the click, so close it first.
  const cover = adAt(state, point);
  if (cover !== null) return seen(`ad:${cover.id}`) ? closeIntent(ctx, cover) : null;

  if (e && want !== e.active) {
    const owned = WEAPON_CYCLE.filter((w) => w === 'hammer' || e.owned.includes(w));
    const from = owned.indexOf(e.active);
    const to = owned.indexOf(want);
    const forward = (to - from + owned.length) % owned.length;
    // Q / E: keyboard, so the switch doesn't wait for the cursor, which keeps heading for the Mob.
    return { point: null, commands: [{ type: 'switchWeapon', direction: forward <= owned.length - forward ? 'next' : 'previous' }] };
  }
  if (want === 'hammer') {
    // Wait over the Mob while the hammer cools down; the swing lands where the cursor is.
    const ready = state.tick >= lane.hammerReadyTick;
    const at = screenToLane(point, layout);
    return { point, commands: ready ? [{ type: 'hammer', x: at.x, y: at.y }] : [] };
  }
  return { point, commands: [], hold: true };
}

/** Heads for the nearest seen packet; the per-Tick `lanePointer` picks it up on the way. */
function collect({ state, seen, memory, layout }: Ctx): Intent | null {
  const e = state.economy;
  if (!e) return null;
  let best: CursorPoint | null = null;
  let bestD = Infinity;
  for (const pk of e.packets) {
    if (!seen(`pk:${pk.id}`)) continue;
    const at = laneToScreen({ x: pk.x, y: PACKET_Y }, layout);
    if (adAt(state, at) !== null) continue; // under a Lane_Cover Ad: can't be hovered
    const d = Math.hypot(at.x - memory.cursor.x, at.y - memory.cursor.y);
    if (d < bestD) {
      best = at;
      bestD = d;
    }
  }
  return best === null ? null : { point: best, commands: [] };
}

function clutter(ctx: Ctx): Intent | null {
  const { state, memory, rng, p, seen } = ctx;
  for (const ad of state.ads?.ads ?? []) {
    if (!seen(`ad:${ad.id}`)) continue;
    if (ad.kind === 'fake') {
      const key = String(ad.id);
      if (memory.fakeClick[key] === undefined) memory.fakeClick[key] = p.fakeRate > 0 && rng() < p.fakeRate;
      if (memory.fakeClick[key]) {
        const intent = clickAd(ctx, ad, 'fakeButton', () => { memory.fakeClick[key] = false; });
        if (intent !== null) return intent;
      }
      continue;
    }
    if (ad.kind !== 'clutter') continue;
    const intent = closeIntent(ctx, ad);
    if (intent !== null) return intent;
  }
  return null;
}

/** Buys with the 1–5 hotkeys, so the cursor stays where it is. */
function shop({ state }: Ctx): Intent | null {
  const e = state.economy;
  if (!e) return null;
  for (const slot of BUY_ORDER) {
    const status = slotStatus(slot, e);
    if (status === 'owned' || status === 'held') continue;
    // The blocker only helps while clutter is open.
    if (slot === 4 && !(state.ads?.ads ?? []).some((a) => a.kind === 'clutter')) return null;
    return status === 'affordable' ? { point: null, commands: [{ type: 'buy', slot }] } : null;
  }
  return null;
}

const idle: Policy = { decide: () => [] };

export const POLICIES: Readonly<Record<PolicyName, Policy>> = {
  idle,
  casual: makeBot(BOT_TABLE.casual),
  competent: makeBot(BOT_TABLE.competent),
  perfect: makeBot(BOT_TABLE.perfect),
};

export function getPolicy(name: PolicyName): Policy {
  return POLICIES[name];
}
