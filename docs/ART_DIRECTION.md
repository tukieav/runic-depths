# Runic Depths visual direction and review contract

The target is a readable, richly lit dark fantasy action RPG. Diablo III is a
reference for combat readability and finish, not a source of copied characters,
textures, music or environments. This document does not certify AAA quality.

## What has to improve on screen

The previous release established a working asset pipeline, but its repeated
window/pillar spacing, broad empty floors, miniature characters and abrupt dark
world boundary made it look like a modular prototype. More polygons alone do not
resolve those issues. Evaluate the actual playing camera before inspecting a
close-up model render.

1. **Composition:** room edges carry irregular, purposeful detail; traversable
   floor and enemy warning shapes remain clear. Distinct landmarks break the
   repeated tile grid. Props must respect collision and never masquerade as a
   passage.
2. **Lighting:** warm practical lights and cool ambient fill separate actors from
   stone. Contact darkening grounds feet and architecture. Fog and restrained
   bloom create depth without washing out silhouettes, floor warnings or UI.
3. **Characters:** each class reads by silhouette and equipment before color.
   Armor has a clear hierarchy of large forms, bevels and smaller ornament.
   Metal, cloth, skin and bone must respond differently to light. Normal and
   roughness maps should affect the visible result, not merely exist in a file.
4. **Motion:** locomotion bends hips, knees, shoulders and elbows; attacks have
   anticipation, impact and recovery; spellcasting, dodge and hit reactions have
   distinct poses. Secondary cloth or accessory motion follows the action.
   Animation must not change authoritative combat timing or displace collision.
5. **Combat effects:** a short readable impact is more useful than persistent
   screen-filling particles. Telegraphs must stay legible under bloom and against
   every chapter palette. Reduced-motion mode must suppress camera shake and
   unnecessary motion while preserving combat information.
6. **Sound:** distinguish weapon contact, magical impact, locomotion, damage and
   rewards. Give chapter music and ambient layers space for transient effects.
   No autoplay before a gesture; pause, mute and platform mute must silence every
   source, including decoded samples and reverb tails.

## Chapter palette and focal intent

| Chapter           | Dominant material                | Lighting contrast                | Composition cue                                     |
| ----------------- | -------------------------------- | -------------------------------- | --------------------------------------------------- |
| Ashen Belfry      | Worn stone, tarnished brass      | Blue shadow / candle amber       | Sacred windows and bell architecture                |
| Rootbound Gardens | Mossy masonry, twisted roots     | Muted green / warm lantern       | Encroaching growth and broken boundaries            |
| Glass Archive     | Pale stone, dark shelving, glass | Cool cyan / violet               | Archive rhythm interrupted by shattered reflections |
| Iron Tribunal     | Blackened stone, forged metal    | Charcoal / furnace orange        | Heavy machinery and angular authority               |
| Drowned Court     | Wet stone, coral and relics      | Deep teal / pearl light          | Water, eroded ritual forms and depth                |
| Starless Heart    | Fractured runestone              | Desaturated void / luminous rune | Broken geometry converging on a central focal point |

## Release evidence

`tests/cinematic-browser.mjs` exercises the actual built game in Chromium with
software WebGL. Its report binds captures and observations to shipping file
hashes. It checks that final rendered frames contain visible geometry, that
quality changes and resize keep the scene visible, and that gameplay selects
distinct authored action clips with changing bone poses. Chapter and touch-view
captures are for human visual review; a nonblack frame is not an aesthetic pass.

Existing graphics, browser, engine and audio suites remain necessary. The new
visual suite does not replace campaign correctness, input reachability, save
integrity or platform lifecycle checks. Scripted chapter and animation fixtures
are render tests, not evidence of a human playthrough.

Do not report software-rendered frame rates as mobile or Chromebook performance.
Record draw calls, triangle counts and render resolution to identify regressions,
then verify frame pacing on physical target devices before claiming their
performance. Similarly, an upload-size check is not CrazyGames acceptance.

The postprocessing chain must maintain a correct final output color conversion
and resize its intermediate targets with the canvas. See the official
[Three.js postprocessing guide](https://threejs.org/manual/en/post-processing.html)
and [EffectComposer API](https://threejs.org/docs/pages/EffectComposer.html).
Current [CrazyGames technical requirements](https://docs.crazygames.com/requirements/technical/)
limit initial loading to 50 MB, or 20 MB for mobile-homepage eligibility, with a
250 MB total and 1,500-file ceiling. They also require smooth operation on supported
4 GB Chromebooks. These are separate constraints; fitting the download budget
does not prove rendering performance.

## Remaining gap to a commercial AAA production

AAA finish is a production and review standard, not a renderer toggle or a test
counter. A claim of parity would require sustained expert art review, handcrafted
set pieces, broader enemy-specific motion and effects, high-quality deformation
under every attack, extensive physical-device profiling and human playtesting.
Procedural authoring and automated integration tests can improve this project
substantially without proving that parity. Report the visible delta and known
limits honestly on every release.

## Visual review of the 2.2 iteration

Reviewed actual browser captures of all five classes and all six chapters, plus
the 844 × 390 and 390 × 844 touch layouts. The closer playing camera makes the
shield, shoulder plates, robe hems and weapon shapes easier to recognize. Warm
torch bloom, cool shadow color and darkened unexplored rooms create a clearer
foreground/background hierarchy. Highlights remain localized rather than
bleaching the floor or UI. The archive/void floor treatment was revised during
review: plain floating square plates were replaced with a worn radial stone
inlay, which now reads as part of the architecture.

Close-up pose captures also exposed an unwanted mottled face surface. The asset
revision gives skin a smoother color treatment, flat tangent-space normals and
high roughness. Broader Warden/Reaver bodies and a narrower Ranger improve the
class silhouettes. The visible dodge crouch, bent knees, raised melee weapon and
forward caster pose are distinct; gameplay tests additionally observe the live
skeletal mixer responding to actual inputs and damage.

The remaining aesthetic limitations are visible, not hypothetical: room floors
and pillar arrangements still repeat, many rooms share a similar rectangular
composition, character surfaces remain stylized and faceted, and landscape
phones give the world a small share of the screen. This is a material improvement
to the previous release, without evidence of parity with a commercial AAA title.

The final-frame regression suite exposed a real context-recovery defect that
console-only checks missed. GPU handles from the lost WebGL context were disposed
after the new context was created, producing `INVALID_OPERATION` despite a
subsequently visible frame. Instrumentation traced it first to the lighting
probe/composer and then to scene geometry disposal. Cleanup belongs to the lost
context phase; recreating targets and reuploading retained CPU assets belongs to
restoration. The regression checks both immediate recovery and a subsequent new
journey, retaining strict checks for preceding and current WebGL errors.

Performance mode has separate simplified character GLBs, rather than only
turning off bloom. They retain the articulated skeleton and action clips while
using about 3,500 triangles per character and textured Lambert materials. High
quality keeps the full models and physically based materials. The test checks
the actual loaded geometry/materials after an asynchronous quality change, not
just the selected option text. The camera zoom control is also checked through
the compact pause menu and across a page reload.

Final local run: all ten cinematic test groups passed, with 17 inspected final
frames and no JavaScript, console or sampled WebGL errors. The report hashes all
75 shipping files. The Warden switched from 26,458 triangles with a standard PBR
material to 3,500 triangles with a Lambert material and back. In the compact menu,
changing zoom from 0.8 to 1.3 reduced the camera's vertical world span from 14.625
to 9 units; the 1.3 setting survived reload. Both context restoration and the next
new journey had empty preceding-error queues and `gl.getError() === 0`.
See [`qa/cinematic/results.json`](../qa/cinematic/results.json) for the exact
bundle hashes, action-pose observations, fallback case and capture inventory.

Two additional regressions cover resource lifetime and gameplay feedback. After
two warm-up scene rebuilds, six further rebuilds kept GPU texture allocation
constant at 55 textures. This protects against leaking each cloned skeleton’s
bone texture. In Performance mode, normal kill accounting unlocked the portal;
the material on the actually displayed ring changed from teal to gold and its
emissive intensity increased from 0.55 to 1.8. Both states have captured frames.

A delayed-download regression holds all optional LOD transfers for 5.6 seconds.
Selecting Performance immediately applies Lambert materials to the existing
full-detail model and disables postprocessing; gameplay continues while the
files remain pending. When the real responses arrive, the current journey
updates to the 3,500-triangle model without losing progress. This test exceeds
the former 4.5-second optional-asset deadline. Failed detail transitions now
record loaded and failed model IDs, LOD errors, actual material types, geometry
detail, quality and WebGL state rather than reporting only a generic timeout.
