/**
 * Title screen and Options_Dialog copy (title-and-endings Req 12.4). Exact strings come from the
 * title-and-endings design; style follows `.kiro/steering/retro-copy.md` (dry late-90s software
 * text with a quiet horror leak, invented names only).
 *
 * The wordmark and subtitle are the placeholder from requirements decision 1 and live only here.
 */

export const TITLE_COPY = {
  wordmark: 'DEAD LINE 56K',
  subtitle: 'a Phantom 98 nightmare',
  play: 'Play game',
  options: 'Options',
  hint: 'Best viewed at 1024x768 with the lights off.',
  copyright: '(C) 1998 Graveyard Shift Software. All souls reserved.',
} as const;

export const OPTIONS_COPY = {
  title: 'Options',
  close: 'Close',
  volume: 'Master volume:',
  percentSuffix: '%',
  music: 'Music',
  sfx: 'Sound effects',
  shake: 'Screen shake',
  hints: 'Show hints',
  note: 'Changes take effect immediately.',
  ok: 'OK',
} as const;
