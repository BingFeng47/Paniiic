import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createAudioEngine } from '../../src/core/audio';
import type { SceneSignal } from '../../src/core/scene';
import { createPowerOffScene } from '../../src/scenes/powerOffScene';
import { createFakeAudioContext, createFakeAudioEngine, type FakeAudioEngine } from '../helpers/audio';
import { fakeMonitor, fakeVisibility, trackListeners, type ListenerTracker } from '../helpers/dom';

let trackers: ListenerTracker[] = [];

beforeEach(() => {
  trackers = [trackListeners(document), trackListeners(window)];
});

afterEach(() => {
  // Trackers can wrap each other on shared targets, so restore the newest first.
  for (const t of trackers.reverse()) t.restore();
  trackers = [];
});

/** Mounts the scene with a recording signal. `audio` defaults to a locked fake engine. */
function setup(audio: Parameters<typeof createPowerOffScene>[0]['audio'] = createFakeAudioEngine({ unlocked: false })) {
  const monitor = fakeMonitor();
  const signals: SceneSignal[] = [];
  const root = document.createElement('div');
  const rootTracker = trackListeners(root);
  trackers.push(rootTracker);
  const scene = createPowerOffScene({ monitor, audio, signal: (s) => signals.push(s) });
  scene.mount(root);
  return { monitor, signals, root, rootTracker, scene };
}

describe('createPowerOffScene', () => {
  it('shows a dark screen with the LED on standby and signals nothing until the button is pressed', () => {
    // Req 3.1
    const { monitor, signals, root } = setup();
    expect(root.querySelector('.scene.scene-power-off')).not.toBeNull();
    expect(monitor.led()).toBe('standby');
    expect(monitor.hasPowerHandler()).toBe(true);
    expect(signals).toEqual([]);
  });

  it('unlocks audio inside the press handler before signalling powerOn', () => {
    // Req 1.2, 3.2
    const audio: FakeAudioEngine = createFakeAudioEngine({ unlocked: false });
    const seenAtSignal: { log: string[]; unlocked: boolean }[] = [];
    const monitor = fakeMonitor();
    const scene = createPowerOffScene({
      monitor,
      audio,
      signal: () => seenAtSignal.push({ log: audio.log.map((e) => e.type), unlocked: audio.isUnlocked() }),
    });
    scene.mount(document.createElement('div'));

    monitor.pressPower();
    expect(seenAtSignal).toEqual([{ log: ['unlock'], unlocked: true }]);
  });

  it('still signals powerOn when unlock reports audio as unavailable', () => {
    // Req 3.3: unlock() returns false and the boot goes on silently.
    const audio = createFakeAudioEngine({ unlocked: false, available: false });
    const { monitor, signals } = setup(audio);

    monitor.pressPower();
    expect(audio.log).toEqual([{ type: 'unlock', result: false }]);
    expect(audio.isUnlocked()).toBe(false);
    expect(signals).toEqual(['powerOn']);
  });

  it('still signals powerOn with the real engine when the audio context cannot be created', () => {
    // Req 3.3
    const audio = createAudioEngine({
      createContext: () => {
        throw new Error('no Web Audio here');
      },
      visibility: fakeVisibility(),
    });
    const { monitor, signals } = setup(audio);

    expect(() => monitor.pressPower()).not.toThrow();
    expect(signals).toEqual(['powerOn']);
    expect(audio.isUnlocked()).toBe(false);
  });

  it('still signals powerOn with the real engine when resume() rejects', async () => {
    // Req 3.3
    const ctx = createFakeAudioContext({ resumeRejects: true });
    const audio = createAudioEngine({ createContext: () => ctx.asAudioContext(), visibility: fakeVisibility() });
    const { monitor, signals } = setup(audio);

    monitor.pressPower();
    expect(signals).toEqual(['powerOn']);
    expect(ctx.calls[0]).toBe('resume');
    await Promise.resolve();
    await Promise.resolve();
    expect(audio.isUnlocked()).toBe(false);
  });

  it('after unmount the button is inert, the LED is on and no listeners are left', () => {
    // Req 3.5, 14.2
    const { monitor, signals, root, rootTracker, scene } = setup();
    monitor.pressPower();
    expect(signals).toEqual(['powerOn']);

    scene.unmount();
    expect(monitor.hasPowerHandler()).toBe(false);
    expect(monitor.led()).toBe('on');
    expect(root.children).toHaveLength(0);

    monitor.pressPower();
    monitor.pressPower();
    expect(signals).toEqual(['powerOn']);

    expect(rootTracker.attached()).toEqual([]);
    for (const t of trackers) expect(t.attached()).toEqual([]);
  });
});
