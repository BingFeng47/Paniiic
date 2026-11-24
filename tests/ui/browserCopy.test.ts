import { describe, expect, it } from 'vitest';
import { AD_COPY_COUNTS } from '../../src/game/ads/openAd';
import { AD_COPY, AD_LABELS, BROWSER_WINDOW, DOWNLOAD_PAGE, DOWNLOAD_PANEL } from '../../src/ui/browserCopy';
import { ICON_NAMES, ICON_SVG } from '../../src/desktop/iconArt';

const ALL = JSON.stringify({ AD_COPY, AD_LABELS, BROWSER_WINDOW, DOWNLOAD_PAGE, DOWNLOAD_PANEL });

describe('browserCopy', () => {
  it('has as many ad variants per kind as AD_COPY_COUNTS', () => {
    for (const kind of Object.keys(AD_COPY_COUNTS) as (keyof typeof AD_COPY_COUNTS)[]) {
      expect(AD_COPY[kind]).toHaveLength(AD_COPY_COUNTS[kind]);
    }
  });

  it('uses the exact design strings', () => {
    expect(BROWSER_WINDOW.title).toBe('MidnightNet Download Center - NetSurfer');
    expect(BROWSER_WINDOW.statusBusy).toBe('NetSurfer is busy. Please try again later.');
    expect(DOWNLOAD_PAGE.realLink).toBe('download HOMEWORK.ZIP (mirror 3)');
    expect(DOWNLOAD_PAGE.started).toBe('Your download has started. Please do not hang up.');
    expect(AD_LABELS.noThanks).toBe('no thanks, I like slow Internet');
    expect(DOWNLOAD_PANEL.waiting).toBe('Waiting for server...');
  });

  it('formats rate and time left', () => {
    expect(DOWNLOAD_PANEL.rate(3.24)).toBe('3.2 KB/s');
    expect(DOWNLOAD_PANEL.timeLeft(65)).toBe('1:05');
    expect(DOWNLOAD_PANEL.timeLeft(-3)).toBe('0:00');
  });

  it('formats the slow-download cause lines (ad-pressure Req 7.1, 7.4)', () => {
    expect(DOWNLOAD_PANEL.causeAds(1)).toBe('1 pop-up is using your bandwidth.');
    expect(DOWNLOAD_PANEL.causeAds(3)).toBe('3 pop-ups are using your bandwidth.');
    expect(DOWNLOAD_PANEL.causeLine).toBe('Line noise detected. Something is chewing on the modem.');
    // JSON.stringify skips functions, so check the formatted cause text for trademarks too.
    expect(DOWNLOAD_PANEL.causeAds(2)).not.toMatch(/windows|microsoft|netscape|\baol\b|internet explorer/i);
  });

  it('names no real trademarks', () => {
    expect(ALL).not.toMatch(/windows|microsoft|netscape|\baol\b|internet explorer/i);
  });

  it('has a browser icon', () => {
    expect(ICON_NAMES).toContain('browser');
    expect(ICON_SVG.browser).toMatch(/^<svg/);
  });
});
