// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import fc from 'fast-check';
import { createDownloadPanel, downloadView, FILE_KB } from '../../../src/render/browser/downloadPanel';
import { downloadRate } from '../../../src/game/downloadRate';
import { createNetsurferContent, CONTENT_ORIGIN } from '../../../src/render/browser/netsurferWindow';
import { DEFAULT_AD_BALANCE } from '../../../src/game/balance/ads';
import { DEFAULT_CORE_BALANCE } from '../../../src/game/balance/core';
import { initialAds } from '../../../src/game/ads/adSystems';
import type { Ad, AdKind, AdState } from '../../../src/game/ads/adTypes';
import { bandwidthFor } from '../../../src/game/ads/bandwidth';
import { DOWNLOAD_PANEL } from '../../../src/ui/browserCopy';

// ad-pressure 6.1: the view now reads the rate from downloadRate(state), so the input carries
// integrity and the full core balance. At full integrity with no bandwidth field the rate is
// exactly downloadPercentPerSecond, so the old expected texts below are unchanged.
const balance = { ...DEFAULT_CORE_BALANCE, downloadPercentPerSecond: 100 / 110 };
const full = { pauseSources: [] as string[], integrity: balance.maxIntegrity, balance };

function ad(id: number, kind: AdKind): Ad {
  return {
    id,
    kind,
    pattern: kind === 'fake' ? null : 'plain',
    rect: { x: 0, y: 0, w: 10, h: 10 },
    openTick: 0,
    copy: 0,
    laneCover: false,
    stage: 'main',
    corner: null,
    closeAt: null,
    jumps: 0,
  };
}

/** Ad_State with the given open Ads and the `bandwidth` the bandwidth system would write. */
function withAds(kinds: readonly AdKind[]): { ads: AdState; bandwidth: number } {
  const ads = { ...initialAds(DEFAULT_AD_BALANCE), ads: kinds.map((k, i) => ad(i + 1, k)) };
  return { ads, bandwidth: bandwidthFor(ads) };
}

describe('downloadView', () => {
  it('shows rate and time left', () => {
    const v = downloadView({ ...full, download: 50 });
    expect(v.percent).toBe(50);
    expect(v.rateText).toBe('18.6 KB/s');
    expect(v.timeLeftText).toBe('0:55');
    expect(v.causeText).toBe('');
  });
  it('shows waiting while paused', () => {
    expect(downloadView({ ...full, download: 10, pauseSources: ['ad:1'] }).timeLeftText).toBe(
      'Waiting for server...',
    );
  });
  // ad-pressure Req 7.1: rate and time left follow downloadRate(state).
  it('slows the rate and time left with open clutter', () => {
    // 2 clutter: bandwidth 0.7 → 2048 × (100/110) × 0.7 / 100 = 13.03 KB/s; 50 / 0.636 = 78.6 s.
    const v = downloadView({ ...full, ...withAds(['clutter', 'clutter', 'fake']), download: 50 });
    expect(v.rateText).toBe('13.0 KB/s');
    expect(v.timeLeftText).toBe('1:19');
    expect(v.causeText).toBe(DOWNLOAD_PANEL.causeAds(2));
  });
  it('slows the rate with a damaged modem', () => {
    // integrity 0: Line_Quality 0.6 → 11.17 KB/s; 50 / 0.545 = 91.7 s.
    const v = downloadView({ ...full, integrity: 0, download: 50 });
    expect(v.rateText).toBe('11.2 KB/s');
    expect(v.timeLeftText).toBe('1:32');
    expect(v.causeText).toBe(DOWNLOAD_PANEL.causeLine);
  });
  it('names both causes when both apply', () => {
    const v = downloadView({ ...full, ...withAds(['clutter']), integrity: 50, download: 0 });
    expect(v.causeText).toBe(`${DOWNLOAD_PANEL.causeAds(1)} ${DOWNLOAD_PANEL.causeLine}`);
  });
  it('shows no cause for interrupters and fake buttons alone', () => {
    const v = downloadView({ ...full, ...withAds(['interrupter', 'fake']), download: 0 });
    expect(v.rateText).toBe('18.6 KB/s');
    expect(v.causeText).toBe('');
  });
  // Property: Req 6.1, 6.3 percent, bar fraction and waiting follow the state (part of Property 9).
  // **Validates: Requirements 6.1, 6.2, 6.3**
  it('percent, fraction and waiting match the state', () => {
    fc.assert(
      fc.property(fc.double({ min: 0, max: 100, noNaN: true }), fc.boolean(), (d, paused) => {
        const v = downloadView({ ...full, download: d, pauseSources: paused ? ['x'] : [] });
        expect(v.percent).toBe(Math.floor(d));
        expect(v.fraction).toBeCloseTo(d / 100);
        expect(v.waiting).toBe(paused);
      }),
    );
  });
});

describe('download panel DOM', () => {
  it('updates text and penalty class', () => {
    const p = createDownloadPanel();
    p.update({ ...full, download: 25.7 });
    expect(p.root.querySelector('.dl-percent')!.textContent).toBe('25%');
    const cause = p.root.querySelector('.dl-cause') as HTMLElement;
    expect(cause.hidden).toBe(true);
    expect(cause.textContent).toBe('');
    p.update({ ...full, ...withAds(['clutter', 'clutter', 'clutter']), download: 26 });
    expect(cause.hidden).toBe(false);
    expect(cause.textContent).toBe(DOWNLOAD_PANEL.causeAds(3));
    p.update({ ...full, download: 27 });
    expect(cause.hidden).toBe(true);
    p.setPenalty(true);
    expect(p.root.classList.contains('is-penalty')).toBe(true);
  });
});

/** Download_Panel inputs the game can produce: `bandwidth` is what the bandwidth system writes. */
const arbPanelInput = fc
  .record({
    download: fc.double({ min: 0, max: 100, noNaN: true }),
    paused: fc.boolean(),
    integrity: fc.oneof(fc.constant(balance.maxIntegrity), fc.integer({ min: 0, max: balance.maxIntegrity })),
    // undefined: a core-only Run with no Ad_State and no bandwidth field.
    kinds: fc.option(fc.array(fc.constantFrom<AdKind>('clutter', 'interrupter', 'fake'), { maxLength: 10 }), {
      nil: undefined,
    }),
  })
  .map(({ download, paused, integrity, kinds }) => ({
    ...full,
    download,
    integrity,
    pauseSources: paused ? ['ad:1'] : [],
    ...(kinds === undefined ? {} : withAds(kinds)),
  }));

describe('download panel rate and cause (ad-pressure 6.5)', () => {
  // Property: ad-pressure Req 7.1 the shown rate is downloadRate(state), and the cause line is
  // empty exactly when the rate is at full speed.
  // **Validates: Requirements 7.1**
  it('shows downloadRate(state) and a cause line exactly when below full speed', () => {
    const p = createDownloadPanel();
    const rate = p.root.querySelector('.dl-rate') as HTMLElement;
    const cause = p.root.querySelector('.dl-cause') as HTMLElement;
    fc.assert(
      fc.property(arbPanelInput, (s) => {
        p.update(s);
        const pct = downloadRate(s);
        const kbps = s.pauseSources.length > 0 ? 0 : Math.round(((FILE_KB * pct) / 100) * 10) / 10;
        expect(rate.textContent).toBe(DOWNLOAD_PANEL.rate(kbps));
        const atFull = pct === balance.downloadPercentPerSecond;
        expect(downloadView(s).causeText === '').toBe(atFull);
        expect(cause.textContent === '').toBe(atFull);
        expect(cause.hidden).toBe(atFull);
      }),
      { numRuns: 200 },
    );
  });

  it('puts the cause line in through textContent only (ad-pressure Req 7.4)', async () => {
    const HOSTILE = '<img src=x onerror="alert(1)"><b>chew</b>';
    vi.resetModules();
    vi.doMock('../../../src/ui/browserCopy', async (importOriginal) => {
      const real = await importOriginal<typeof import('../../../src/ui/browserCopy')>();
      return { ...real, DOWNLOAD_PANEL: { ...real.DOWNLOAD_PANEL, causeAds: () => HOSTILE, causeLine: HOSTILE } };
    });
    try {
      const fresh = await import('../../../src/render/browser/downloadPanel');
      const innerHTML = vi.spyOn(Element.prototype, 'innerHTML', 'set');
      const p = fresh.createDownloadPanel();
      p.update({ ...full, ...withAds(['clutter']), integrity: 10, download: 5 });
      const cause = p.root.querySelector('.dl-cause') as HTMLElement;
      expect(cause.hidden).toBe(false);
      expect(cause.textContent).toBe(`${HOSTILE} ${HOSTILE}`);
      expect(cause.children).toHaveLength(0);
      expect(p.root.querySelector('img, b')).toBeNull();
      expect(innerHTML).not.toHaveBeenCalled();
    } finally {
      vi.doUnmock('../../../src/ui/browserCopy');
      vi.resetModules();
      vi.restoreAllMocks();
    }
  });
});

describe('netsurfer content', () => {
  it('places page and real link at the balance rects', () => {
    let clicks = 0;
    const c = createNetsurferContent(DEFAULT_AD_BALANCE, () => clicks++);
    const { page, realLink } = DEFAULT_AD_BALANCE;
    expect(c.page.style.left).toBe(`${page.x - CONTENT_ORIGIN.x}px`);
    expect(c.page.style.top).toBe(`${page.y - CONTENT_ORIGIN.y}px`);
    expect(c.realLink.style.left).toBe(`${realLink.x - page.x}px`);
    expect(c.root.querySelectorAll('.ns-tool')).toHaveLength(5);
    c.realLink.click();
    expect(clicks).toBe(1);
    c.setStatus('busy');
    expect(c.root.querySelector('.ns-status-text')!.textContent).toBe('busy');
    c.showStarted();
    expect(c.realLink.hidden).toBe(true);
  });
});
