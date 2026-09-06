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
- Five original Blender-authored heroes, plus distinct authored models for all 24 ordinary enemies and six bosses. Each enemy has High and Performance exports, an anatomy-specific rig and eight animation clips; the two archers also have dedicated shooting clips, deforming bowstrings and quivers. Role-correct procedural visuals remain available if loading fails.
- Cierniowy Czyhacz / Thorn Lurker and Ember Channeler carry bows and release actual arrows after a visible preparation. Casters retain staffs or focuses, spiders have eight articulated legs, and hounds have animated quadruped rigs.
- Shared 1024px enemy PBR atlases, individual material palettes and physical boss ornaments; garden dressing uses curved roots, modelled ferns, mushroom gills and irregular moss instead of flat green disks.
- Fifteen environment PBR maps, modelled gothic arches and stained glass, authored sarcophagus/shrine props, dynamic shadows, environment reflections, HDR bloom, contact shading and exploration darkness.
- A generated hero portrait atlas and an original stereo score with six chapter compositions, an adaptive percussion layer and nineteen sampled effects.
- Separate lightweight character models and textured vertex lighting for performance mode; high quality keeps the full models and PBR effects.
- Browser save/resume, English/Polish switching, keyboard/mouse and touch controls, sound settings, camera zoom, performance mode, and reduced motion.
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
npm run test:graphics
npm run test:cinematic
npm run test:enemies
npm run test:campaign
npm run package
```

`build` produces the static site in `dist/`. `test` runs content, engine, SDK, audio, enemy presentation and attack-timing checks. `test:browser` builds the shipping game and exercises it in Chrome through Playwright; it uses `/usr/bin/google-chrome` by default, or the executable specified by `CHROME_BIN`. Browser evidence is written to `qa/arpg/`.

`package` creates **`releases/runic-depths-covenant-v2.zip`** for static hosting or portal submission. When the current marketing media are present, it also creates `releases/runic-depths-submission-kit-v2.zip` containing the game ZIP, three covers, two silent gameplay previews, submission copy, and QA notes. Upload the inner game ZIP as the game; upload the covers and videos in their separate portal fields. Serve `dist/` over HTTP rather than opening `index.html` as a local file. Build dependencies include Three.js and esbuild; see their included licenses.

## Art pipeline

The browser renderer remains Three.js. Blender is the authoring tool; exported glTF/GLB models carry geometry, UVs, PBR textures, skin weights and animation tracks into the existing game. Original `.blend` scenes live in `source-art/characters/` and `source-art/enemies/`. Their generators are `scripts/build-character-assets.py` and `scripts/build-enemy-assets.py`; enemy exports are compressed by `scripts/optimize-enemy-assets.mjs` using the bundled Meshopt decoder. Surface and prop generators are `scripts/build-surface-assets.py` and `scripts/build-surface-props.mjs`. Blender is not needed to play or build the shipped game. See [graphics pipeline and engine decision](docs/GRAPHICS_PIPELINE.md) for provenance, alternatives and validation scope.

`npm run test:graphics` verifies actual GLB skeletons, animation playback, decoded PBR maps, prop placement and fallback behavior. It records screenshots and exact file hashes in `qa/graphics/`.

`npm run test:cinematic` inspects actual final-frame pixels and motion, six chapter scenes, quality switching, context restoration and missing HDR support. It records exact build hashes in `qa/cinematic/`.

`npm run test:enemies` checks all 30 identities in High and Performance, actual bow geometry and weighted bowstrings, anatomical rigs, shared material data, preparation and release under real AI, and missing-asset fallback. `qa/enemies/results.json` records exact file hashes; the gallery and close frames are supplementary visual evidence. See [the concrete enemy art critique and repair ledger](docs/ENEMY_ART_REVIEW.md).

The 2.3 art is original, stylized browser artwork. Its procedural authoring and modest per-model geometry do not establish AAA or Diablo III production parity.

## Verification scope

The automated checks cover game content and progression, combat and saves, browser interactions, responsive layouts, and SDK/audio lifecycle behavior. Browser reports identify their actual WebGL backend: ordinary CI checks use software rendering, while optional hardware captures use the available desktop GPU. SDK unit checks use mocks. They provide local engineering evidence, not a CrazyGames certificate or approval. Actual portal integration and representative physical desktop/mobile hardware acceptance remain separate checks.

Automated combat simulations have completed the campaign in approximately 11–20 simulated minutes. This is a bot measurement, not a measured human playtime or a claim of hours of content.

Submission copy and proposed discovery categories are documented in [marketing/SUBMISSION.md](marketing/SUBMISSION.md) and [marketing/TAXONOMY.md](marketing/TAXONOMY.md). Older media and QA files may remain in the repository. Treat a report or recording as current only when its recorded build hashes match the release; a 2.2 result is not evidence for the changed 2.3 build.
