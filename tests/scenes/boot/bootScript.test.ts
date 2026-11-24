import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  BOOT_SCRIPT,
  bootFrameAt,
  cuesBetween,
  type BootCue,
} from '../../../src/scenes/boot/bootScript';

const TICK_MS = 1000 / 60;
const STAGE_ORDER = { bios: 0, splash: 1, done: 2 } as const;
const MEMORY_PREFIX = 'Memory Test:';

/** Elapsed boot times: whole ms, fractional ms and exact fixed-loop tick times, around the script. */
const elapsedMs = fc.oneof(
  fc.integer({ min: -100, max: BOOT_SCRIPT.doneAtMs + 1000 }),
  fc.double({ min: -100, max: BOOT_SCRIPT.doneAtMs + 1000, noNaN: true }),
  fc.integer({ min: 0, max: 600 }).map((ticks) => ticks * TICK_MS),
);

/** Window lengths for cue partitions: zero-length, one tick, a few ticks or anything up to 3 s. */
const windowMs = fc.oneof(
  fc.constant(0),
  fc.constant(TICK_MS),
  fc.integer({ min: 1, max: 30 }).map((ticks) => ticks * TICK_MS),
  fc.double({ min: 0, max: 3000, noNaN: true }),
);

/** Frame times starting at -1 with non-decreasing steps (cumulative window lengths). */
const frameTimes = fc.oneof(
  fc.array(windowMs, { maxLength: 60 }).map((steps) => {
    const times = [-1];
    for (const step of steps) times.push(times[times.length - 1] + step);
    return times;
  }),
  // Times as the Boot_Scene computes them: tick count × tick length, ticks non-decreasing.
  fc.array(fc.integer({ min: 0, max: 40 }), { maxLength: 60 }).map((steps) => {
    const times = [-1];
    let ticks = 0;
    for (const step of steps) {
      ticks += step;
      times.push(ticks * TICK_MS);
    }
    return times;
  }),
);

function cuesOver(times: readonly number[]): BootCue[] {
  const fired: BootCue[] = [];
  for (let i = 1; i < times.length; i++) fired.push(...cuesBetween(times[i - 1], times[i]));
  return fired;
}

describe('bootFrameAt', () => {
  it('switches stage at the splash and done times', () => {
    expect(bootFrameAt(5399).stage).toBe('bios');
    expect(bootFrameAt(5400).stage).toBe('splash');
    expect(bootFrameAt(7999).stage).toBe('splash');
    expect(bootFrameAt(8000).stage).toBe('done');
  });

  it('counts memory from 0K to 65536K OK between 900 and 2,400 ms', () => {
    expect(bootFrameAt(899).lines).toHaveLength(2);
    expect(bootFrameAt(900).lines[2]).toBe('Memory Test: 0K');
    expect(bootFrameAt(2399).memoryK).toBe(64512);
    const end = bootFrameAt(2400);
    expect(end.memoryK).toBe(65536);
    expect(end.lines[2]).toBe('Memory Test: 65536K OK');
  });

  it('shows every BIOS line by the end of the BIOS stage', () => {
    const lines = bootFrameAt(5399).lines;
    expect(lines).toHaveLength(BOOT_SCRIPT.header.length + 1 + BOOT_SCRIPT.body.length);
    expect(lines[lines.length - 1]).toBe('Starting Phantom 98...');
  });
});

describe('cuesBetween', () => {
  it('includes the 0 ms cue from prev = -1 and excludes prev itself', () => {
    expect(cuesBetween(-1, 300).map((c) => c.sound)).toEqual(['crtThunk', 'postBeep']);
    expect(cuesBetween(300, 2600).map((c) => c.atMs)).toEqual([2600]);
  });
});

describe('boot script properties', () => {
  // Feature: retro-shell, Property 4: The boot timeline only moves forward
  // Property: Req 4.2, 4.3 for t1 <= t2 stage, lines, memory count and splash progress never go back
  it('never moves the boot timeline backwards', () => {
    fc.assert(
      fc.property(elapsedMs, elapsedMs, (a, b) => {
        const [t1, t2] = a <= b ? [a, b] : [b, a];
        const f1 = bootFrameAt(t1);
        const f2 = bootFrameAt(t2);

        expect(STAGE_ORDER[f2.stage]).toBeGreaterThanOrEqual(STAGE_ORDER[f1.stage]);
        expect(f2.lines.length).toBeGreaterThanOrEqual(f1.lines.length);
        f1.lines.forEach((line, i) => {
          if (!line.startsWith(MEMORY_PREFIX)) expect(f2.lines[i]).toBe(line);
        });
        expect(f1.memoryK).toBeGreaterThanOrEqual(0);
        expect(f1.memoryK).toBeLessThanOrEqual(f2.memoryK);
        expect(f2.memoryK).toBeLessThanOrEqual(BOOT_SCRIPT.memory.totalK);
        expect(f1.splashProgress).toBeGreaterThanOrEqual(0);
        expect(f1.splashProgress).toBeLessThanOrEqual(f2.splashProgress);
        expect(f2.splashProgress).toBeLessThanOrEqual(1);
      }),
      { numRuns: 200 },
    );
  });

  // Feature: retro-shell, Property 4: The boot timeline only moves forward
  // Property: Req 4.2 a BIOS line is shown exactly when its scheduled time has been reached
  it('shows each BIOS line exactly when its time is reached', () => {
    fc.assert(
      fc.property(elapsedMs, (t) => {
        const { lines } = bootFrameAt(t);
        for (const line of [...BOOT_SCRIPT.header, ...BOOT_SCRIPT.body]) {
          expect(lines.includes(line.text)).toBe(line.atMs <= t);
        }
        const memoryLines = lines.filter((line) => line.startsWith(MEMORY_PREFIX));
        expect(memoryLines).toHaveLength(BOOT_SCRIPT.memory.atMs <= t ? 1 : 0);
      }),
      { numRuns: 200 },
    );
  });

  // Feature: retro-shell, Property 5: Every boot cue fires exactly once
  // Property: Req 4.4 any partition of [-1, tk] into frame windows fires the cues with atMs <= tk once, in order
  it('fires every reached cue exactly once in script order', () => {
    fc.assert(
      fc.property(frameTimes, (times) => {
        const end = times[times.length - 1];
        expect(cuesOver(times)).toEqual(BOOT_SCRIPT.cues.filter((cue) => cue.atMs <= end));
      }),
      { numRuns: 200 },
    );
  });

  // Feature: retro-shell, Property 5: Every boot cue fires exactly once
  // Property: Req 4.4, 4.6 frames that run to the end of the splash fire the whole cue list once
  it('fires the whole cue list once by the time the splash is done', () => {
    fc.assert(
      fc.property(
        frameTimes,
        fc.double({ min: BOOT_SCRIPT.doneAtMs, max: BOOT_SCRIPT.doneAtMs + 5000, noNaN: true }),
        (times, finish) => {
          const last = times[times.length - 1];
          const all = [...times, Math.max(last, finish)];
          expect(cuesOver(all)).toEqual(BOOT_SCRIPT.cues);
        },
      ),
      { numRuns: 200 },
    );
  });
});
