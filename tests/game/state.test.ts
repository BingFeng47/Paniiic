import { describe, expect, it } from 'vitest';
import { BalanceError, DEFAULT_CORE_BALANCE } from '../../src/game/balance/core';
import { createRun } from '../../src/game/state';

describe('createRun', () => {
  it('starts dialing with full integrity and no download progress (Req 3.1)', () => {
    expect(createRun({ seed: 42 })).toEqual({
      seed: 42,
      tick: 0,
      rng: 42,
      phase: 'dialing',
      phaseStartTick: 0,
      integrity: DEFAULT_CORE_BALANCE.maxIntegrity,
      download: 0,
      pauseSources: [],
      criticalLatched: false,
      halfwayReached: false,
      balance: DEFAULT_CORE_BALANCE,
    });
  });

  it('normalizes the seed to an unsigned 32-bit integer and uses it as the RNG state', () => {
    expect(createRun({ seed: -1 })).toMatchObject({ seed: 0xffffffff, rng: 0xffffffff });
    expect(createRun({ seed: 2 ** 32 + 5 })).toMatchObject({ seed: 5, rng: 5 });
    expect(createRun({ seed: 7.9 })).toMatchObject({ seed: 7, rng: 7 });
  });

  it('applies balance overrides, including max integrity', () => {
    const state = createRun({ seed: 1, balance: { maxIntegrity: 50, dialSeconds: 5 } });
    expect(state.integrity).toBe(50);
    expect(state.balance).toEqual({ ...DEFAULT_CORE_BALANCE, maxIntegrity: 50, dialSeconds: 5 });
  });

  it('starts latched when integrity starts at the critical threshold (critical === max)', () => {
    expect(createRun({ seed: 1, balance: { criticalIntegrity: 100 } }).criticalLatched).toBe(true);
  });

  it('does not let overrides leak into later runs', () => {
    createRun({ seed: 1, balance: { maxIntegrity: 50 } });
    expect(createRun({ seed: 1 }).balance).toEqual(DEFAULT_CORE_BALANCE);
  });

  it('rejects invalid balance overrides with BalanceError (Req 8.2)', () => {
    expect(() => createRun({ seed: 1, balance: { dialSeconds: -1 } })).toThrow(BalanceError);
    expect(() => createRun({ seed: 1, balance: { criticalIntegrity: 200 } })).toThrow(
      BalanceError,
    );
  });

  it('returns plain data that survives a JSON round trip (Req 6.2)', () => {
    const state = createRun({ seed: 123, balance: { downloadPercentPerSecond: 2 } });
    expect(JSON.parse(JSON.stringify(state))).toEqual(state);
  });

  it('does not carry a bandwidth key, so core-only states keep their shape (ad-pressure Req 2.5, 9.2)', () => {
    const state = createRun({ seed: 9 });
    expect(Object.keys(state)).not.toContain('bandwidth');
    expect(JSON.parse(JSON.stringify(state))).toStrictEqual(state);
  });

  it('keeps a set bandwidth through a JSON round trip (ad-pressure Req 9.2)', () => {
    const state = { ...createRun({ seed: 9 }), bandwidth: 0.55 };
    expect(JSON.parse(JSON.stringify(state))).toStrictEqual(state);
  });
});
