import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  createSceneDirector,
  nextScene,
  type Scene,
  type SceneFactories,
  type SceneId,
  type SceneSignal,
  type SignalFn,
} from '../../src/core/scene';

const IDS: readonly SceneId[] = ['powerOff', 'title', 'boot', 'desktop', 'shutdown'];
const SIGNALS: readonly SceneSignal[] = ['powerOn', 'play', 'bootDone', 'shutDown', 'shutdownDone', 'mainMenu'];

/** The six table entries from the design, written out independently of the source. */
const EXPECTED_TRANSITIONS: readonly (readonly [SceneId, SceneSignal, SceneId])[] = [
  ['powerOff', 'powerOn', 'title'],
  ['title', 'play', 'boot'],
  ['boot', 'bootDone', 'desktop'],
  ['desktop', 'shutDown', 'shutdown'],
  ['shutdown', 'shutdownDone', 'powerOff'],
  ['desktop', 'mainMenu', 'title'], // replay-flow Req 3.2
  ['boot', 'mainMenu', 'title'], // power button → Power_Confirm → Yes during the boot
];

function expectedTarget(from: SceneId, signal: SceneSignal): SceneId | undefined {
  return EXPECTED_TRANSITIONS.find(([f, s]) => f === from && s === signal)?.[2];
}

const signalArray = fc.array(fc.constantFrom(...SIGNALS), { maxLength: 60 });

/** Factories whose scenes log their lifecycle and leave a marker element in the root. */
function loggingFactories(log: string[], onMount?: Partial<Record<SceneId, (s: SignalFn) => void>>) {
  const make =
    (id: SceneId) =>
    (signal: SignalFn): Scene => ({
      mount(root) {
        log.push(`mount:${id}`);
        const el = document.createElement('div');
        el.dataset.scene = id;
        root.append(el);
        onMount?.[id]?.(signal);
      },
      unmount() {
        log.push(`unmount:${id}`);
      },
    });
  return Object.fromEntries(IDS.map((id) => [id, make(id)])) as unknown as SceneFactories;
}

/** Scene ids in the order they were mounted, read from a lifecycle log. */
function mountedOrder(log: readonly string[]): SceneId[] {
  return log.filter((e) => e.startsWith('mount:')).map((e) => e.slice('mount:'.length) as SceneId);
}

describe('nextScene', () => {
  it('follows the six transitions and ignores other signals', () => {
    expect(nextScene('powerOff', 'powerOn')).toBe('title');
    expect(nextScene('title', 'play')).toBe('boot');
    expect(nextScene('boot', 'bootDone')).toBe('desktop');
    expect(nextScene('desktop', 'shutDown')).toBe('shutdown');
    expect(nextScene('shutdown', 'shutdownDone')).toBe('powerOff');
    expect(nextScene('desktop', 'mainMenu')).toBe('title');
    expect(nextScene('powerOff', 'bootDone')).toBe('powerOff');
  });

  it('ignores mainMenu outside the desktop and the boot (replay-flow Req 3.6)', () => {
    expect(nextScene('boot', 'mainMenu')).toBe('title');
    for (const id of IDS.filter((i) => i !== 'desktop' && i !== 'boot')) {
      expect(nextScene(id, 'mainMenu')).toBe(id);
    }
  });

  it('Property 1: the desktop is only reachable through the boot, the boot only through the title', () => {
    // Property: Req 1.6 desktop is entered only from boot; Req 1.7 unmatched signals keep the scene
    // Property: title-and-endings Req 1.1, 1.2 power on → title, play → boot; Req 1.3 boot only
    // from title; Req 1.4 title only from power off; Req 1.5 desktop only from boot; Req 1.7
    // unmatched signals keep the scene
    // Feature: retro-shell, Property 1: The desktop is only reachable through the boot
    // Feature: title-and-endings, Property 1: The scene flow passes through the title screen
    // Feature: replay-flow, Property 1: The desktop is only reached through the boot
    // Property: replay-flow Req 3.2, 3.3, 3.5, 3.6, 3.7 mainMenu leads desktop → title only
    fc.assert(
      fc.property(signalArray, (signals) => {
        let current: SceneId = 'powerOff';
        for (const signal of signals) {
          const next = nextScene(current, signal);
          const expected = expectedTarget(current, signal);
          if (expected === undefined) {
            expect(next).toBe(current);
          } else {
            expect(next).toBe(expected);
          }
          if (next === 'desktop' && current !== 'desktop') expect(current).toBe('boot');
          if (next !== current) {
            // Every scene change is one of the six table entries.
            expect(EXPECTED_TRANSITIONS).toContainEqual([current, signal, next]);
          }
          if (next === 'title' && current !== 'title') {
            // replay-flow Req 3.5: title only from powerOff on powerOn or desktop on mainMenu.
            expect([['powerOff', 'powerOn'], ['desktop', 'mainMenu'], ['boot', 'mainMenu']]).toContainEqual([current, signal]);
          }
          if (next === 'boot' && current !== 'boot') expect(current).toBe('title');
          current = next;
        }
      }),
      { numRuns: 200 },
    );
  });
});

describe('createSceneDirector', () => {
  it('start() mounts the power off scene', () => {
    const log: string[] = [];
    const root = document.createElement('div');
    const director = createSceneDirector(root, loggingFactories(log));
    director.start();
    expect(director.current()).toBe('powerOff');
    expect(log).toEqual(['mount:powerOff']);
    expect((root.firstElementChild as HTMLElement).dataset.scene).toBe('powerOff');
  });

  it('start() mounts the given initial scene', () => {
    const log: string[] = [];
    const root = document.createElement('div');
    const director = createSceneDirector(root, loggingFactories(log), 'title');
    director.start();
    expect(director.current()).toBe('title');
    expect(log).toEqual(['mount:title']);
    director.signal('play');
    expect(director.current()).toBe('boot');
  });
  it('starts in power off and switches with unmount before mount, clearing the root', () => {
    const log: string[] = [];
    const root = document.createElement('div');
    const director = createSceneDirector(root, loggingFactories(log));
    director.start();
    director.signal('powerOn');
    expect(director.current()).toBe('title');
    expect(log).toEqual(['mount:powerOff', 'unmount:powerOff', 'mount:title']);
    expect(root.children).toHaveLength(1);
    expect((root.firstElementChild as HTMLElement).dataset.scene).toBe('title');
  });

  it('keeps the mounted scene when a signal does not match it', () => {
    const log: string[] = [];
    const root = document.createElement('div');
    const director = createSceneDirector(root, loggingFactories(log));
    director.start();
    director.signal('bootDone');
    director.signal('shutDown');
    expect(director.current()).toBe('powerOff');
    expect(log).toEqual(['mount:powerOff']);
  });

  it('queues a signal raised from inside mount until the switch completes', () => {
    const log: string[] = [];
    const root = document.createElement('div');
    const director = createSceneDirector(
      root,
      loggingFactories(log, {
        title: (signal) => signal('play'),
        boot: (signal) => signal('bootDone'),
      }),
    );
    director.start();
    director.signal('powerOn');
    expect(director.current()).toBe('desktop');
    expect(log).toEqual([
      'mount:powerOff',
      'unmount:powerOff',
      'mount:title',
      'unmount:title',
      'mount:boot',
      'unmount:boot',
      'mount:desktop',
    ]);
  });

  it('stop() unmounts the current scene, clears the root and ignores later signals', () => {
    const log: string[] = [];
    const root = document.createElement('div');
    const director = createSceneDirector(root, loggingFactories(log));
    director.start();
    director.signal('powerOn');
    director.stop();
    expect(log).toEqual(['mount:powerOff', 'unmount:powerOff', 'mount:title', 'unmount:title']);
    expect(root.children).toHaveLength(0);
    director.signal('bootDone');
    expect(log).toHaveLength(4);
    expect(root.children).toHaveLength(0);
  });

  it('Property 1 (director): desktop mounts follow boot mounts, boot follows title, title follows power off', () => {
    // Property: Req 1.1 power off mounts first; Req 1.6 desktop only from boot; Req 1.7 unmatched
    // signals change nothing; Req 1.8 the old scene unmounts before the next one mounts
    // Property: title-and-endings Req 1.3 boot only from title; Req 1.4 title only from power
    // off; Req 1.5 desktop only from boot; Req 1.7 unmatched signals change nothing
    // Feature: retro-shell, Property 1: The desktop is only reachable through the boot
    // Feature: title-and-endings, Property 1: The scene flow passes through the title screen
    // Feature: replay-flow, Property 1: The desktop is only reached through the boot
    // Property: replay-flow Req 3.2, 3.3, 3.5, 3.6, 3.7 mainMenu leads desktop → title only
    fc.assert(
      fc.property(signalArray, (signals) => {
        const log: string[] = [];
        const root = document.createElement('div');
        const director = createSceneDirector(root, loggingFactories(log));
        director.start();
        let model: SceneId = 'powerOff';
        for (const signal of signals) {
          director.signal(signal);
          model = expectedTarget(model, signal) ?? model;
          expect(director.current()).toBe(model);
          expect(root.children).toHaveLength(1);
          expect((root.firstElementChild as HTMLElement).dataset.scene).toBe(model);
        }

        const mounts = mountedOrder(log);
        expect(mounts[0]).toBe('powerOff');
        mounts.forEach((id, i) => {
          if (id === 'desktop') expect(mounts[i - 1]).toBe('boot');
          if (id === 'boot') expect(mounts[i - 1]).toBe('title');
          if (id === 'title' && i > 0) expect(['powerOff', 'desktop', 'boot']).toContain(mounts[i - 1]);
          // Every switch is one table entry: the target of some signal from the previous scene.
          if (i > 0) {
            expect(EXPECTED_TRANSITIONS.some(([f, , t]) => f === mounts[i - 1] && t === id)).toBe(true);
          }
        });

        // Lifecycle log alternates strictly: mount, unmount of that scene, mount, ...
        log.forEach((entry, i) => {
          if (i % 2 === 0) {
            expect(entry.startsWith('mount:')).toBe(true);
          } else {
            expect(entry).toBe(`unmount:${log[i - 1]!.slice('mount:'.length)}`);
          }
        });

        director.stop();
        expect(log[log.length - 1]).toBe(`unmount:${model}`);
        expect(root.children).toHaveLength(0);
      }),
      { numRuns: 200 },
    );
  });
});
