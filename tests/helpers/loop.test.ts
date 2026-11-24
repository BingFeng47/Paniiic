import { describe, expect, it } from 'vitest';
import { createManualLoop } from './loop';

describe('createManualLoop', () => {
  it('delivers frames to a started loop until it is stopped', () => {
    const loop = createManualLoop();
    const seen: number[] = [];
    expect(loop.isRunning()).toBe(false);
    const stop = loop.start((n) => seen.push(n));
    expect(loop.isRunning()).toBe(true);
    loop.frame(1);
    loop.frame(0);
    loop.frame(3);
    stop();
    loop.frame(5);
    expect(seen).toEqual([1, 0, 3]);
    expect(loop.isRunning()).toBe(false);
    expect(loop.startCount()).toBe(1);
    expect(loop.stopCount()).toBe(1);
  });

  it('counts every stop call, repeats included', () => {
    const loop = createManualLoop();
    const stop = loop.start(() => {});
    stop();
    stop();
    expect(loop.stopCount()).toBe(2);
    expect(loop.isRunning()).toBe(false);
  });

  it('honours a stop from inside onTicks and skips later frames', () => {
    const loop = createManualLoop();
    const seen: number[] = [];
    const stop = loop.start((n) => {
      seen.push(n);
      if (n === 2) stop();
    });
    loop.frame(1);
    loop.frame(2);
    loop.frame(3);
    expect(seen).toEqual([1, 2]);
  });

  it('runs several loops in start order; a loop started mid-frame waits for the next frame', () => {
    const loop = createManualLoop();
    const seen: string[] = [];
    loop.start((n) => {
      seen.push(`a${n}`);
      if (n === 1) loop.start((m) => seen.push(`b${m}`));
    });
    loop.frame(1);
    loop.frame(2);
    expect(seen).toEqual(['a1', 'a2', 'b2']);
    expect(loop.startCount()).toBe(2);
  });

  it('rejects negative or fractional tick counts', () => {
    const loop = createManualLoop();
    expect(() => loop.frame(-1)).toThrow();
    expect(() => loop.frame(0.5)).toThrow();
  });
});
