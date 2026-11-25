# Paniiic

*a Phantom 98 nightmare*

It's 1998. Dial up, download one file, and survive. Zombies crawl along the phone line to eat
your modem while lying pop-up ads hijack your browser. One mouse, two fronts.

A Halloween browser game built with [Kiro](https://kiro.dev) for **Kiroween 2026**
(Costume Contest), by BingFeng47 and Calvin.

<!-- TODO before submitting: add the demo video and a screenshot or GIF. -->
**▶ Play it:** [kiroween-gules.vercel.app](https://kiroween-gules.vercel.app) 

---

## Inspiration

Anyone who used the Internet in the late 1990s remembers two kinds of horror: the modem
screeching for twenty seconds before anything happened, and the pop-up ads that lied. Big green
"DOWNLOAD NOW!!" buttons that weren't the download. A ✕ that opened another ad. "OK" meaning
"install". We wanted a Halloween game that dresses up as that whole machine, from the BIOS
screen to the dial-up dialog, and turns those tricks into the enemies.

The second horror needed a body, so we gave it one. While the modem connects, zombies climb out
of a manhole and shamble along the phone line toward it. You watch them through a security
camera.

## How to play

You boot **Phantom 98**, a made-up late-90s PC. You go through the BIOS, the splash screen and
the desktop, then dial up. The raid has already started while you dial, and there is no "skip".
Once you're online, the NetSurfer browser opens the download page for `HOMEWORK.ZIP`.

The screen has two fronts and you have one mouse:

- **Top, the browser:** close pop-up ads with the right control, ignore the fake download
  button, and click the small grey link to keep the download moving.
- **Bottom, the connection lane:** a night-time CCTV feed of the phone line. Smash zombies
  before they reach the modem and start chewing on it.

Mistakes on one front hurt the other. If you click a fake button, a fast zombie spawns. A tank
reaching the modem fires a burst of pop-ups. A clutter ad you leave open slows the download,
and after 10 seconds it hatches a zombie. A damaged modem also downloads slower.

**Win** when the download reaches 100%. **Lose** when modem integrity reaches 0.

### Controls

| Action | Control |
|---|---|
| Hammer a zombie, close an ad | Click |
| Saw, flamethrower | Hold (and drag the flamethrower) |
| Collect dropped KB | Move the cursor over the packet |
| Buy from the shop | Click a slot, or press `1`–`5` |
| Switch weapon | `Q` / `E` or the mouse wheel |

### What's in a run

- **Five zombies:** default, fast, tank, ranged (spits globs from mid-lane) and a 150 HP boss
  that summons more zombies and more pop-ups.
- **Three kinds of ad:** clutter banners, fake "DOWNLOAD NOW!!" buttons and interrupters
  that pause the download.
- **Seven close patterns**, each with exactly one correct control: plain ✕, decoy ✕, hidden ✕,
  swapped buttons, countdown, confirm and runaway ✕.
- **A shop** paid in kilobytes dropped by zombies: hammer upgrade, electric saw, flamethrower,
  pop-up blocker and surge protector.
- **About three minutes** across a seven-chapter timeline, from a quiet dial-up to a final
  zombie flood.
- **Two endings:** you get `funny_cats_1998.avi`, or the line goes dead on
  `SKELETON_DATING_SIM.EXE`.
- **A daily run:** everyone gets the same seed on the same day. Your score prints as a receipt
  from "NetSurfer Billing Dept." and you can sign the online Hall of Fame guestbook.

Full rules: [`docs/game-design.md`](docs/game-design.md).

## How we built it

TypeScript, Vite, vanilla DOM and Canvas 2D, with no game engine and no UI framework. All
audio, including the dial tone, the handshake screech, the theme song, groans and camera
static, is synthesized live with the Web Audio API. There are no samples.

The core rule is that **the simulation is pure**. `src/game/` holds every game rule as plain
TypeScript with no DOM, no timers and no `Math.random()`. A fixed-step
`step(state, inputs, dt)` runs at 60 ticks per second and returns the next state plus a list of
events. Rendering only reads state, and audio, screen shake and CCTV static subscribe to the
events. With the same seed and the same inputs you get the same run, and that one property
made the rest possible:

- **Property-based tests** (fast-check) check invariants over thousands of random runs.
- **A headless copy of the game** runs inside our own MCP server, so Kiro can play hundreds of
  bot runs and report balance numbers.
- **The daily seed** gives every player the same run on the same day.

Download speed, for example, comes from one function shared by the game, the HUD and the bots:

$$
r = r_0 \cdot \max\left(0.4,\ 1 - 0.15\,n\right) \cdot \left(0.6 + 0.4\,\frac{I}{100}\right)
$$

where $r_0 = 0.74\%/\text{s}$, $n$ is the number of open clutter ads and $I$ is modem
integrity. A healthy modem with no ads open needs $100 / 0.74 \approx 135$ s of download.
Interrupters and penalties stretch a winning run to about 3:00.

The Hall of Fame is a Supabase table reached with plain `fetch` and the publishable key only.
Row-level security allows reading and inserting but never updating or deleting, and database
checks keep every field in range.

## How we used Kiro

We built the game spec-first with Kiro, and almost everything after the design decisions was
automated. Everything below is in [`.kiro/`](.kiro) and [`docs/`](docs).

- **Specs:** [`.kiro/specs/`](.kiro/specs) has 17 specs and about 430 tasks. Each spec goes
  requirements → design → tasks, and each design lists numbered correctness properties. Later
  specs changed shipped rules after playtests (`lane-melee`, `ad-pressure`,
  `pacing-and-economy`) and list the old tests they replace.
- **Automated building and testing:** [`.kiro/hooks/`](.kiro/hooks) has six hooks.
  - Every saved `.ts` file is type-checked and its related tests run.
  - Every finished task runs the full suite and logs to [`docs/kiro-log.md`](docs/kiro-log.md).
  - Every balance change replays 20 bot runs and prints PASS/WARN per target.
  - A session-start brief shows the branch, uncommitted files and open tasks.
  - Guard hooks block destructive commands and writes to the team's art.
- **Property-based testing:** fast-check tests in 66 files, 1,631 tests in total. They found
  bugs that example tests missed: a critical-integrity alarm that could fire twice, a phantom
  tick when no time had passed, a NaN in sprite animation maths, and a surge-protector shield
  that wasn't cleared on the tick it expired.
- **MCP:**
  - **zombie-sim**, our own server in [`tools/mcp-sim/`](tools/mcp-sim), runs the real game
    headless with bot players. Its tools are `simulate_run`, `balance_report` and
    `validate_sprites`. With it, Kiro found that the 30 HP boss never reached the modem and
    tuned it to 150 HP with evidence ([`docs/balance/`](docs/balance)).
  - **Playwright MCP** lets our playtester agent play the real game in a browser. That includes
    an end-to-end test of the Hall of Fame against the real Supabase table
    ([`docs/playtests/`](docs/playtests)).
- **Steering:** [`.kiro/steering/`](.kiro/steering) has eight files across four inclusion modes
  (always, file-matched, auto and manual). They cover the product rules, the architecture, the
  balance and sprite rules, and a late-90s copywriting voice for all in-game text.
- **Custom agents:** [`.kiro/agents/`](.kiro/agents) has `playtester`, `balance-tuner` and
  `art-integrator`. Each may write only to its own folders.
- **Skills:** [`.kiro/skills/`](.kiro/skills) has `add-mob`, `add-ad` and `add-weapon`, recipes
  for adding a zombie, an ad or a weapon end to end.

## Challenges

- **Balancing a game nobody had played yet.** In the first playtest the run felt short and
  easy. Our simulation showed that every bot won every run and the modem never went critical.
  We rebuilt the pacing and tuned it with the zombie-sim server, 50 seeds per bot policy. At
  150 HP, rising at 75% download, the boss now reaches the modem in every winning run, and 70%
  of competent runs go critical in the final chapter.
- **Players ignored ads.** Leaving a clutter ad open cost nothing. Worse, the shared ad limit
  meant a screen full of unclosed clutter blocked interrupters, so ignoring ads protected the
  download. Now open ads slow the bar, hatch zombies, and count against a clutter-only limit.
- **One economy target we chose to miss.** We wanted a typical run to earn less than the shop
  costs. The competent bot earns about 610 KB by a win against a 365 KB shop. Fixing that
  would have needed upgrade prices about 3× higher, so we kept the prices and wrote the
  trade-off down.
- **Tooling surprises.**
  - Parallel sub-agents once overwrote the same stylesheet.
  - Our task-logging hook couldn't see task names in the hook payload, so it now diffs the spec
    checkboxes.
  - Overlapping suite runs made property tests time out, so the hooks now share one run.
- **Looking like 1998 without borrowing from 1998.** We used no real trademarks, logos or
  music. Every OS, browser and company name is invented.

## What we learned

- Specs with correctness properties are slower to start than vibe coding, but they make large
  rule changes safe. When we changed shipped rules, the properties told us exactly what broke.
- A deterministic simulation is worth the discipline. It gave us tests, a balance tool and a
  fair leaderboard from one design choice.
- Deceptive UI is easy to build and hard to make fair. Each close pattern has exactly one
  correct control, so a player who has seen it once can beat it in about two seconds.

## Our experience with Kiro

Spec-driven development worked well for us. We also hit some friction once the project grew to
17 specs:

- **The Kiro tab gets long and hard to follow.** With many specs and hundreds of tasks, it was
  hard to see at a glance where the project stood.
- **It's hard to tell what is done when several specs are in flight.** We kept opening
  `tasks.md` files to check which tasks were finished, started or not begun. Our
  `session-start` hook prints task counts per spec to work around this. Colour-coded status
  (not started, in progress, done) on each spec and task would help.
- **Specs have no order.** When we generated several specs together, Kiro didn't show which one
  had to be built first, so we kept the order by hand in
  [`docs/roadmap.md`](docs/roadmap.md). A way to mark one spec as depending on another, and to
  have Kiro suggest or enforce the build order, would stop specs from being run out of
  sequence.

---

## Run it locally

Requires Node.js 22 or newer.

```sh
npm install
npm run dev        # http://localhost:3000
npm test           # unit and property-based tests
npm run typecheck  # type-check only
npm run build      # type-check, then static build in dist/
```

The build is plain static files, so `dist/` can be served from any static host.

### zombie-sim MCP server

A headless copy of the simulation for balance work, exposed to Kiro as the `zombie-sim` MCP
server (`simulate_run`, `balance_report`, `validate_sprites`).

```sh
npm run sim:build   # bundles tools/mcp-sim/dist/server.mjs; rerun after changing src/game/
npm run sim:check   # optional smoke check of the built server
```

The server is registered in `.kiro/settings/mcp.json`. To set it up elsewhere, copy the
`zombie-sim` entry from [`docs/mcp.example.json`](docs/mcp.example.json), then reconnect the
server in Kiro after building.

### Hall of Fame (optional)

Scores go to a Supabase table. Without it the game still runs, and the result screen shows
"Guestbook closed for maintenance."

1. Paste [`docs/leaderboard.sql`](docs/leaderboard.sql) into the Supabase SQL editor and run it.
2. Copy `.env.example` to `.env.local` and fill in the project URL and the **publishable** key
   (`sb_publishable_...`). Restart `npm run dev` after editing it.

Never use the secret key (`sb_secret_...`) in the game or in any env file. The game refuses it,
and `.env*` files other than `.env.example` are gitignored.

## Project layout

```
src/game/     pure simulation: state, step(), RNG, mobs, weapons, ads, director
src/game/balance/  tuning tables (HP, speeds, prices, chapter timeline, score)
src/render/   canvas and DOM renderers for the lane and the browser
src/scenes/   title, boot, desktop
src/ui/       HUD, shop tray, result screen
tests/        Vitest + fast-check, mirroring src/
tools/mcp-sim/  the zombie-sim MCP server
.kiro/        specs, steering, hooks, agents, skills, MCP config
docs/         design, roadmap, balance reports, playtest reports, Kiro log
```

## Art and audio

All art and audio are original. Audio is synthesized at runtime with the Web Audio API, with
no samples or recorded music. Sprites are drawn as one SVG per animation frame. Until the
team's hand-drawn frames land in `assets/sprites/`, the game draws code-generated placeholder
frames. [`docs/art-list.md`](docs/art-list.md) lists every frame and its status. The font is
VT323 (SIL Open Font License) via `@fontsource/vt323`.

No real trademarks are used. Every product and company name in the game is invented.

## License

[MIT](LICENSE) © 2026 BingFeng47 and Calvin
