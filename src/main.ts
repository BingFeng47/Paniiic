// Entry point: Settings_Store, Monitor, Audio_Engine and Scene_Director (Req 1.1, 2.1, 3.2;
// title-and-endings Req 5.11). All CSS is imported here only, so tests never import CSS. The
// wiring itself lives in scenes/index.ts.
import '@fontsource/vt323';
import './styles/theme.css';
import './styles/monitor.css';
import './styles/boot.css';
import './styles/title.css';
import './styles/desktop.css';
import './styles/dialup.css';
import './styles/lane.css';
import './styles/result.css';
import './styles/browser.css';
import './styles/hints.css';
import './styles/juice.css';
import { createAudioEngine } from './core/audio';
import { createMonitor } from './core/monitor';
import { createSceneDirector } from './core/scene';
import { bindAudioSettings, createSettingsStore } from './core/settings';
import { buildSceneFactories } from './scenes';

const host = document.getElementById('screen');
if (!host) throw new Error('Missing #screen element in index.html');

const monitor = createMonitor(host);
const settings = createSettingsStore();
const audio = createAudioEngine();
// Before the first scene mounts, so the stored mix applies from the first sound (Req 5.11).
const unbindAudioSettings = bindAudioSettings(audio, settings);
// The page opens straight on the title screen; the monitor is already on. Audio unlocks on the
// player's first click or key press there (browser autoplay rules).
monitor.setLed('on');
const director = createSceneDirector(monitor.screen, buildSceneFactories({ monitor, audio, settings }), 'title');
director.start();

// Dev only: tear the shell down before Vite swaps this module, so listeners and loops don't pile up.
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    director.stop();
    unbindAudioSettings();
    audio.unmount();
    monitor.unmount();
  });
}
