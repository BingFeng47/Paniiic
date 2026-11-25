/**
 * Pure Title_Scene input model (title-and-endings design, "src/scenes/title/titleModel.ts").
 *
 * The Title_Scene routes every Play, Options and tick through `titleStep`, so the rules "one
 * Play", "no Play while Options or the Hall_of_Fame is open" and "finish exactly 600 ms after Play" live here where
 * they can be property-tested without a DOM (Req 1.6, 2.4, 2.5, 3.5).
 *
 * Every model this module returns is frozen. An action that changes nothing returns the input
 * model itself with no effects. Invariants: `fadeTicksLeft > 0` only in `fading`; `done` is final.
 * `finish` is the only effect that leads to `signal('play')` (Req 1.6).
 */
import { TICK_MS } from '../../core/fixedLoop';

/** Length of the Theme_Song fade after Play (Req 3.5, requirements decision 7). */
export const THEME_FADE_MS = 600;

/** The theme fade measured in fixed-loop ticks: 600 ms is 36 ticks. */
export const THEME_FADE_TICKS: number = Math.round(THEME_FADE_MS / TICK_MS);

export type TitleMode = 'menu' | 'options' | 'hallOfFame' | 'fading' | 'done';

export interface TitleModel {
  readonly mode: TitleMode;
  /** Ticks left until `finish`; above 0 only in `fading`. */
  readonly fadeTicksLeft: number;
}

export const INITIAL_TITLE: TitleModel = Object.freeze({ mode: 'menu', fadeTicksLeft: 0 });

export type TitleAction =
  | { readonly type: 'play' }
  | { readonly type: 'openOptions' }
  | { readonly type: 'closeOptions' }
  | { readonly type: 'openHallOfFame' }
  | { readonly type: 'closeHallOfFame' }
  | { readonly type: 'ticks'; readonly n: number };

export type TitleEffect =
  | 'openOptions'
  | 'closeOptions'
  | 'openHallOfFame'
  | 'closeHallOfFame'
  | 'startFade'
  | 'finish';

export interface TitleStepResult {
  readonly model: TitleModel;
  readonly effects: readonly TitleEffect[];
}

const NO_EFFECTS: readonly TitleEffect[] = Object.freeze([]);

function unchanged(model: TitleModel): TitleStepResult {
  return Object.freeze({ model, effects: NO_EFFECTS });
}

function next(mode: TitleMode, fadeTicksLeft: number, effect: TitleEffect): TitleStepResult {
  return Object.freeze({
    model: Object.freeze({ mode, fadeTicksLeft }),
    effects: Object.freeze([effect]),
  });
}

/**
 * Applies one action to the model, following the design's mode/action table:
 *
 * - menu + play → `fading` with `THEME_FADE_TICKS` left, effect `startFade` (Req 3.5)
 * - menu + openOptions → `options`, effect `openOptions` (Req 4.1)
 * - options + closeOptions → `menu`, effect `closeOptions` (Req 4.6)
 * - options + play → unchanged (Req 2.5)
 * - menu + openHallOfFame → `hallOfFame`, effect `openHallOfFame` (leaderboard Req 7.2)
 * - hallOfFame + closeHallOfFame → `menu`, effect `closeHallOfFame` (leaderboard Req 7.2)
 * - hallOfFame + play / openOptions → unchanged (leaderboard Req 7.5)
 * - fading + ticks n > 0 → count down; at ≤ 0 → `done`, effect `finish`
 * - fading or done + any non-tick action → unchanged (Req 2.4)
 * - anything else (ticks in menu/options/hallOfFame/done, n ≤ 0 or non-finite) → unchanged
 */
export function titleStep(model: TitleModel, action: TitleAction): TitleStepResult {
  switch (model.mode) {
    case 'menu':
      if (action.type === 'play') return next('fading', THEME_FADE_TICKS, 'startFade');
      if (action.type === 'openOptions') return next('options', 0, 'openOptions');
      if (action.type === 'openHallOfFame') return next('hallOfFame', 0, 'openHallOfFame');
      return unchanged(model);
    case 'options':
      if (action.type === 'closeOptions') return next('menu', 0, 'closeOptions');
      return unchanged(model);
    case 'hallOfFame':
      if (action.type === 'closeHallOfFame') return next('menu', 0, 'closeHallOfFame');
      return unchanged(model);
    case 'fading': {
      if (action.type !== 'ticks') return unchanged(model);
      const n = action.n;
      if (!(n > 0) || !Number.isFinite(n)) return unchanged(model);
      const left = model.fadeTicksLeft - n;
      if (left <= 0) return next('done', 0, 'finish');
      return Object.freeze({
        model: Object.freeze({ mode: 'fading', fadeTicksLeft: left }),
        effects: NO_EFFECTS,
      });
    }
    case 'done':
      return unchanged(model);
  }
}
