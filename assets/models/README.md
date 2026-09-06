# Original Covenant character assets

These eight original models were authored for Runic Depths with the reproducible
Blender 4.5 LTS script `scripts/build-character-assets.py`. No third-party character
geometry, textures or motion capture is used. The artwork and animation data in
this directory are dedicated to the public domain under CC0-1.0.

The five hero models are `warden`, `ranger`, `arcanist`, `reaver`, and `oracle`.
Enemy base models are `skeleton`, `wraith`, and `brute`. Each GLB contains one
skinned mesh, one material, a 16-bone articulated rig and five embedded animation
clips: `idle`, `walk`, `attack`, `cast`, `death`. Animations are original keyframes;
armor sections use rigid bone weights and the cape has its own animated bone.

Embedded 256×256 atlases provide base color, tangent-space normals, metallic and
roughness data, and emissive oathstone accents. Their original surface patterns
include hammered metal, engraved runes, woven linen and stitched leather. UV
rectangles are baked offline into a single material to limit each model to one
draw call per rendering pass. No runtime texture network requests are needed.

Coordinates: +Y up, +Z forward, feet at Y=0; characters approximately 1.5 units
high. Weapons are attached to the hand bone. Use `SkeletonUtils.clone` to create
independent animated instances; geometry, materials and textures remain shared.

To rebuild, run Blender from the repository root:

```
blender --background --python scripts/build-character-assets.py
```

Editable `.blend` scenes and original PNG atlases are written to
`source-art/characters/`, outside the browser package. The script also writes
`manifest.json` containing asset dimensions, rig counts, clips and byte sizes.
The Blender glTF export is standard, uncompressed GLB and needs no decoder CDN.
