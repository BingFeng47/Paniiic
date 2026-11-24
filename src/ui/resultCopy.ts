/**
 * Every string the Result_Screen shows (Req 12.4). Dry dialog text and late-90s filenames with
 * the horror leaking through the boring parts, per the `retro-copy` steering file. Set only
 * through `textContent`.
 */
export const RESULT_COPY = {
  stats: { time: 'Session time:', integrity: 'Modem integrity:', download: 'Downloaded:' },
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
