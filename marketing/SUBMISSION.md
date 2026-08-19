# Runic Depths — CrazyGames Submission

**Name:** Runic Depths
**Category:** Adventure / RPG (Casual)
**Tags:** dungeon, crawler, turn-based, rpg, roguelike, loot, pixel, casual
**Age rating:** All ages (mild fantasy combat, no blood/gore)

## Short description (~140 chars)
Descend into procedurally generated dungeons! Turn-based combat, epic loot, level-up builds and fog of war. How deep can you go?

## Full description (EN)
Runic Depths is a bite-sized turn-based dungeon crawler. Every floor is procedurally
generated — rooms, corridors, flickering torches and secrets hidden in the fog of war.

**Features**
- Turn-based tactics: every step you take, the monsters move too
- Fight goblins, skeletons, ogres — and a Depth Lord boss every 3rd floor
- Loot chests for gold, HP potions and 5 tiers of weapons & armor
- Level up and pick 1 of 3 upgrade cards (+HP / +ATK / +DEF) to shape your build
- Fog of war with memory — explored rooms stay on your minimap
- Endless descent: the deeper you go, the deadlier it gets. Score = depth × 100 + gold + XP
- Watch an ad to RESURRECT once per run and keep your streak alive

**How to play**
- Move with WASD / arrow keys, or tap/click a tile next to your hero
- Walk into a monster to attack it
- Q (or tap the potion button) drinks an HP potion
- Find the glowing stairs to descend to the next floor

## Controls
Keyboard: WASD / arrows = move & attack, Q = potion, 1/2/3 = pick level-up card.
Mouse / touch: tap adjacent tile to move/attack, tap buttons for potion/cards.

## QA notes (SDK v3 Full Implementation)
- `SDK.init()` before boot (with timeout race for non-CG domains)
- `game.loadingStart/loadingStop` around boot
- `game.gameplayStart/gameplayStop` at play/restart/game-over/ads
- Midgame ad on PLAY AGAIN; rewarded ad = RESURRECT (50% HP, once per run)
- Audio muted + game paused during ads (adStarted/adFinished callbacks)
- Respects `game.settings.muteAudio` + addSettingsChangeListener
- `game.happytime()` on level-up and boss kill
- Best score via `data.setItem/getItem` with localStorage fallback
- Live demo: https://tukieav.github.io/runic-depths/

## Save progress answer
"Yes, using the Data Module from the CrazyGames SDK"

## Game options
- [x] supports mobile devices
- [x] supports CrazyGames muting audio through SDK
- [ ] online multiplayer
