# Design: game-core

## Overview

game-core is a small, pure TypeScript simulation in `src/game/` plus a browser frame loop in
`src/core/`. The simulation advances in fixed ticks of 1/60 s through one function, `step()`.
Later specs add their own logic as **systems**: functions that run inside `step()` and change
the game only through a narrow tick context (damage the modem, penalize the download, pause it,
emit events, draw random numbers). That keeps every rule in one deterministic path and lets the
headless runner and the future `zombie-sim` MCP server play whole runs in Node.

## Architecture

```
            browser only                         pure, runs in Node too
 ┌───────────────────────────────┐     ┌────────────────────────────────────────┐
 │ src/core/fixedLoop.ts         │     │ src/game/step.ts                        │
 │  requestAnimationFrame        │ n   │  step(state, inputs, systems)           │
 │  accumulate() → n ticks ──────┼────►│   1. terminal? return unchanged         │
 │  pause on visibilitychange    │     │   2. clone state, tick + 1              │
 └───────────────────────────────┘     │   3. apply input commands               │
 ┌───────────────────────────────┐     │   4. run systems (lane, ads... later)   │
 │ renderers / audio (later)     │◄────┤   5. dial timer → connected             │
 │  read state, react to events  │     │   6. download progress                  │
 └───────────────────────────────┘     │   7. resolve win, then lose             │
                                       │  returns { state, events }              │
 ┌───────────────────────────────┐     └────────────────────────────────────────┘
 │ src/game/headless.ts          │ uses step() in a plain loop; tests + MCP server
 └───────────────────────────────┘
```

### Order inside one tick

1. If the phase is `won` or `lost`, return the same state object and no events (Req 3.9).
2. Clone the state with `structuredClone` and add 1 to `tick`. All later steps change only the
   clone, so the caller's state is never mutated (Req 1.5).
3. Apply input commands in array order. `startDownload` only works in `connected` (Req 3.2, 3.4).
   A `startDownload` that arrives on the same tick the connection comes up is ignored, because
   inputs are applied before the dial timer. The browser UI won't offer the real link until it
   sees `connected`, so this can't happen in play.
4. Run systems in array order (none yet; later specs add them).
5. Dial timer: in `dialing`, once `tick - phaseStartTick >= dialTicks`, switch to `connected`
   and emit `connected` (Req 3.3).
6. Download: in `downloading` with no pause sources, add `downloadPercentPerTick`, capped at
   100 (Req 3.5, 5.1, 5.3). Emit `downloadHalfway` the first time progress reaches 50 (Req 5.5).
7. Resolve: if download ≥ 100, the phase becomes `won`. Otherwise, if integrity ≤ 0, it
   becomes `lost` (Req 3.6, 3.7, 3.8).

## Components and interfaces

### `src/game/balance/core.ts`

```ts
export interface CoreBalance {
  readonly dialSeconds: number;              // 20
  readonly downloadPercentPerSecond: number; // 100 / 110
  readonly maxIntegrity: number;             // 100
  readonly criticalIntegrity: number;        // 20
}
export const DEFAULT_CORE_BALANCE: CoreBalance;
export class BalanceError extends Error { readonly problems: readonly string[] }
/** Merge overrides onto defaults and validate. Throws BalanceError listing every problem. */
export function resolveCoreBalance(overrides?: Partial<CoreBalance>): CoreBalance;
```

Validation rules (Req 8.2): every value must be finite; `dialSeconds > 0`,
`downloadPercentPerSecond > 0`, `maxIntegrity > 0`, `0 <= criticalIntegrity <= maxIntegrity`.

### `src/game/rng.ts`

Mulberry32: a 32-bit seeded generator whose whole state is one unsigned 32-bit integer. That
integer lives in `GameState.rng`, so it survives JSON (Req 1.3, 6.2).

```ts
export function nextRandom(rngState: number): { value: number; next: number }; // value in [0, 1)
```

### `src/game/types.ts`

```ts
export const TICK_RATE = 60;
export type Phase = 'dialing' | 'connected' | 'downloading' | 'won' | 'lost';

export type InputCommand = { readonly type: 'startDownload' };

export type GameEventBody =
  | { readonly type: 'connected' }
  | { readonly type: 'downloadStarted' }
  | { readonly type: 'downloadPenalty'; readonly amount: number; readonly download: number }
  | { readonly type: 'downloadHalfway' }
  | { readonly type: 'modemHit'; readonly amount: number; readonly integrity: number }
  | { readonly type: 'integrityCritical'; readonly integrity: number }
  | { readonly type: 'won' }
  | { readonly type: 'lost' };
export type GameEvent = GameEventBody & { readonly tick: number };

export interface GameState {
  readonly seed: number;
  readonly tick: number;
  readonly rng: number;
  readonly phase: Phase;
  readonly phaseStartTick: number;
  readonly integrity: number;
  readonly download: number;                 // 0..100
  readonly pauseSources: readonly string[];  // sorted, unique ids
  readonly criticalLatched: boolean;         // true while at/below critical
  readonly halfwayReached: boolean;
  readonly balance: CoreBalance;
}
```

`balance` is stored in the state so a run carries its own tuning. That makes headless runs with
overrides self-contained and keeps replays exact.

### `src/game/state.ts`

```ts
export interface NewRunOptions { readonly seed: number; readonly balance?: Partial<CoreBalance> }
export function createRun(options: NewRunOptions): GameState; // Req 3.1
```

The seed is normalized with `>>> 0`.

### `src/game/context.ts`: the tick context systems use

```ts
export interface TickContext {
  readonly tick: number;
  emit(event: GameEventBody): void;
  random(): number;                 // advances draft.rng
  damageModem(amount: number): void;
  penalizeDownload(amount: number): void;
  addPauseSource(id: string): void;
  removePauseSource(id: string): void;
}
export type System = (draft: MutableGameState, ctx: TickContext) => void;
```

- `damageModem`: integrity = max(0, integrity − amount); emit `modemHit`. If integrity ≤
  critical and not latched, latch and emit `integrityCritical`. If integrity is above critical,
  clear the latch so a future repair can trigger it again (Req 4.1–4.4).
- `penalizeDownload`: download = max(0, download − amount); emit `downloadPenalty` (Req 5.2).
- Pause sources are kept as a sorted, de-duplicated array, so the order of adding doesn't change
  the state (Req 5.3, 5.4, 1.2).
- Negative or non-finite amounts throw. That is a programming error in a system, not game play.

### `src/game/step.ts`

```ts
export interface StepResult { readonly state: GameState; readonly events: readonly GameEvent[] }
export function step(
  state: GameState,
  inputs: readonly InputCommand[],
  systems?: readonly System[],
): StepResult;
```

### `src/game/headless.ts`

```ts
export interface ScriptedInput { readonly tick: number; readonly command: InputCommand }
export interface RunSample { readonly second: number; readonly phase: Phase; readonly integrity: number; readonly download: number }
export interface HeadlessOptions extends NewRunOptions {
  readonly script?: readonly ScriptedInput[];
  readonly systems?: readonly System[];
  readonly maxSeconds?: number; // default 300
}
export interface HeadlessResult {
  readonly final: GameState;
  readonly events: readonly GameEvent[];
  readonly samples: readonly RunSample[]; // one per whole second, plus the final tick
  readonly endedBy: 'won' | 'lost' | 'timeout';
}
export function runHeadless(options: HeadlessOptions): HeadlessResult; // Req 7.1–7.3
```

Scripted inputs are grouped by tick and delivered on the step that produces that tick. Balance
overrides go through `createRun`, so they only affect that run (Req 7.3).

### `src/core/fixedLoop.ts` (browser side)

```ts
export const TICK_MS = 1000 / 60;
export const MAX_FRAME_MS = 250;
/** Pure: how many ticks to run for this frame, and the leftover time. */
export function accumulate(accMs: number, elapsedMs: number): { ticks: number; accMs: number };

export interface FixedLoopDeps {
  readonly now: () => number;
  readonly requestFrame: (cb: (t: number) => void) => number;
  readonly cancelFrame: (id: number) => void;
  readonly visibility: { readonly hidden: boolean; addEventListener(t: 'visibilitychange', f: () => void): void; removeEventListener(t: 'visibilitychange', f: () => void): void };
}
/** Calls onTicks(n) each frame with n ≥ 0. Returns a stop function. */
export function startFixedLoop(onTicks: (n: number) => void, deps?: Partial<FixedLoopDeps>): () => void;
```

- Elapsed time per frame is clamped to `MAX_FRAME_MS` (Req 2.2).
- While hidden, the loop cancels its frame. When visible again it resets the last timestamp and
  the accumulator, so hidden time is never replayed (Req 2.3, 2.4).
- The dependencies can be injected so the loop can be tested without real time.

## Data models

All state and events are plain objects, numbers, strings, booleans and arrays. No `Map`, `Set`,
class instances, `undefined` fields or `NaN`, so `JSON.parse(JSON.stringify(x))` gives back
an equal value (Req 6.2).

## Error handling

| Situation | Behaviour |
|---|---|
| Invalid balance values | `resolveCoreBalance` throws `BalanceError` listing every problem. The run is not created. |
| A system passes a negative or non-finite amount | The tick context throws an `Error`. Tests catch this; it is a bug, not a game state. |
| Unknown input command type | Not possible: TypeScript's exhaustive switch rejects it at compile time. |
| Frame gap over 250 ms (tab stall, debugger) | Clamped to 250 ms (15 ticks). |

## Correctness properties

Each property is a fast-check test in `tests/game/` or `tests/core/`.

| # | Property | Requirement |
|---|---|---|
| P1 | For any seed and any input script, two runs give identical states and events on every tick. | 1.2 |
| P2 | `step` never mutates its input: a deep-frozen state can be stepped, and the original stays equal to a snapshot taken before. | 1.5 |
| P3 | For any sequence of modem damage, integrity stays in [0, max]. | 4.2 |
| P4 | For any sequence of download penalties and ticks, progress stays in [0, 100]. | 5.1 |
| P5 | While any pause source is active, progress never increases. | 5.3 |
| P6 | Once `won` or `lost`, any further steps with any inputs leave the state unchanged. | 3.9 |
| P7 | Every state and event in a random run survives a JSON round trip unchanged. | 6.2 |
| P8 | `accumulate` conserves time: ticks × TICK_MS + new acc = old acc + min(elapsed, 250), within 1e-6 ms, and 0 ≤ new acc < TICK_MS. | 2.1, 2.2 |
| P9 | For any damage sequence, the number of `integrityCritical` events equals the number of times integrity crosses from above critical to at/below it. | 4.3 |
| P10 | The order in which pause sources are added does not change the resulting state. | 1.2, 5.3 |

## Testing strategy

- **Property tests (fast-check):** P1–P10 above.
- **Example tests:** phase walk-through (dialing → connected at exactly 1,200 ticks → download
  → won), `startDownload` ignored while dialing, same-tick tie gives `won`, halfway event fires
  once, balance validation messages, headless timeout, overrides apply to one run only, loop
  pauses and resumes with fake visibility and fake frames.
- **Test helpers** in `tests/helpers/game.ts`: `scheduledDamage(schedule)` and
  `scheduledPenalty(schedule)` systems that apply effects on given ticks, plus `stepN()`.
