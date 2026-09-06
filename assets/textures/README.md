# Original dungeon PBR surfaces

The five 512 × 512 material sets were authored specifically for Runic Depths from
mathematical noise, drawn cracks, irregular masonry joints, chipped stone,
hammered metal scratches, a woven damask pattern, and an original carved covenant
sigil. They contain no downloaded photographs, stock textures, copied glyphs or
third-party artwork. The project owns this original generated artwork.

Reproduce from the repository root with Python 3, Pillow and NumPy:

```sh
python3 scripts/build-surface-assets.py
```

`manifest.json` records every file, dimension, byte count and SHA-256. Albedo uses
sRGB; normal and roughness use linear values. Normal maps use the OpenGL tangent
space convention (+Y) and are lossless WebP, as are the roughness maps. Albedo
uses quality-87 WebP. Total surface payload is capped at 3 MiB by the generator.

`createSurfaceLibrary(webglRenderer)` in `src/surface-assets.js` exposes:

- `apply(existingMaterial, kind, options)` to retain an existing color tint.
- `material(kind, options)` to create and own a MeshStandardMaterial.
- `ready` and `state` for load diagnostics, with nonblocking neutral fallbacks.
- `dispose()` to release the library after the dungeon renderer is disposed.

Kinds: `flagstone`, `masonry`, `metal`, `cloth`, `runestone`. Options include
`repeat: [u, v]`, `normalScale`, `roughness`, and `metalness`. Textures repeat and
use mipmaps plus device-capped anisotropy. Use one UV tile on each floor slab;
reuse repeated UVs on broad masonry faces and large cloth props. Tint textures
through material color to maintain each chapter's distinct palette.

Each request has a 4.5-second deadline. A missing or stalled texture retains its
neutral placeholder, and late responses are discarded rather than changing the
settled load diagnostics or blocking entry to the game.
