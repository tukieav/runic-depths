# Enemy presentation audit

`tests/enemy-browser.mjs` tests the built game. Its report binds the observations to SHA-256 hashes of every packaged file. Run after `npm run build`:

```sh
node tests/enemy-browser.mjs
ENEMY_QA_GPU=hardware node tests/enemy-browser.mjs
```

The default backend is Chromium SwiftShader for portable CI checks. The second command requires the local NVIDIA GPU and records the actual WebGL renderer. Neither is a benchmark for a physical phone or an entry-level laptop.

The fixture uses the real game engine to spawn enemies and run AI attacks. It clears a small generated room to remove occlusion and random encounter composition. Attack anticipation, projectile release, skeleton pose changes, loaded geometry, and material types are inspected in the actual runtime. The normal six chapter screenshots retain the gameplay camera and postprocessing. The contact sheet uses the actual High game pipeline with closer orthographic bounds, scenery hidden, and one actor isolated by camera layers. It is an inspection composition, not ordinary gameplay framing. Every close frame checks the actual GPU pixel buffer for a lit model and a clean WebGL error queue.

Early experimental captures bypassed the game pipeline, manually changed live rig transforms, or moved the same rig to a second rendering context. Some of those captures produced empty or dark silhouettes. Their cause was not conclusively isolated, and they are not evidence of a production rendering defect or of its repair. Those methods and their images are excluded from the retained evidence. The final captures run `renderer.render(game)` with its normal animation/frame bookkeeping, postprocessing, lighting and GPU resources; all 30 characters must appear in the pixel buffer for the suite to pass.

The original implementation had concrete presentation defects:

- Enemy identity resolved from broad body shape into three shared humanoid models. Boss size and color did too much of the work of distinguishing characters.
- The procedural equipment branch recognized the hero Ranger and hero casters. Humanoid enemy spellcasters could inherit a sword.
- Every projectile used the same glowing gem and translucent cone, regardless of whether it represented a physical arrow, spores, or magic.
- Enemy ranged attacks released their projectiles immediately when the attack timer began, before a visible draw or casting anticipation.
- Non-humanoid enemies relied on simple procedural geometry and motion rather than individual authored rigs.

Visual inspection also found a real bug in the first new asset export: changing Blender image color space after writing generated pixels reset the normal and roughness/metalness maps to black. This made enemies excessively shiny and washed out their colors. The generator order was corrected. A browser regression now samples the actual decoded material bitmaps and rejects black normal maps, zero roughness, or an atlas that loses the distinction between metal and cloth.

The retained NVIDIA run passes five groups with no errors: valid PBR bitmap content; all 30 High models and their framebuffers; all 15 ranged AI attacks; all 30 Performance models; and role-correct fallback after authored file failures. Both archers move the actual skin-weighted `bow_draw` joint by approximately 0.173 game units at 0.133 seconds, while no projectile exists yet. Their first arrows appear at 0.350 seconds. Exact coordinates, timing, triangle counts, renderer identity, and build hashes are recorded in `results.json`.

Passing these checks establishes the specific art/behavior contracts recorded in `results.json`. It does not establish AAA quality. AAA comparison also requires close visual review of anatomy, skinning, composition, surface detail, motion transitions, hit response, encounter readability, and performance on representative hardware. Polygon count, file count, and a passing test suite alone cannot establish that standard.
