// Theme_Score for the title screen: an original eight-bar tune in D minor, plus the pure timing
// maths the theme song and the title scene share (Req 3.2, 3.3, 3.4). No DOM, no audio, no timers.
//
// One pass is 32 beats at 80 BPM (24 s). Bars 1–4 are music box over a slow chord pad; bars 5–8
// add a theremin lead. Bar 7 moves to E♭ major, a tritone from the A major that follows.
import { TICK_RATE } from '../../game/types';

export type ThemeInstrument = 'bass' | 'pad' | 'bell' | 'lead';

export interface ThemeNote {
  /** Start, in beats from the pass start. */
  readonly beat: number;
  /** Length in beats, > 0. */
  readonly beats: number;
  /** Pitch as a MIDI note number. */
  readonly midi: number;
  readonly instrument: ThemeInstrument;
}

export interface ThemeScore {
  readonly bpm: number;
  readonly passBeats: number;
  readonly notes: readonly ThemeNote[];
}

export interface ScheduledNote {
  readonly instrument: ThemeInstrument;
  readonly hz: number;
  /** Seconds from the start of the pass. */
  readonly start: number;
  /** Seconds from the start of the pass. */
  readonly end: number;
}

const BEATS_PER_BAR = 4;
const BASS_BEATS = 1.5;
const BELL_BEATS = 1;

interface BarSpec {
  readonly bass: number;
  readonly pad: readonly [number, number, number];
  readonly bell: readonly [number, number, number, number];
}

/** Bars 1–8: Dm, B♭, Gm, A, Dm, B♭, E♭, A. */
const BARS: readonly BarSpec[] = [
  { bass: 38, pad: [50, 53, 57], bell: [62, 65, 69, 65] },
  { bass: 34, pad: [50, 53, 58], bell: [62, 65, 70, 65] },
  { bass: 43, pad: [50, 55, 58], bell: [62, 67, 70, 67] },
  { bass: 45, pad: [49, 52, 57], bell: [61, 64, 69, 64] },
  { bass: 38, pad: [50, 53, 57], bell: [62, 65, 69, 65] },
  { bass: 34, pad: [50, 53, 58], bell: [62, 65, 70, 65] },
  { bass: 39, pad: [51, 55, 58], bell: [63, 67, 70, 67] },
  { bass: 45, pad: [49, 52, 57], bell: [61, 64, 69, 64] },
];

/** Theremin lead in bars 5–8, as [beat, beats, midi]. */
const LEAD: readonly (readonly [number, number, number])[] = [
  [16, 2, 69], // A4
  [18, 1, 74], // D5
  [19, 1, 73], // C♯5
  [20, 1, 74], // D5
  [21, 1, 77], // F5
  [22, 1, 76], // E5
  [23, 1, 74], // D5
  [24, 1.5, 79], // G5
  [25.5, 0.5, 77], // F5
  [26, 2, 75], // E♭5
  [28, 1, 73], // C♯5
  [29, 1, 76], // E5
  [30, 2, 69], // A4
];

const INSTRUMENT_ORDER: Readonly<Record<ThemeInstrument, number>> = {
  bass: 0,
  pad: 1,
  bell: 2,
  lead: 3,
};

function note(beat: number, beats: number, midi: number, instrument: ThemeInstrument): ThemeNote {
  return Object.freeze({ beat, beats, midi, instrument });
}

/** Bass on beats 0 and 2, the pad chord for the whole bar, and the four-note bell arpeggio. */
function bar(index: number, spec: BarSpec): ThemeNote[] {
  const start = index * BEATS_PER_BAR;
  return [
    note(start, BASS_BEATS, spec.bass, 'bass'),
    note(start + 2, BASS_BEATS, spec.bass, 'bass'),
    ...spec.pad.map((midi) => note(start, BEATS_PER_BAR, midi, 'pad')),
    ...spec.bell.map((midi, i) => note(start + i, BELL_BEATS, midi, 'bell')),
  ];
}

function buildNotes(): readonly ThemeNote[] {
  const notes = [
    ...BARS.flatMap((spec, i) => bar(i, spec)),
    ...LEAD.map(([beat, beats, midi]) => note(beat, beats, midi, 'lead')),
  ];
  // Stable sort keeps the table order (low to high pitch) within one beat and instrument.
  notes.sort(
    (a, b) => a.beat - b.beat || INSTRUMENT_ORDER[a.instrument] - INSTRUMENT_ORDER[b.instrument],
  );
  return Object.freeze(notes);
}

/** 80 BPM, 32 beats, 85 notes (16 bass, 24 pad, 32 bell, 13 lead). */
export const THEME_SCORE: ThemeScore = Object.freeze({
  bpm: 80,
  passBeats: BARS.length * BEATS_PER_BAR,
  notes: buildNotes(),
});

/** Equal-tempered frequency: 440 × 2^((midi − 69) / 12). */
export function midiHz(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12);
}

/** Length of one pass in seconds: passBeats × 60 / bpm (24 for THEME_SCORE, Req 3.3). */
export function passSeconds(score: ThemeScore): number {
  return (score.passBeats * 60) / score.bpm;
}

/** Length of one pass in simulation ticks (1,440 for THEME_SCORE). */
export function passTicks(score: ThemeScore): number {
  return Math.round(passSeconds(score) * TICK_RATE);
}

/**
 * Pure (Req 3.4): note times in seconds from the start of a pass played for durationSec.
 * Notes starting at or after durationSec are dropped, later ends are clipped to durationSec, and
 * notes left with start ≥ end are dropped. Non-finite or non-positive durations give [].
 */
export function themeSchedule(score: ThemeScore, durationSec: number): readonly ScheduledNote[] {
  if (!Number.isFinite(durationSec) || durationSec <= 0) return [];
  const secPerBeat = 60 / score.bpm;
  const out: ScheduledNote[] = [];
  for (const { beat, beats, midi, instrument } of score.notes) {
    const start = beat * secPerBeat;
    if (start >= durationSec) continue;
    const end = Math.min((beat + beats) * secPerBeat, durationSec);
    if (!(start < end)) continue;
    out.push({ instrument, hz: midiHz(midi), start, end });
  }
  return out;
}

/** Pass indices k ≥ 1 with prevTicks < k × passTicks ≤ nowTicks, ascending (Req 3.2). */
export function passesBetween(
  prevTicks: number,
  nowTicks: number,
  passTicks: number,
): readonly number[] {
  if (
    !Number.isFinite(prevTicks) ||
    !Number.isFinite(nowTicks) ||
    !Number.isFinite(passTicks) ||
    passTicks <= 0 ||
    nowTicks <= prevTicks
  ) {
    return [];
  }
  const first = Math.max(1, Math.floor(prevTicks / passTicks) + 1);
  const last = Math.floor(nowTicks / passTicks);
  const out: number[] = [];
  for (let k = first; k <= last; k++) out.push(k);
  return out;
}
