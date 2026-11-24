# Design Document: ad-pressure

## Overview

Four small rule changes and their views:

1. **Bandwidth**: a new `bandwidthSystem` writes `GameState.bandwidth` from the number of open
   clutter Ads. `step()` multiplies the download step by it.
2. **Line quality**: `step()` also multiplies by a factor from integrity. Both factors come from
   one pure helper, `downloadRate(state)`, which the Download_Panel reuses.
3. **Hatching**: `directorAds` spawns a Mob for every clutter Ad whose age hits a multiple of
   `hatchSeconds`. No new Ad state.
4. **Cap and placement**: `openAd` counts clutter only; Lane_Cover clutter is placed in
   `laneArea`, and Pinch 1 gets a Lane_Cover row.

A shared `createGameSystems()` comes first so that the bot runner gets every later rule for free.

## Architecture

```mermaid
flowchart LR
  subgraph tick[one Tick, systems stage]
    L[lane systems<br/>ensureLane, hammer, weapons, mobs, directorLane] --> A[ad systems<br/>ensureAds, adInput, directorAds + hatch, adExpiry]
    A --> W[economy.wallet<br/>packets, blocker]
    W --> B[bandwidthSystem<br/>NEW: writes draft.bandwidth]
  end
  B --> D[step stage 6<br/>download += downloadRate(draft) / TICK_RATE]
```

`bandwidthSystem` runs last so it counts clutter after this Tick's closes (`adInputSystem`),
openings (`directorAds`) and blocks (`walletSystem`).

## Components and Interfaces

### `src/game/systems.ts` (new)

```ts
export interface GameSystemOverrides {
  readonly lane?: LaneBalanceOverrides;
  readonly ads?: AdBalanceOverrides;
  readonly chapters?: ChapterTableOverrides;
  readonly economy?: EconomyBalanceOverrides;
}
/** Session_Registry order, then bandwidthSystem. Later specs append here (statsSystem). */
export function createGameSystems(o: GameSystemOverrides = {}): readonly System[];
```

`sessionRegistry.ts` replaces its inline list with `createGameSystems()`. `runBot.ts`'s
`buildSystems` becomes a call to it (its `BalanceOverrides` already has these four keys plus
`core`, which goes to `createRun`).

### Core balance and step (`src/game/balance/core.ts`, `src/game/step.ts`)

- `CoreBalance.lineQualityFloor: number` (default 0.6, validated in [0, 1]).
- `GameState.bandwidth?: number`. `MutableGameState` keeps it optional. `createRun` does not set
  it, so core-only states keep their shape.
- New `src/game/downloadRate.ts`:

```ts
export function lineQuality(state: Pick<GameState, 'integrity' | 'balance'>): number {
  const { maxIntegrity, lineQualityFloor: f } = state.balance;
  const share = Math.min(1, Math.max(0, state.integrity / maxIntegrity));
  return f + (1 - f) * share;
}
/** Percent per second right now. */
export function downloadRate(state: Pick<GameState, 'integrity' | 'balance' | 'bandwidth'>): number {
  return state.balance.downloadPercentPerSecond * (state.bandwidth ?? 1) * lineQuality(state);
}
```

- `step()` stage 6: `const perTick = downloadRate(draft) / TICK_RATE`. At full integrity with no
  bandwidth field the product is exactly `downloadPercentPerSecond × 1 × 1`, so the existing
  "6,600 Ticks" test and the EPSILON rule still hold.

### Ad balance (`src/game/balance/ads.ts`)

New fields, merged and validated like the others:

| Key | Default | Rule |
|---|---|---|
| `bandwidthPerClutter` | 0.15 | [0, 1] |
| `bandwidthFloor` | 0.4 | [0, 1] |
| `hatchSeconds` | 10 | ≥ 1 Tick |
| `hatchWarningSeconds` | 3 | [0, hatchSeconds] |
| `laneArea` | `{ x: 0, y: 480, w: 1024, h: 260 }` | integer rect inside `field`, fits `sizes.clutter` |

`laneArea` matches `desktopArea(true)` (480 = 768 − 28 − 260) and `LANE_DOCK_H` in
`src/desktop/layout.ts`. A test pins that equality so a layout change can't drift silently.

### Bandwidth system (`src/game/ads/bandwidth.ts`, new)

```ts
export function bandwidthFor(ads: AdState): number {
  const n = ads.ads.filter((a) => a.kind === 'clutter').length;
  const b = ads.balance;
  return Math.max(b.bandwidthFloor, 1 - b.bandwidthPerClutter * n);
}
export const bandwidthSystem: System = (draft) => {
  if (draft.ads !== undefined) draft.bandwidth = bandwidthFor(draft.ads);
};
```

### Hatching (`src/game/ads/hatch.ts`, new; called from `directorAds`)

```ts
export interface HatchView { readonly secondsLeft: number; readonly warning: boolean }
export function hatchView(ad: Ad, tick: number, b: AdBalance): HatchView | null; // null unless clutter
/** True on the Ticks this clutter Ad hatches: age > 0 and age % hatchTicks === 0. */
export function hatchesNow(ad: Ad, tick: number, b: AdBalance): boolean;
```

`directorAds` runs hatching right after `fakeSpawns`, before the calm check (Requirement 4.4):

```ts
const kind = chapterOf(t, dir.chapter).hatchKind;
if (kind !== null) for (const ad of ads.ads) if (hatchesNow(ad, tick, ads.balance)) {
  const mobId = addMob(lane, ctx, kind, laneLength, 'adHatch');
  ctx.emit({ type: 'adHatched', id: ad.id, mobId });
}
```

It iterates the Ad list from before this Tick's new Ads, which have age 0 anyway. `addMob`
already returns the new Mob id.

New event in `AdEventBody`: `{ type: 'adHatched'; id: number; mobId: number }`.
`SpawnSource` gains `'adHatch'`.

### Chapter table (`src/game/balance/chapters.ts`)

- `Chapter.hatchKind: 'default' | 'fast' | 'tank' | null`, validated.
- Defaults: hook `null`, plotTurn1 `default`, pinch1 `default`, midpoint `fast`, pinch2 `fast`,
  plotTurn2 `fast`, resolution `null`.
- Pinch 1 gains `row('clutter', 16, 25, TRICKY, { startSecond: 4, laneCover: true })`.
  `pacing-and-economy` retimes all rows later; it keeps this row's role.

### Cap and placement (`src/game/ads/openAd.ts`, `src/game/ads/placement.ts`)

- `openAd`: `if (kind === 'clutter' && clutterCount(state) >= b.cap) { emit adSkipped; return }`.
- `placeClutter`: `const area = laneCover ? b.laneArea : b.desktop`.

### Views

- **Download_Panel** (`src/render/browser/downloadPanel.ts`): `downloadView` takes the state
  fields `downloadRate` needs and shows the KB/s from it. New `causeText`:
  `DOWNLOAD_PANEL.causeAds(n)`, `DOWNLOAD_PANEL.causeLine`, or both, from `browserCopy.ts`.
  Time left uses the current rate.
- **Ad_Layer** (`adDom.ts`, `adLayer.ts`): `updateAdText` toggles `is-hatching` from
  `hatchView`. `browser.css` adds the shake (transform only), a crack overlay and a hand, drawn as
  constant inline SVG. The shake runs at 2 Hz with no brightness change, so the flash budget is
  untouched.
- **Sounds** (`browserSounds.ts`): `hatch` (wood creak plus a low groan), synthesized like the
  others, played on `adHatched`.
- **Lane_View** (`src/render/laneView.ts`): no new drawing; the Mob spawns like a scheduled one.
  Verify that `pointerleave` fires when the pointer moves onto a Lane_Cover Ad and that it sends
  `down: false` (Requirement 6.4); add the call if it doesn't.
- **Hints**: `guideCopy.ts` clutter body and a new `hatch` entry; `hintTable.ts` adds
  `{ id: 'hatch', trigger: { type: 'event', event: 'adHatched' }, anchor: 'lane' }` after
  `clutter`.

## Data Models

All additions are numbers, booleans, `null` or string unions. `GameState.bandwidth` is a number
in [0, 1].

## Correctness Properties

1. **Bandwidth bounds**: for any Ad list, `bandwidthFor` is in [floor, 1] and does not increase
   when a clutter Ad is added. _Req 2.1–2.3_
2. **Download never runs faster than full speed**: over random bot runs, each Tick's download
   step is ≤ `downloadPercentPerSecond / TICK_RATE` and ≥ 0. _Req 2.4, 3.2_
3. **Full health, no clutter = old timing**: with no ads and no damage, the download takes the
   same Tick count as before. _Req 2.5, 3.3_
4. **Hatch cadence**: a clutter Ad left open for `k × hatchSeconds` (k ≥ 1) has produced exactly
   `k` `adHatched` events while its chapter's `hatchKind` was non-null. _Req 4.3, 4.5_
5. **Cap is clutter-only**: at any Tick the number of open clutter Ads is ≤ `cap`, and no
   `adSkipped` event ever names `interrupter` or `fake`. _Req 5.1, 5.2_
6. **Lane cover placement**: every Lane_Cover clutter rect is inside `laneArea`. _Req 6.2_
7. **Determinism**: same seed and inputs give identical states and events, and every state
   survives a JSON round trip. _Req 9_

## Error Handling

Invalid new balance keys throw the existing `AdBalanceError`, `BalanceError` or
`ChapterTableError` with every problem listed.

## Testing Strategy

- Unit: `bandwidthFor`, `lineQuality`, `downloadRate`, `hatchView`, `hatchesNow`, the new
  validation rules, placement in `laneArea`, `openAd` cap.
- Properties 1–7 with fast-check in `tests/game/ads/adPressureProperties.test.ts`, reusing
  `tests/helpers/bots.ts`.
- Update, never weaken, the shipped tests that pin old rules: browser-front cap tests, the
  director Last_Interrupter `pending` test, chapter table defaults, ad balance defaults, the
  Download_Panel rate text, the Hint_Table list. Each change is listed in the task notes.
- Render: Download_Panel cause text; `is-hatching` toggling; the Lane_View `pointerleave` path.
