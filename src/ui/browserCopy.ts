/**
 * Every string the browser front shows (Req 5.2, 5.3, 6.5, 12.8). Views set these through
 * `textContent` only. Ad variant counts must match `AD_COPY_COUNTS` in src/game/ads/openAd.ts.
 */

import type { AdKind } from '../game/ads/adTypes';

export const BROWSER_WINDOW = Object.freeze({
  title: 'MidnightNet Download Center - NetSurfer',
  address: 'http://files.midnightnet.example/homework/',
  addressLabel: 'Address:',
  toolbar: Object.freeze(['Back', 'Forward', 'Stop', 'Refresh', 'Home'] as const),
  statusReady: 'Document: Done',
  statusBusy: 'NetSurfer is busy. Please try again later.',
});

export const DOWNLOAD_PAGE = Object.freeze({
  heading: 'MidnightNet Download Center',
  intro: 'Thank you for choosing MidnightNet. Your file is ready. Please select a mirror below.',
  file: 'HOMEWORK.ZIP (2,048 KB)',
  realLink: 'download HOMEWORK.ZIP (mirror 3)',
  started: 'Your download has started. Please do not hang up.',
  footer: 'Best viewed in NetSurfer 3.0 at 800 x 600. Mirrors 1 and 2 have not answered since dusk.',
});

export const DOWNLOAD_PANEL = Object.freeze({
  title: 'Saving HOMEWORK.ZIP',
  savingTo: 'Saving to: C:\\SCHOOL\\HOMEWORK.ZIP',
  waiting: 'Waiting for server...',
  rateLabel: 'Transfer rate:',
  timeLeftLabel: 'Time left:',
  /** "3.2 KB/s" */
  rate: (kbPerSecond: number): string => `${kbPerSecond.toFixed(1)} KB/s`,
  /** "1:05" */
  timeLeft: (seconds: number): string => {
    const s = Math.max(0, Math.ceil(seconds));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  },
  percent: (whole: number): string => `${whole}%`,
  /** Cause line when open clutter Ads use bandwidth (ad-pressure Req 7.1). */
  causeAds: (openClutter: number): string =>
    openClutter === 1
      ? '1 pop-up is using your bandwidth.'
      : `${openClutter} pop-ups are using your bandwidth.`,
  /** Cause line when a damaged modem lowers Line_Quality (ad-pressure Req 7.1). */
  causeLine: 'Line noise detected. Something is chewing on the modem.',
});

/** Labels for the close pattern controls. */
export const AD_LABELS = Object.freeze({
  close: '✕',
  bigClose: '✕',
  tinyClose: '✕',
  ok: 'OK',
  cancel: 'Cancel',
  noThanks: 'no thanks, I like slow Internet',
  skip: 'Skip ad',
  skipIn: (seconds: number): string => `Skip ad in ${seconds}...`,
  confirmQuestion: 'Are you sure you want to miss this deal?',
  confirmYes: 'Yes',
  confirmNo: 'No',
});

export interface AdCopy {
  readonly title: string;
  readonly headline: string;
  readonly body: string;
  /** Fake buttons: the big green button text. Others: a call to action inside the ad. */
  readonly action: string;
}

export const AD_COPY: Readonly<Record<AdKind, readonly AdCopy[]>> = Object.freeze({
  clutter: Object.freeze([
    {
      title: 'CONGRATULATIONS!!!',
      headline: 'YOU ARE THE 1,000,000th VISITOR!!',
      body: 'Claim your FREE prize before midnight! Prize may be haunted.',
      action: 'CLICK HERE!!',
    },
    {
      title: 'FREE CURSORS',
      headline: 'FREE CURSOR PACK - 666 SKULLS',
      body: 'Animated skulls, bats and coffins for your mouse pointer!!! 100% FREE!!!',
      action: 'GET THEM NOW',
    },
    {
      title: 'PUNCH THE MUMMY',
      headline: 'PUNCH THE MUMMY AND WIN $500!!',
      body: 'Hit him 3 times to WIN! He has been waiting in this banner a long time.',
      action: 'PLAY NOW',
    },
    {
      title: 'SCREENSAVERS.EXE',
      headline: 'FREE SCREENSAVERS!!!',
      body: 'Flying toasters? Boring. Try FLYING TOMBSTONES! Over 13 designs!!',
      action: 'DOWNLOAD FREE',
    },
  ]),
  interrupter: Object.freeze([
    {
      title: 'System Alert',
      headline: 'Your modem may be INFECTED',
      body: 'Something is chewing on your phone line. Run a FREE scan now to protect your files.',
      action: 'SCAN NOW',
    },
    {
      title: 'SPEED UP YOUR INTERNET',
      headline: 'Your connection is 666% TOO SLOW!!',
      body: 'Install TurboGrave 2000 and download up to 10x FASTER. Download paused until you decide.',
      action: 'INSTALL NOW',
    },
    {
      title: 'Important Message',
      headline: 'WAIT! Before you download...',
      body: 'Join the PhantomClub mailing list for FREE weekly spells, recipes and curses.',
      action: 'SIGN ME UP',
    },
  ]),
  fake: Object.freeze([
    { title: '', headline: '', body: '', action: 'DOWNLOAD NOW!!' },
    { title: '', headline: '', body: 'FAST mirror', action: '>> START DOWNLOAD <<' },
  ]),
});
