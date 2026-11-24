import { describe, expect, it } from 'vitest';
import type { Ad } from '../../../src/game/ads/adTypes';
import type { AdBalance } from '../../../src/game/balance/ads';
import { controlsFor, resolveClick, resolveHover } from '../../../src/game/ads/closePatterns';

const balance = { countdownSeconds: 3, runawayJumps: 3 } as AdBalance;
const ad = (o: Partial<Ad>): Ad => ({
  id: 1, kind: 'clutter', pattern: 'plain', rect: { x: 0, y: 0, w: 420, h: 240 }, openTick: 0,
  copy: 0, laneCover: false, stage: 'main', corner: null, closeAt: null, jumps: 0, ...o,
});

describe('closePatterns', () => {
  it('plain closes on close, mistakes on body, ignores missing controls', () => {
    const a = ad({});
    expect(resolveClick(a, 'close', 0, balance).kind).toBe('close');
    expect(resolveClick(a, 'body', 0, balance).kind).toBe('mistake');
    expect(resolveClick(a, 'skip', 0, balance).kind).toBe('ignore');
  });
  it('decoy big ✕ and swapped OK are mistakes', () => {
    expect(resolveClick(ad({ pattern: 'decoy' }), 'bigClose', 0, balance).kind).toBe('mistake');
    expect(resolveClick(ad({ pattern: 'swapped' }), 'ok', 0, balance).kind).toBe('mistake');
    expect(resolveClick(ad({ pattern: 'swapped' }), 'noThanks', 0, balance).kind).toBe('close');
  });
  it('countdown skip works only after the countdown', () => {
    const a = ad({ pattern: 'countdown', openTick: 10 });
    expect(resolveClick(a, 'skip', 10 + 179, balance).kind).toBe('ignore');
    expect(resolveClick(a, 'skip', 10 + 180, balance).kind).toBe('close');
  });
  it('confirm advances, No goes back, Yes closes', () => {
    expect(resolveClick(ad({ pattern: 'confirm' }), 'close', 0, balance)).toEqual({ kind: 'stage', stage: 'confirm' });
    const c = ad({ pattern: 'confirm', stage: 'confirm' });
    expect(controlsFor(c)).toEqual(['confirmYes', 'confirmNo', 'body']);
    expect(resolveClick(c, 'confirmNo', 0, balance)).toEqual({ kind: 'stage', stage: 'main' });
    expect(resolveClick(c, 'confirmYes', 0, balance).kind).toBe('close');
  });
  it('fake button clicks are fake hits', () => {
    expect(resolveClick(ad({ kind: 'fake', pattern: null }), 'fakeButton', 0, balance).kind).toBe('fakeHit');
  });
  it('runaway ✕ jumps at most 3 times, at least 60 px, inside the ad', () => {
    let a: Ad = ad({ kind: 'interrupter', pattern: 'runaway', closeAt: { x: 400, y: 4 } });
    let r = 0.123;
    const rand = () => (r = (r * 9301 + 0.49297) % 1);
    for (let i = 0; i < 3; i++) {
      const n = resolveHover(a, balance, rand)!;
      expect(Math.hypot(n.closeAt!.x - a.closeAt!.x, n.closeAt!.y - a.closeAt!.y)).toBeGreaterThanOrEqual(60);
      expect(n.closeAt!.x).toBeLessThanOrEqual(404);
      expect(n.closeAt!.y).toBeLessThanOrEqual(224);
      a = n;
    }
    expect(a.jumps).toBe(3);
    expect(resolveHover(a, balance, rand)).toBeNull();
    expect(resolveClick(a, 'close', 0, balance).kind).toBe('close');
  });
});
