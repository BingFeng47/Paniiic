import { describe, expect, it } from 'vitest';
import { createCctvOsd } from '../../../src/render/cctv/cctvOsd';
import { EMPTY_CCTV, type CctvState } from '../../../src/render/cctv/cctvState';
import { LANE_COPY } from '../../../src/ui/laneCopy';

const q = (el: HTMLElement, sel: string) => el.querySelector(sel)!;

describe('createCctvOsd', () => {
  it('shows label, REC, timestamp and startup status', () => {
    const osd = createCctvOsd();
    expect(osd.el.classList.contains('cctv-osd')).toBe(true);
    const cctv: CctvState = { ...EMPTY_CCTV, startTick: 420 };
    osd.update({ tick: 420 }, cctv, { shakeEnabled: true });
    expect(q(osd.el, '.cctv-label').textContent).toBe(LANE_COPY.cctv.label);
    expect(q(osd.el, '.cctv-rec').textContent).toBe(LANE_COPY.cctv.rec);
    expect(q(osd.el, '.cctv-rec').classList.contains('is-on')).toBe(true);
    expect(q(osd.el, '.cctv-time').textContent).toBe('11-23-98 11:59:07 PM');
    expect(q(osd.el, '.cctv-status').textContent).toBe(LANE_COPY.cctv.connecting);
    osd.update({ tick: 420 + 40 }, cctv, { shakeEnabled: true });
    expect(q(osd.el, '.cctv-status').textContent).toBe('');
    expect(q(osd.el, '.cctv-rec').classList.contains('is-on')).toBe(false);
  });

  it('sets .is-tearing only when shake is on and a tear shows', () => {
    const osd = createCctvOsd();
    const cctv: CctvState = { ...EMPTY_CCTV, startTick: 0, tearUntilTick: 110 };
    osd.update({ tick: 100 }, cctv, { shakeEnabled: false });
    expect(osd.el.classList.contains('is-tearing')).toBe(false);
    osd.update({ tick: 100 }, cctv, { shakeEnabled: true });
    expect(osd.el.classList.contains('is-tearing')).toBe(true);
    osd.update({ tick: 110 }, cctv, { shakeEnabled: true });
    expect(osd.el.classList.contains('is-tearing')).toBe(false);
  });

  it('does not rewrite unchanged text', () => {
    const osd = createCctvOsd();
    osd.update({ tick: 0 }, EMPTY_CCTV, { shakeEnabled: true });
    const node = q(osd.el, '.cctv-time').firstChild;
    osd.update({ tick: 30 }, EMPTY_CCTV, { shakeEnabled: true });
    expect(q(osd.el, '.cctv-time').firstChild).toBe(node);
  });
  it('writes the combo line through textContent and clears it on the feed cut (pacing-and-economy Req 5.5)', () => {
    const osd = createCctvOsd();
    osd.update({ tick: 0, combo: 'COMBO x3 +1 KB' }, EMPTY_CCTV, { shakeEnabled: true });
    expect(q(osd.el, '.cctv-combo').textContent).toBe('COMBO x3 +1 KB');
    osd.update({ tick: 1 }, EMPTY_CCTV, { shakeEnabled: true });
    expect(q(osd.el, '.cctv-combo').textContent).toBe('');
    osd.update({ tick: 2, combo: 'COMBO x4 +1 KB' }, EMPTY_CCTV, { shakeEnabled: true });
    osd.cut();
    expect(q(osd.el, '.cctv-combo').textContent).toBe('');
  });
});
