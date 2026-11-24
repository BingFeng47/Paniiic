// Tests for the Dialer App (Req 9.1–9.4, 11.1, 11.4–11.7, 12.1, 12.4–12.6). Unit tests drive
// `sessionView` directly with real `createRun` + `step` states; one integration test runs the
// whole cycle through `createSession` on a manual loop.
import { afterEach, describe, expect, it } from 'vitest';
import type { AudioEngine } from '../../src/core/audio';
import { createWindowManager, type WindowManager } from '../../src/desktop/windowManager';
import { createDialerApp, DIALER_WINDOW_ID, type DialerApp } from '../../src/dialup/dialer';
import { DIALER_COPY, stageTimeLeftSeconds } from '../../src/dialup/dialScript';
import { MODEM_SOUND_SEC } from '../../src/dialup/modemSounds';
import { createSession, type SessionContext } from '../../src/dialup/session';
import { trayModemView } from '../../src/dialup/trayModemView';
import type { ModemLamp } from '../../src/desktop/taskbar';
import type { CoreBalance } from '../../src/game/balance/core';
import type { System } from '../../src/game/context';
import { createRun } from '../../src/game/state';
import { step } from '../../src/game/step';
import type { GameState, InputCommand } from '../../src/game/types';
import { createFakeAudioEngine, type FakeAudioEngine } from '../helpers/audio';
import { scheduledDamage, stepN } from '../helpers/game';
import { createManualLoop } from '../helpers/loop';

const START: InputCommand = { type: 'startDownload' };

const STATUS = {
  initializing: 'Initializing modem...',
  dialing: 'Dialing 555-0199...',
  ringing: 'Waiting for the remote computer to answer...',
  negotiating: 'Negotiating with the remote computer...',
  verifying: 'Verifying user name and password...',
  loggingOn: 'Logging on to network...',
  connected: 'Connected at 28,800 bps.',
  terminated: 'The connection was terminated by the remote computer.',
} as const;
const HANG_UP = 'Unable to hang up. Something is holding the line.';

/* ---- Rig: real window manager, fake audio ---------------------------------------------------- */

interface Rig {
  readonly windows: WindowManager;
  readonly audio: FakeAudioEngine;
  readonly dialer: DialerApp;
  connects(): number;
}

const cleanups: (() => void)[] = [];

afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()!();
  document.body.replaceChildren();
});

function createRig(onConnect?: () => void): Rig {
  const host = document.createElement('div');
  document.body.append(host);
  const windows = createWindowManager({ toScreenPoint: (x, y) => ({ x, y }), area: { w: 1024, h: 740 } });
  windows.mount(host);
  const audio = createFakeAudioEngine();
  const engine: AudioEngine = audio;
  let connects = 0;
  const dialer = createDialerApp({
    windows,
    audio: engine,
    onConnect: () => {
      connects += 1;
      onConnect?.();
    },
  });
  cleanups.push(() => {
    dialer.unmount();
    windows.unmount();
    host.remove();
  });
  return { windows, audio, dialer, connects: () => connects };
}

const windowEl = (): HTMLElement | null => document.querySelector(`[data-window-id="${DIALER_WINDOW_ID}"]`);
const query = <T extends Element = HTMLElement>(selector: string): T | null =>
  windowEl()?.querySelector<T>(selector) ?? null;
const bodyButtons = (): HTMLButtonElement[] => [
  ...(windowEl()?.querySelectorAll<HTMLButtonElement>('.window-body .btn') ?? []),
];
const statusEl = (): HTMLElement | null => query('.dialer-status');
const detailEl = (): HTMLElement | null => query('.dialer-detail');
const status = (): string | null | undefined => statusEl()?.textContent;
const detail = (): string | null | undefined => detailEl()?.textContent;
const title = (rig: Rig): string | undefined => rig.windows.info(DIALER_WINDOW_ID)?.title;

/** Only text nodes under `el`: the view wrote its text through `textContent`. */
function expectTextOnly(el: HTMLElement | null): void {
  expect(el).not.toBeNull();
  expect(el!.children).toHaveLength(0);
  for (const node of el!.childNodes) expect(node.nodeType).toBe(Node.TEXT_NODE);
}

/* ---- Driver: real game-core states into the sessionView -------------------------------------- */

interface SoundEntry {
  readonly tick: number;
  readonly type: 'play' | 'stop';
  readonly name: string;
  readonly durationSec?: number;
}

interface DriverOptions {
  readonly systems?: readonly System[];
  readonly balance?: Partial<CoreBalance>;
}

function isOver(state: GameState): boolean {
  return state.phase === 'won' || state.phase === 'lost';
}

/** Mounts the Dialer's sessionView and feeds it states from `createRun` + `step`. */
function drive(rig: Rig, options: DriverOptions = {}) {
  const systems = options.systems ?? [];
  const view = rig.dialer.sessionView;
  const sent: InputCommand[] = [];
  const sounds: SoundEntry[] = [];
  const states = new Map<number, GameState>();
  let logSeen = rig.audio.log.length;
  let state = createRun({ seed: 1, balance: options.balance });

  const record = (): void => {
    states.set(state.tick, state);
    for (const entry of rig.audio.log.slice(logSeen)) {
      if (entry.type === 'play') {
        sounds.push({ tick: state.tick, type: 'play', name: entry.name, durationSec: entry.durationSec });
      } else if (entry.type === 'stop') {
        sounds.push({ tick: state.tick, type: 'stop', name: entry.name });
      }
    }
    logSeen = rig.audio.log.length;
  };

  const ctx: SessionContext = {
    laneHost: document.createElement('div'),
    overlayHost: document.createElement('div'),
    windows: rig.windows,
    audio: rig.audio,
    toScreenPoint: (x, y) => ({ x, y }),
    send: (command) => sent.push(command),
  };
  view.mount(ctx);
  view.update(state, []);
  record();

  const advance = (n: number, inputs: readonly InputCommand[] = []): void => {
    const result = stepN(step, state, n, {
      systems,
      inputs: inputs.map((command) => ({ tick: state.tick + 1, command })),
    });
    state = result.state;
    view.update(state, result.events);
    record();
  };

  return {
    state: () => state,
    sent,
    sounds,
    stateAt: (tick: number) => states.get(tick),
    /** One frame of `n` ticks. */
    advance,
    /** One-tick frames until `tick` (or the Run ends). */
    tickTo(tick: number): void {
      while (state.tick < tick && !isOver(state)) advance(1);
    },
  };
}

/** Rounds durations so float noise in the stage shares doesn't hide the shape of the log. */
const rounded = (entries: readonly SoundEntry[]) =>
  entries.map((e) =>
    e.durationSec === undefined ? e : { ...e, durationSec: Math.round(e.durationSec * 1e6) / 1e6 },
  );

/* ---- Idle form ------------------------------------------------------------------------------- */

describe('Dialer idle form', () => {
  it('shows the Connect To form with the connection details and two buttons (Req 9.1)', () => {
    const rig = createRig();
    rig.dialer.open();

    expect(rig.windows.isOpen(DIALER_WINDOW_ID)).toBe(true);
    expect(title(rig)).toBe('Connect To');
    expect(rig.windows.info(DIALER_WINDOW_ID)?.icon).toBe('dialer');
    expect(query('.dialer-form')).not.toBeNull();
    expect(query('.dialer-progress')).toBeNull();
    expect(query('.dialer-name')?.textContent).toBe('MidnightNet Online');

    const labels = [...windowEl()!.querySelectorAll('.field-label')].map((l) => l.textContent);
    expect(labels).toEqual(['User name:', 'Password:', 'Phone number:']);
    const user = query<HTMLInputElement>('#dialer-user-name')!;
    const password = query<HTMLInputElement>('#dialer-password')!;
    const phone = query<HTMLInputElement>('#dialer-phone-number')!;
    expect(user.value).toBe('guest');
    expect(password.type).toBe('password');
    expect(password.value).toBe('********');
    expect(phone.value).toBe('555-0199');
    for (const input of [user, password, phone]) expect(input.readOnly).toBe(true);

    expect(bodyButtons().map((b) => b.textContent)).toEqual(['Connect', 'Cancel']);
  });

  it('calls onConnect when Connect is clicked and keeps the window open (Req 9.2)', () => {
    const rig = createRig();
    rig.dialer.open();
    bodyButtons()[0]!.click();
    expect(rig.connects()).toBe(1);
    expect(rig.windows.isOpen(DIALER_WINDOW_ID)).toBe(true);
  });

  it('closes on Cancel and on the close button while idle (Req 9.3)', () => {
    const rig = createRig();
    rig.dialer.open();
    bodyButtons()[1]!.click();
    expect(rig.windows.isOpen(DIALER_WINDOW_ID)).toBe(false);

    rig.dialer.open();
    query<HTMLButtonElement>('.title-bar-close')!.click();
    expect(rig.windows.isOpen(DIALER_WINDOW_ID)).toBe(false);
    expect(rig.connects()).toBe(0);
  });
});

/* ---- Session view ---------------------------------------------------------------------------- */

describe('Dialer session view', () => {
  it('swaps the open window to the progress view (Req 9.4)', () => {
    const rig = createRig();
    rig.dialer.open();
    drive(rig);

    expect(rig.windows.isOpen(DIALER_WINDOW_ID)).toBe(true);
    expect(document.querySelectorAll('.window')).toHaveLength(1);
    expect(query('.dialer-form')).toBeNull();
    expect(query('.dialer-progress')).not.toBeNull();
    expect(title(rig)).toBe('Connecting to MidnightNet Online');
    expect(status()).toBe(STATUS.initializing);
    expect(detail()).toBe('');
    expect(bodyButtons().map((b) => b.textContent)).toEqual(['Cancel']);
  });

  it('opens the window with the progress view when it was closed (Req 9.4)', () => {
    const rig = createRig();
    drive(rig);
    expect(rig.windows.isOpen(DIALER_WINDOW_ID)).toBe(true);
    expect(query('.dialer-progress')).not.toBeNull();
    expect(title(rig)).toBe(DIALER_COPY.titles.dialing);
  });

  it('shows each stage status at its ticks, then connected, through text nodes only (Req 11.1, 11.4)', () => {
    const rig = createRig();
    rig.dialer.open();
    const d = drive(rig);
    // Stage boundaries for the default 20 s (1,200 tick) dial, from the design table.
    const expected: readonly [number, string][] = [
      [0, STATUS.initializing],
      [89, STATUS.initializing],
      [90, STATUS.dialing],
      [179, STATUS.dialing],
      [180, STATUS.ringing],
      [299, STATUS.ringing],
      [300, STATUS.negotiating],
      [899, STATUS.negotiating],
      [900, STATUS.verifying],
      [1079, STATUS.verifying],
      [1080, STATUS.loggingOn],
      [1199, STATUS.loggingOn],
      [1200, STATUS.connected],
    ];
    for (const [tick, text] of expected) {
      d.tickTo(tick);
      expect(d.state().tick).toBe(tick);
      expect(status(), `status at tick ${tick}`).toBe(text);
      expect(title(rig), `title at tick ${tick}`).toBe(
        tick < 1200 ? DIALER_COPY.titles.dialing : DIALER_COPY.titles.connected,
      );
      expectTextOnly(statusEl());
    }
    expect(d.state().phase).toBe('connected');
    expect(d.sent).toEqual([]);
  });

  it('switches stage voices: stop previous, play next, silence for verifying and logging on, relay click on connect (Req 12.1, 12.4, 12.5)', () => {
    const rig = createRig();
    const d = drive(rig);
    d.tickTo(1200);

    expect(rounded(d.sounds)).toEqual([
      { tick: 0, type: 'play', name: 'dialTone', durationSec: 1.5 },
      { tick: 90, type: 'stop', name: 'dialTone' },
      { tick: 90, type: 'play', name: 'dtmf', durationSec: 1.5 },
      { tick: 180, type: 'stop', name: 'dtmf' },
      { tick: 180, type: 'play', name: 'ringback', durationSec: 2 },
      { tick: 300, type: 'stop', name: 'ringback' },
      { tick: 300, type: 'play', name: 'handshake', durationSec: 10 },
      { tick: 900, type: 'stop', name: 'handshake' },
      { tick: 1200, type: 'play', name: 'relayClick', durationSec: MODEM_SOUND_SEC.relayClick },
    ]);

    // Each stage voice lasts exactly the time left in its stage, from the Run's dial clock.
    for (const entry of d.sounds) {
      if (entry.type !== 'play' || entry.name === 'relayClick') continue;
      expect(entry.durationSec).toBe(stageTimeLeftSeconds(d.stateAt(entry.tick)!));
    }

    // More connected frames play nothing else; the relay click plays once.
    d.advance(300);
    d.advance(1, [START]);
    d.advance(60);
    expect(rig.audio.played()).toEqual(['dialTone', 'dtmf', 'ringback', 'handshake', 'relayClick']);
  });

  it('leaves only the current stage voice playing after a frame that skips stages (Req 12.1)', () => {
    const rig = createRig();
    const d = drive(rig);

    d.advance(350); // initializing → negotiating, skipping dialing and ringing
    expect(status()).toBe(STATUS.negotiating);
    expect(rig.audio.played()).toEqual(['dialTone', 'handshake']);
    const active = rig.audio.activeVoices();
    expect(active.map((v) => v.name)).toEqual(['handshake']);
    expect(active[0]!.durationSec).toBe(stageTimeLeftSeconds(d.state()));
    expect(active[0]!.durationSec).toBeCloseTo((900 - 350) / 60, 9);

    d.advance(700); // → tick 1050, verifying: silent
    expect(status()).toBe(STATUS.verifying);
    expect(rig.audio.activeVoices()).toEqual([]);

    d.advance(250); // → tick 1300, connected
    expect(rig.audio.activeVoices().map((v) => v.name)).toEqual(['relayClick']);
  });

  it('jumps straight from initializing to connected without leaking a stage voice (Req 12.1, 12.5)', () => {
    const rig = createRig();
    const d = drive(rig);
    d.advance(1300);
    expect(status()).toBe(STATUS.connected);
    expect(rig.audio.played()).toEqual(['dialTone', 'relayClick']);
    expect(rig.audio.activeVoices().map((v) => v.name)).toEqual(['relayClick']);
    // Duration counts from the `connected` event's tick, not from the frame.
    expect(detail()).toBe('Duration: 000:00:01');
  });

  it('counts the connection duration in Run ticks since the connected event (Req 11.4, 11.5)', () => {
    const rig = createRig();
    rig.dialer.open();
    const d = drive(rig);
    d.tickTo(1200);
    expect(status()).toBe(STATUS.connected);
    expect(detail()).toBe('Duration: 000:00:00');
    d.advance(299);
    expect(detail()).toBe('Duration: 000:00:04');
    d.advance(1);
    expect(detail()).toBe('Duration: 000:00:05');
    expectTextOnly(detailEl());

    d.advance(1, [START]);
    expect(d.state().phase).toBe('downloading');
    expect(status()).toBe(STATUS.connected);
    expect(title(rig)).toBe(DIALER_COPY.titles.connected);
    expect(query('.dialer-progress')!.classList.contains('is-connected')).toBe(true);
  });

  it('refuses to hang up: message for 180 Run ticks, window and Run untouched (Req 11.7)', () => {
    const rig = createRig();
    rig.dialer.open();
    const d = drive(rig);
    d.tickTo(400);

    bodyButtons()[0]!.click(); // the progress view's Cancel
    expect(rig.windows.isOpen(DIALER_WINDOW_ID)).toBe(true);
    expect(detail()).toBe(HANG_UP);
    expect(detailEl()!.classList.contains('is-alert')).toBe(true);
    expect(status()).toBe(STATUS.negotiating);
    expectTextOnly(detailEl());

    d.tickTo(400 + 179);
    expect(detail()).toBe(HANG_UP);
    d.advance(1);
    expect(d.state().tick).toBe(400 + 180);
    expect(detail()).toBe('');
    expect(detailEl()!.classList.contains('is-alert')).toBe(false);
    expect(rig.windows.isOpen(DIALER_WINDOW_ID)).toBe(true);
    expect(query('.dialer-progress')).not.toBeNull();

    // The title bar ✕ does the same, and the Run never got a command.
    query<HTMLButtonElement>('.title-bar-close')!.click();
    expect(rig.windows.isOpen(DIALER_WINDOW_ID)).toBe(true);
    expect(detail()).toBe(HANG_UP);
    expect(d.sent).toEqual([]);
    expect(rig.connects()).toBe(0);
  });

  it('shows the duration again once the hang-up message ends while connected (Req 11.4, 11.7)', () => {
    const rig = createRig();
    rig.dialer.open();
    const d = drive(rig);
    d.tickTo(1300);
    rig.windows.requestClose(DIALER_WINDOW_ID);
    expect(detail()).toBe(HANG_UP);
    expect(status()).toBe(STATUS.connected);
    d.advance(180);
    expect(detail()).toBe('Duration: 000:00:04'); // 1,480 − 1,200 = 280 ticks
    expect(rig.windows.isOpen(DIALER_WINDOW_ID)).toBe(true);
  });

  it('shows the terminated text when the Run is lost while dialing (Req 11.6)', () => {
    const rig = createRig();
    rig.dialer.open();
    const d = drive(rig, { systems: [scheduledDamage([{ tick: 5, amount: 100 }])] });
    d.tickTo(10);

    expect(d.state().phase).toBe('lost');
    expect(d.state().tick).toBe(5);
    expect(status()).toBe(STATUS.terminated);
    expect(statusEl()!.classList.contains('is-alert')).toBe(true);
    expect(query('.dialer-progress')!.classList.contains('is-terminated')).toBe(true);
    expect(detail()).toBe('');
    expectTextOnly(statusEl());
    expect(rig.audio.activeVoices()).toEqual([]);
    expect(d.sounds.at(-1)).toEqual({ tick: 5, type: 'stop', name: 'dialTone' });
  });

  it('shows the terminated text without a duration when the Run is lost after connecting (Req 11.6)', () => {
    const rig = createRig();
    rig.dialer.open();
    const d = drive(rig, { systems: [scheduledDamage([{ tick: 1300, amount: 100 }])] });
    d.tickTo(1400);
    expect(d.state().phase).toBe('lost');
    expect(status()).toBe(STATUS.terminated);
    expect(detail()).toBe('');
  });

  it('stops every voice and shows the form again on unmount (Req 10.11, 12.6)', () => {
    const rig = createRig();
    rig.dialer.open();
    const d = drive(rig);
    d.tickTo(400);
    rig.windows.requestClose(DIALER_WINDOW_ID);
    expect(rig.audio.activeVoices().map((v) => v.name)).toEqual(['handshake']);

    rig.dialer.sessionView.unmount();
    expect(rig.audio.activeVoices()).toEqual([]);
    expect(query('.dialer-form')).not.toBeNull();
    expect(query('.dialer-progress')).toBeNull();
    expect(title(rig)).toBe('Connect To');

    // Updates after unmount do nothing.
    d.advance(10);
    expect(query('.dialer-progress')).toBeNull();
    expect(rig.audio.played()).toEqual(['dialTone', 'dtmf', 'ringback', 'handshake']);

    // Idle close rules are back.
    bodyButtons()[1]!.click();
    expect(rig.windows.isOpen(DIALER_WINDOW_ID)).toBe(false);
  });

  it('stops the relay click on unmount and starts fresh on the next Session (Req 12.6)', () => {
    const rig = createRig();
    rig.dialer.open();
    const first = drive(rig);
    first.tickTo(1300);
    rig.windows.requestClose(DIALER_WINDOW_ID);
    rig.dialer.sessionView.unmount();
    expect(rig.audio.activeVoices()).toEqual([]);

    const second = drive(rig);
    expect(status()).toBe(STATUS.initializing);
    expect(detail()).toBe('');
    expect(title(rig)).toBe(DIALER_COPY.titles.dialing);
    expect(rig.audio.activeVoices().map((v) => v.name)).toEqual(['dialTone']);
    second.tickTo(1200);
    expect(detail()).toBe('Duration: 000:00:00');
  });

  it('closes the window and stops its voices on app unmount', () => {
    const rig = createRig();
    rig.dialer.open();
    drive(rig).tickTo(300);
    rig.dialer.unmount();
    expect(rig.windows.isOpen(DIALER_WINDOW_ID)).toBe(false);
    expect(rig.audio.activeVoices()).toEqual([]);
  });
});

/* ---- Integration through createSession ------------------------------------------------------- */

describe('Dialer in a Session', () => {
  it('runs form → Session → connected → form on a manual loop', () => {
    const loop = createManualLoop();
    const lamps: ModemLamp[] = [];
    let session: ReturnType<typeof createSession> | null = null;
    const rig = createRig(() => {
      if (session?.isActive()) return;
      session = createSession({
        seed: 1,
        systems: [],
        views: [rig.dialer.sessionView, trayModemView({ setModem: (lamp) => lamps.push(lamp) })],
        startLoop: loop.start,
      });
      session.start({
        laneHost: document.createElement('div'),
        overlayHost: document.createElement('div'),
        windows: rig.windows,
        audio: rig.audio,
        toScreenPoint: (x, y) => ({ x, y }),
      });
    });
    cleanups.push(() => session?.stop());

    rig.dialer.open();
    bodyButtons()[0]!.click();
    expect(rig.connects()).toBe(1);
    expect(status()).toBe(STATUS.initializing);
    expect(title(rig)).toBe(DIALER_COPY.titles.dialing);

    // 10-tick frames: one 300-tick frame would skip the dialing and ringing stages.
    for (let i = 0; i < 30; i += 1) loop.frame(10);
    expect(status()).toBe(STATUS.negotiating);

    rig.windows.requestClose(DIALER_WINDOW_ID);
    expect(rig.windows.isOpen(DIALER_WINDOW_ID)).toBe(true);
    expect(detail()).toBe(HANG_UP);
    loop.frame(179);
    expect(detail()).toBe(HANG_UP);
    loop.frame(1);
    expect(detail()).toBe('');

    loop.frame(1200 - 480);
    expect(status()).toBe(STATUS.connected);
    loop.frame(300);
    expect(detail()).toBe('Duration: 000:00:05');
    expect(title(rig)).toBe(DIALER_COPY.titles.connected);
    expect(rig.audio.played()).toEqual(['dialTone', 'dtmf', 'ringback', 'handshake', 'relayClick']);
    expect(lamps).toEqual(['blink', 'on']);

    session!.stop();
    expect(rig.audio.activeVoices()).toEqual([]);
    expect(lamps.at(-1)).toBe('off');
    expect(query('.dialer-form')).not.toBeNull();
    expect(title(rig)).toBe('Connect To');
    bodyButtons()[1]!.click();
    expect(rig.windows.isOpen(DIALER_WINDOW_ID)).toBe(false);
  });

  it('returns to the form when the Run is lost', () => {
    const loop = createManualLoop();
    const rig = createRig();
    const finals: GameState[] = [];
    rig.dialer.open();
    const session = createSession({
      seed: 1,
      systems: [scheduledDamage([{ tick: 5, amount: 100 }])],
      views: [rig.dialer.sessionView],
      startLoop: loop.start,
      onEnd: (final) => finals.push(final),
    });
    session.start({
      laneHost: document.createElement('div'),
      overlayHost: document.createElement('div'),
      windows: rig.windows,
      audio: rig.audio,
      toScreenPoint: (x, y) => ({ x, y }),
    });
    loop.frame(10);

    expect(finals.map((s) => s.phase)).toEqual(['lost']);
    expect(loop.isRunning()).toBe(false);
    expect(rig.audio.activeVoices()).toEqual([]);
    expect(query('.dialer-form')).not.toBeNull();
    expect(title(rig)).toBe('Connect To');
  });
});
