/**
 * Desktop copy: every in-game string on the Phantom 98 desktop (Req 14.7). Exact strings come
 * from the retro-shell design; style follows `.kiro/steering/retro-copy.md` (dry late-90s system
 * text with a quiet horror leak, invented names only, Req 14.5).
 *
 * Arrays keep display order: desktop icons top to bottom (Req 5.2), start menu items top to
 * bottom with the separator placed before "Shut Down..." by startMenu.ts (Req 8.2).
 */

import { GUIDE_COPY } from '../ui/guideCopy';

const README_LINES = [
  'Welcome to Phantom 98!',
  '',
  ...GUIDE_COPY.readme,
  '',
  'To get on the Internet:',
  '  1. Double-click "Connect to MidnightNet".',
  '  2. Click Connect.',
  '  3. Wait while the modem talks to the other modem.',
  '',
  'If you hear scratching on the phone line, that is normal.',
  'Everyone hears it.',
  '',
  '- The MidnightNet Team',
] as const;

export const DESKTOP_COPY = {
  /** Desktop icons, in column order (Req 5.2). */
  icons: [
    { id: 'dialer', label: 'Connect to MidnightNet' },
    { id: 'readme', label: 'README.TXT' },
    { id: 'wastebasket', label: 'Wastebasket' },
  ],
  /** Window titles (Req 5.7, 5.8). The dialer's titles live in DIALER_COPY. */
  titles: {
    readme: 'README.TXT - Jotter',
    wastebasket: 'Wastebasket',
  },
  /** README.TXT body, shown in a `<pre>` (Req 5.7). */
  readme: README_LINES.join('\n'),
  /** Wastebasket contents and status bar (Req 5.8). */
  wastebasket: {
    files: ['resume_FINAL_final.doc', 'old_modem_drv.zip', 'DO_NOT_DIAL.TXT', 'manhole_cover.bmp'],
    status: '4 object(s)',
  },
  /** Start menu items in order and the vertical banner (Req 8.2). */
  startMenu: {
    banner: 'Phantom 98',
    items: [
      { id: 'dialer', label: 'Connect to MidnightNet' },
      { id: 'readme', label: 'README.TXT' },
      { id: 'wastebasket', label: 'Wastebasket' },
      { id: 'shutDown', label: 'Shut Down...' },
    ],
  },
  /** Start button label. */
  start: 'Start',
  /** Tray clock, stuck one minute before midnight (Req 7.5). */
  clock: '11:59 PM',
} as const;

export type DesktopCopy = typeof DESKTOP_COPY;
