# Runic Depths — CrazyGames submission

**Name:** Runic Depths  
**Primary category:** Adventure (`/c/adventure`)  
**Secondary discovery paths:** RPG, Roguelike  
**Verified tags:** RPG, Roguelike, Turn-Based, Monster, Pixel, 2D, Magic, Deep Progress  
**Age rating:** PEGI 12 (mild fantasy combat; no blood or gore)  
**Live URL:** https://tukieav.github.io/runic-depths/

## Short description

Explore torch-lit procedural dungeons, outsmart monsters in turn-based combat, and build a persistent hero across runs.

## Full description

Descend through procedurally generated ruins where every step advances the world. Read whose turn it is, inspect enemy move, melee, and ranged intents, and choose a safe route through limited vision. Loot equipment, find healing resources, break rune pillars to open a better position, and reach the glowing stairs before the dungeon closes in.

Choose a class, discover monsters in the Bestiary, and carry Soul Gems into permanent upgrades between expeditions. Chests, vaults, altars, randomized level-up choices, evolving dungeon biomes, and a Depth Lord on every third floor keep each tactical descent different.

## Features

- Turn-based movement and bump-to-attack combat with a clear player/enemy resolving state
- Enemy intent labels (MOVE, MELEE, BOLT), cyan selected-path feedback, and an in-world first-room hint
- Destructible rune pillars that block routes for both heroes and monsters until broken
- Procedural floors with fog of war, torches, chests, potions, gold, Soul Gems, vaults, altars, and boss floors
- Seven monster types, persistent Bestiary, classes, Soul Shop upgrades, depth records, and daily streak rewards
- Reduced-motion support, readable contrast, touch controls, and bounded effects for long sessions

## Controls

Desktop: WASD or arrow keys move/attack; Q drinks a potion; 1/2/3 picks a level-up card; click an adjacent tile to move or attack.  
Mobile: tap an adjacent tile to move or attack; tap the potion and level-up controls. Controls remain at least 44 CSS px where applicable.

## SDK, data, and ad behavior

- CrazyGames SDK v3 initializes with a safe timeout; loading starts after initialization.
- `gameplayStart`/`gameplayStop` follow active play boundaries; visibility, focus, and ad events pause/resume input, simulation, and audio once.
- CrazyGames mute settings are respected. `happytime` is throttled.
- Save data includes score and meta-progression via the Data Module with localStorage fallback; malformed or older saves safely normalize or fall back.
- A rewarded resurrection or Soul Gem multiplier may be offered after death. Restart is immediate and never requires an ad.

## Quality-resubmission note

This resubmission adds deterministic turn/animation gates, all required DPR=1 viewport checks, seeded first-floor safety tests, lifecycle handling, a 120-second accelerated soak gate, tactical intent UI, destructible rune-pillar routing, and refreshed gameplay media.
