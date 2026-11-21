---
inclusion: always
---

# Tech

## Stack

- TypeScript (strict), Vite, Vitest with jsdom, fast-check for property-based tests.
- Vanilla DOM and Canvas 2D. **No UI framework and no game engine.** Keep dependencies minimal and
  ask before adding a runtime dependency.
- Static site. It must build with `npm run build` and deploy as plain files.

## Architecture rules

1. **Simulation is pure.** All game rules live in `src/game/` as plain TypeScript with no DOM,
   no `window`, no timers and no `Date.now()` / `Math.random()`.
   - Fixed timestep: `step(state, inputs, dtFixed)` returns the next state plus a list of events.
   - Randomness comes only from the seeded RNG passed in the state.
   - Same seed + same inputs ⇒ same result. Tests and the balance tooling rely on this.
2. **Rendering only reads.** `src/render/` and `src/ui/` draw the state and turn pointer input into
   input commands. They never change game state directly.
3. **Tuning is data.** Numbers (HP, speeds, prices, spawn times) live in `src/game/balance/`, not
   inline in logic.
4. **Events, not callbacks.** The simulation emits events (`mobKilled`, `modemHit`, `adOpened`...)
   that audio, screen shake and other effects subscribe to.

## Code conventions

- Create DOM with a small `h()` helper and set text through `textContent`. Never put game or ad
  text into `innerHTML`. Inline SVG is allowed only for our own compile-time constant markup.
- Prefer `readonly` types and discriminated unions. Avoid classes in `src/game/` unless they hold
  no game state.
- Every scene and component exposes `mount()` / `unmount()` and cleans up its listeners, timers
  and animation frames.
- Pause the simulation when the tab is hidden (`visibilitychange`).

## Commands

- `npm run dev` serves on port 3000.
- `npm test` runs all tests. `npm run typecheck` type-checks.
- `npm run build` type-checks and builds to `dist/`.
