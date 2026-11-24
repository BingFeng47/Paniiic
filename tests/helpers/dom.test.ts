import { afterEach, describe, expect, it } from 'vitest';
import { fakeVisibility, trackListeners, type ListenerTracker } from './dom';

describe('trackListeners', () => {
  let tracker: ListenerTracker | null = null;
  afterEach(() => {
    tracker?.restore();
    tracker = null;
  });

  it('reports listeners still attached and forgets removed ones', () => {
    tracker = trackListeners(document);
    const a = (): void => {};
    const b = (): void => {};
    document.addEventListener('keydown', a);
    document.addEventListener('pointerdown', b, true);
    expect(tracker.count()).toBe(2);
    expect(tracker.attached()).toEqual([
      { type: 'keydown', listener: a, capture: false },
      { type: 'pointerdown', listener: b, capture: true },
    ]);
    // Wrong capture flag does not remove it, as in the DOM.
    document.removeEventListener('pointerdown', b);
    expect(tracker.count('pointerdown')).toBe(1);
    document.removeEventListener('pointerdown', b, { capture: true });
    document.removeEventListener('keydown', a);
    expect(tracker.count()).toBe(0);
  });

  it('still delivers events and ignores duplicate adds', () => {
    tracker = trackListeners(document);
    let calls = 0;
    const f = (): void => {
      calls += 1;
    };
    document.addEventListener('keydown', f);
    document.addEventListener('keydown', f);
    expect(tracker.count()).toBe(1);
    document.dispatchEvent(new Event('keydown'));
    expect(calls).toBe(1);
    document.removeEventListener('keydown', f);
    document.dispatchEvent(new Event('keydown'));
    expect(calls).toBe(1);
  });

  it('drops once listeners after they fire and signal listeners on abort', () => {
    const target = new EventTarget();
    tracker = trackListeners(target);
    let onceCalls = 0;
    const handler = {
      handleEvent: () => {
        onceCalls += 1;
      },
    };
    target.addEventListener('x', handler, { once: true });
    const controller = new AbortController();
    target.addEventListener('y', () => {}, { signal: controller.signal });
    expect(tracker.count()).toBe(2);
    target.dispatchEvent(new Event('x'));
    target.dispatchEvent(new Event('x'));
    expect(onceCalls).toBe(1);
    controller.abort();
    expect(tracker.count()).toBe(0);
  });

  it('removes a once listener that never fired through its original reference', () => {
    const target = new EventTarget();
    tracker = trackListeners(target);
    let calls = 0;
    const f = (): void => {
      calls += 1;
    };
    target.addEventListener('x', f, { once: true });
    target.removeEventListener('x', f);
    target.dispatchEvent(new Event('x'));
    expect(calls).toBe(0);
    expect(tracker.count()).toBe(0);
  });

  it('restore() puts the original methods back', () => {
    const originalAdd = window.addEventListener;
    const originalRemove = window.removeEventListener;
    const t = trackListeners(window);
    expect(window.addEventListener).not.toBe(originalAdd);
    t.restore();
    expect(window.addEventListener).toBe(originalAdd);
    expect(window.removeEventListener).toBe(originalRemove);
    window.addEventListener('resize', () => {});
    expect(t.count()).toBe(0);
  });
});

describe('fakeVisibility', () => {
  it('starts visible by default and dispatches visibilitychange on setHidden', () => {
    const vis = fakeVisibility();
    const seen: boolean[] = [];
    const f = (): void => {
      seen.push(vis.hidden);
    };
    vis.addEventListener('visibilitychange', f);
    expect(vis.hidden).toBe(false);
    vis.setHidden(true);
    expect(vis.visibilityState).toBe('hidden');
    vis.setHidden(true);
    vis.setHidden(false);
    expect(seen).toEqual([true, true, false]);
    expect(vis.listenerCount()).toBe(1);
    vis.removeEventListener('visibilitychange', f);
    expect(vis.listenerCount()).toBe(0);
  });

  it('can start hidden', () => {
    expect(fakeVisibility(true).hidden).toBe(true);
  });
});
