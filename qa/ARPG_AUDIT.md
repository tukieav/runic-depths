# Runic Depths action RPG verification

This report concerns the rebuilt real-time, WebGL action RPG. Earlier `ROUND*` and `FINAL_POLISH*` reports concern the previous turn-based game and do not prove this build.

## Graphics update 2.1

The 2026-09-06 update adds eight original Blender-authored skinned GLB characters, five animation clips per model, fifteen authored PBR surface maps, two GLB props, modelled gothic architecture, directional shadows and environment lighting. See [graphics pipeline](../docs/GRAPHICS_PIPELINE.md). `npm run test:graphics` verifies binary assets and their actual usage in the shipping scene, real animation changes under input, decoded maps, placement across chapters, and aborted or stalled asset fallbacks. The current graphics report is `qa/graphics/results.json`; its SHA-256 manifest identifies the exact build. Physical-device performance and external platform acceptance remain separate.

## Cinematic update 2.2

The follow-up adds 32-joint character rigs and eight clips per model, 512px
character PBR atlases, class-specific layered equipment, hit and dodge responses,
tapered blade ribbons, ballistic impact sparks, varied architectural niches,
HDR bloom, depth-based contact shading, grading, exploration darkness and camera
zoom. Original sampled audio contains six chapter scores, a synchronized drum
layer and nineteen effects. Procedural audio and direct rendering remain fallback
paths. The final-frame browser suite is `tests/cinematic-browser.mjs`; results in
`qa/cinematic/results.json` bind screenshots, rendered pixels, bone changes,
quality switching and missing-HDR-extension fallback to the exact built files.

These improvements retain a visibly stylized art style. They do **not** establish
Diablo III visual parity, AAA animation quality, an official age rating or
CrazyGames acceptance. See [art direction review](../docs/ART_DIRECTION.md).

## Hardware capture evidence

The final 2.2 marketing encounters were captured in headless Chrome using actual
ANGLE/OpenGL on NVIDIA GeForce RTX 4090, High quality, internal pixel ratio 1.
The landscape and portrait takes measured 59.93 and 59.99 animation frames per
second; approximately 17.5 seconds of simulation elapsed in 17.5 seconds of wall
time. These are two scripted combat encounters on this powerful desktop GPU,
not mobile/Chromebook acceptance or whole-campaign performance certification.
`marketing/v2/manifest.json` records the actual WebGL renderer, timing and build
hashes; the encoded videos are 30 fps. Software-renderer capture was rejected
because it advanced the simulation much more slowly than real time.

Performance mode now selects 3,500-triangle LODs and textured vertex-lit materials.
It retains full-detail models as the fallback when optional LOD downloads fail.
Vertex-lit shading applies immediately while these optional models load; late
arrivals replace geometry without blocking gameplay or resetting progress.
High quality retains PBR shading, full models and the postprocessing chain.

## Repeatable local checks

```sh
npm run build
node --test tests/engine.test.mjs tests/content.test.mjs tests/sdk.test.mjs tests/audio.test.mjs
node tests/arpg-browser.mjs
node tests/audio-browser.mjs
node tests/graphics-assets.mjs
node tests/cinematic-browser.mjs
BALANCE_SOAK=1 node --test --test-name-pattern='^combat soak:' tests/engine.test.mjs
```

The browser test hosts the built `dist` directory on a temporary loopback port and closes its own server and Chrome instance. It uses `/usr/bin/google-chrome`, overridable through `CHROME_BIN`. WebGL rendering uses SwiftShader in headless Chrome. That proves browser functionality, not a physical mobile or Chromebook frame-rate target.

Observed locally on 2026-09-06: **54/54 engine/content/SDK/audio tests**, **13/13 browser integration groups**, **9/9 graphics groups**, **10/10 cinematic groups**, **8/8 platform groups**, the separate real Chrome audio regression, and **5/5 autonomous combat campaigns** passed. Browser evidence uses Chrome 152.0.7977.75 and recorded zero runtime/console errors. Each later shipping rebuild must rerun the browser suite; `browser-results.json` binds the result to SHA-256 hashes of its actual bundle, stylesheet and HTML.

## Engine checks

- Walkable map connectivity for 100 deterministic seeds across all 12 floors (1,200 maps), including all room centers and closed outer boundaries.
- Real click movement through corridors to the final room with each of five classes.
- Five bilingual classes, 15 active skills, six chapters, 24 regular enemy types, six bosses, three story outcomes.
- Basic attacks, wall obstruction, moving around walls to acquire ranged targets, the corridor-corner projectile clearance regression, effective skill damage/healing/movement, mana costs, cooldowns, bounded initial skill damage.
- Movement, resource regeneration and cooldown consistency at 30/60/120/144 Hz; frozen paused state.
- Experience, level growth, talent validation, equipment identity, forging price/upgrade cap, potion purchase boundaries.
- Enemy melee warnings precede damage, and a timely dodge avoids the strike.
- All 12 floor gates, mandatory bosses on even floors, final portal victory and no descent beyond floor 12.
- Save roundtrip for class, progression, inventory/equipment, consumed objects, kills and story decisions; malformed save recovery; no cooldown reset by reloading; death persists across reload and revival charges the normal 10% gold cost.

The campaign gate test deliberately defeats enemies through engine calls. It verifies progression logic; it does not represent a human playthrough or prove long-term difficulty balance.

The separate optional combat soak uses normal movement, attacks, abilities, dodge reactions, pickups, equipment, talents and potions. It never increases damage, health, experience or gold directly and never teleports the hero. The policy has knowledge of map/enemy state and aggressively spends talents and buys supplies, so it is stronger and faster than a new human player. Seed `84621`, 20 Hz simulation, all 12 depths:

| Class | Simulated seconds | Enemies defeated | Final level | Deaths |
| --- | ---: | ---: | ---: | ---: |
| Warden | 842 | 636 | 22 | 0 |
| Ranger | 683 | 631 | 22 | 0 |
| Arcanist | 1022 | 634 | 22 | 0 |
| Reaver | 829 | 633 | 22 | 0 |
| Oracle | 1144 | 633 | 22 | 0 |

Raw result: [combat-soak.tap](arpg/combat-soak.tap). These results show an achievable combat path through the campaign for every class. They do not establish human completion times, retention, optimal difficulty or a Diablo-scale campaign length. Story reading and decision time are excluded.

## Browser checks

The browser suite exercises the actual bundled application. QA inspection is available only through the explicit `?qa=1` URL. The suite also checks that normal URLs expose no privileged QA control.

Coverage: real keyboard movement, ground-click movement, inventory pause/resume, modal focus trap and Enter activation, English/Polish visible labels and document language, all five character models and skill activation, gesture audio unlock, local mute, pause audio cleanup, WebGL context loss/restoration and local progress after reload. Every important HUD control is checked at its actual center for obstruction, including the interaction button and touch joystick. Inventory and class-selection dialogs must fit the viewport and have no horizontal content overflow.

The viewport matrix uses DPR 1 throughout and verifies the browser's actual pointer capability:

| Input | Viewports |
| --- | --- |
| Mouse / fine pointer | 907×510, 1216×684, 1077×606, 821×462, 1366×768, 1920×1080, 1536×864, 1280×720, 1440×900 |
| Touch / coarse pointer | 1080×607 tablet, 800×450 mobile, 390×844 portrait, 844×390 landscape |

All four touch contexts perform real touch drags on the joystick and touch taps to cast a skill. The tablet case specifically guards against a phone-width CSS rule creating an oversized desktop-style HUD.

The browser also clicks the real chapter decision buttons, verifies descent into depths 5 and 9, and checks all three ending screens after the final gate. Combat for this specific UI test is completed through explicit scripted setup; the separate combat soak above supplies ordinary combat coverage.

Generated evidence belongs in `qa/arpg/`: 13 gameplay screenshots, 13 inventory screenshots, 13 class-selection screenshots, three ending screenshots and `browser-results.json`. The JSON records the observed test date, exact Chrome version, build hashes, the complete viewport matrix, successful groups and errors. A missing results file is not a pass; a failed run removes the previous result instead of preserving a stale green report.

## External acceptance still required

Local tests cannot certify CrazyGames acceptance. Follow [PLATFORM_REQUIREMENTS.md](PLATFORM_REQUIREMENTS.md) for current official requirements and SDK integration contracts. Portal preview must verify the real SDK environment, Progress Save configuration, guest and account cloud saves, account changes and deployment delivery. Human reviewers determine original content suitability, gameplay quality and commercial readiness. A 12+ creative target is not an official age rating.

Physical-device checks remain necessary for Safari/iOS audio interruption recovery, Android touch/audio behavior, low-memory hardware performance, supported browsers and the platform's target Chromebook. Headless desktop viewport emulation is not a substitute for these devices.
