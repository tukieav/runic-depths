# Runic Depths: The Hollow Covenant — submission draft

**Version:** 2.3.0
**Polish subtitle:** Pusty Pakt
**Format:** Browser action RPG; real-time combat; isometric 3D WebGL
**Languages:** English and Polish
**Intended audience:** Ages 12+; stylized fantasy combat without blood or gore. This is a content target, not a formal PEGI or other rating.
**Release artifact:** `releases/runic-depths-covenant-v2.zip`, produced by `npm run package`
**Submission status:** Prepared for portal evaluation; no platform approval is claimed.

## Short description

Carry the last lantern into an isometric action RPG. Choose one of five heroes, conquer six strange realms, and uncover a forgotten city’s secret in English or Polish.

## Full description

For seven nights, bells have rung beneath Lumenfall. Each morning, another name disappears from the city’s memory. When your sister Mira vanishes, she leaves one instruction: follow the sound.

Choose an Oath Warden, Veil Ranger, Rune Arcanist, Ash Reaver, or Tide Oracle. Explore twelve procedural depths across six chapters, from a ruined belfry and underground gardens to glass archives, iron furnaces, and a drowned palace. Fight in real time, dodge visible danger zones, and combine three class abilities with weapon attacks.

Find stronger equipment, invest in talents, improve gear at camp, and collect eighteen fragments of the city’s past. Twenty-four enemy archetypes and six named bosses guard the descent. Two story decisions shape three possible endings to an original campaign about memory, care, and freedom.

The game includes full English and Polish text, browser saves, keyboard/mouse and touch controls, adjustable sound, a performance setting, and reduced motion. Its procedural 3D world features original Blender-authored heroes and 30 distinct enemy models, animated bows and creature rigs, and an original sampled score with six chapter compositions and generated hero portraits. There are no advertisements or purchases in the current release.

## Polish short description

Nieś ostatnią latarnię przez izometryczne action RPG. Wybierz jednego z pięciu bohaterów, przemierz sześć niezwykłych krain i odkryj tajemnicę zapomnianego miasta. Pełna wersja polska i angielska.

## Controls

Desktop: WASD or arrows move; left click moves or targets an enemy; hold Enter to attack. Space dodges. Keys 1–3 use class abilities, and right click uses the first ability. Q drinks a healing potion; E interacts. I opens equipment, J the journal, T talents, C hero selection, and Escape pauses or closes a panel.

Touch: a left joystick moves the hero. Six action buttons provide attack, dodge, potion, and three abilities. Tap nearby objects to interact and use the visible HUD buttons to open panels.

## Assets and runtime

- Three.js/WebGL renders procedural 3D environments, five authored heroes and 30 authored enemy identities, each with a Performance model. Enemy geometry and animations use original Blender scenes and four shared PBR atlases.
- Thorn Lurker and Ember Channeler are bow users; spellcasters and organic creatures keep distinct weapons, casting gestures and projectile shapes.
- `assets/hero-atlas.png` contains the generated class portrait artwork used by the game.
- Web Audio plays original sampled chapter music and effects with a procedural fallback; playback begins after user interaction.
- A static build is emitted to `dist/`; the package script archives the shipping files.
- The current build has no ads, purchases, or required login. CrazyGames SDK integration supports platform lifecycle and data handling with standalone fallbacks.

## Evidence and acceptance limits

Run `npm test` for content, engine, SDK, audio and enemy-role/timing tests, `npm run test:browser` for the built game’s Chrome/Playwright checks, and `npm run test:enemies` for the complete bestiary, actual ranged AI, quality modes and fallback. Current browser artifacts are stored under `qa/arpg/`. The browser suite uses Chrome with software WebGL; SDK unit tests use mocks. These checks do not establish physical-device performance or acceptance inside the CrazyGames portal.

The release still requires the portal’s own upload/review process and testing on representative physical desktop and mobile hardware. No official audit pass, age-rating certification, final 2.3 deployment status, AAA production quality, or approved taxonomy is asserted by this document.

Automated combat simulations measured approximately 11–20 simulated minutes for a campaign. Human completion time has not been established, so no public duration claim is proposed.

Use screenshots and recordings whose manifest hashes match the submitted 2.3 build. Historical v1 files describe a different, turn-based 2D implementation and should not be submitted as current gameplay evidence.

## Current v2 upload media

Use `marketing/v2/cover-16x9.png` (1920×1080), `cover-1x1.png` (800×800), and `cover-2x3.png` (800×1200), plus `video-landscape.mp4` and `video-portrait.mp4` in the same folder. These replace the old v1 cover and video files elsewhere in `marketing/`. The videos show staged encounters running through the real 3D game at normal simulation speed; they are silent and begin with the matching cover. Media production metadata is in `marketing/v2/manifest.json`. The retained folder name does not identify the captured version: verify its build hashes against the submission ZIP; media from 2.2 must be regenerated for 2.3.

`npm run package` also builds `releases/runic-depths-submission-kit-v2.zip` when those media files are available. Unpack that kit first; submit the inner game ZIP as the game package and the media in the corresponding image/video fields.
