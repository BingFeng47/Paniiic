/**
 * Dial script: the six Dial_Stages, every string the Dialer shows, and the pure functions that
 * turn a Run's dial clock into a status (Req 9.1, 11.1–11.7, 12.1, 14.7). Exact strings come from
 * the retro-shell design; style follows `.kiro/steering/retro-copy.md`.
 *
 * Pure module: no DOM, timers or wall clock. The status depends only on `state.tick`,
 * `state.phaseStartTick`, `state.phase` and `dialTicks(state.balance)`, so the 20-second dial
 * length stays in game-core balance and the Dialer can never drift from step()'s connect tick.
 */

import { dialTicks } from '../game/balance/core';
import { TICK_RATE, type GameState } from '../game/types';

export type DialStageId =
  | 'initializing'
  | 'dialing'
  | 'ringing'
  | 'negotiating'
  | 'verifying'
  | 'loggingOn';

/** Sound for a stage; `null` means silence (Req 12.4). */
export type DialSoundId = 'dialTone' | 'dtmf' | 'ringback' | 'handshake' | null;

export interface DialStage {
  readonly id: DialStageId;
  /** Share of the dial duration where the stage starts, inclusive. */
  readonly start: number;
  /** Share of the dial duration where the stage ends, exclusive. */
  readonly end: number;
  readonly status: string;
  readonly sound: DialSoundId;
}

/**
 * Stage rows in order (Req 11.2). Only the end share is listed; each start is the previous end,
 * so the shares are contiguous by construction. The last end is exactly 1, so the last stage
 * ends exactly at `dialTicks(balance)` for any dial duration.
 */
const STAGE_ROWS: readonly (Omit<DialStage, 'start'>)[] = [
  { id: 'initializing', end: 0.075, status: 'Initializing modem...', sound: 'dialTone' },
  { id: 'dialing', end: 0.15, status: 'Dialing 555-0199...', sound: 'dtmf' },
  { id: 'ringing', end: 0.25, status: 'Waiting for the remote computer to answer...', sound: 'ringback' },
  { id: 'negotiating', end: 0.75, status: 'Negotiating with the remote computer...', sound: 'handshake' },
  { id: 'verifying', end: 0.9, status: 'Verifying user name and password...', sound: null },
  { id: 'loggingOn', end: 1, status: 'Logging on to network...', sound: null },
];

export const DIAL_STAGES: readonly DialStage[] = Object.freeze(
  STAGE_ROWS.map((row, i) =>
    Object.freeze({
      id: row.id,
      start: i === 0 ? 0 : STAGE_ROWS[i - 1]!.end,
      end: row.end,
      status: row.status,
      sound: row.sound,
    }),
  ),
);

/** Every other string the Dialer shows (Req 9.1, 11.4, 11.6, 11.7). */
export const DIALER_COPY = {
  titles: {
    form: 'Connect To',
    dialing: 'Connecting to MidnightNet Online',
    connected: 'Connected to MidnightNet Online',
  },
  /** The "Connect To" form (Req 9.1). The password value is already masked. */
  form: {
    connectionName: 'MidnightNet Online',
    userNameLabel: 'User name:',
    userName: 'guest',
    passwordLabel: 'Password:',
    password: '********',
    phoneNumberLabel: 'Phone number:',
    phoneNumber: '555-0199',
  },
  buttons: {
    connect: 'Connect',
    cancel: 'Cancel',
  },
  connected: 'Connected at 28,800 bps.',
  /** Prefix for the connection duration line; the Dialer appends `formatDuration(ticks)`. */
  duration: 'Duration: ',
  terminated: 'The connection was terminated by the remote computer.',
  hangUp: 'Unable to hang up. Something is holding the line.',
} as const;

export type DialerCopy = typeof DIALER_COPY;

export type DialStatus =
  | {
      readonly kind: 'dialing';
      readonly index: number;
      readonly stage: DialStage;
      readonly fraction: number;
    }
  | { readonly kind: 'connected' }
  | { readonly kind: 'terminated' };

/** Highest Dial_Fraction while dialing, so the last stage's `[start, 1)` always contains it. */
const MAX_FRACTION = 1 - 1e-9;

/**
 * Dial_Fraction for a dialing Run: elapsed dial ticks over the dial length, clamped to
 * `[0, 1 − 1e-9]`. A dial length that rounds to 0 ticks connects on the first step, so the
 * fraction stays 0 for the one dialing frame instead of dividing by zero.
 */
function dialFraction(state: GameState): number {
  const total = dialTicks(state.balance);
  if (total <= 0) return 0;
  const fraction = (state.tick - state.phaseStartTick) / total;
  return Math.min(Math.max(fraction, 0), MAX_FRACTION);
}

function stageIndexAt(fraction: number): number {
  for (let i = 0; i < DIAL_STAGES.length; i += 1) {
    if (fraction < DIAL_STAGES[i]!.end) return i;
  }
  return DIAL_STAGES.length - 1;
}

/** Reads only tick, phase, phaseStartTick and balance (Req 11.1, 11.3, 11.5, 11.6). */
export function dialStatusOf(state: GameState): DialStatus {
  switch (state.phase) {
    case 'dialing': {
      const fraction = dialFraction(state);
      const index = stageIndexAt(fraction);
      return { kind: 'dialing', index, stage: DIAL_STAGES[index]!, fraction };
    }
    case 'connected':
    case 'downloading':
    case 'won':
      return { kind: 'connected' };
    case 'lost':
      return { kind: 'terminated' };
  }
}

/** Seconds left in the current stage while dialing; 0 otherwise (Req 12.1). */
export function stageTimeLeftSeconds(state: GameState): number {
  const status = dialStatusOf(state);
  if (status.kind !== 'dialing') return 0;
  return ((status.stage.end - status.fraction) * dialTicks(state.balance)) / TICK_RATE;
}

/** Connection duration as `hhh:mm:ss` from a count of Run ticks, e.g. 420 → "000:00:07". */
export function formatDuration(ticks: number): string {
  const totalSeconds = Number.isFinite(ticks) ? Math.max(0, Math.floor(ticks / TICK_RATE)) : 0;
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${pad(hours, 3)}:${pad(minutes, 2)}:${pad(seconds, 2)}`;
}

function pad(value: number, width: number): string {
  return String(value).padStart(width, '0');
}
