---
inclusion: fileMatch
fileMatchPattern: ["assets/**", "src/render/**"]
---

# Sprites (one SVG per frame)

The team draws final art as **one SVG file per animation frame**. Until a frame exists, the game
draws a generated placeholder, so code must never depend on final art being present.

## File convention

```
assets/sprites/<entity>/<animation>/<frame>.svg
e.g. assets/sprites/tank/walk/00.svg, 01.svg, 02.svg ...
```

- `<entity>` is one of: `default`, `fast`, `tank`, `ranged`, `boss`, `hammer`, `saw`,
  `flamethrower`, `modem`, `manhole`, `drop`, plus effect names as needed.
- `<animation>` is one of: `idle`, `walk`, `attack`, `hit`, `die` (weapons: `idle`, `use`).
- `<frame>` is a two-digit number starting at `00`, with no gaps.

## Frame rules for artists (and placeholders)

- Every frame of one entity uses the **same `viewBox`** so frames don't jitter.
- The anchor is the **bottom-centre of the viewBox** (the feet). The game positions sprites by
  their feet on the phone line.
- Mobs face **left** (they walk from the manhole on the right toward the modem on the left).
- No scripts, no external references, no embedded raster images, no web fonts.
- Keep each frame under ~20 KB.

## Code rules

- Load frames with Vite `import.meta.glob('/assets/sprites/**/*.svg', { eager: true, query: '?url' })`
  and build a manifest `{ entity → animation → url[] }`.
- Pre-rasterize each frame to an offscreen canvas once; draw with `drawImage` each tick.
- Placeholders: a generated SVG per entity with a distinct colour and silhouette, plus the frame
  number, so animation timing can be checked before the real art arrives.
- The agent must **not** write files into `assets/sprites/` (a hook blocks it). That folder is
  the team's.
