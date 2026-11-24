// Title_Scene examples (title-and-endings design "Testing Strategy", Req 1.6, 2.1–2.5, 3.1, 3.2,
// 3.5, 3.7, 3.9, 4.6, 4.7, 12.2).
import { afterEach, describe, expect, it } from 'vitest';
import type { Scene } from '../../../src/core/scene';
import { createSettingsStore } from '../../../src/core/settings';
import { createTitleScene } from '../../../src/scenes/title/titleScene';
import { THEME_SCORE, passTicks } from '../../../src/scenes/title/themeScore';
import { themeSong } from '../../../src/scenes/title/themeSong';
import { OPTIONS_COPY, TITLE_COPY } from '../../../src/scenes/title/titleCopy';
import { THEME_FADE_TICKS } from '../../../src/scenes/title/titleModel';
import { createFakeAudioEngine, type FakeAudioEngineOptions } from '../../helpers/audio';
import { trackListeners, type ListenerTracker } from '../../helpers/dom';
import { createManualLoop } from '../../helpers/loop';
import { createFakeStorage } from '../../helpers/storage';

const noWarn = (): void => {};

let trackers: ListenerTracker[] = [];
const hosts: HTMLElement[] = [];
const scenes: Scene[] = [];

afterEach(() => {
  for (const s of scenes.splice(0)) s.unmount();
  for (const t of trackers.reverse()) t.restore();
  trackers = [];
  for (const host of hosts.splice(0)) host.remove();
});

/** Mounts a Title_Scene into a root attached to `document.body` (focus needs it). */
function setup(audioOptions: FakeAudioEngineOptions = {}) {
  const doc = trackListeners(document);
  const win = trackListeners(window);
  trackers.push(doc, win);
  const root = document.createElement('div');
  document.body.appendChild(root);
  hosts.push(root);

  const audio = createFakeAudioEngine(audioOptions);
  const settings = createSettingsStore({ storage: createFakeStorage().getter, warn: noWarn });
  const loop = createManualLoop();
  const signals: string[] = [];
  const scene = createTitleScene({ audio, settings, signal: (s) => signals.push(s), startLoop: loop.start });
  scene.mount(root);
  scenes.push(scene);

  const q = <T extends Element>(selector: string): T => {
    const el = root.querySelector<T>(selector);
    if (el === null) throw new Error(`missing ${selector}`);
    return el;
  };
  return {
    root,
    doc,
    win,
    audio,
    loop,
    scene,
    signals,
    play: q<HTMLButtonElement>('.title-play'),
    options: q<HTMLButtonElement>('.title-options'),
    menu: q<HTMLElement>('.title-menu'),
    q,
  };
}

const fadeOuts = (audio: ReturnType<typeof createFakeAudioEngine>) =>
  audio.log.filter((e) => e.type === 'fadeOut');
const stops = (audio: ReturnType<typeof createFakeAudioEngine>) => audio.log.filter((e) => e.type === 'stop');

describe('Title_Scene', () => {
  it('builds the title card in order with the copy, the CRT effect and focus on Play (Req 2.1, 2.2)', () => {
    const t = setup();
    const el = t.q<HTMLElement>('.scene.scene-title');
    expect(el.classList.contains('crt-on')).toBe(true);
    expect(t.root.children).toHaveLength(1);

    expect([...el.children].map((c) => c.className)).toEqual(['title-night', 'title-card']);
    expect(el.querySelector('.title-night')?.getAttribute('aria-hidden')).toBe('true');

    const card = t.q<HTMLElement>('.title-card');
    expect([...card.children].map((c) => `${c.tagName.toLowerCase()}.${c.className}`)).toEqual([
      'h1.title-wordmark',
      'p.title-subtitle',
      'div.title-menu',
      'p.title-hint',
      'p.title-copyright',
    ]);
    const wordmark = t.q<HTMLElement>('.title-wordmark');
    expect(wordmark.textContent).toBe(TITLE_COPY.wordmark);
    expect(wordmark.dataset.text).toBe(TITLE_COPY.wordmark);
    expect(t.q('.title-subtitle').textContent).toBe(TITLE_COPY.subtitle);
    expect(t.q('.title-hint').textContent).toBe(TITLE_COPY.hint);
    expect(t.q('.title-copyright').textContent).toBe(TITLE_COPY.copyright);

    expect([...t.menu.children]).toEqual([t.play, t.options]);
    for (const [button, text] of [
      [t.play, TITLE_COPY.play],
      [t.options, TITLE_COPY.options],
    ] as const) {
      expect(button.tagName).toBe('BUTTON');
      expect(button.type).toBe('button');
      expect(button.textContent).toBe(text);
    }
    expect(document.activeElement).toBe(t.play);
  });

  it('plays the theme on the Music_Channel for one 24 s pass on mount (Req 3.1)', () => {
    const t = setup();
    expect(t.audio.voices).toHaveLength(1);
    const [voice] = t.audio.voices;
    expect(voice?.recipe).toBe(themeSong);
    expect(voice?.name).toBe('themeSong');
    expect(voice?.channel).toBe('music');
    expect(voice?.durationSec).toBe(24);
    expect(t.loop.isRunning()).toBe(true);
  });

  it('starts the next pass at tick 1,440 and not at 1,439 (Req 3.2)', () => {
    const t = setup();
    expect(passTicks(THEME_SCORE)).toBe(1440);
    t.loop.frame(1439);
    expect(t.audio.voices).toHaveLength(1);
    t.loop.frame(1);
    expect(t.audio.voices).toHaveLength(2);
    const second = t.audio.voices[1];
    expect(second?.recipe).toBe(themeSong);
    expect(second?.channel).toBe('music');
    expect(second?.durationSec).toBe(24);
    t.loop.frame(0);
    expect(t.audio.voices).toHaveLength(2);
  });

  it('fades the theme over 0.6 s on Play and signals play after 36 ticks, not 35 (Req 3.5, 1.6)', () => {
    const t = setup({ fades: 'manual' });
    expect(THEME_FADE_TICKS).toBe(36);
    t.play.click();
    expect(fadeOuts(t.audio)).toEqual([{ type: 'fadeOut', id: 0, name: 'themeSong', durationSec: 0.6 }]);
    expect(t.signals).toEqual([]);

    t.loop.frame(35);
    expect(t.signals).toEqual([]);
    expect(t.loop.isRunning()).toBe(true);
    t.loop.frame(1);
    expect(t.signals).toEqual(['play']);
    expect(t.loop.isRunning()).toBe(false);

    t.loop.frame(100);
    expect(t.signals).toEqual(['play']);
  });

  it('starts no new pass once Play is pressed', () => {
    const t = setup({ fades: 'manual' });
    t.loop.frame(1430);
    t.play.click();
    t.loop.frame(20); // crosses the 1,440 boundary during the fade
    expect(t.audio.voices).toHaveLength(1);
  });

  it('ignores a second Play and an Options click during the fade (Req 2.4)', () => {
    const t = setup({ fades: 'manual' });
    t.play.click();
    t.play.click();
    t.options.click();
    expect(fadeOuts(t.audio)).toHaveLength(1);
    expect(t.root.querySelector('.options-backdrop')).toBeNull();

    t.loop.frame(36);
    expect(t.signals).toEqual(['play']);
  });

  it('ignores Play while Options is open (Req 2.5)', () => {
    const t = setup();
    t.options.click();
    expect(t.root.querySelector('.options-backdrop')).not.toBeNull();
    expect(t.menu.hasAttribute('inert')).toBe(true);

    t.play.click();
    t.loop.frame(100);
    expect(t.signals).toEqual([]);
    expect(fadeOuts(t.audio)).toEqual([]);
    expect(t.root.querySelector('.options-backdrop')).not.toBeNull();
  });

  it('keeps the theme playing and looping while Options is open (Req 4.7)', () => {
    const t = setup();
    t.options.click();
    expect(stops(t.audio)).toEqual([]);
    expect(fadeOuts(t.audio)).toEqual([]);
    expect(t.audio.voices[0]?.stopped()).toBe(false);

    t.loop.frame(1440);
    expect(t.audio.voices).toHaveLength(2);
    expect(t.audio.voices[1]?.channel).toBe('music');
  });

  it('closes Options, drops inert and focuses the Options button; Play then works (Req 4.6)', () => {
    const t = setup();
    t.options.click();
    t.q<HTMLButtonElement>('.options-buttons button').click();
    expect(t.root.querySelector('.options-backdrop')).toBeNull();
    expect(t.menu.hasAttribute('inert')).toBe(false);
    expect(document.activeElement).toBe(t.options);

    t.options.click();
    expect(t.q('.title-bar-text').textContent).toBe(OPTIONS_COPY.title);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(t.root.querySelector('.options-backdrop')).toBeNull();
    expect(document.activeElement).toBe(t.options);

    t.play.click();
    t.loop.frame(36);
    expect(t.signals).toEqual(['play']);
  });

  it('stops the theme on unmount without a fade (Req 3.7, 12.2)', () => {
    const t = setup();
    t.loop.frame(1440);
    t.scene.unmount();
    expect(t.audio.activeVoices()).toEqual([]);
    expect(t.loop.isRunning()).toBe(false);
    expect(t.root.children).toHaveLength(0);
  });

  it('leaves a fading theme Voice to the engine on unmount (Req 3.7, 12.2)', () => {
    const t = setup({ fades: 'manual' });
    t.play.click();
    t.loop.frame(36);
    t.scene.unmount();
    expect(stops(t.audio)).toEqual([]);
    expect(t.audio.voices[0]?.fading()).toBe(true);

    t.audio.finishFades();
    expect(t.audio.activeVoices()).toEqual([]);
  });

  it('accepts Play and Options without sound when audio is unavailable (Req 3.9)', () => {
    const t = setup({ available: false, unlocked: false });
    expect(t.q('.title-wordmark').textContent).toBe(TITLE_COPY.wordmark);
    t.options.click();
    expect(t.root.querySelector('.options-backdrop')).not.toBeNull();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    t.play.click();
    t.loop.frame(36);
    expect(t.signals).toEqual(['play']);
  });

  it('leaves no document or window listeners after unmount, with Options open (Req 12.2)', () => {
    const t = setup();
    t.options.click();
    expect(t.doc.count('keydown')).toBe(1);
    t.scene.unmount();
    expect(t.doc.count()).toBe(0);
    expect(t.win.count()).toBe(0);
    expect(t.root.children).toHaveLength(0);
    expect(t.loop.isRunning()).toBe(false);
  });

  it('does nothing on frames or clicks after unmount', () => {
    const t = setup();
    const { play } = t;
    t.scene.unmount();
    play.click();
    t.loop.frame(2000);
    expect(t.signals).toEqual([]);
    expect(t.audio.voices).toHaveLength(1);
  });
});
