# Roadmap

Deadline: **4 Dec 2026, 14:00 PT = 5 Dec 2026, 06:00 Singapore time.** Aim to submit on 4 Dec.

Each milestone is one Kiro spec in `.kiro/specs/<name>/`. Kiro features in brackets show what
each milestone adds to the "How we used Kiro" story.

| # | Spec | Contents | Target date | Kiro features |
|---|---|---|---|---|
| 1 | `game-core` | Pure simulation: seeded RNG, fixed-step loop, run state machine (dialing → connected → downloading → won/lost), integrity, download progress, events, headless runner. | 22–23 Nov | Spec (requirements first), PBT, hooks |
| 2 | `retro-shell` | Boot, BIOS, splash, desktop, window manager, dial-up dialog with synthesized modem audio. Visual reference: the team's trial build. | 23–25 Nov | Spec, `retro-copy` steering |
| 3 | `connection-lane` | 5 mobs, hammer, modem hits, lane renderer with placeholder sprites, sprite manifest loader. | 24–26 Nov | Spec, `sprites` steering, `add-mob` skill |
| 4 | `browser-front` | Download page, real link, download bar, clutter / fake / interrupter ads, runaway ✕. | 25–27 Nov | Spec, Playwright MCP checks |
| 5 | `cross-front-and-director` | Cross-front rules and the 7-chapter timeline as data. | 27–28 Nov | Spec, `game-balance` steering |
| 6 | `economy-weapons` | Drops, KB, shop tray, saw, flamethrower, pop-up blocker, surge protector, upgrades. | 28–29 Nov | Spec, PBT (currency conservation) |
| 7 | `zombie-sim-mcp` | Custom MCP server in `tools/mcp-sim/`: `simulate_run`, `balance_report`, `validate_sprites`. `balance-tuner` agent. | 29–30 Nov | Custom MCP, custom agent |
| 8 | `juice-and-endings` | Screen shake, crack and corruption overlays, win / lose endings, audio polish. | 30 Nov–1 Dec | Spec, `playtester` agent with Playwright |
| 9 | `final-art` | Swap in the team's SVG frames, polish pass. | 1–2 Dec | `art-integrator` agent |
| – | bugfix specs | At least one real bug fixed through a bugfix spec. | as they come | Bugfix spec, PBT |
| – | submission | Deploy, video, writeup, blog. | 2–4 Dec | `/submission` steering |

## Planned Kiro setup (added when the milestone needs it)

- **Steering:** `product`, `tech`, `structure` (always); `testing`, `game-balance`, `sprites`
  (file match); `retro-copy` (auto); `submission` (manual).
- **Hooks:** `guard-shell`, `guard-write`, `check-on-save`, `task-done`, `session-start` (done).
  Later: a balance check that runs the headless sim after balance files change.
- **MCP:** Playwright (browser checks). `zombie-sim` (our own, milestone 7).
- **Custom agents:** `balance-tuner` (sim MCP plus balance files only), `playtester`
  (Playwright only, reports findings), `art-integrator` (sprites work).
- **Skills:** `add-mob`, `add-weapon`, `add-ad`. Written once the first mob, weapon and ad
  exist, so the recipe matches the real code.
- **Powers:** check the Powers panel for relevant ones (e.g. browser testing) and note any we use.
- **Kiro Crew / Best Kiro Crew App:** out of scope unless we have spare time.
