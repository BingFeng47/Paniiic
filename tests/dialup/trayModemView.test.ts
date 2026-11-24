// Tests for the Tray modem lamp Session_View (Req 7.6, 7.7) with real game-core states.
import { describe, expect, it } from 'vitest';
import type { ModemLamp } from '../../src/desktop/taskbar';
import type { SessionContext } from '../../src/dialup/session';
import { lampFor, trayModemView } from '../../src/dialup/trayModemView';
import { createRun } from '../../src/game/state';
import { step } from '../../src/game/step';
import type { GameState, InputCommand } from '../../src/game/types';
import { scheduledDamage, stepN } from '../helpers/game';

const START: InputCommand = { type: 'startDownload' };
const ctx = {} as SessionContext;

/** One real state per phase: 1 s dial (60 ticks) and a 10-tick download. */
function statesByPhase(): Record<GameState['phase'], GameState> {
  const balance = { dialSeconds: 1, downloadPercentPerSecond: 600 };
  const dialing = createRun({ seed: 1, balance });
  const connected = stepN(step, dialing, 60).state;
  const downloading = stepN(step, connected, 1, { inputs: [{ tick: 61, command: START }] }).state;
  const won = stepN(step, downloading, 20).state;
  const lost = stepN(step, dialing, 5, { systems: [scheduledDamage([{ tick: 5, amount: 100 }])] }).state;
  return { dialing, connected, downloading, won, lost };
}

describe('lampFor', () => {
  it('blinks while dialing, is steady while connected or downloading, off when over', () => {
    const s = statesByPhase();
    for (const [phase, state] of Object.entries(s)) expect(state.phase).toBe(phase);
    expect(lampFor(s.dialing)).toBe('blink');
    expect(lampFor(s.connected)).toBe('on');
    expect(lampFor(s.downloading)).toBe('on');
    expect(lampFor(s.won)).toBe('off');
    expect(lampFor(s.lost)).toBe('off');
  });
});

describe('trayModemView', () => {
  it('sets the lamp only when it changes and turns it off on unmount', () => {
    const lamps: ModemLamp[] = [];
    const view = trayModemView({ setModem: (lamp) => lamps.push(lamp) });
    let state = createRun({ seed: 1 });

    view.mount(ctx);
    view.update(state, []);
    expect(lamps).toEqual(['blink']);
    for (let i = 0; i < 1199; i += 1) {
      const r = step(state, []);
      state = r.state;
      view.update(state, r.events);
    }
    expect(state.phase).toBe('dialing');
    expect(lamps).toEqual(['blink']);

    const connected = step(state, []);
    view.update(connected.state, connected.events);
    expect(connected.state.phase).toBe('connected');
    expect(lamps).toEqual(['blink', 'on']);

    const downloading = step(connected.state, [START]);
    view.update(downloading.state, downloading.events);
    expect(downloading.state.phase).toBe('downloading');
    expect(lamps).toEqual(['blink', 'on']);

    view.unmount();
    expect(lamps).toEqual(['blink', 'on', 'off']);
  });

  it('turns the lamp off when the Run is lost and starts over on the next mount', () => {
    const s = statesByPhase();
    const lamps: ModemLamp[] = [];
    const view = trayModemView({ setModem: (lamp) => lamps.push(lamp) });

    view.mount(ctx);
    view.update(s.dialing, []);
    view.update(s.lost, []);
    expect(lamps).toEqual(['blink', 'off']);
    view.unmount();

    lamps.length = 0;
    view.mount(ctx);
    view.update(s.connected, []);
    expect(lamps).toEqual(['on']);
  });
});
