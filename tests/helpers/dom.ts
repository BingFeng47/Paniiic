// DOM test helpers: listener leak tracking and a controllable page-visibility source.

export interface TrackedListener {
  readonly type: string;
  readonly listener: EventListenerOrEventListenerObject;
  readonly capture: boolean;
}

export interface ListenerTracker {
  /** Listeners added since tracking began that are still attached. */
  attached(): TrackedListener[];
  /** Number of attached listeners, optionally only for one event type. */
  count(type?: string): number;
  /** Put the target's original `addEventListener` / `removeEventListener` back. */
  restore(): void;
}

interface Record_ extends TrackedListener {
  /** What was actually registered on the target (a wrapper for `once` listeners). */
  readonly registered: EventListenerOrEventListenerObject;
}

const captureOf = (options?: boolean | EventListenerOptions): boolean =>
  typeof options === 'boolean' ? options : Boolean(options?.capture);

const callListener = (listener: EventListenerOrEventListenerObject, target: EventTarget, event: Event): void => {
  if (typeof listener === 'function') listener.call(target, event);
  else listener.handleEvent(event);
};

/**
 * Wrap `target.addEventListener` / `removeEventListener` to see which listeners are still
 * attached, e.g. `trackListeners(document)` before `mount()` and `count() === 0` after
 * `unmount()`. Follows DOM rules: a listener is identified by (type, listener, capture), adding
 * the same one twice is a no-op, `once` listeners drop out after firing and `signal` listeners
 * drop out on abort. Listeners added before tracking began are not reported.
 * Call `restore()` when done (e.g. in `afterEach`), since `document` and `window` are shared.
 */
export function trackListeners(target: EventTarget): ListenerTracker {
  const records: Record_[] = [];
  const originalAdd = target.addEventListener;
  const originalRemove = target.removeEventListener;
  const ownAdd = Object.getOwnPropertyDescriptor(target, 'addEventListener');
  const ownRemove = Object.getOwnPropertyDescriptor(target, 'removeEventListener');

  const find = (type: string, listener: EventListenerOrEventListenerObject, capture: boolean): number =>
    records.findIndex((r) => r.type === type && r.listener === listener && r.capture === capture);

  const drop = (record: Record_): void => {
    const i = records.indexOf(record);
    if (i >= 0) records.splice(i, 1);
  };

  const add = function (
    type: string,
    listener: EventListenerOrEventListenerObject | null,
    options?: boolean | AddEventListenerOptions,
  ): void {
    if (listener === null) return;
    const capture = captureOf(options);
    const opts = typeof options === 'object' ? options : undefined;
    if (find(type, listener, capture) >= 0 || opts?.signal?.aborted) {
      originalAdd.call(target, type, listener, options);
      return;
    }
    let record: Record_;
    const registered: EventListenerOrEventListenerObject = opts?.once
      ? (event: Event) => {
          drop(record);
          callListener(listener, target, event);
        }
      : listener;
    record = { type, listener, capture, registered };
    records.push(record);
    opts?.signal?.addEventListener('abort', () => drop(record), { once: true });
    originalAdd.call(target, type, registered, options);
  };

  const remove = function (
    type: string,
    listener: EventListenerOrEventListenerObject | null,
    options?: boolean | EventListenerOptions,
  ): void {
    if (listener === null) return;
    const i = find(type, listener, captureOf(options));
    if (i < 0) {
      originalRemove.call(target, type, listener, options);
      return;
    }
    const [record] = records.splice(i, 1);
    originalRemove.call(target, type, record?.registered ?? listener, options);
  };

  Object.defineProperty(target, 'addEventListener', { value: add, configurable: true, writable: true });
  Object.defineProperty(target, 'removeEventListener', { value: remove, configurable: true, writable: true });

  const restoreProp = (name: string, own: PropertyDescriptor | undefined): void => {
    if (own) Object.defineProperty(target, name, own);
    else delete (target as unknown as Record<string, unknown>)[name];
  };

  return {
    attached: () => records.map(({ type, listener, capture }) => ({ type, listener, capture })),
    count: (type) => (type === undefined ? records.length : records.filter((r) => r.type === type).length),
    restore() {
      restoreProp('addEventListener', ownAdd);
      restoreProp('removeEventListener', ownRemove);
    },
  };
}

/**
 * A stand-in for `document` as a visibility source (`startFixedLoop`'s and the audio engine's
 * `visibility` dependency).
 */
export interface FakeVisibility extends EventTarget {
  readonly hidden: boolean;
  readonly visibilityState: DocumentVisibilityState;
  /** Set `hidden` and dispatch `visibilitychange`, even if the value did not change. */
  setHidden(hidden: boolean): void;
  /** Number of `visibilitychange` listeners still attached. */
  listenerCount(): number;
}

export function fakeVisibility(hidden = false): FakeVisibility {
  let isHidden = hidden;
  const target = new EventTarget();
  const tracker = trackListeners(target);
  // defineProperties (not Object.assign) so `hidden` stays a live getter.
  Object.defineProperties(target, {
    hidden: { get: () => isHidden, enumerable: true },
    visibilityState: { get: () => (isHidden ? 'hidden' : 'visible'), enumerable: true },
    setHidden: {
      value: (value: boolean) => {
        isHidden = value;
        target.dispatchEvent(new Event('visibilitychange'));
      },
    },
    listenerCount: { value: () => tracker.count('visibilitychange') },
  });
  return target as FakeVisibility;
}

type Monitor_ = import('../../src/core/monitor').Monitor;
type LedState_ = import('../../src/core/monitor').LedState;

/** A `Monitor` stand-in for scene and window tests, with hooks to read and drive it. */
export interface FakeMonitor extends Monitor_ {
  /** Last state passed to `setLed` (starts at `'off'`). */
  led(): LedState_;
  /** Whether a power handler is currently set. */
  hasPowerHandler(): boolean;
  /** Press the power button: calls the current handler, or does nothing when it is `null`. */
  pressPower(): void;
  /** Whether `unmount()` has been called. */
  isUnmounted(): boolean;
}

/**
 * Fake monitor whose Screen is a detached 1024 × 768 `div.screen`. `toScreenPoint` divides
 * client coordinates by `scale` (default 1, so it is the identity), as if the Screen sat at the
 * client origin.
 */
export function fakeMonitor(scale = 1): FakeMonitor {
  const screen = document.createElement('div');
  screen.className = 'screen';
  let led: LedState_ = 'off';
  let handler: (() => void) | null = null;
  let unmounted = false;
  return {
    screen,
    setLed: (state) => {
      led = state;
    },
    setPowerHandler: (fn) => {
      handler = fn;
    },
    toScreenPoint: (clientX, clientY) => ({ x: clientX / scale, y: clientY / scale }),
    unmount: () => {
      unmounted = true;
      handler = null;
    },
    led: () => led,
    hasPowerHandler: () => handler !== null,
    pressPower: () => handler?.(),
    isUnmounted: () => unmounted,
  };
}
