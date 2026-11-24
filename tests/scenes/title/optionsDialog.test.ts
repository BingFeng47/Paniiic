// Options_Dialog examples (title-and-endings design "Testing Strategy", Req 4.1–4.6, 12.2).
import { afterEach, describe, expect, it } from 'vitest';
import type { Mountable } from '../../../src/core/scene';
import {
  STORAGE_KEY,
  bindAudioSettings,
  createSettingsStore,
  parseSettings,
  serializeSettings,
  type SettingsStore,
} from '../../../src/core/settings';
import { createOptionsDialog } from '../../../src/scenes/title/optionsDialog';
import { OPTIONS_COPY } from '../../../src/scenes/title/titleCopy';
import { createFakeAudioEngine } from '../../helpers/audio';
import { trackListeners, type ListenerTracker } from '../../helpers/dom';
import { createFakeStorage, type FakeStorage } from '../../helpers/storage';

type FlagKey = 'musicEnabled' | 'sfxEnabled' | 'screenShake' | 'hintsEnabled';
const FLAG_KEYS: readonly FlagKey[] = ['musicEnabled', 'sfxEnabled', 'screenShake', 'hintsEnabled'];

const noWarn = (): void => {};

let trackers: ListenerTracker[] = [];
const hosts: HTMLElement[] = [];
const dialogs: Mountable[] = [];

afterEach(() => {
  for (const d of dialogs.splice(0)) d.unmount();
  for (const t of trackers.reverse()) t.restore();
  trackers = [];
  for (const host of hosts.splice(0)) host.remove();
});

/** Store holding 60 / music off / sfx on / shake off, backed by a working fake storage. */
function seededStore(): { store: SettingsStore; storage: FakeStorage } {
  const storage = createFakeStorage({
    initial: serializeSettings({ masterVolume: 60, musicEnabled: false, sfxEnabled: true, screenShake: false, hintsEnabled: false }),
  });
  return { store: createSettingsStore({ storage: storage.getter, warn: noWarn }), storage };
}

/** Mounts the dialog into a root attached to `document.body` (focus and bubbling need it). */
function setup() {
  const { store, storage } = seededStore();
  const root = document.createElement('div');
  document.body.appendChild(root);
  hosts.push(root);
  const doc = trackListeners(document);
  trackers.push(doc);
  let closes = 0;
  const dialog = createOptionsDialog({ settings: store, onClose: () => (closes += 1) });
  dialog.mount(root);
  dialogs.push(dialog);

  const q = <T extends Element>(selector: string): T => {
    const el = root.querySelector<T>(selector);
    if (el === null) throw new Error(`missing ${selector}`);
    return el;
  };
  return {
    store,
    storage,
    root,
    doc,
    dialog,
    closes: () => closes,
    slider: q<HTMLInputElement>('input#options-volume'),
    volumeValue: q<HTMLElement>('.options-volume-value'),
    box: (key: FlagKey) => q<HTMLInputElement>(`input[type=checkbox][data-setting=${key}]`),
    okButton: q<HTMLButtonElement>('.options-buttons button'),
    closeButton: q<HTMLButtonElement>('.title-bar-close'),
  };
}

function pressEscape(): void {
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
}

describe('Options_Dialog', () => {
  it('shows the stored Settings in the controls on mount (Req 4.1)', () => {
    const t = setup();
    expect(t.slider.type).toBe('range');
    expect(t.slider.min).toBe('0');
    expect(t.slider.max).toBe('100');
    expect(t.slider.step).toBe('10');
    expect(t.slider.value).toBe('60');
    expect(t.volumeValue.textContent).toBe('60%');
    expect(t.slider.getAttribute('aria-valuetext')).toBe('60%');
    expect(t.box('musicEnabled').checked).toBe(false);
    expect(t.box('sfxEnabled').checked).toBe(true);
    expect(t.box('screenShake').checked).toBe(false);
    expect(t.box('hintsEnabled').checked).toBe(false);

    const labels = [...t.root.querySelectorAll('label.options-check')].map((l) => l.textContent);
    expect(labels).toEqual([OPTIONS_COPY.music, OPTIONS_COPY.sfx, OPTIONS_COPY.shake, OPTIONS_COPY.hints]);
    const dialogEl = t.root.querySelector('.options-dialog');
    expect(dialogEl?.getAttribute('role')).toBe('dialog');
    expect(dialogEl?.getAttribute('aria-modal')).toBe('true');
  });

  it('moves focus to the Volume_Slider on mount (Req 4.2)', () => {
    const t = setup();
    expect(document.activeElement).toBe(t.slider);
  });

  it('stores a slider input, shows the new percentage and updates audio inside the same event (Req 4.3, 4.5)', () => {
    const t = setup();
    const engine = createFakeAudioEngine();
    bindAudioSettings(engine, t.store);
    expect(engine.mix().volume).toBe(60);

    // Registered after the dialog's own listener, so it runs later in the same dispatch.
    let volumeDuringEvent: number | null = null;
    t.slider.addEventListener('input', () => {
      volumeDuringEvent = engine.mix().volume;
    });

    t.slider.value = '30';
    t.slider.dispatchEvent(new Event('input', { bubbles: true }));

    expect(volumeDuringEvent).toBe(30);
    expect(t.store.get().masterVolume).toBe(30);
    expect(parseSettings(t.storage.stored(STORAGE_KEY)).masterVolume).toBe(30);
    expect(t.volumeValue.textContent).toBe('30%');
    expect(t.slider.getAttribute('aria-valuetext')).toBe('30%');
  });

  it.each(FLAG_KEYS)('stores the %s checkbox state on change (Req 4.4)', (key) => {
    const t = setup();
    const before = t.store.get();
    const box = t.box(key);

    box.checked = !before[key];
    box.dispatchEvent(new Event('change', { bubbles: true }));
    expect(t.store.get()[key]).toBe(!before[key]);
    expect(parseSettings(t.storage.stored(STORAGE_KEY))[key]).toBe(!before[key]);

    // The other Settings are untouched.
    for (const other of FLAG_KEYS.filter((k) => k !== key)) expect(t.store.get()[other]).toBe(before[other]);
    expect(t.store.get().masterVolume).toBe(60);

    box.checked = before[key];
    box.dispatchEvent(new Event('change', { bubbles: true }));
    expect(t.store.get()[key]).toBe(before[key]);
  });

  it('calls onClose for OK, the close button and Escape (Req 4.6)', () => {
    const t = setup();
    expect(t.okButton.textContent).toBe(OPTIONS_COPY.ok);
    t.okButton.click();
    expect(t.closes()).toBe(1);

    expect(t.closeButton.getAttribute('aria-label')).toBe(OPTIONS_COPY.close);
    t.closeButton.click();
    expect(t.closes()).toBe(2);

    pressEscape();
    expect(t.closes()).toBe(3);
  });

  it('ignores keys other than Escape', () => {
    const t = setup();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(t.closes()).toBe(0);
  });

  it('keeps a document keydown listener only while mounted and removes its elements on unmount (Req 12.2)', () => {
    const t = setup();
    expect(t.doc.count('keydown')).toBe(1);

    t.dialog.unmount();
    expect(t.doc.count()).toBe(0);
    expect(t.root.querySelector('.options-backdrop')).toBeNull();
    expect(t.closes()).toBe(0); // unmount does not call onClose

    pressEscape();
    expect(t.closes()).toBe(0);
  });

  it('reads the current Settings again when mounted a second time', () => {
    const t = setup();
    t.dialog.unmount();
    t.store.update({ masterVolume: 90, musicEnabled: true });
    t.dialog.mount(t.root);
    expect(t.slider.value).toBe('90');
    expect(t.volumeValue.textContent).toBe('90%');
    expect(t.box('musicEnabled').checked).toBe(true);
    expect(t.doc.count('keydown')).toBe(1);
  });
});
