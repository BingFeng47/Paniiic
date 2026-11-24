---
inclusion: always
---

# Product

A Halloween browser game for **Kiroween 2026**, entered in the **Costume Contest** category
(judged mainly on a polished, unforgettable, spooky UI that serves the game's function).
Team: BingFeng47 and Calvin.

## The pitch

It is the late 1990s. You boot a retro PC, dial up to the Internet and try to download one file.
While the modem connects, zombies crawl out of a manhole and shamble along the phone line toward
the modem. Once online, the browser fills with lying pop-up ads. One mouse, two fronts:

- **Top screen (browser):** close ads, avoid fake buttons, keep the download moving.
- **Bottom screen (connection lane):** kill zombies before they wreck the modem.

Mistakes on one front punish the other. A full run lasts about 3:00 from dialing. Scores go to an online Hall of Fame.

## Non-negotiables

- The player always goes through the full startup: boot, desktop, dial-up. **No "skip to game".**
- Zombies attack **during dial-up**. The download can only start after the connection is up.
- Win: download reaches 100%. Lose: modem integrity reaches 0.
- Zombie kills drop currency used to buy and upgrade weapons. The player starts with a **hammer**.
- Five mob types: **default, fast, tank, ranged, boss**.

The full design (chapters, mobs, weapons, economy, ads) lives in
#[[file:docs/game-design.md]]
Treat it as the source of truth. When a request conflicts with it, point out the conflict and ask
before changing either.

## Judging criteria to keep in mind (20% each)

Potential Impact, Technological Implementation (depth of Kiro use), Design, Innovation/Idea,
Presentation (demo video under 3 minutes). Favour polish and feel over feature count.

## Legal guardrails for the demo and repo

- No real trademarks: never write "Windows", "Microsoft", "Netscape", "AOL" or similar names,
  and do not copy their logos. Use invented names such as "NetSurfer".
- No copyrighted music or samples. All audio is synthesized with the Web Audio API.
- All art is original. Final SVG frames are made by the team (see `sprites.md`).
