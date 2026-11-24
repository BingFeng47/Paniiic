// Tuning data for the juice-and-endings effects. Render-side only; changes no game rule.

export const JUICE_TUNING = Object.freeze({
  shake: Object.freeze({
    /** Ticks a shake lasts after a modemHit (Req 1.1). */
    durationTicks: 12,
    /** Hits of this amount or more count as heavy. */
    heavyHitAmount: 10,
    lightMaxPx: 2,
    heavyMaxPx: 4,
    /** Added to the limit while integrity is critical (Req 1.2). */
    criticalBonusPx: 1,
  }),
  /** Integrity at or below which crack stages 1, 2, 3 show (Req 2.1). */
  crackThresholds: Object.freeze([20, 10, 5] as const),
  corruption: Object.freeze({ none: 0, faint: 1, strong: 2 } as const),
  /** End_Transition length in frame ticks (Req 7). */
  transitionTicks: 30,
  /** Max live sfx voices (Req 6.4). */
  voiceCap: 24,
  voiceStealFadeMs: 20,
  /** Master limiter (Req 6.5). */
  limiter: Object.freeze({ thresholdDb: -6, kneeDb: 0, ratio: 20, attackS: 0.003, releaseS: 0.12 }),
  /** Flash budget: at most `maxFull` full flashes in any `windowTicks` (Req 8.1). */
  flash: Object.freeze({ maxFull: 3, windowTicks: 60 }),
});
