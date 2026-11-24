---
name: add-ad
description: Add a new pop-up ad kind or close pattern to the browser front (for example a "chain letter" ad or a "shrinking ✕" pattern) end to end, covering the type unions, the close pattern table, ad balance and validation, opening and placement, the DOM builder, copy, sounds and tests. Use when adding, renaming or changing an Ad_Kind, a Close_Pattern or an ad's controls.
---

# Add an ad kind or a close pattern to the browser front

The checklist uses a new close pattern `shrink` and a new ad kind `chain` as examples. Replace
them with the real names. Each step names the file and the symbol to change. A new pattern
usually needs steps 1–2 and 3.2–3.3 only; a new kind touches every step.

## 0. Before writing code

- `docs/game-design.md` is the source of truth. Section 7 fixes three ad kinds (clutter, fake
  button, interrupter) and the close patterns. A new kind or pattern changes the design. Ask
  the team first, then add its row to section 7 (behaviour, correct response, mistake, chapter).
- **One correct control per close pattern** (design section 9). A player who has seen the
  pattern once must be able to close it in about 2 seconds.
- Read the `retro-copy` steering (`.kiro/steering/retro-copy.md`) before writing any ad text.

## 1. Type unions: `src/game/ads/adTypes.ts`

1. New pattern: add `'shrink'` to `ClosePattern`. New kind: add `'chain'` to `AdKind`.
2. New controls the player can click go into `AdControl`. Reuse existing controls
   (`close`, `tinyClose`, `skip`...) where the meaning is the same.
3. Extra per-ad state goes on `Ad` as `readonly` plain data (numbers, `null`, no `undefined`,
   no functions) so the state survives a JSON round trip. See `corner`, `closeAt` and `jumps`.
4. New events go into `AdEventBody`.

## 2. Close pattern table: `src/game/ads/closePatterns.ts`

1. Add a `'shrink:main'` row to `CLOSE_PATTERN_TABLE` with `controls` (drawing order),
   `correct` (exactly one control, or `null` for a stage that only moves to another stage) and
   `wrong` (controls that count as a mistake and open one more clutter). Controls in neither
   list are ignored. A multi-stage pattern adds a row per stage, like `confirm:confirm`.
   `rowFor` throws at runtime when a row is missing; typecheck will not catch it.
2. Special click rules (timers, stage changes) go into `resolveClick`, like the `countdown`
   ready tick and the `confirm` stages. Hover rules go into `resolveHover` (runaway ✕).
3. Keep it pure: no DOM, timers, `Date.now()` or `Math.random()`. Randomness only through the
   `random` argument, which comes from `ctx.random()`.

## 3. Balance: `src/game/balance/ads.ts`

1. Add the name to the runtime list: `CLOSE_PATTERNS` for a pattern, `AD_KINDS` for a kind.
   **Typecheck will not remind you.** `resolveAdBalance` and `validateAdBalance` loop over
   these lists, so a missing name makes every schedule row that uses it fail validation.
2. New kind: add a `chain` row to `DEFAULT_AD_BALANCE.sizes` (`AdBalance.sizes` is a full
   `Record<AdKind, ...>`, so typecheck forces it).
3. Add the pattern or kind to the placeholder Ad_Schedule in `DEFAULT_AD_BALANCE.schedule`
   (`AdRow`: `kind`, `startSecond`, `endSecond`, `everySeconds`, `patterns`, `laneCover`) in the
   chapter the design gives it. Run seconds count from dial start; connect is at 20 s.
   `scheduleAds` in `src/game/ads/adSystems.ts` reads the rows; no code change there. The
   milestone-5 director replaces it through `createAdSystems({ scheduler })`.
4. Behaviour numbers (durations, distances) get a field in `AdBalance`, `AdBalanceOverrides`,
   `resolveAdBalance` and a `check(...)` line in `validateAdBalance`. See `countdownSeconds`
   and `runawayJumps`. Never put a number inline in logic.
5. Know the ad-pressure keys (design sections 4, 7, 8) before adding a kind or changing clutter:
   - `bandwidthPerClutter` (0.15) and `bandwidthFloor` (0.4): each open clutter Ad takes 15
     points of download speed, down to 40%. `bandwidthFor` in `src/game/ads/bandwidth.ts`
     counts the Ads.
   - `hatchSeconds` (10) and `hatchWarningSeconds` (3): a clutter Ad open for a whole multiple
     of `hatchSeconds` lets one Mob out of the Manhole, and the Ad shows the Hatch_Warning for
     the last 3 s. **Hatching applies to clutter only.** The Mob kind is the Chapter's
     `hatchKind` in `src/game/balance/chapters.ts` (`null` turns it off).
   - `cap` (8) counts **clutter only**. Interrupters and fake buttons always open, so a screen
     full of clutter never shields the download.
   - `laneArea` (`{ x: 0, y: 480, w: 1024, h: 260 }`): the Screen rect over the Lane_Dock. It
     must lie inside `field` and fit `sizes.clutter`, and it must equal the Lane_Dock in
     `src/desktop/layout.ts` (a test pins this).

## 4. Opening and placement: `src/game/ads/openAd.ts`, `src/game/ads/placement.ts`

1. `AD_COPY_COUNTS` in `openAd.ts`: new kind gets a copy variant count (typecheck forces it).
   It must equal the number of `AD_COPY` entries in step 6.
2. Initial per-ad state for a pattern (like `corner` for `hidden`, `closeAt` for `runaway`) is
   set in `openAd`. Random draws only through `random`.
3. New kind: add a `case 'chain'` to the switch in `placeAd` (`placement.ts`). Reuse
   `uniformIn` or write a placement rule like `fakeFallback`. Decide in `openAd` whether it
   pauses the download (`ctx.addPauseSource`, interrupters only so far).
4. Kind-specific click or expiry handling (fake buttons) lives in `src/game/ads/adSystems.ts`.
5. The Ad_Cap check in `openAd` uses `clutterCount`, so only clutter is ever skipped with
   `adSkipped`. Keep that rule: a new kind that must always appear stays out of the count.
6. Lane_Cover: a clutter row with `laneCover: true` is placed fully inside `laneArea`
   (`placeClutter` in `placement.ts`); other clutter goes in `desktop`. The live rows are the
   Chapter `ads` in `src/game/balance/chapters.ts` (Lane_Cover from Pinch 1 on). A Lane_Cover Ad
   blocks hammer, saw, flamethrower and pickups under it in `src/render/laneView.ts`.
7. **A new clutter-like kind must decide three things** and say so in its design row:
   - Does it eat bandwidth? Then count it in `bandwidthFor` (`src/game/ads/bandwidth.ts`).
   - Does it hatch? Then let `hatchView` and `hatchesNow` (`src/game/ads/hatch.ts`) accept it;
     `hatchSpawns` in `src/game/director/directorAds.ts` and the `is-hatching` warning in
     `adDom.ts` follow from those two helpers.
   - Does it count toward the Ad_Cap? Then count it in `clutterCount` (`openAd.ts`).
   All three check `kind === 'clutter'` today, so a new kind is left out unless you add it.

## 5. DOM: `src/render/browser/adDom.ts`

1. `buildAd` draws one element per control with `data-control` set to the `AdControl`; the
   Ad_Layer reads that attribute and sends `adClick`. Add the new control's element, gated by
   `has('...')`. The root gets `ad-pattern-shrink` / `ad-chain` classes for styling.
2. Text that changes while the ad is open goes through `updateAdText`, and anything that
   changes the element structure must change `adSignature` so the view rebuilds it.
3. Text only through `h()` children or `textContent`, never `innerHTML`.
4. Styles go in `src/styles/browser.css`.

## 6. Copy: `src/ui/browserCopy.ts`

- New kind: add `AD_COPY.chain` with exactly `AD_COPY_COUNTS.chain` entries (`title`,
  `headline`, `body`, `action`).
- New control labels go into `AD_LABELS`.
- Follow the `retro-copy` steering. No real trademarks; `tests/copy.test.ts` scans the strings.

## 7. Sounds (optional): `src/render/browser/browserSounds.ts`

- `adOpened`, `adClosed`, `adMistake`, `fakeButtonClicked` and `adCloseJumped` already play cues.
- For a new cue: add an id to `BrowserSoundId`, a length to `BROWSER_SOUND_SEC`, a recipe built
  from the `src/core/soundKit.ts` helpers to `BROWSER_SOUNDS`, and a case in the event switch
  used by `browserSoundsFor`. Synthesized Web Audio only, no audio files.

## 8. Tests to add or update

- `tests/game/ads/closePatterns.test.ts`: the correct control closes, each wrong control is a
  mistake, other controls are ignored, plus any timer or stage rule, with exact ticks.
- `tests/game/ads/openAd.test.ts`: initial per-ad state and, for a new kind, placement inside
  its area.
- `tests/ui/browserCopy.test.ts` checks `AD_COPY` against `AD_COPY_COUNTS` without edits.
- `tests/render/browser/adLayer.test.ts`: the builder draws the new controls with the right
  `data-control` and a click sends the matching `adClick`.
- `tests/game/headless.test.ts` runs whole runs; check it still passes with the new schedule row.
- A kind that eats bandwidth, hatches or counts toward the cap: extend
  `tests/game/ads/bandwidth.test.ts`, `tests/game/ads/hatch.test.ts` and the cap and placement
  properties in `tests/game/ads/adPressureProperties.test.ts`.
- Property tests are named after the requirement they check, for example
  `// Property: Req 6.1 exactly one correct control per pattern`.

## 9. Check

```sh
npm run typecheck   # lists every exhaustive Record and switch still missing the new kind
npm test
```

Fix the code, never weaken a failing test. If the ad changes the run's pacing, report the old
and new numbers and the reason.
