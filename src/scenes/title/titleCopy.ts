/**
 * Title screen and Options_Dialog copy (title-and-endings Req 12.4). Exact strings come from the
 * title-and-endings design; style follows `.kiro/steering/retro-copy.md` (dry late-90s software
 * text with a quiet horror leak, invented names only).
 *
 * The wordmark and subtitle come from requirements decision 1 and live only here.
 */

export const TITLE_COPY = {
  wordmark: 'PANIIIC',
  subtitle: 'a Phantom 98 nightmare',
  play: 'Play game',
  hallOfFame: 'Hall of Fame',
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

/** Hall_of_Fame window copy (leaderboard Req 7.2–7.4). A free late-90s homepage guestbook. */
export const HALL_OF_FAME_COPY = {
  title: 'NetSurfer - Guestbook',
  close: 'Close',
  heading: '~*~ The Hall of Fame ~*~',
  counterLabel: 'Guests signed:',
  /** Digits in the guest counter; larger counts show in full. */
  counterDigits: 6,
  /** Shown in each counter digit while the count is loading or unknown. */
  counterBlank: '-',
  today: "Today's top 10",
  allTime: 'All-time top 10',
  colRank: '#',
  colName: 'Name',
  colScore: 'Score',
  colOutcome: 'Result',
  won: 'Got online',
  lost: 'Eaten',
  empty: 'Nobody has signed yet. The line is quiet... too quiet.',
  loading: 'Loading guestbook...',
  busy: 'Server busy. Try again later.',
  offline: 'Guestbook closed for maintenance.',
  note: 'Sign it yourself: finish a run!',
  construction: 'UNDER CONSTRUCTION',
  footer: 'Hosted free by PhantomHTTPd. Last updated 10/31/98, 11:59 PM.',
  ok: 'Close',
} as const;
