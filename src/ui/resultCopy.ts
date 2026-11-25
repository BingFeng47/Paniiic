/**
 * Every string the Result_Screen shows (Req 12.4). Dry dialog text and late-90s filenames with
 * the horror leaking through the boring parts, per the `retro-copy` steering file. Set only
 * through `textContent`.
 */
export const RESULT_COPY = {
  stats: { time: 'Session time:', integrity: 'Modem integrity:', download: 'Downloaded:' },
  /** The Receipt (leaderboard Req 4): a dry phone bill with the horror in the small print. */
  receipt: {
    from: 'NetSurfer Billing Dept.',
    title: 'STATEMENT OF ACCOUNT',
    lines: {
      download: 'Data transfer',
      kills: 'Pest control, line 1',
      boss: 'Removal of large item',
      ads: 'Pop-up disposal',
      combo: 'Bulk removal discount',
      win: 'Completed download',
      integrity: 'Modem returned intact',
      speed: 'Early finish credit',
    },
    total: 'TOTAL SCORE',
    pointsSuffix: ' pts',
    footer: 'Thank you for choosing NetSurfer. Do not open the manhole.',
  },
  /** The Guestbook_Form (leaderboard Req 5): a late-90s guestbook box under the bill. */
  guestbook: {
    heading: 'Sign our Guestbook!',
    nameLabel: 'Your name:',
    nameHint: '3-12 letters, digits, spaces, _ or -',
    sign: 'Sign',
    signing: 'Signing...',
    busy: 'Server busy. Try again later.',
    closed: 'Guestbook closed for maintenance.',
    thanks: 'Thank you for signing! Please come again.',
    rankPrefix: 'Your rank today: #',
    listBusy: 'Your entry was saved, but the list could not be loaded.',
    today: "Today's top 10",
    colRank: '#',
    colName: 'Name',
    colScore: 'Score',
    colOutcome: 'Result',
    won: 'Got online',
    lost: 'Eaten',
  },
  retry: 'Retry',
  mainMenu: 'Main menu',
  percentSuffix: '%',
  won: {
    windowTitle: 'Download Complete',
    status: 'Download complete',
    savedTo: 'Saved to C:\\DOWNLOADS\\',
    headline: 'Welcome to the Internet!',
    file: 'funny_cats_1998.avi',
    fileNote: '2,048 KB received. No bite marks found.',
  },
  lost: {
    staticText: 'NO CARRIER',
    windowTitle: 'Connection Terminated',
    message: 'The connection was terminated by the remote computer.',
    file: 'SKELETON_DATING_SIM.EXE',
    fileNote: 'Estimated time left: forever',
  },
} as const;
