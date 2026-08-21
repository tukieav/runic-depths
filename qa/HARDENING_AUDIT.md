# Runic Depths hardening audit

Audited 2026-08-21 against `HARDENING_COMMON.md`, `CODEX_TASK.md`, and the
`runic-depths` entry in `.hardening/portfolio-map.json`.

## Evidence exercised before edits

- `npm run build` completed successfully.
- `node tests/e2e.mjs` completed with **27 PASS**, including menu, a first run
  through depth 2, combat, death/restart, persistence, shop/bestiary, and touch
  input. The dynamic server was already available on port 8531.
- Existing 1280×720 and 1920×1080 gate captures were inspected. At narrow
  907×510 the fixed desktop HUD and menu typography need an explicit gate;
  there was no reproducible capture or assertion for it yet. The first-run
  session begins after one PLAY click, but its tactical commitments are not
  explained in-world.

## Core loop and session depth

One PLAY click starts a procedural floor. Each hero step consumes a turn,
monsters immediately act, loot and XP improve the current run, and soul gems
fund persistent upgrades/classes after death. The first floor contains a chest,
gold and a soul gem, then stairs lead into the endless descent. The current
session has strong atmosphere and readable immediate combat, but the player has
little pre-commit information about enemy actions or safe routes.

## Prioritized issues

1. **No resolving state:** `tryMove` immediately calls `endPlayerTurn`, and
   `monstersAct` mutates the whole encounter in the same input stack
   (`src/main.js:305-322`, `src/main.js:523-532`). Players can issue another
   input while hit/death feedback is only visual.
2. **No turn forecast:** visible monsters show sprites/health only
   (`src/main.js:1123-1161`); HUD exposes no active side, selected path, or
   move/melee/ranged intent (`src/main.js:1258-1338`). This is the main first
   room comprehension gap.
3. **Restart incorrectly requires a midgame ad locally/when SDK succeeds:**
   `playAgain` awaits `requestAd('midgame')` before `newRun`
   (`src/main.js:616-628`), contradicting the natural-break/non-mandatory
   restart requirement.
4. **Turn/update determinism is not explicitly modelled or tested:** gameplay
   happens synchronously, while render feedback mutates state every frame
   (`msgLog` at `src/main.js:1329-1336`, menu particles at `1383-1391`). The
   RAF loop has only a render delta clamp and no 60/144/165Hz proof
   (`src/main.js:1765-1772`).
5. **No lifecycle pause:** there are no `visibilitychange` or `blur/focus`
   handlers; RAF runs continually and audio is resumed by `ensureCtx`
   (`src/main.js:1765-1786`, `src/audio.js:7-16`). Ad callbacks only mute audio
   (`src/main.js:580-585`, `600-605`).
6. **Unbounded presentation arrays:** torch/menu drawing randomly pushes
   particles per frame (`src/main.js:970-973`, `1378-1391`); combat bursts also
   push arbitrary counts (`643-687`). No cap, listener counter, or soak gate
   exists.
7. **First-floor safety is not proved:** generation relies on `Math.random`,
   spawns only outside the start room, but guarantees neither a reachable heal
   pickup nor a safe initial-radius invariant (`src/main.js:101-253`). There is
   no seedable generator/property test.
8. **No connected terrain tactical feature:** visual pillars are decorative
   only (`src/main.js:181-199`, `887-904`); generator/pathfinding do not use
   pressure runes or destructible terrain.
9. **Responsive quality is unverified:** `fitCanvas` has a portrait branch
   (`src/main.js:20-39`), but tests use a single 1280×800 page
   (`tests/e2e.mjs:14`) and buttons are logical 52-64px rather than tested CSS
   hit targets across required DPR=1 sizes.
10. **Submission taxonomy is stale/inaccurate:** it names `Adventure / RPG
   (Casual)` and invented SEO tags (`marketing/SUBMISSION.md:4-5`) instead of
   the map's Adventure primary and exact verified tags. It also says “All
   ages,” not PEGI 12, and overstates ad pausing (`lines 45-57`).

## Likely quit causes

| Moment | Quit risk | Evidence |
| --- | --- | --- |
| First 10 seconds | A new player cannot see whose turn, intent, or a committed route, and has to infer bump-to-attack. | `src/main.js:305-322`, `1123-1161`, `1258-1338` |
| First 60 seconds | Immediate monster resolution compresses tactical feedback; first-floor healing is chance-based. | `src/main.js:523-532`, `222-253` |
| Five minutes | Repeated frame-generated particles, no lifecycle pause, and unproved bounds could cause performance degradation. | `src/main.js:643-687`, `970-973`, `1378-1391` |

## Graphics/game-feel findings

The baked tiles, fog, sprites, torches, loot glows and combat sparks form a
cohesive dark-fantasy presentation. The weak point is feedback ordering:
damage, death, loot, and enemy reactions all happen logically at once, so the
animation does not communicate a clear turn handoff. The first room needs a
small tactical callout rather than another modal. Reduced-motion behavior is
not currently respected.

## Requirement matrix before implementation

| Requirement | Status | Evidence |
| --- | --- | --- |
| New player in gameplay in ≤1 click | PASS | PLAY calls `startGame` (`src/main.js:1451-1455`) |
| Restart <1s, non-mandatory ad | FAIL | `playAgain` awaits a midgame ad (`616-628`) |
| DPR=1 required viewport matrix | FAIL | only 1280×800 E2E viewport (`tests/e2e.mjs:14`) |
| 60/144/165Hz deterministic proof | FAIL | no simulation gate; render has per-frame mutation |
| Lifecycle / ad pause-resume | FAIL | no visibility/focus lifecycle handlers |
| Save + malformed/old migration | PARTIAL | parse fallback exists, but no schema migration/validation test (`src/meta.js:45-57`) |
| 120s soak, bounded arrays/listeners | FAIL | no soak test/caps |
| Keyboard/mouse/touch + mobile target proof | PARTIAL | input paths exist (`src/main.js:702-757`), no matrix proof |
| SDK boundaries/mute/ad behavior | PARTIAL | wrapper/mute exist, but no gameplay boundary idempotence or real ad pause |
| Reduced motion/accessibility | FAIL | no media query behavior |
| First-floor safe, reachable resource path | FAIL | random generation, no seed/property proof |
| Clear tactical turn state + terrain feature | FAIL | absent |
| Accurate taxonomy/marketing proof | FAIL | stale submission content |

## Taxonomy corrections required

Use only the `runic-depths` map entry: primary **Adventure**, secondary
discovery paths **RPG** and **Roguelike**, exact tags **RPG, Roguelike,
Turn-Based, Monster, Pixel, 2D, Magic, Deep Progress**. Remove Casual,
invented keyword tags, and the “All ages” claim.
