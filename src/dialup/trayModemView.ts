/**
 * Tray modem lamp as a Session_View (Req 7.6, 7.7): blinking while the Run is dialing, steady
 * while connected or downloading, off otherwise and after the Session ends.
 */
import type { ModemLamp, Taskbar } from '../desktop/taskbar';
import type { GameState } from '../game/types';
import type { SessionView } from './session';

export function lampFor(state: GameState): ModemLamp {
  switch (state.phase) {
    case 'dialing':
      return 'blink';
    case 'connected':
    case 'downloading':
      return 'on';
    case 'won':
    case 'lost':
      return 'off';
  }
}

export function trayModemView(taskbar: Pick<Taskbar, 'setModem'>): SessionView {
  let lamp: ModemLamp | null = null;
  return {
    mount() {
      lamp = null;
    },
    update(state) {
      const next = lampFor(state);
      if (next === lamp) return;
      lamp = next;
      taskbar.setModem(next);
    },
    unmount() {
      lamp = null;
      taskbar.setModem('off');
    },
  };
}
