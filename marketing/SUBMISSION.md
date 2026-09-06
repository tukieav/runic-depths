# Runic Depths: The Hollow Covenant — submission draft

**Version:** 2.1.0
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

The game includes full English and Polish text, browser saves, keyboard/mouse and touch controls, adjustable sound, a performance setting, and reduced motion. Its 3D world is built procedurally, accompanied by an original synthesized score with six chapter moods and generated hero portraits. There are no advertisements or purchases in the current release.

## Polish short description

Nieś ostatnią latarnię przez izometryczne action RPG. Wybierz jednego z pięciu bohaterów, przemierz sześć niezwykłych krain i odkryj tajemnicę zapomnianego miasta. Pełna wersja polska i angielska.

## Controls

Desktop: WASD or arrows move; left click moves or targets an enemy; hold Enter to attack. Space dodges. Keys 1–3 use class abilities, and right click uses the first ability. Q drinks a healing potion; E interacts. I opens equipment, J the journal, T talents, C hero selection, and Escape pauses or closes a panel.

Touch: a left joystick moves the hero. Six action buttons provide attack, dodge, potion, and three abilities. Tap nearby objects to interact and use the visible HUD buttons to open panels.

## Assets and runtime

- Three.js/WebGL renders the original procedural 3D environments, heroes, enemies, and effects.
- `assets/hero-atlas.png` contains the generated class portrait artwork used by the game.
- Web Audio synthesizes the original score and sound effects; playback begins after user interaction.
- A static build is emitted to `dist/`; the package script archives the shipping files.
- The current build has no ads, purchases, or required login. CrazyGames SDK integration supports platform lifecycle and data handling with standalone fallbacks.

## Evidence and acceptance limits

Run `npm test` for content, engine, SDK, and audio tests, and `npm run test:browser` for the built game’s Chrome/Playwright checks. Current browser artifacts are stored under `qa/arpg/`. The browser suite uses Chrome with software WebGL; SDK unit tests use mocks. These checks do not establish physical-device performance or acceptance inside the CrazyGames portal.

The release still requires the portal’s own upload/review process and testing on representative physical desktop and mobile hardware. No official audit pass, age-rating certification, live v2 deployment, or approved taxonomy is asserted by this document.

Automated combat simulations measured approximately 11–20 simulated minutes for a campaign. Human completion time has not been established, so no public duration claim is proposed.

Use fresh v2 screenshots and recordings for submission. Historical v1 files describe a different, turn-based 2D implementation and should not be submitted as current gameplay evidence.

## Current v2 upload media

Use `marketing/v2/cover-16x9.png` (1920×1080), `cover-1x1.png` (800×800), and `cover-2x3.png` (800×1200), plus `video-landscape.mp4` and `video-portrait.mp4` in the same folder. These replace the old v1 cover and video files elsewhere in `marketing/`. The videos show staged encounters running through the real 3D game at normal simulation speed; they are silent and begin with the matching cover. Media production metadata is in `marketing/v2/manifest.json`.

`npm run package` also builds `releases/runic-depths-submission-kit-v2.zip` when those media files are available. Unpack that kit first; submit the inner game ZIP as the game package and the media in the corresponding image/video fields.
