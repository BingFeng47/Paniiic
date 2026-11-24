// Full shell flow through the real Scene_Director and buildSceneFactories, with a fake monitor,
// fake audio and a manual loop: power off → title → boot → desktop → shutdown → power off, twice
// (Req 1.1–1.5, 3.5; title-and-endings Req 1.1–1.8).
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { AudioEngine } from '../../src/core/audio';
import { createSceneDirector, type SceneDirector } from '../../src/core/scene';
import type { System } from '../../src/game/context';
import { buildSceneFactories } from '../../src/scenes';
import { createFakeAudioEngine, type FakeAudioEngine } from '../helpers/audio';
import { fakeMonitor, trackListeners, type FakeMonitor, type ListenerTracker } from '../helpers/dom';
import { scheduledDamage } from '../helpers/game';
import { createManualLoop, type ManualLoop } from '../helpers/loop';

/** 8,000 ms of boot and 4,000 ms of shutdown at 60 ticks per second. */
const BOOT_TICKS = 480;
const SHUTDOWN_TICKS = 240;
/** The title's 600 ms theme fade between Play and the boot. */
const TITLE_FADE_TICKS = 36;
/** The real loop never hands over more than 15 ticks per frame; deliver ticks the same way. */
const MAX_FRAME_TICKS = 15;

interface Shell {
  readonly director: SceneDirector;
  readonly monitor: FakeMonitor;
  readonly audio: FakeAudioEngine;
  readonly loop: ManualLoop;
  /** Run `n` ticks in frames of at most 15. */
  deliver(n: number): void;
  /** Class names of the scene elements currently inside the Screen. */
  scenes(): string[];
}

let doc: ListenerTracker;
let win: ListenerTracker;
let shells: Shell[] = [];

beforeEach(() => {
  document.body.replaceChildren();
  doc = trackListeners(document);
  win = trackListeners(window);
  shells = [];
});

afterEach(() => {
  for (const shell of shells) shell.director.stop();
  doc.restore();
  win.restore();
  document.body.replaceChildren();
});

interface ShellOptions {
  /** Registry systems for every Session's Run; none when absent. */
  readonly systems?: readonly System[];
}

function startShell(options: ShellOptions = {}): Shell {
  const monitor = fakeMonitor();
  document.body.appendChild(monitor.screen);
  // Locked at first, like the real engine before the power-on click.
  const audio = createFakeAudioEngine({ unlocked: false });
  const loop = createManualLoop();
  const factories = buildSceneFactories({
    monitor,
    audio: audio as unknown as AudioEngine,
    startLoop: loop.start,
    seedSource: () => 1,
    registry: { views: [], systems: options.systems ?? [] },
  });
  const director = createSceneDirector(monitor.screen, factories);
  director.start();
  const deliver = (n: number): void => {
    for (let left = n; left > 0; left -= MAX_FRAME_TICKS) loop.frame(Math.min(MAX_FRAME_TICKS, left));
  };
  const scenes = () => [...monitor.screen.children].map((c) => c.className);
  const shell = { director, monitor, audio, loop, deliver, scenes };
  shells.push(shell);
  return shell;
}

const q = <T extends HTMLElement = HTMLElement>(root: ParentNode, selector: string): T => {
  const el = root.querySelector<T>(selector);
  if (!el) throw new Error(`no element matches ${selector}`);
  return el;
};

/** Press the power button and check that nothing at all changes. */
function expectPowerIgnored(shell: Shell): void {
  const before = {
    scene: shell.director.current(),
    dom: shell.monitor.screen.innerHTML,
    led: shell.monitor.led(),
    loops: shell.loop.startCount(),
    audioLog: shell.audio.log.length,
  };
  expect(shell.monitor.hasPowerHandler()).toBe(false);
  shell.monitor.pressPower();
  expect({
    scene: shell.director.current(),
    dom: shell.monitor.screen.innerHTML,
    led: shell.monitor.led(),
    loops: shell.loop.startCount(),
    audioLog: shell.audio.log.length,
  }).toEqual(before);
}

/** From the title screen: click Play and run the 36-tick theme fade to the boot. */
function playToBoot(shell: Shell): void {
  expect(shell.director.current()).toBe('title');
  q(shell.monitor.screen, '.scene-title');
  q(shell.monitor.screen, '.title-play').click();
  shell.deliver(TITLE_FADE_TICKS);
  expect(shell.director.current()).toBe('boot');
}

/** From the power off scene: power on, Play on the title screen and run the boot to the desktop. */
function powerOnToDesktop(shell: Shell): void {
  expect(shell.director.current()).toBe('powerOff');
  shell.monitor.pressPower();
  playToBoot(shell);
  shell.deliver(BOOT_TICKS);
  expect(shell.director.current()).toBe('desktop');
}

/** From the desktop: Start → Shut Down... and run the shutdown to power off. */
function shutDownToPowerOff(shell: Shell): void {
  const screen = shell.monitor.screen;
  q(screen, '.start-button').click();
  q(screen, '.start-menu [data-item-id="shutDown"]').click();
  expect(shell.director.current()).toBe('shutdown');
  shell.deliver(SHUTDOWN_TICKS);
  expect(shell.director.current()).toBe('powerOff');
}

describe('shell flow', () => {
  it('starts in the power off scene with the LED in standby (Req 1.1)', () => {
    const { director, monitor, audio, loop, scenes } = startShell();
    expect(director.current()).toBe('powerOff');
    expect(scenes()).toEqual(['scene scene-power-off']);
    expect(monitor.led()).toBe('standby');
    expect(monitor.hasPowerHandler()).toBe(true);
    expect(audio.isUnlocked()).toBe(false);
    expect(loop.startCount()).toBe(0);
  });

  it('runs power button → title → Play → boot → desktop → Shut Down... → power off (Req 1.2–1.5)', () => {
    const shell = startShell();
    const { director, monitor, audio, loop, deliver, scenes } = shell;

    // Power button: audio unlocks inside the press, then the title mounts (Req 1.2, 3.2;
    // title-and-endings Req 1.1).
    monitor.pressPower();
    expect(audio.log[0]).toEqual({ type: 'unlock', result: true });
    expect(director.current()).toBe('title');
    expect(scenes()).toEqual(['scene scene-title crt-on']);

    // Play, then the 36-tick theme fade, then the boot mounts (title-and-endings Req 1.2).
    q(monitor.screen, '.title-play').click();
    deliver(TITLE_FADE_TICKS);
    expect(director.current()).toBe('boot');
    expect(scenes()).toEqual(['scene scene-boot crt-on']);
    expect(monitor.led()).toBe('on');
    expect(loop.startCount()).toBe(2);

    // The boot runs for exactly 480 ticks (Req 1.3).
    deliver(BOOT_TICKS - 1);
    expect(director.current()).toBe('boot');
    expect(audio.played().slice(1, 3)).toEqual(['crtThunk', 'postBeep']);
    loop.frame(1);
    expect(director.current()).toBe('desktop');
    expect(scenes()).toEqual(['scene scene-desktop']);
    expect(audio.played().at(-1)).toBe('startupChime');
    // The boot loop and its voices stopped with the boot scene.
    expect(loop.isRunning()).toBe(false);
    expect(audio.activeVoices().map((v) => v.name)).toEqual(['startupChime']);

    // Start → Shut Down... (Req 1.4).
    q(monitor.screen, '.start-button').click();
    q(monitor.screen, '.start-menu [data-item-id="shutDown"]').click();
    expect(director.current()).toBe('shutdown');
    expect(scenes()).toEqual(['scene scene-shutdown']);
    expect(audio.activeVoices()).toEqual([]);
    expect(loop.startCount()).toBe(3);

    // The shutdown runs for exactly 240 ticks, then the power off scene is back (Req 1.5).
    deliver(SHUTDOWN_TICKS - 1);
    expect(director.current()).toBe('shutdown');
    loop.frame(1);
    expect(director.current()).toBe('powerOff');
    expect(scenes()).toEqual(['scene scene-power-off']);
    expect(monitor.led()).toBe('standby');
    expect(monitor.hasPowerHandler()).toBe(true);
    expect(loop.isRunning()).toBe(false);
    // Nothing from the earlier scenes is left listening.
    expect(doc.attached()).toEqual([]);
    expect(win.attached()).toEqual([]);
  });

  it('ignores the power button on the title screen (title-and-endings Req 2.6, 1.6)', () => {
    const shell = startShell();
    shell.monitor.pressPower();
    expect(shell.director.current()).toBe('title');
    expectPowerIgnored(shell);
    // Still ignored while the theme keeps looping, and the title is not left without Play.
    shell.deliver(120);
    expectPowerIgnored(shell);
    expect(shell.director.current()).toBe('title');
    // Play still works afterwards.
    playToBoot(shell);
  });

  it('stays on the title screen through Options and Escape (title-and-endings Req 1.6, 1.7)', () => {
    const shell = startShell();
    const screen = shell.monitor.screen;
    shell.monitor.pressPower();
    expect(shell.director.current()).toBe('title');

    // Options opens the dialog and raises no scene signal.
    q(screen, '.title-options').click();
    q(screen, '.scene-title .options-dialog');
    shell.deliver(120);
    expect(shell.director.current()).toBe('title');
    expect(shell.scenes()).toEqual(['scene scene-title crt-on']);

    // Escape closes the dialog and still leaves the title mounted.
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(screen.querySelector('.options-dialog')).toBeNull();
    shell.deliver(120);
    expect(shell.director.current()).toBe('title');
    expect(shell.scenes()).toEqual(['scene scene-title crt-on']);

    // A second Escape with no dialog open does nothing either.
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    shell.deliver(60);
    expect(shell.director.current()).toBe('title');

    // Play is the way out.
    playToBoot(shell);
  });

  it('shows the title screen again after power off → title → boot → desktop → shutdown → power off (title-and-endings Req 1.1, 1.8)', () => {
    const shell = startShell();
    powerOnToDesktop(shell);
    shutDownToPowerOff(shell);
    expect(shell.scenes()).toEqual(['scene scene-power-off']);

    shell.monitor.pressPower();
    expect(shell.director.current()).toBe('title');
    expect(shell.scenes()).toEqual(['scene scene-title crt-on']);
    // The title's theme starts again on the Music_Channel.
    const theme = shell.audio.activeVoices().filter((v) => v.name === 'themeSong');
    expect(theme).toHaveLength(1);
    expect(theme[0]!.channel).toBe('music');
    playToBoot(shell);
  });

  it('during the boot, the power button opens a dimmed confirm that pauses and can go back to the title', () => {
    const shell = startShell();
    shell.monitor.pressPower();
    playToBoot(shell);
    shell.deliver(BOOT_TICKS / 2);
    shell.monitor.pressPower();
    const screen = shell.monitor.screen;
    q(screen, '.power-confirm');
    expect(q(screen, '.scene-boot').hasAttribute('inert')).toBe(true);
    // Paused: the boot does not finish while the dialog is open.
    shell.deliver(BOOT_TICKS);
    expect(shell.director.current()).toBe('boot');
    // No closes the dialog and the boot carries on where it stopped.
    q(screen, '.power-confirm-no').click();
    expect(screen.querySelector('.power-confirm')).toBeNull();
    expect(q(screen, '.scene-boot').hasAttribute('inert')).toBe(false);
    shell.deliver(BOOT_TICKS / 2);
    expect(shell.director.current()).toBe('desktop');
  });

  it('Yes on the power confirm goes back to the title screen', () => {
    const shell = startShell();
    shell.monitor.pressPower();
    playToBoot(shell);
    shell.monitor.pressPower();
    q(shell.monitor.screen, '.power-confirm-yes').click();
    expect(shell.director.current()).toBe('title');
    expect(shell.monitor.screen.querySelector('.power-confirm')).toBeNull();
    expect(shell.monitor.hasPowerHandler()).toBe(false);
  });

  it('during a Session, the power confirm pauses the run and Yes leaves for the title', () => {
    const shell = startShell();
    powerOnToDesktop(shell);
    const screen = shell.monitor.screen;
    q(screen, '.desktop-icon[data-app="dialer"]').dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    q(screen, '.dialer-form .btn-default').click();
    shell.deliver(60);
    shell.monitor.pressPower();
    q(screen, '.power-confirm');
    // Escape counts as No.
    q(screen, '.power-confirm').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(screen.querySelector('.power-confirm')).toBeNull();
    shell.monitor.pressPower();
    q(screen, '.power-confirm-yes').click();
    expect(shell.director.current()).toBe('title');
  });

  it('ignores the power button during the shutdown (Req 3.5)', () => {
    const shell = startShell();
    powerOnToDesktop(shell);
    const screen = shell.monitor.screen;
    q(screen, '.start-button').click();
    q(screen, '.start-menu [data-item-id="shutDown"]').click();
    expectPowerIgnored(shell);
    shell.deliver(SHUTDOWN_TICKS / 2);
    expectPowerIgnored(shell);
    shell.deliver(SHUTDOWN_TICKS / 2);
    expect(shell.director.current()).toBe('powerOff');
  });

  it('powers on again after a shutdown and runs the whole flow a second time', () => {
    const shell = startShell();
    powerOnToDesktop(shell);
    shutDownToPowerOff(shell);

    powerOnToDesktop(shell);
    expect(shell.scenes()).toEqual(['scene scene-desktop']);
    expect(shell.audio.played().filter((name) => name === 'startupChime')).toHaveLength(2);
    shutDownToPowerOff(shell);
    expect(shell.loop.startCount()).toBe(6);
    expect(shell.loop.isRunning()).toBe(false);
  });

  /** From the desktop: dial, lose the Run at tick 5 and wait for the lose reveal. */
  function loseRun(shell: Shell): { desktop: HTMLElement; overlay: HTMLElement } {
    const { director, audio, loop, deliver, scenes } = shell;
    const screen = shell.monitor.screen;
    const desktop = q(screen, '.scene-desktop');
    const startsBefore = loop.startCount();

    // Connect from the dialer icon.
    q(screen, '.desktop-icon[data-app="dialer"]').dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    q(screen, '.dialer-form .btn-default').click();
    expect(desktop.classList.contains('is-session')).toBe(true);
    expect(loop.startCount()).toBe(startsBefore + 1);

    // The Run is lost: the lose screen covers the desktop, which stays the mounted scene.
    deliver(MAX_FRAME_TICKS);
    loop.frame(30); // juice-and-endings End_Transition
    expect(director.current()).toBe('desktop');
    expect(scenes()).toEqual(['scene scene-desktop']);
    expect(desktop.classList.contains('is-session')).toBe(false);
    const overlay = q(desktop, '.result-screen.is-lost');
    expect(desktop.lastElementChild).toBe(overlay);
    expect(loop.startCount()).toBe(startsBefore + 2); // the Result_Screen runs on the shell's loop
    expect(audio.activeVoices().map((v) => v.name)).toEqual(
      expect.arrayContaining(['modemScreech', 'staticHiss']),
    );

    // The lose reveal at 1,500 ms focuses Retry.
    deliver(90);
    expect(document.activeElement).toBe(q(overlay, '.result-retry'));
    expect(q(overlay, '.result-file-name').textContent).toBe('SKELETON_DATING_SIM.EXE');
    return { desktop, overlay };
  }

  it('shows the lose screen when a Run ends and Main menu returns to the title (title-and-endings Req 8.1; replay-flow Req 3.3, 3.4, 4.2, 5.2)', () => {
    // A registry system ends every Run at tick 5 with 100 modem damage.
    const shell = startShell({ systems: [scheduledDamage([{ tick: 5, amount: 100 }])] });
    const { director, audio, loop, scenes } = shell;
    powerOnToDesktop(shell);
    const { overlay } = loseRun(shell);
    const startsBefore = loop.startCount();

    q<HTMLButtonElement>(overlay, '.result-main-menu').click();

    // The title is mounted, exactly as on power-on: theme on the Music_Channel, Play focused.
    expect(director.current()).toBe('title');
    expect(scenes()).toEqual(['scene scene-title crt-on']);
    expect(shell.monitor.screen.querySelector('.scene-desktop')).toBeNull();
    expect(document.activeElement).toBe(q(shell.monitor.screen, '.title-play'));
    const names = audio.activeVoices().map((v) => v.name);
    expect(names).toEqual(['themeSong']);
    expect(audio.activeVoices()[0]!.channel).toBe('music');
    // Only the title's loop runs; the desktop left no document or window listeners behind.
    expect(loop.startCount()).toBe(startsBefore + 1);
    expect(loop.isRunning()).toBe(true);
    expect(doc.attached()).toEqual([]);
    expect(win.attached()).toEqual([]);

    // Play runs the full boot back to the desktop.
    playToBoot(shell);
    shell.deliver(BOOT_TICKS);
    expect(director.current()).toBe('desktop');
    expect(scenes()).toEqual(['scene scene-desktop']);
  });

  it('Retry after a loss dials again at once without a boot (replay-flow Req 2.1)', () => {
    const shell = startShell({ systems: [scheduledDamage([{ tick: 5, amount: 100 }])] });
    const { director, audio, loop } = shell;
    powerOnToDesktop(shell);
    const { desktop, overlay } = loseRun(shell);
    const chimes = audio.played().filter((n) => n === 'startupChime').length;
    const startsBefore = loop.startCount();

    q<HTMLButtonElement>(overlay, '.result-retry').click();

    expect(director.current()).toBe('desktop');
    expect(q(shell.monitor.screen, '.scene-desktop')).toBe(desktop);
    expect(desktop.querySelector('.result-screen')).toBeNull();
    expect(desktop.querySelectorAll('[inert]')).toHaveLength(0);
    expect(desktop.classList.contains('is-session')).toBe(true);
    expect(shell.monitor.screen.querySelector('.dialer-progress')).not.toBeNull();
    expect(loop.startCount()).toBe(startsBefore + 1);
    expect(loop.isRunning()).toBe(true);
    const names = audio.activeVoices().map((v) => v.name);
    expect(names).not.toContain('modemScreech');
    expect(names).not.toContain('staticHiss');
    // No boot: no second startup chime, the scene never left the desktop.
    expect(audio.played().filter((n) => n === 'startupChime')).toHaveLength(chimes);
  });

  it('stop() tears the shell down from any scene and leaves nothing running', () => {
    const shell = startShell();
    powerOnToDesktop(shell);
    q(shell.monitor.screen, '.start-button').click(); // the open menu holds document listeners
    shell.director.stop();
    expect(shell.monitor.screen.children).toHaveLength(0);
    expect(shell.loop.isRunning()).toBe(false);
    expect(shell.audio.activeVoices()).toEqual([]);
    expect(doc.attached()).toEqual([]);
    expect(win.attached()).toEqual([]);
  });
});
