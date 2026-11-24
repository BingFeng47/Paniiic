/**
 * Every number of the CCTV camera layer (lane-cctv spec, Requirement 10.3).
 *
 * Times are in simulation ticks (60 per second). Alphas are 0..1. Colours are names of
 * `--c-cctv-*` tokens in theme.css, resolved once per mount like the lane palette.
 * This is render-only tuning; nothing here feeds back into `src/game/`.
 */
export const CCTV_TUNING = Object.freeze({
  /** Feed_Startup length. */
  startupTicks: 36,

  /** Grain: pre-rendered noise tiles, swapped every `grainEveryTicks` (15 times per second). */
  grainTiles: 4,
  grainTileSize: 128,
  grainEveryTicks: 4,
  grainAlpha: 0.09,

  /** Cached scanline + vignette overlay. */
  scanlineStep: 3,
  scanlineAlpha: 0.18,
  vignetteAlpha: 0.55,

  /** Camera_Grade: colour-blend tint, then a multiply darken. */
  gradeColor: '--c-cctv-grade',
  gradeAlpha: 0.85,
  darken: 0.12,

  /** Signal_Tear on modem hits. `tearMaxCover` is the largest share of the feed height. */
  tearTicks: 10,
  tearBands: 5,
  tearMaxCover: 0.3,
  tearAlpha: 0.45,

  /** Signal_Dropout at critical integrity: at most one per cycle, each `dropoutTicks` long. */
  dropoutEveryTicks: 120,
  dropoutTicks: 8,
  dropoutAlpha: 0.6,
  /**
   * NO SIGNAL cut on a loss (juice-and-endings Req 7.1): black, then noise held for
   * `noSignalHoldTicks` per frame so the picture changes at most 3 times per second (Req 8.1).
   * The cut asks the flash budget once; a `dim` grant uses `noSignalDimAlpha`.
   */
  noSignalHoldTicks: 20,
  noSignalAlpha: 0.5,
  noSignalDimAlpha: 0.25,

  /** Motion_Boxes around newly spawned Mobs. */
  motionBoxTicks: 60,

  /** REC dot blink: on for half of each `2 × recHalfPeriodTicks`. */
  recHalfPeriodTicks: 30,

  /** Flash limit: at most `flashBudget` flash onsets in any `flashWindowTicks` window. */
  flashBudget: 3,
  flashWindowTicks: 60,

  /** Camera sound levels on the Sfx_Channel. */
  humLevel: 0.04,
  staticLevel: 0.18,
});

export type CctvTuning = typeof CCTV_TUNING;

/** Colour token names for the camera layer, all defined in src/styles/theme.css. */
export const CCTV_TOKENS = Object.freeze({
  grade: '--c-cctv-grade',
  osd: '--c-cctv-osd',
  osdOutline: '--c-cctv-osd-outline',
  rec: '--c-cctv-rec',
  motion: '--c-cctv-motion',
} as const);
