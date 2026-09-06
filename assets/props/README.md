# Original sculptural environment models

`sarcophagus.glb` is a weathered stone tomb with a clothed, stylized oath-keeper
effigy, ceremonial sword, recessed panels and carved corner columns.
`shrine.glb` is a pointed gothic shrine with a stone altar, a hanging covenant
sigil, five candles with wax drops, and an open book with raised pages.

Both are original geometry authored specifically for this project, with no
external meshes, scans, images or protected character designs. The depiction is
non-graphic fantasy sculpture appropriate to the game's intended age range.

Rebuild using the project's pinned Three.js dependency:

```sh
node scripts/build-surface-props.mjs
```

The resulting glTF 2.0 binary models are centered at X/Z zero and stand on Y=0.
The sarcophagus runs along Z; the shrine's decorated face points toward +Z.
`manifest.json` records bounds, triangle counts, byte size and SHA-256.

Materials named `surface.KIND` obtain the shared original maps through
`loadPropAssets(surfaceLibrary)` in `src/prop-assets.js`. The GLBs retain their
plain PBR colors when opened independently; textures are intentionally shared
at runtime to avoid duplicating the texture payload in each model.

`createPropVisual(kind)` returns a new hierarchy with cached geometry/materials,
or `null` before a model has loaded. Do not dispose geometry when removing an
individual clone. `disposePropAssets()` releases the shared cache after the
renderer is no longer in use. Models are batched by material in the generator.
Each model load has a 4.5-second deadline; late results are safely disposed, and
a disposed/restarted library cannot be repopulated by a stale response.
