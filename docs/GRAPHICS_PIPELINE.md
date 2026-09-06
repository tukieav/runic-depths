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

## Authored assets in this update

The original character workshop is `scripts/build-character-assets.py`, run with
Blender in background mode. It saves editable Blender scenes separately from the
browser payload and exports GLB files into `assets/models/`. The five playable
classes and the skeleton, wraith and brute families have UV-mapped meshes, weighted
32-joint skeletons and idle, walk, two attack variants, cast, dodge, hit and death clips.
Each model uses four 512px PBR maps and standard KHR_mesh_quantization for
compact UVs, normals and weights; no runtime geometry decoder is required. The manifest records each
export's mesh, skeleton, clip and byte counts; the runtime audit inspects the actual
files and live skinning independently.

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

## Version 2.2 presentation

The high setting renders an HDR scene through depth-based contact occlusion,
thresholded bloom, color grading, tone mapping and FXAA. This is a compact screen
space approximation of contact shading, not ray tracing or a full ambient
occlusion solution. `renderer.postprocessingStatus()` exposes the active chain.
Lost-context render targets and environment probes are retired during context
loss, then recreated after restoration without deleting obsolete GPU handles.
Performance mode and devices without floating-point color buffers use direct
rendering; the latter also skips the HDR environment probe.

Original radial stone reliefs replace the flat archive and void floor markers.
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

## Performance models and materials

High quality retains the full authored models and PBR lighting. Performance mode
selects separate original 3,498–3,500-triangle GLBs with the same 32-joint rig and
eight clips. Their 256px atlases and quantized attributes total about 2.18 MiB for
all eight models. `scripts/build-character-lods.py` derives these optional assets
from the editable high-detail scenes; the full exports are not overwritten.

Performance materials retain color textures and emissive detail with vertex-lit
Lambert shading. They avoid normal/roughness/environment fragment calculations,
dynamic shadows and postprocessing. Missing LOD assets fall back to the full
model. Switching quality reloads presentation while preserving the game state.
The browser tests verify that real scene geometry and materials change with the
setting. Hardware and software rendering measurements must be labelled separately.

The character instance owns its cloned skeleton and GPU bone texture. Removing an
actor disposes that skeleton while preserving shared mesh and surface resources.
The animated portal owns its final displayed material in both quality settings,
so unlocking updates the rendered color and glow. Browser regressions inspect
GPU texture counts across rebuilds and actual locked/unlocked portal materials.
