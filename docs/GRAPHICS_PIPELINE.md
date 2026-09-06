# Graphics pipeline and engine decision

Reviewed on 2026-09-06. This document distinguishes the browser platform, the
rendering library, and the tools used to author assets.

## Decision

Keep the existing Three.js/WebGL renderer and add authored glTF models, skeletal
animation and texture maps. HTML5 is the delivery platform; it does not constrain
the game to flat graphics or geometric placeholders. Three.js provides a glTF
loader and an animation mixer, including playback of independently animated
objects. These directly address the missing asset pipeline without replacing the
working campaign, controls, save system or portal integration.
[GLTFLoader](https://threejs.org/docs/pages/GLTFLoader.html),
[AnimationMixer](https://threejs.org/docs/pages/AnimationMixer.html).

This is a project-specific engineering judgment, not a claim that Three.js is
universally better than a full editor-based game engine.

| Option                    | Relevant evidence                                                                                                                                                                                                         | Decision for this update                                                                                                                          |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Three.js + Blender assets | glTF loading, material maps and animation playback are already available in the installed library.                                                                                                                        | Extend the renderer and preserve the existing game.                                                                                               |
| Godot 4 web export        | Browser export requires WebAssembly and WebGL 2.0; it uses the Compatibility renderer. Forward+ and Mobile rendering methods are not supported on web. Single-threaded export is the recommended default for web portals. | A useful alternative for a future editor-first project, but migrating this game would not bring Godot's desktop rendering methods to the browser. |
| Unity web export          | Unity's web target remains subject to browser graphics, audio and threading restrictions. CrazyGames currently disables Unity games on iOS by default because of memory-related crashes, with later evaluation possible.  | No migration for this graphics update; evaluate a representative mobile build before considering a future port.                                   |

Sources: [Godot web export](https://docs.godotengine.org/en/stable/tutorials/export/exporting_for_web.html),
[Unity 6 web technical limitations](https://docs.unity3d.com/6000.0/Documentation/Manual/webgl-technical-overview.html),
[CrazyGames technical requirements](https://docs.crazygames.com/requirements/technical/).

## Ready-made asset options checked

| Pack                                                                               | Publisher's published contents and license                              | Possible role                                                                                         |
| ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| [Kenney Mini Dungeon](https://kenney.nl/assets/mini-dungeon)                       | 30 files, 3D models, animation/variation features, character rigs; CC0. | Compact dungeon characters and props; art style needs assessment in the actual scene.                 |
| [Quaternius Ultimate Monsters](https://quaternius.com/packs/ultimatemonsters.html) | 50 animated monsters; the page lists FBX, OBJ, Blend and glTF; CC0.     | A source of enemy silhouettes and animations when a selected model suits the game's visual direction. |

These packs were researched as alternatives. Their listing here does not mean
their files are bundled in the game. The shipped asset manifest and provenance
files identify actual included work. Preserve the source license alongside any
future imported pack and inspect its scale, materials, animation clips and polygon
count before adding it to the shipping build.

## Shipping constraints

Keep runtime assets local to the game bundle and address them with relative URLs.
CrazyGames currently permits 250 MB total, 1,500 files and an initial download up
to 50 MB; eligibility for the mobile homepage requires at most 20 MB initial
download. The platform expects Chrome/Edge compatibility and smooth operation on
4 GB Chromebooks. Asset authoring and rendering choices therefore need to be
validated against transfer size, draw calls and physical-device measurements.
[CrazyGames technical requirements](https://docs.crazygames.com/requirements/technical/).

## Authored assets in version 2.3

The five playable heroes retain their original `assets/models/` GLBs: one skinned
mesh, a 32-joint rig, four embedded 512px PBR maps and eight clips each. Their
editable scenes and workshop remain in `source-art/characters/` and
`scripts/build-character-assets.py`. The old skeleton, wraith and brute enemy
exports are retired; enemies no longer choose a generic hero-style mesh by shape.

`assets/enemies/manifest.json` lists 30 original identities, each with a High GLB
and a separate Performance GLB. The exports currently contain **756–10,440
triangles in High and 756–1,800 in Performance**. These are manifest measurements,
not a claim of film-resolution assets; the smallest floating creatures need much
less geometry than an armored boss. Rigs have 13, 19, 32 or 33 joints according to
anatomy. Every model contains eight locomotion/action clips. The two archers also
have `shoot` and `shoot_alt`, with vertices weighted to a real `bow_draw` joint.
The 60 compressed GLBs total 4,658,232 bytes before shared texture files.

Thirty editable `.blend` scenes live in `source-art/enemies/`.
`scripts/build-enemy-assets.py` authors mesh layers, equipment, UV regions, vertex
palettes and original animation curves. `scripts/optimize-enemy-assets.mjs`
quantizes attributes and applies `EXT_meshopt_compression`; `src/enemy-assets.js`
uses the Meshopt decoder shipped with Three.js. Unlike the retained hero packing,
this enemy compression does require that bundled decoder. It makes no external
CDN request. The artwork is original CC0-1.0; decoder/tool licenses are retained.

All enemies share four 1024 × 1024 maps: color, tangent-space normal, packed
roughness/metalness and emission. The atlas contains material regions, not a
unique 1024px skin for every creature. Runtime parsing removes redundant image
references and assigns six cached theme materials that share the four GPU
textures. Per-vertex colors distinguish cloth, metal, bark, bone, coral and other
surfaces. The manifest records individual file hashes and sizes; these must be
rechecked if the workshop is rerun.

`src/enemy-presentation.js` is the explicit identity/role contract. Thorn Lurker
and Ember Channeler use bows, visible strings, quivers and arrows. Staff users,
spirits and organic spitters retain their own attack sources. Every identity has
its own export; boss-specific geometry includes Veyr's bell head, the Matriarch's
branching crown, Ilyra's prismatic wings, Kord's anvil crown, Orren's coral crown
and Aster's eclipse halo. These ornaments improve recognition; their quality
still needs assessment in motion and at the normal gameplay camera.

`scripts/build-surface-props.mjs` authors the sarcophagus and shrine as reusable
GLB geometry with UVs. The game instantiates these props and applies the shared
surface maps. Their source generator and manifest make the shipped geometry
editable and reproducible without adding a third-party asset dependency.

`scripts/build-surface-assets.py` creates five original 512 × 512 material sets:
flagstone, masonry, metal, cloth and runestone. Each set includes base color,
tangent-space normal and roughness maps in WebP format. Their manifest contains
SHA-256 hashes, dimensions and file sizes. `src/surface-assets.js` loads the maps
once and reuses texture sources for material variants. Neutral map placeholders
keep geometry visible if an asset request fails.

Regenerate source art only when changing asset design. Regular `npm run build`
packages the checked-in exports; players never download Blender or Python, and CI
does not need either tool to build the game.

## Verification contract

`node tests/graphics-assets.mjs` tests the built `dist` game, served from a
temporary loopback HTTP server. It checks actual GLB structure, UVs, skinning,
texture images, animation tracks, loaded scene materials and changing bone poses
during gameplay. It captures desktop and touch-view screenshots and blocks model
and texture requests to check that the fallback still allows play. A separate
case holds transfers open to verify that asset deadlines bound startup time.

The generated report records the exact bundle and asset hashes. Headless Chromium
with software WebGL provides integration evidence; its frame rate is not a
physical mobile/Chromebook benchmark and it does not constitute portal approval.

## Retained cinematic rendering and version 2.3 combat presentation

The high setting renders an HDR scene through depth-based contact occlusion,
thresholded bloom, color grading, tone mapping and FXAA. This is a compact screen
space approximation of contact shading, not ray tracing or a full ambient
occlusion solution. `renderer.postprocessingStatus()` exposes the active chain.
Lost-context render targets and environment probes are retired during context
loss, then recreated after restoration without deleting obsolete GPU handles.
Performance mode and devices without floating-point color buffers use direct
rendering; the latter also skips the HDR environment probe.

Original radial stone reliefs replace the flat archive and void floor markers.
In the gardens, `src/garden-detail.js` replaces flat moss circles and straight
plant placeholders with irregular low ground cover, curved tapering roots,
folded fern leaves, mushroom caps/gills and shallow wall ivy. High and Performance
have separate geometry caps. Complete transformed footprints keep tall plants
inside blocked tiles and ground moss below six centimetres on walkable stone.
Near-wall dressing follows the camera visibility treatment rather than leaving
large foliage floating in front of the player.
Exploration masks shade unseen dungeon surfaces. Static geometry is grouped by
material and spatial cell so offscreen geometry can be culled. Nearest torch
selection updates at four Hz. Camera zoom is adjustable from 0.8 to 1.35; the
reduced-motion preference suppresses impact shake and optional effects.

`src/combat-presentation.js` provides tapered blade ribbons and ballistic sparks.
Hit and dodge animation clips are connected to real damage and dodge state, with
animation recovery independent of gameplay damage calculations. New original
sampled chapter music and combat effects are authored by
`scripts/build-audio-assets.py`; audio loads after a user gesture and retains a
procedural fallback. All these features are verified against the built game;
they do not establish AAA production quality or portal acceptance.

## Combat timing and projectiles

Ordinary ranged AI records its aim and prepares for 0.32 seconds before releasing
a projectile. The aim remains fixed if the hero sidesteps; a newly obstructed
line of sight cancels release. Boss specials have a separate 0.55-second
preparation. Casters pass actual `castTime` to their animation; bow users select
shooting clips. Legacy saved enemies refresh presentation-relevant role data,
including the Thorn Lurker's conversion to an archer. Enemy bow releases also
select the matching sampled audio event.

`src/projectile-presentation.js` renders arrows with shafts, heads and fletching,
and distinct spore, prism, tide, thorn, soul and void shapes. `shoot` retains the
source identity and a body/scale-based launch height. Projectile height blends
toward the target while it travels. This corrects the universal knee-height
projectile, but it is **not** exact sampling of an animated hand or bow socket;
precise weapon attachment throughout each pose remains a refinement target.

## Performance models and materials

The five retained heroes have separate approximately 3,500-triangle LODs with
32-joint rigs, eight clips and embedded 256px atlases, generated by
`scripts/build-character-lods.py`. Enemy Performance assets are a separate set
with their own 756–1,800-triangle budget and the same shared enemy surfaces and
role-specific rigs as High. Quality reduction must preserve a bow as a bow and
an eight-legged creature as eight-legged; it must not substitute a generic sword
carrier.

Performance materials retain color textures and emissive detail with vertex-lit
Lambert shading. They avoid normal/roughness/environment fragment calculations,
dynamic shadows and postprocessing. Missing LOD assets fall back to the full
model. Switching quality reloads presentation while preserving the game state.
The cheaper materials apply immediately, independently of optional model
transfers. LOD transfers may finish after the bounded startup screen; completed
assets then replace the geometry, and a later quality switch can retry failures.
The browser tests verify that real scene geometry and materials change with the
setting. Hardware and software rendering measurements must be labelled separately.

The character instance owns its cloned skeleton and GPU bone texture. Removing an
actor disposes that skeleton while preserving shared mesh and surface resources.
The animated portal owns its final displayed material in both quality settings,
so unlocking updates the rendered color and glow. Browser regressions inspect
GPU texture counts across rebuilds and actual locked/unlocked portal materials.

## Acceptance evidence and remaining art debt

`tests/enemy-presentation.test.mjs` checks complete identity coverage and semantic
AI/weapon/projectile consistency. `tests/enemy-combat.test.mjs` checks real
preparation, release, fixed aim, obstruction, pause/revival, legacy saves and boss
special timing. `tests/enemy-browser.mjs` inspects actual GLB geometry, weighted
bow vertices, animated rigs, typed projectiles, physical materials, all 30 LODs
and deliberate asset failure. Its exact-build evidence is `qa/enemies/results.json`;
`qa/enemies/all-30-contact-sheet.png` and individual close frames support visual
review. `scripts/validate-enemy-assets.mjs` fully decodes Meshopt before Khronos
glTF validation; its separate report is `qa/enemies/gltf-validation.json`.

Final 2.3 browser/hash binding, CI, packaged file sizes and public deployment must
be confirmed against the release artifacts. Existing green reports from an earlier
build do not close that verification. No current CI outcome or physical low-end
frame-rate measurement is asserted here.

The renderer still uses repeated procedural room architecture and generated
surface patterns; NPCs still reuse the Oracle model. The enemy assets are
stylized procedural constructions. Humanoids still share similar heads, armored
ribcages and proportions; Veyr and Kord reuse a recognizable golem base and
rectangular hammer, and hounds share a core silhouette. Rounded segments can read
as toy-like or robotic. Shared normal-map detail does not replace bespoke anatomy
and individually finished surface work. There is no motion capture, cinematic
facial performance, scan-based surface work or manual animation polish at AAA
production scale. The concrete defect ledger is [ENEMY_ART_REVIEW.md](ENEMY_ART_REVIEW.md).
