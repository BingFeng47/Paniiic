import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  INITIAL_TITLE,
  THEME_FADE_MS,
  THEME_FADE_TICKS,
  titleStep,
  type TitleAction,
  type TitleEffect,
  type TitleModel,
} from '../../../src/scenes/title/titleModel';

const PLAY: TitleAction = { type: 'play' };
const OPEN: TitleAction = { type: 'openOptions' };
const CLOSE: TitleAction = { type: 'closeOptions' };
const OPEN_HOF: TitleAction = { type: 'openHallOfFame' };
const CLOSE_HOF: TitleAction = { type: 'closeHallOfFame' };
const ticks = (n: number): TitleAction => ({ type: 'ticks', n });

const model = (mode: TitleModel['mode'], fadeTicksLeft = 0): TitleModel =>
  Object.freeze({ mode, fadeTicksLeft });

/** Asserts the action left the model as the same object and raised no effect. */
function expectUnchanged(start: TitleModel, action: TitleAction): void {
  const result = titleStep(start, action);
  expect(result.model).toBe(start);
  expect(result.effects).toEqual([]);
}

describe('titleModel examples (design mode/action table)', () => {
  it('measures the 600 ms fade as 36 ticks and starts in menu', () => {
    expect(THEME_FADE_MS).toBe(600);
    expect(THEME_FADE_TICKS).toBe(36);
    expect(INITIAL_TITLE).toEqual({ mode: 'menu', fadeTicksLeft: 0 });
    expect(Object.isFrozen(INITIAL_TITLE)).toBe(true);
  });

  it('menu + play → fading with 36 ticks left and startFade', () => {
    const r = titleStep(INITIAL_TITLE, PLAY);
    expect(r.model).toEqual({ mode: 'fading', fadeTicksLeft: THEME_FADE_TICKS });
    expect(r.effects).toEqual(['startFade']);
    expect(Object.isFrozen(r.model)).toBe(true);
    expect(Object.isFrozen(r.effects)).toBe(true);
  });

  it('menu + openOptions → options with openOptions', () => {
    const r = titleStep(INITIAL_TITLE, OPEN);
    expect(r.model).toEqual({ mode: 'options', fadeTicksLeft: 0 });
    expect(r.effects).toEqual(['openOptions']);
  });

  it('options + closeOptions → menu with closeOptions', () => {
    const r = titleStep(model('options'), CLOSE);
    expect(r.model).toEqual({ mode: 'menu', fadeTicksLeft: 0 });
    expect(r.effects).toEqual(['closeOptions']);
  });

  it('options + play changes nothing', () => {
    expectUnchanged(model('options'), PLAY);
  });

  it('fading + ticks counts down, then finishes at 0', () => {
    const fading = titleStep(INITIAL_TITLE, PLAY).model;
    const partial = titleStep(fading, ticks(10));
    expect(partial.model).toEqual({ mode: 'fading', fadeTicksLeft: 26 });
    expect(partial.effects).toEqual([]);
    const done = titleStep(partial.model, ticks(26));
    expect(done.model).toEqual({ mode: 'done', fadeTicksLeft: 0 });
    expect(done.effects).toEqual(['finish']);
  });

  it('fading + ticks past the end finishes once with no ticks left', () => {
    const r = titleStep(model('fading', 3), ticks(20));
    expect(r.model).toEqual({ mode: 'done', fadeTicksLeft: 0 });
    expect(r.effects).toEqual(['finish']);
  });

  it('menu + openHallOfFame → hallOfFame with openHallOfFame (leaderboard Req 7.2)', () => {
    const r = titleStep(INITIAL_TITLE, OPEN_HOF);
    expect(r.model).toEqual({ mode: 'hallOfFame', fadeTicksLeft: 0 });
    expect(r.effects).toEqual(['openHallOfFame']);
    expect(Object.isFrozen(r.model)).toBe(true);
  });

  it('hallOfFame + closeHallOfFame → menu with closeHallOfFame (leaderboard Req 7.2)', () => {
    const r = titleStep(model('hallOfFame'), CLOSE_HOF);
    expect(r.model).toEqual({ mode: 'menu', fadeTicksLeft: 0 });
    expect(r.effects).toEqual(['closeHallOfFame']);
    // Play works again after closing.
    expect(titleStep(r.model, PLAY).effects).toEqual(['startFade']);
  });

  it('hallOfFame ignores play, Options actions, a second open and ticks (leaderboard Req 7.5)', () => {
    const open = model('hallOfFame');
    for (const action of [PLAY, OPEN, CLOSE, OPEN_HOF, ticks(1), ticks(36), ticks(1000)]) {
      expectUnchanged(open, action);
    }
  });

  it('options ignores the Hall of Fame actions, and closeHallOfFame does nothing in menu', () => {
    expectUnchanged(model('options'), OPEN_HOF);
    expectUnchanged(model('options'), CLOSE_HOF);
    expectUnchanged(INITIAL_TITLE, CLOSE_HOF);
  });

  it('fading and done ignore play, openOptions and closeOptions', () => {
    for (const start of [model('fading', 12), model('done')]) {
      for (const action of [PLAY, OPEN, CLOSE, OPEN_HOF, CLOSE_HOF]) expectUnchanged(start, action);
    }
  });

  it('ticks with n = 0, NaN, negative or infinite change nothing while fading', () => {
    const fading = model('fading', 20);
    for (const n of [0, NaN, -1, -0, Infinity, -Infinity]) expectUnchanged(fading, ticks(n));
  });

  it('ticks outside fading change nothing', () => {
    for (const start of [INITIAL_TITLE, model('options'), model('done')]) {
      for (const n of [0, NaN, 1, 36, 100]) expectUnchanged(start, ticks(n));
    }
  });

  it('closeOptions in menu and openOptions in options change nothing', () => {
    expectUnchanged(INITIAL_TITLE, CLOSE);
    expectUnchanged(model('options'), OPEN);
  });
});

const arbAction: fc.Arbitrary<TitleAction> = fc.oneof(
  fc.constant(PLAY),
  fc.constant(OPEN),
  fc.constant(CLOSE),
  fc.constant(OPEN_HOF),
  fc.constant(CLOSE_HOF),
  fc.integer({ min: 0, max: 20 }).map(ticks),
);

describe('titleModel properties', () => {
  // Property: Req 1.6, 2.4, 2.5, 3.5 one Play starts one 600 ms fade and one finish
  // Feature: title-and-endings, Property 2: The title screen starts the game exactly once, 600 ms after Play
  it('starts the game exactly once, 600 ms after Play', () => {
    fc.assert(
      fc.property(fc.array(arbAction, { maxLength: 80 }), (actions) => {
        let current = INITIAL_TITLE;
        let startFades = 0;
        let finishes = 0;
        let ticksSinceFade = 0;
        for (const action of actions) {
          const { model: nextModel, effects } = titleStep(current, action);
          const count = (e: TitleEffect): number => effects.filter((x) => x === e).length;

          // startFade only for a play received in menu, and at most once.
          const expectStart = current.mode === 'menu' && action.type === 'play';
          expect(count('startFade')).toBe(expectStart ? 1 : 0);
          startFades += count('startFade');
          expect(startFades).toBeLessThanOrEqual(1);

          // A play received while Options is open changes nothing (Req 2.5).
          if (current.mode === 'options' && action.type === 'play') {
            expect(nextModel).toBe(current);
            expect(effects).toEqual([]);
          }
          // While the Hall_of_Fame is open only its close does anything (leaderboard Req 7.5).
          if (current.mode === 'hallOfFame' && action.type !== 'closeHallOfFame') {
            expect(nextModel).toBe(current);
            expect(effects).toEqual([]);
          }

          // After startFade only ticks can change the model (Req 2.4).
          if (startFades === 1 && !expectStart && action.type !== 'ticks') {
            expect(nextModel).toBe(current);
            expect(effects).toEqual([]);
          }

          // finish exactly when the ticks summed since startFade first reach 36 (Req 3.5).
          const before = ticksSinceFade;
          if (startFades === 1 && !expectStart && action.type === 'ticks') {
            ticksSinceFade += action.n;
          }
          const expectFinish =
            startFades === 1 && before < THEME_FADE_TICKS && ticksSinceFade >= THEME_FADE_TICKS;
          expect(count('finish')).toBe(expectFinish ? 1 : 0);
          finishes += count('finish');
          expect(finishes).toBeLessThanOrEqual(1);

          // Model invariants: ticks left only while fading; done once finished.
          expect(nextModel.fadeTicksLeft > 0).toBe(nextModel.mode === 'fading');
          expect(nextModel.mode === 'done').toBe(finishes === 1);
          if (nextModel.mode === 'fading') {
            expect(nextModel.fadeTicksLeft).toBe(THEME_FADE_TICKS - ticksSinceFade);
          }
          current = nextModel;
        }
      }),
      { numRuns: 200 },
    );
  });
});
