# Kiroween

A Halloween browser game built with [Kiro](https://kiro.dev) for Kiroween 2026 (Costume Contest).

Boot a late-1990s PC, dial up to the Internet and try to download one file. Zombies crawl along
the phone line toward your modem while pop-up ads lie to you. One mouse, two fronts.

## Run it

Requires Node.js 22 or newer.

```sh
npm install
npm run dev      # http://localhost:3000
npm test         # unit and property-based tests
npm run build    # static build in dist/
```

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

## How it is built

- Game design: [`docs/game-design.md`](docs/game-design.md)
- Roadmap: [`docs/roadmap.md`](docs/roadmap.md)
- Kiro specs, steering and hooks: [`.kiro/`](.kiro)

## Art
All sprites in [`assets/sprites/`](assets/sprites) are original work by the team, BingFeng47 and
Calvin, drawn as one SVG per animation frame. Anything without a team frame yet is drawn with a
generated placeholder. The list of every frame and its status is in
[`docs/art-list.md`](docs/art-list.md).
## License

[MIT](LICENSE)
