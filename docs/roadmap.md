# Roadmap

Deadline: **4 Dec 2026, 14:00 PT = 5 Dec 2026, 06:00 Singapore time.** Aim to submit on 4 Dec.

Each milestone is one Kiro spec in `.kiro/specs/<name>/`. Kiro features in brackets show what
each milestone adds to the "How we used Kiro" story.

| # | Spec | Status | Contents | Target date | Kiro features |
|---|---|---|---|---|---|
| 1 | `game-core` | done | Pure simulation: seeded RNG, fixed-step loop, run state machine (dialing → connected → downloading → won/lost), integrity, download progress, events, headless runner. | 22–23 Nov | Spec (requirements first), PBT, hooks |
| 2 | `retro-shell` | done | Boot, BIOS, splash, desktop, window manager, dial-up dialog with synthesized modem audio. Visual reference: the team's trial build. | 23–25 Nov | Spec, `retro-copy` steering |
| 3 | `connection-lane` | 2 tasks open (playtest, final check) | 5 mobs, hammer, modem hits, lane renderer with placeholder sprites, sprite manifest loader. | 24–26 Nov | Spec, `sprites` steering, `add-mob` skill |
| 3b | `title-and-endings` | done | Title screen with synthesized theme, Options (volume, music, sound effects, screen shake) in `localStorage`, win / lose result screens over the desktop. | 22 Nov | Spec (requirements first), PBT (settings round trip, store model), `retro-copy` steering, `playtester` agent |
| 3c | `lane-melee` | requirements | Mobs stay at the modem and keep hitting it until killed. Tank and boss bursts on the first hit only. | 23 Nov | Spec that changes a shipped spec, PBT |
| 3d | `lane-cctv` | requirements | The lane drawn as a night CCTV feed: OSD, REC, timestamp, grain, static on hits, signal loss at critical, motion boxes. | 23–24 Nov | Spec, `sprites` steering |
| 3e | `replay-flow` | requirements | Result screen gets Retry (dial again at once) and Main menu (title screen). | 23 Nov | Spec, PBT (scene director) |
| 4 | `browser-front` | requirements | NetSurfer window, download page, real link, download bar, clutter / fake / interrupter ads, the 7 close patterns, pop-up bursts. | 24–26 Nov | Spec, Playwright MCP checks, `add-ad` skill |
| 5 | `cross-front-and-director` | requirements | The 7-chapter timeline as data, scripted beats, fake button → zombie. Replaces both placeholder schedules. | 26–27 Nov | Spec, `game-balance` steering |
| 6 | `economy-weapons` | requirements | KB, data packets, shop tray, saw, flamethrower, pop-up blocker, surge protector, upgrades. | 27–28 Nov | Spec, PBT (currency conservation), `add-weapon` skill |
| 6b | `player-guide` | requirements | Desktop sticky note with the objective, hint balloons once per run, "Show hints" option. | 28 Nov | Spec, `retro-copy` steering |
| 7 | `zombie-sim-mcp` | requirements | Custom MCP server in `tools/mcp-sim/`: `simulate_run`, `balance_report`, `validate_sprites`. `balance-tuner` agent and a balance hook. | 29–30 Nov | Custom MCP, custom agent, hook |
| 8 | `juice-and-endings` | requirements | Screen shake on both fronts, crack and corruption overlays, hit feedback, audio polish, end transitions. | 30 Nov–1 Dec | Spec, `playtester` agent with Playwright |
| 9 | `final-art` | requirements | Art list, swap in the team's SVG frames, sprite validation, polish pass. | 1–2 Dec | `art-integrator` agent |
| 10 | `ad-pressure` | requirements | Playtest feedback, 23 Nov. Open clutter ads slow the download and hatch zombies, the ad limit counts clutter only, lane-cover ads from pinch 1, line quality (damaged modem downloads slower). | 24–25 Nov | Spec that changes shipped specs, PBT, `add-ad` skill, `playtester` agent |
| 11 | `pacing-and-economy` | requirements | About 3:00 runs with a slow start and a ramp, boss on download progress, lower drops and higher prices, combos, bot cursor travel, new balance targets and a tuning pass. | 25–27 Nov | Spec, `zombie-sim` MCP, `balance-tuner` agent, balance hook |
| 12 | `leaderboard` | requirements | Daily seed, run stats and score, score receipt, guestbook name entry, Supabase Hall of Fame on the title screen. | 26–28 Nov | Spec, PBT (score), `retro-copy` steering, Playwright checks |
| – | bugfix specs | – | At least one real bug fixed through a bugfix spec. | as they come | Bugfix spec, PBT |
| – | submission | – | Deploy, video, writeup, blog. | 2–4 Dec | `/submission` steering |

## Design coverage

Every rule in `docs/game-design.md` and the spec that builds it. Check this table when the design
changes, so nothing falls between specs.

| Design section | Rule | Spec |
|---|---|---|
| 1 Flow | Power on → title → BIOS → splash → desktop | `retro-shell`, `title-and-endings` |
| 1 Flow | Objective sticky note on the desktop | `player-guide` |
| 1 Flow | 20 s dial-up with the raid already running | `game-core`, `retro-shell`, `connection-lane` |
| 1 Flow | NetSurfer opens the download page on connect; real link starts the download | `browser-front` |
| 1 Flow | Result screen with Retry and Main menu | `title-and-endings`, `replay-flow` |
| 2 Layout | Browser front on top, lane at the bottom | `retro-shell`, `browser-front` |
| 2 Layout | Lane shown as a CCTV feed with an OSD HUD | `lane-cctv` |
| 3 Chapters | 7-chapter timeline and its beats | `cross-front-and-director` |
| 4 Integrity | Max 100, critical at 20, win on a same-tick tie | `game-core` |
| 5 Mobs | Five mobs, HP, speed, drops, ranged globs, boss summons | `connection-lane` |
| 5 Mobs | Mobs stay at the modem and hit it on a timer | `lane-melee` |
| 6 Economy | KB, packets, hover to collect, +2 KB per ad, shop, weapons, items, hotkeys | `economy-weapons` |
| 6 Economy | Economy targets (60 KB by ~1:10, 120 more by ~1:30) | `economy-weapons`, checked by `zombie-sim-mcp` |
| 7 Ads | Clutter, fake button, interrupter and the 7 close patterns | `browser-front` |
| 8 Cross-front | Fake button → −20% download | `browser-front` |
| 8 Cross-front | Fake button → fast zombie | `cross-front-and-director` |
| 8 Cross-front | Fake button → −5 KB | `economy-weapons` |
| 8 Cross-front | First tank / boss hit → pop-up burst | `lane-melee` (emits), `browser-front` (opens the ads) |
| 8 Cross-front | Critical → corruption and crack overlays, CCTV signal loss | `juice-and-endings`, `lane-cctv` |
| 10 Art and audio | One SVG per frame, placeholders | `connection-lane`, `final-art` |
| 10 Art and audio | Synthesized audio only | every spec |
| 11 Guide | Hint balloons and the "Show hints" option | `player-guide` |
| 3 Chapters | About 3:00 run, spawn ramp, boss on download progress | `pacing-and-economy` |
| 4 Integrity | Line quality: damaged modem downloads slower | `ad-pressure` |
| 5 Mobs, 6 Economy | Lower drops, higher prices, 3 s packets, +3 KB per ad, combos | `pacing-and-economy` |
| 7 Ads | Open clutter slows the download and hatches zombies; clutter-only ad limit; lane cover from pinch 1 | `ad-pressure` |
| 8 Cross-front | Clutter → slower download and hatched zombies; damaged modem → slower download | `ad-pressure` |
| 1 Flow, 12 Score | Score receipt, guestbook name entry, Hall of Fame, daily seed | `leaderboard` |

## Planned Kiro setup (added when the milestone needs it)

- **Steering:** `product`, `tech`, `structure` (always); `testing`, `game-balance`, `sprites`
  (file match); `retro-copy` (auto); `submission` (manual).
- **Hooks:** `guard-shell`, `guard-write`, `check-on-save`, `task-done`, `session-start` (done).
  Later: a balance check that runs the headless sim after balance files change (`zombie-sim-mcp`).
- **MCP:** Playwright (browser checks). `zombie-sim` (our own, milestone 7).
- **Custom agents:** `playtester` (Playwright MCP, writes reports to `docs/playtests/` only) and
  `art-integrator` (wires frames in `src/render/`, never edits art) are done. `balance-tuner`
  (sim MCP plus balance files only) comes with milestone 7.
- **Skills:** `add-mob` (done), `add-ad` (`browser-front`), `add-weapon` (`economy-weapons`).
  Written once the first mob, weapon and ad exist, so the recipe matches the real code.
- **Powers:** check the Powers panel for relevant ones (e.g. browser testing) and note any we use.
- **Kiro Crew / Best Kiro Crew App:** out of scope unless we have spare time.
