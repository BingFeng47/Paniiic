/**
 * Options_Dialog (title-and-endings Req 4): a modal window on the Title_Scene with the
 * Volume_Slider and the Music, Sound effects, Screen shake and Show hints checkboxes.
 *
 *   div.options-backdrop
 *     div.window.is-active.options-dialog  role=dialog aria-modal aria-labelledby=options-title
 *       div.title-bar > span.title-bar-text#options-title
 *                     + div.title-bar-controls > button.title-bar-button.title-bar-close
 *       div.window-body
 *         div.options-row > label[for=options-volume] + input#options-volume[type=range]
 *                         + span.options-volume-value
 *         label.options-check > input[type=checkbox][data-setting=…] + text   (three times)
 *         p.options-note
 *         div.options-buttons > button.btn.btn-default
 *
 * Every change goes straight to the Settings_Store; audio follows inside the same event because
 * `bindAudioSettings` is a synchronous store listener (Req 4.3–4.5). OK, ✕ and Escape call
 * `onClose()`; the owner unmounts the dialog (Req 4.6). The `document` keydown listener exists
 * only while mounted (Req 12.2). Text goes in through text nodes only (Req 12.3).
 */
import { h } from '../../core/h';
import type { Mountable } from '../../core/scene';
import { volumeFromSlider, type Settings, type SettingsStore } from '../../core/settings';
import { OPTIONS_COPY } from './titleCopy';

export interface OptionsDialogDeps {
  readonly settings: Pick<SettingsStore, 'get' | 'update'>;
  /** OK, ✕ or Escape (Req 4.6). */
  readonly onClose: () => void;
}

/** Title-bar close glyph (UI chrome, not game copy; matches the desktop windows). */
const CLOSE_GLYPH = '✕';

const VOLUME_ID = 'options-volume';
const TITLE_ID = 'options-title';

type FlagKey = 'musicEnabled' | 'sfxEnabled' | 'screenShake' | 'hintsEnabled';

const FLAGS: ReadonlyArray<{ readonly key: FlagKey; readonly label: string }> = [
  { key: 'musicEnabled', label: OPTIONS_COPY.music },
  { key: 'sfxEnabled', label: OPTIONS_COPY.sfx },
  { key: 'screenShake', label: OPTIONS_COPY.shake },
  { key: 'hintsEnabled', label: OPTIONS_COPY.hints },
];

function flagPatch(key: FlagKey, value: boolean): Partial<Settings> {
  switch (key) {
    case 'musicEnabled':
      return { musicEnabled: value };
    case 'sfxEnabled':
      return { sfxEnabled: value };
    case 'screenShake':
      return { screenShake: value };
    case 'hintsEnabled':
      return { hintsEnabled: value };
  }
}

function percentText(volume: number): string {
  return `${volume}${OPTIONS_COPY.percentSuffix}`;
}

export function createOptionsDialog(deps: OptionsDialogDeps): Mountable {
  const { settings, onClose } = deps;

  let mounted = false;

  const volumeValue = h('span', { className: 'options-volume-value' });

  const slider = h('input', {
    attrs: { id: VOLUME_ID, type: 'range', min: '0', max: '100', step: '10' },
    on: {
      input: () => {
        const next = settings.update({ masterVolume: volumeFromSlider(slider.value) });
        showVolume(next.masterVolume);
      },
    },
  });

  function showVolume(volume: number): void {
    const text = percentText(volume);
    volumeValue.textContent = text;
    slider.setAttribute('aria-valuetext', text);
  }

  const checkboxes = new Map<FlagKey, HTMLInputElement>();
  const checkRows = FLAGS.map(({ key, label }) => {
    const box = h('input', {
      attrs: { type: 'checkbox', 'data-setting': key },
      on: { change: () => settings.update(flagPatch(key, box.checked)) },
    });
    checkboxes.set(key, box);
    return h('label', { className: 'options-check' }, box, label);
  });

  const closeButton = h(
    'button',
    {
      className: 'title-bar-button title-bar-close',
      attrs: { type: 'button', 'aria-label': OPTIONS_COPY.close },
      on: { click: () => close() },
    },
    CLOSE_GLYPH,
  );

  const okButton = h(
    'button',
    { className: 'btn btn-default', attrs: { type: 'button' }, on: { click: () => close() } },
    OPTIONS_COPY.ok,
  );

  const el = h(
    'div',
    { className: 'options-backdrop' },
    h(
      'div',
      {
        className: 'window is-active options-dialog',
        attrs: { role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': TITLE_ID },
      },
      h(
        'div',
        { className: 'title-bar' },
        h('span', { className: 'title-bar-text', attrs: { id: TITLE_ID } }, OPTIONS_COPY.title),
        h('div', { className: 'title-bar-controls' }, closeButton),
      ),
      h(
        'div',
        { className: 'window-body' },
        h(
          'div',
          { className: 'options-row' },
          h('label', { attrs: { for: VOLUME_ID } }, OPTIONS_COPY.volume),
          slider,
          volumeValue,
        ),
        ...checkRows,
        h('p', { className: 'options-note' }, OPTIONS_COPY.note),
        h('div', { className: 'options-buttons' }, okButton),
      ),
    ),
  );

  function close(): void {
    if (!mounted) return;
    onClose();
  }

  const onDocKeyDown = (e: KeyboardEvent): void => {
    if (e.key !== 'Escape') return;
    e.preventDefault();
    close();
  };

  /** Shows the current Settings in the controls (Req 4.1). */
  function readSettings(): void {
    const current = settings.get();
    slider.value = String(current.masterVolume);
    // A hand-edited volume that is not a multiple of 10 is shown as stored until the slider moves.
    showVolume(current.masterVolume);
    for (const { key } of FLAGS) {
      const box = checkboxes.get(key);
      if (box) box.checked = current[key];
    }
  }

  return {
    mount(root) {
      if (mounted) return;
      mounted = true;
      readSettings();
      root.appendChild(el);
      document.addEventListener('keydown', onDocKeyDown);
      slider.focus(); // Req 4.2
    },
    /** Removes the document listener and the elements without calling `onClose` (Req 12.2). */
    unmount() {
      if (!mounted) return;
      mounted = false;
      document.removeEventListener('keydown', onDocKeyDown);
      el.remove();
    },
  };
}
