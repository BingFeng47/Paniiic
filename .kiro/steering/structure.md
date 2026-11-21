---
inclusion: always
---

# Structure

```
src/
  main.ts          entry: mounts the scene state machine
  core/            runtime helpers: h(), frame loop, audio engine, scene interface
  scenes/          boot (BIOS, splash), desktop, power off / shutdown
  desktop/         window manager, taskbar, start menu, icons
  dialup/          dialer dialog, modem sounds, connection state
  game/            PURE simulation (no DOM): state, step(), rng, mobs, weapons, ads, director
    balance/       tuning tables (HP, speeds, prices, chapter timeline)
  render/          canvas/DOM renderers for the lane and the browser front
    sprites/       sprite loader and placeholder SVG generator
  ui/              HUD, shop tray, end screens
  styles/          CSS
assets/
  sprites/         team-owned final SVG frames (agent must not write here)
tests/             Vitest + fast-check tests, mirroring src/ paths
tools/             dev tooling, e.g. the zombie-sim MCP server
scripts/hooks/     scripts run by .kiro/hooks
docs/              game design, roadmap, submission checklist, kiro-log
.kiro/             specs, steering, hooks, agents, skills (never gitignored)
```

- One spec per feature folder in `.kiro/specs/`, in the order listed in `docs/roadmap.md`.
- Tests mirror source paths: `src/game/rng.ts` → `tests/game/rng.test.ts`.
- New folders should match this layout. If a new top-level folder seems necessary, ask first.
