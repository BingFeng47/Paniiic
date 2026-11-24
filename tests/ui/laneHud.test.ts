// Lane HUD tests (connection-lane design, "src/ui/laneHud.ts"; Req 12.1–12.4).
// Property 15 plus DOM examples. The copy-table scan for LANE_COPY lives in tests/copy.test.ts.
import fc from 'fast-check';
import { describe, expect, it, vi } from 'vitest';
import { createRun } from '../../src/game/state';
import type { GameState } from '../../src/game/types';
import { LANE_COPY } from '../../src/ui/laneCopy';
import { createLaneHud, integrityView, type LaneHud } from '../../src/ui/laneHud';

function withIntegrity(integrity: number): GameState {
  return { ...createRun({ seed: 1 }), integrity };
}

interface HudCase {
  readonly max: number;
  readonly critical: number;
  readonly integrity: number;
}

/** A state from createRun with the given balance and integrity. */
function stateFor({ max, critical, integrity }: HudCase): GameState {
  const run = createRun({ seed: 1, balance: { maxIntegrity: max, criticalIntegrity: critical } });
  return { ...run, integrity };
}

/**
 * Integrity in [0, max] as quarter steps (exact in binary, like integer damage on a fractional
 * run), with extra weight on both ends.
 */
const arbIntegrity = (max: number): fc.Arbitrary<number> =>
  fc.oneof(
    { weight: 1, arbitrary: fc.constant(0) },
    { weight: 1, arbitrary: fc.constant(max) },
    { weight: 6, arbitrary: fc.integer({ min: 0, max: max * 4 }).map((k) => k / 4) },
  );

/** Any valid balance (max > 0, 0 ≤ critical ≤ max) with a pair of matching integrity values. */
const arbBalance = fc.integer({ min: 1, max: 1000 }).chain((max) =>
  fc.record({
    max: fc.constant(max),
    critical: fc.oneof(
      fc.constant(0),
      fc.constant(max),
      fc.double({ min: 0, max, noNaN: true, noDefaultInfinity: true }),
    ),
  }),
);

const arbCase: fc.Arbitrary<HudCase> = arbBalance.chain(({ max, critical }) =>
  arbIntegrity(max).map((integrity) => ({ max, critical, integrity })),
);

/** A balance plus a sequence of integrity values, with repeats so unchanged updates happen. */
const arbSequence = arbBalance.chain(({ max, critical }) =>
  fc
    .array(arbIntegrity(max), { minLength: 1, maxLength: 30 })
    .chain((values) =>
      fc
        .array(fc.nat({ max: values.length - 1 }), { minLength: 1, maxLength: 40 })
        .map((picks) => picks.map((i) => values[i]!)),
    )
    .map((integrities) => ({ max, critical, integrities })),
);

/** Same formula as laneHud.ts: integrity * 100 / max is exact for these inputs. */
const expectedPercent = (integrity: number, max: number): number => Math.ceil((integrity * 100) / max);

interface WriteCounter {
  count: number;
}

/** Counts writes to `prop` on `target` by shadowing the inherited accessor with an own one. */
function countWrites(target: object, prop: string): WriteCounter {
  let proto: object | null = target;
  let desc: PropertyDescriptor | undefined;
  while (proto && !desc) {
    desc = Object.getOwnPropertyDescriptor(proto, prop);
    proto = Object.getPrototypeOf(proto) as object | null;
  }
  if (!desc?.set || !desc.get) throw new Error(`no accessor for ${prop}`);
  const { get, set } = desc;
  const counter: WriteCounter = { count: 0 };
  Object.defineProperty(target, prop, {
    configurable: true,
    get() {
      return get.call(this);
    },
    set(value: unknown) {
      counter.count++;
      set.call(this, value);
    },
  });
  return counter;
}

function parts(hud: LaneHud) {
  return {
    fill: hud.el.querySelector<HTMLElement>('.lane-hud-fill')!,
    value: hud.el.querySelector<HTMLElement>('.lane-hud-value')!,
    note: hud.el.querySelector<HTMLElement>('.lane-hud-note')!,
  };
}

describe('integrityView', () => {
  it('rounds the percentage up so 0% shows only at 0', () => {
    expect(integrityView(withIntegrity(7))).toEqual({ fraction: 0.07, percentText: '7%', critical: true });
    expect(integrityView(withIntegrity(0.4)).percentText).toBe('1%');
    expect(integrityView(withIntegrity(0)).percentText).toBe('0%');
  });

  it('is critical at the threshold and not above it', () => {
    expect(integrityView(withIntegrity(20)).critical).toBe(true);
    expect(integrityView(withIntegrity(21)).critical).toBe(false);
  });

  it('works on a custom balance', () => {
    const state = stateFor({ max: 40, critical: 10, integrity: 10 });
    expect(integrityView(state)).toEqual({ fraction: 0.25, percentText: '25%', critical: true });
    expect(integrityView({ ...state, integrity: 39.75 }).percentText).toBe('100%');
  });

  // Property: Req 12.1, 12.2, 12.3 the HUD view matches integrity / max, a rounded-up whole
  // percentage and the critical threshold
  // Feature: connection-lane, Property 15: The HUD shows integrity as a fraction, a percentage and a critical flag
  it('Property 15: fraction, percentage and critical flag follow the balance', () => {
    fc.assert(
      fc.property(arbCase, (c) => {
        const view = integrityView(stateFor(c));
        const percent = expectedPercent(c.integrity, c.max);

        expect(view.fraction).toBeGreaterThanOrEqual(0);
        expect(view.fraction).toBeLessThanOrEqual(1);
        expect(view.fraction).toBe(c.integrity / c.max);

        expect(view.percentText).toBe(`${percent}${LANE_COPY.percentSuffix}`);
        expect(view.percentText).toMatch(/^\d+%$/);
        expect(percent).toBeGreaterThanOrEqual(0);
        expect(percent).toBeLessThanOrEqual(100);
        // Rounded up: the shown percentage is the first whole number at or above the real one.
        expect(percent).toBeGreaterThanOrEqual(view.fraction * 100 - 1e-9);
        expect(percent - 1).toBeLessThan(view.fraction * 100);
        expect(view.percentText === '0%').toBe(c.integrity === 0);
        if (c.integrity === c.max) expect(view.percentText).toBe('100%');

        expect(view.critical).toBe(c.integrity <= c.critical);
      }),
      { numRuns: 200 },
    );
  });
});

describe('createLaneHud', () => {
  it('updates fill, value, note and .is-critical', () => {
    const hud = createLaneHud();
    const { fill, value, note } = parts(hud);
    expect(hud.el.querySelector('.lane-hud-label')!.textContent).toBe(LANE_COPY.integrityLabel);
    expect(LANE_COPY.integrityLabel).toBe('MODEM'); // lane-cctv Req 2.4

    hud.update(withIntegrity(100));
    expect(fill.style.width).toBe('100%');
    expect(value.textContent).toBe('100%');
    expect(note.textContent).toBe('');
    expect(hud.el.classList.contains('is-critical')).toBe(false);

    hud.update(withIntegrity(15));
    expect(fill.style.width).toBe('15%');
    expect(value.textContent).toBe('15%');
    expect(note.textContent).toBe(LANE_COPY.criticalNote);
    expect(hud.el.classList.contains('is-critical')).toBe(true);

    hud.update(withIntegrity(60));
    expect(fill.style.width).toBe('60%');
    expect(value.textContent).toBe('60%');
    expect(note.textContent).toBe('');
    expect(hud.el.classList.contains('is-critical')).toBe(false);
  });

  it('does not touch the DOM when the state repeats', () => {
    const hud = createLaneHud();
    const { fill, value, note } = parts(hud);
    hud.update(withIntegrity(50));
    const valueText = value.firstChild;
    const widthWrites = countWrites(fill.style, 'width');
    const valueWrites = countWrites(value, 'textContent');
    const noteWrites = countWrites(note, 'textContent');
    const toggle = vi.spyOn(hud.el.classList, 'toggle');

    hud.update(withIntegrity(50));
    hud.update(withIntegrity(50));

    expect(widthWrites.count).toBe(0);
    expect(valueWrites.count).toBe(0);
    expect(noteWrites.count).toBe(0);
    expect(toggle).not.toHaveBeenCalled();
    expect(value.firstChild).toBe(valueText);
  });

  // Property: Req 12.1, 12.2, 12.3 after every update the DOM shows the view for that state, and
  // each part is written only when its value changes
  // Feature: connection-lane, Property 15: The HUD shows integrity as a fraction, a percentage and a critical flag
  it('Property 15: the DOM mirrors integrityView and writes only on change', () => {
    fc.assert(
      fc.property(arbSequence, ({ max, critical, integrities }) => {
        const hud = createLaneHud();
        const { fill, value, note } = parts(hud);
        const widthWrites = countWrites(fill.style, 'width');
        const valueWrites = countWrites(value, 'textContent');
        const noteWrites = countWrites(note, 'textContent');
        const toggle = vi.spyOn(hud.el.classList, 'toggle');

        let expectedWidth = 0;
        let expectedValue = 0;
        let expectedCritical = 0;
        let prev: ReturnType<typeof integrityView> | null = null;

        for (const integrity of integrities) {
          const state = stateFor({ max, critical, integrity });
          const view = integrityView(state);
          hud.update(state);

          if (!prev || view.fraction * 100 !== prev.fraction * 100) expectedWidth++;
          if (!prev || view.percentText !== prev.percentText) expectedValue++;
          if (!prev || view.critical !== prev.critical) expectedCritical++;
          prev = view;

          // jsdom serializes CSS percentages to 4 decimals, so compare at that precision.
          expect(parseFloat(fill.style.width)).toBeCloseTo(view.fraction * 100, 3);
          expect(fill.style.width.endsWith('%')).toBe(true);
          expect(value.textContent).toBe(view.percentText);
          expect(hud.el.classList.contains('is-critical')).toBe(view.critical);
          expect(note.textContent).toBe(view.critical ? LANE_COPY.criticalNote : '');
        }

        expect(widthWrites.count).toBe(expectedWidth);
        expect(valueWrites.count).toBe(expectedValue);
        expect(noteWrites.count).toBe(expectedCritical);
        expect(toggle).toHaveBeenCalledTimes(expectedCritical);
        toggle.mockRestore();
      }),
      { numRuns: 100 },
    );
  });
});
