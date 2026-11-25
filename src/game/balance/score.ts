// Score tuning for the leaderboard (leaderboard Req 3.1). docs/game-design.md section 12 mirrors it.
/** Bump when the score formula changes, so old and new rows can be told apart. */
export const SCORE_VERSION = 1;

export const SCORE_TABLE = {
  perPercent: 10,
  perKill: 10,
  boss: 200,
  perAd: 20,
  perCombo: 25,
  comboMin: 3,
  winBase: 1000,
  perIntegrity: 10,
  perSecondUnder: 5,
  parSeconds: 240,
} as const;
