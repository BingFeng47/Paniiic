// Scene contract and the Scene_Director that moves between the five shell scenes
// (Req 1.1–1.8, 14.1; title-and-endings Req 1.1–1.8; replay-flow Req 3.2–3.6).
// `nextScene` is the pure transition table; the director owns the DOM side:
// it unmounts the old scene, clears the root and mounts the new one, one switch at a time.

/** Anything with a mount/unmount lifecycle (Req 14.1). */
export interface Mountable {
  mount(root: HTMLElement): void;
  unmount(): void;
}

export type Scene = Mountable;
export type SceneId = 'powerOff' | 'title' | 'boot' | 'desktop' | 'shutdown';
export type SceneSignal = 'powerOn' | 'play' | 'bootDone' | 'shutDown' | 'shutdownDone' | 'mainMenu';
export type SignalFn = (signal: SceneSignal) => void;

/**
 * The only six transitions. The title is entered from power off or, through Main menu, from the
 * desktop; the boot only from the title and the desktop only from the boot (Req 1.6;
 * title-and-endings Req 1.1–1.5; replay-flow Req 3.2, 3.3, 3.5).
 */
const TRANSITIONS: Readonly<Record<SceneId, Partial<Readonly<Record<SceneSignal, SceneId>>>>> = {
  powerOff: { powerOn: 'title' }, // title-and-endings Req 1.1 (was 'boot': retro-shell Req 1.2)
  title: { play: 'boot' }, // title-and-endings Req 1.2
  boot: { bootDone: 'desktop', mainMenu: 'title' }, // power button → Power_Confirm → Yes
  desktop: { shutDown: 'shutdown', mainMenu: 'title' }, // replay-flow Req 3.2, 3.3
  shutdown: { shutdownDone: 'powerOff' }, // title-and-endings Req 1.8
};

/** Pure transition table (Req 1.2–1.7). Unmatched signals keep the current scene
 * (so `mainMenu` outside the desktop and the boot is a no-op, replay-flow Req 3.6). */
export function nextScene(current: SceneId, signal: SceneSignal): SceneId {
  return TRANSITIONS[current][signal] ?? current;
}

export interface SceneDirector {
  /** Mounts the initial scene (power off unless the director was given another). Calling it again does nothing. */
  start(): void;
  signal: SignalFn;
  current(): SceneId;
  /** Unmounts the current scene and clears the root. Later signals are ignored. */
  stop(): void;
}

export type SceneFactories = Readonly<Record<SceneId, (signal: SignalFn) => Scene>>;

export function createSceneDirector(
  root: HTMLElement,
  factories: SceneFactories,
  initial: SceneId = 'powerOff',
): SceneDirector {
  let currentId: SceneId = initial;
  let scene: Scene | null = null;
  let running = false;
  let busy = false;
  let stopRequested = false;
  const queue: SceneSignal[] = [];

  const signal: SignalFn = (s) => {
    if (!running) return;
    queue.push(s);
    drain();
  };

  /** Unmount before mount (Req 1.8), with the root emptied in between. */
  function switchTo(id: SceneId): void {
    const old = scene;
    scene = null;
    old?.unmount();
    root.replaceChildren();
    currentId = id;
    const next = factories[id](signal);
    scene = next;
    next.mount(root);
  }

  function teardown(): void {
    running = false;
    queue.length = 0;
    const old = scene;
    scene = null;
    old?.unmount();
    root.replaceChildren();
  }

  /**
   * Runs queued work one item at a time. Signals or stop() raised from inside a scene's
   * mount()/unmount() land in the queue and are handled after the current switch completes.
   */
  function drain(): void {
    if (busy) return;
    busy = true;
    try {
      while (running) {
        if (stopRequested) {
          stopRequested = false;
          teardown();
          break;
        }
        const s = queue.shift();
        if (s === undefined) break;
        const target = nextScene(currentId, s);
        if (target !== currentId) switchTo(target);
      }
    } finally {
      busy = false;
    }
  }

  return {
    start() {
      if (running || scene) return;
      running = true;
      busy = true;
      try {
        switchTo(initial);
      } finally {
        busy = false;
      }
      drain();
    },
    signal,
    current: () => currentId,
    stop() {
      if (!running) return;
      stopRequested = true;
      drain();
    },
  };
}
