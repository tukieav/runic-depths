# Runic Depths: The Hollow Covenant

An original browser action RPG with real-time combat, an isometric 3D world, and complete English and Polish campaign text. Follow your missing sister beneath Lumenfall, where stolen memories keep an impossible city alive. Intended for ages 12 and up: stylized fantasy combat without blood or gore.

**Play:** https://tukieav.github.io/runic-depths/

## Play locally

```sh
npm ci
npm run dev
```

Open **http://localhost:8485**. The development server builds and watches the game. A browser with WebGL support is required; sound starts after a player gesture.

## The adventure

- Five classes: Oath Warden, Veil Ranger, Rune Arcanist, Ash Reaver, and Tide Oracle. Each has three active abilities, with different melee, ranged, healing, and totem play styles.
- Six chapters across twelve procedurally generated depths, with 24 enemy archetypes and six named bosses.
- Eighteen collectible memories, NPC dialogue, two consequential story choices, and three endings.
- Equipment in weapon, armor, and charm slots; five rarity tiers; talents, forging, potions, shrines, and a bestiary.
- Original procedural 3D environments and characters, a generated hero portrait atlas in `assets/hero-atlas.png`, and an original synthesized score with six chapter moods.
- Browser save/resume, English/Polish switching, keyboard/mouse and touch controls, sound settings, performance mode, and reduced motion.
- No advertisements, purchases, or account requirement in the current game.

## Controls

| Action | Keyboard / mouse |
| --- | --- |
| Move | WASD or arrow keys; click the ground |
| Attack | Hold Enter; click an enemy |
| Dodge | Space |
| Class abilities | 1, 2, 3; right mouse button uses ability 1 |
| Healing potion | Q |
| Interact with nearby object | E; click the object |
| Inventory / journal / talents | I / J / T |
| Choose hero | C |
| Pause / close panel | Escape |

On touchscreens, use the left joystick and six action buttons: attack, dodge, potion, and three abilities. Tap nearby objects to interact; panel buttons remain available in the HUD. Choosing a new hero starts a new journey and replaces the current adventure.

## Build, test, and package

```sh
npm run build
npm test
npm run test:browser
npm run test:platform
npm run test:campaign
npm run package
```

`build` produces the static site in `dist/`. `test` runs content, engine, SDK, and audio checks. `test:browser` builds the shipping game and exercises it in Chrome through Playwright; it uses `/usr/bin/google-chrome` by default, or the executable specified by `CHROME_BIN`. Browser evidence is written to `qa/arpg/`.

`package` creates **`releases/runic-depths-covenant-v2.zip`** for static hosting or portal submission. When the current marketing media are present, it also creates `releases/runic-depths-submission-kit-v2.zip` containing the game ZIP, three covers, two silent gameplay previews, submission copy, and QA notes. Upload the inner game ZIP as the game; upload the covers and videos in their separate portal fields. Serve `dist/` over HTTP rather than opening `index.html` as a local file. Build dependencies include Three.js and esbuild; see their included licenses.

## Verification scope

The automated checks cover game content and progression, combat and saves, browser interactions, responsive layouts, and SDK/audio lifecycle behavior. Chrome tests use a software WebGL backend; SDK unit checks use mocks. They provide local engineering evidence, not a CrazyGames certificate or approval. Actual portal integration and representative physical desktop/mobile hardware acceptance remain separate checks.

Automated combat simulations have completed the campaign in approximately 11–20 simulated minutes. This is a bot measurement, not a measured human playtime or a claim of hours of content.

Submission copy and proposed discovery categories are documented in [marketing/SUBMISSION.md](marketing/SUBMISSION.md) and [marketing/TAXONOMY.md](marketing/TAXONOMY.md). Older v1 media and QA files may remain in the repository; only the new release archive and current ARPG evidence describe this version.
