# Editable bestiary workshop

Each `.blend` contains the original authored mesh, material regions, vertex
palettes, weighted rig and animation actions. The browser payload is generated
from these scenes; source scenes are deliberately outside `assets/`.

Rebuild with Blender 4.5.3 LTS:

```sh
blender --background --python scripts/build-enemy-assets.py
npm install --prefix /tmp/runic-gltf @gltf-transform/core@4.5.0 @gltf-transform/extensions@4.5.0 @gltf-transform/functions@4.5.0 meshoptimizer@1.2.0 gltf-validator@2.0.0-dev.3.10
RUNIC_GLTF_TOOLS=/tmp/runic-gltf/node_modules node scripts/optimize-enemy-assets.mjs
RUNIC_GLTF_TOOLS=/tmp/runic-gltf/node_modules node scripts/validate-enemy-assets.mjs
```

The optional `RUNIC_ENEMY=<id>` environment variable limits Blender generation to
one identity for development. This writes a partial manifest; rebuild all models
before a release. The optimizer retains shared external images, artist metadata,
all animation channels and the complete skin. It quantizes positions to 14 bits,
UVs to 12 bits and vertex colors/weights to 8 bits, then applies standard Meshopt
compression. No server-side decoder is required.

Validation fully decodes Meshopt before invoking Khronos glTF Validator, so it
checks the actual vertex and skin data rather than merely accepting a compressed
extension. Current reports are in `qa/enemies/gltf-validation.json`. Runtime
renders and action tests remain necessary: the glTF structural validator alone
cannot prove material quality, weapon correctness or good animation.

Original artwork license: CC0-1.0. Source provenance is the deterministic Python
workshop and these editable scenes, with no external art inputs.
