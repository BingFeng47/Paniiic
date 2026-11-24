/**
 * Guide copy (player-guide Req 1, 2): the desktop Mission_Note, the Hint_Balloon titles and
 * bodies, and the README guide lines. Style follows `.kiro/steering/retro-copy.md`: dry late-90s
 * tray-balloon text with a quiet horror leak, invented names only.
 */
import type { HintId } from './hints/hintTable';

/** One source of truth for hint ids: the Hint_Table. Re-exported for existing importers. */
export type { HintId };

export interface HintCopy {
  readonly title: string;
  readonly body: string;
}

export const GUIDE_COPY = {
  /** Desktop sticky note (Req 1.1). */
  missionNote: "Get online. Download HOMEWORK.ZIP before midnight. Don't let anything eat the modem.",
  /** Hint_Balloon text, keyed by hint id (design hint table). */
  hints: {
    lane: {
      title: 'Something is on the line',
      body: 'Zombies are crawling toward the modem. Click them to smash them.',
    },
    realLink: {
      title: 'You are now connected',
      body: 'Click the small grey link to start the download. Not the big green button.',
    },
    clutter: {
      title: 'New pop-up detected',
      body: 'Open pop-ups slow the download and let zombies out. Close them fast!',
    },
    hatch: {
      title: 'Pop-up hatched',
      body: 'A pop-up you left open just let a zombie onto the line.',
    },
    interrupter: {
      title: 'Download paused',
      body: 'This pop-up paused your download. Close it to resume.',
    },
    packet: {
      title: 'Data packet dropped',
      body: 'Move the mouse over the packet to grab the KB before it fades.',
    },
    shop: {
      title: 'Upgrade available',
      body: 'You can afford an item. Press 1-5 to buy.',
    },
    critical: {
      title: 'Modem integrity critical',
      body: 'The modem is dying. Defend it!',
    },
  } satisfies Record<HintId, HintCopy>,
  /** README.TXT lines with the objective and the three controls (Req 1.4). */
  readme: [
    'Your mission:',
    '  Get online and download HOMEWORK.ZIP before midnight.',
    "  Don't let anything eat the modem.",
    '',
    'Controls:',
    '  - Click zombies on the phone line to smash them.',
    '  - Close pop-ups to keep the page clear.',
    '  - Click the small grey link to start the download.',
  ],
} as const;

export type GuideCopy = typeof GUIDE_COPY;
