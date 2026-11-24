// Script bots for headless runs (cross-front-and-director and economy-weapons designs: Testing
// Strategy). A bot looks at the state the player would see before each tick and returns that
// tick's input commands. `recordBot` plays the bot with `step()` and returns the commands as a
// `ScriptedInput[]`; because runs are deterministic, feeding that script to `runHeadless` with
// the same seed, balance and systems replays the bot's run exactly. Moves to zombie-sim-mcp later.
import type { System } from '../../src/game/context';
import { PACKET_Y } from '../../src/game/economy';
import type { ScriptedInput } from '../../src/game/headless';
import { createRun, type NewRunOptions } from '../../src/game/state';
import { step } from '../../src/game/step';
import { TICK_RATE, type GameState, type InputCommand } from '../../src/game/types';
import { hitBoxCentre } from './lane';

/** Returns the commands for the step that produces `state.tick + 1`. */
export type Bot = (state: GameState) => readonly InputCommand[];

export interface KillerBotOptions {
  /** Second at which the bot clicks the real link. Default 21. */
  readonly downloadAtSecond?: number;
  /** Sweep the lane pointer over the oldest packet each tick. Default false. */
  readonly collectPackets?: boolean;
}

/**
 * Starts the download at `downloadAtSecond`, hammers the Hit_Box centre of the Enemy nearest the
 * modem on every tick (the Hammer skips commands while cooling down) and, when collecting, moves
 * the lane pointer (button up) onto the oldest packet.
 */
export function killerBot(options: KillerBotOptions = {}): Bot {
  const downloadTick = Math.round((options.downloadAtSecond ?? 21) * TICK_RATE);
  return (state) => {
    const cmds: InputCommand[] = [];
    if (state.tick + 1 === downloadTick) cmds.push({ type: 'startDownload' });
    const enemies = state.lane?.enemies ?? [];
    if (enemies.length > 0) {
      const target = enemies.reduce((a, b) => (b.x < a.x || (b.x === a.x && b.id < a.id) ? b : a));
      cmds.push({ type: 'hammer', ...hitBoxCentre(state, target) });
    }
    const packet = options.collectPackets ? state.economy?.packets[0] : undefined;
    if (packet !== undefined) cmds.push({ type: 'lanePointer', x: packet.x, y: PACKET_Y, down: false });
    return cmds;
  };
}

export interface RecordOptions extends NewRunOptions {
  readonly systems: readonly System[];
  readonly maxSeconds: number;
}

/** Plays `bot` for up to `maxSeconds` (or until the run ends) and returns its inputs as a script. */
export function recordBot(bot: Bot, options: RecordOptions): ScriptedInput[] {
  const maxTicks = Math.round(options.maxSeconds * TICK_RATE);
  let state = createRun({ seed: options.seed, balance: options.balance });
  const script: ScriptedInput[] = [];
  while (state.phase !== 'won' && state.phase !== 'lost' && state.tick < maxTicks) {
    const cmds = bot(state);
    for (const command of cmds) script.push({ tick: state.tick + 1, command });
    state = step(state, cmds, options.systems).state;
  }
  return script;
}
