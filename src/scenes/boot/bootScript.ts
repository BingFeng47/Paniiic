/**
 * Boot script: the BIOS screen and splash timeline as pure data plus two pure readers
 * (Req 4.2–4.6, 14.7). Times are elapsed boot milliseconds, which the Boot_Scene derives from
 * fixed-loop ticks (Req 4.7). No DOM, timers or clock reads here.
 *
 * Copy is taken verbatim from the retro-shell design and follows `.kiro/steering/retro-copy.md`:
 * dry BIOS text with one horror leak ("Something on COM2"), invented names only (Req 14.5).
 */

export interface BiosLine {
  readonly atMs: number;
  readonly text: string;
}

export type BootSoundId = 'crtThunk' | 'postBeep' | 'diskSeek';

export interface BootCue {
  readonly atMs: number;
  readonly sound: BootSoundId;
}

export interface BootScript {
  /** Lines shown before the memory line, in time order. */
  readonly header: readonly BiosLine[];
  /** The memory test line counts from 0K at `atMs` up to `totalK` at `endMs` (Req 4.3). */
  readonly memory: {
    readonly atMs: number;
    readonly endMs: number;
    readonly totalK: number;
    readonly stepK: number;
  };
  /** Lines shown after the memory line, in time order. */
  readonly body: readonly BiosLine[];
  /** BIOS date string, bottom-left of the BIOS screen. */
  readonly footer: string;
  /** Sound cues in script (time) order (Req 4.4). */
  readonly cues: readonly BootCue[];
  readonly splashAtMs: number;
  readonly doneAtMs: number;
  readonly splash: { readonly wordmark: string; readonly copyright: string };
}

export const BOOT_SCRIPT: BootScript = {
  header: [
    { atMs: 400, text: 'NightOwl BIOS v4.13  (C) 1985-1998 NightOwl Firmware, Inc.' },
    { atMs: 700, text: 'Phantom-II CPU at 233 MHz' },
  ],
  memory: { atMs: 900, endMs: 2400, totalK: 65536, stepK: 1024 },
  body: [
    { atMs: 2600, text: 'Detecting IDE Primary Master ... GRAVEDIGGER 2.1GB' },
    { atMs: 2900, text: 'Detecting IDE Primary Slave  ... None' },
    { atMs: 3200, text: 'Detecting IDE Secondary Master ... CD-ROM 24X' },
    { atMs: 3500, text: 'Keyboard ............ OK' },
    { atMs: 3650, text: 'Mouse ............... OK' },
    { atMs: 3800, text: 'Modem on COM2 ....... OK' },
    { atMs: 4300, text: 'Something on COM2 ... DETECTED' },
    { atMs: 4900, text: 'Starting Phantom 98...' },
  ],
  footer: '10/31/98-NOB-4.13',
  cues: [
    { atMs: 0, sound: 'crtThunk' },
    { atMs: 300, sound: 'postBeep' },
    { atMs: 2600, sound: 'diskSeek' },
    { atMs: 2900, sound: 'diskSeek' },
    { atMs: 3200, sound: 'diskSeek' },
  ],
  splashAtMs: 5400,
  doneAtMs: 8000,
  splash: {
    wordmark: 'Phantom 98',
    copyright: 'Copyright (C) 1981-1998 Phantom Software Corp.',
  },
};

export interface BootFrame {
  readonly stage: 'bios' | 'splash' | 'done';
  /** Visible BIOS lines in order, memory line included. */
  readonly lines: readonly string[];
  /** 0..totalK, a multiple of stepK until the count ends at totalK. */
  readonly memoryK: number;
  /** 0..1 within the splash stage; 0 during bios, 1 when done. */
  readonly splashProgress: number;
}

/** Memory count at `t`: 0 before the line starts, whole steps while counting, `totalK` at the end. */
function memoryAt(t: number, memory: BootScript['memory']): number {
  if (t < memory.atMs) return 0;
  if (t >= memory.endMs) return memory.totalK;
  const steps = Math.floor(memory.totalK / memory.stepK);
  const done = Math.floor(((t - memory.atMs) * steps) / (memory.endMs - memory.atMs));
  return Math.min(steps, done) * memory.stepK;
}

function memoryLine(k: number, memory: BootScript['memory']): string {
  return k >= memory.totalK ? `Memory Test: ${k}K OK` : `Memory Test: ${k}K`;
}

/** The boot screen at `elapsedMs` (Req 4.2, 4.3, 4.5, 4.6). Pure. */
export function bootFrameAt(elapsedMs: number, script: BootScript = BOOT_SCRIPT): BootFrame {
  const t = Number.isNaN(elapsedMs) ? 0 : elapsedMs;
  const memoryK = memoryAt(t, script.memory);

  const lines: string[] = [];
  for (const line of script.header) if (line.atMs <= t) lines.push(line.text);
  if (script.memory.atMs <= t) lines.push(memoryLine(memoryK, script.memory));
  for (const line of script.body) if (line.atMs <= t) lines.push(line.text);

  const stage = t < script.splashAtMs ? 'bios' : t < script.doneAtMs ? 'splash' : 'done';
  const span = script.doneAtMs - script.splashAtMs;
  const splashProgress =
    stage === 'bios' ? 0 : stage === 'done' || span <= 0 ? 1 : (t - script.splashAtMs) / span;

  return { stage, lines, memoryK, splashProgress };
}

/** Cues with prevMs < atMs <= nowMs, in script order (Req 4.4). Pure. */
export function cuesBetween(
  prevMs: number,
  nowMs: number,
  script: BootScript = BOOT_SCRIPT,
): readonly BootCue[] {
  return script.cues.filter((cue) => prevMs < cue.atMs && cue.atMs <= nowMs);
}
