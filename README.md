# Runic Depths

Turn-based dungeon crawler mini-cRPG for CrazyGames. Procedurally generated floors,
fog of war, loot (5 weapon/armor tiers), level-up card picks, boss every 3rd depth.

**Play:** https://tukieav.github.io/runic-depths/

- Build: `npm ci && npm run build` → self-contained `dist/`
- Dev: `npm run dev`
- Tests: `cd dist && python3 -m http.server 8485`, then `node tests/e2e.mjs`
- Tech: esbuild + Canvas 2D + WebAudio (procedural assets, ~23 KB bundle), CrazyGames SDK v3

Controls: WASD/arrows or tap to move, walk into monsters to attack, Q = potion.
