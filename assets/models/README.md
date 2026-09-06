# Original Covenant character assets

These eight original models were authored for Runic Depths with the reproducible
Blender 4.5 LTS script `scripts/build-character-assets.py`. No third-party character
geometry, textures or motion capture is used. The artwork and animation data in
this directory are dedicated to the public domain under CC0-1.0.

The five hero models are `warden`, `ranger`, `arcanist`, `reaver`, and `oracle`.
Enemy base models are `skeleton`, `wraith`, and `brute`. Each GLB contains one
skinned mesh, one material, a 32-bone articulated rig and eight embedded animation
clips: `idle`, `walk`, `attack`, `attack_alt`, `cast`, `dodge`, `hit`, `death`.
Animations are original keyframes with class-specific anticipation, contact and
recovery, counter-rotating hips and shoulders, ankle roll, recoil and dodge.
Armor uses rigid weights; capes blend across a three-bone chain and robe hems
blend across the pelvis and left/right tabard and hem joints. Constant rest-pose
tracks are removed offline to reduce animation work for each actor.

Embedded 512×512 atlases provide base color, tangent-space normals, metallic and
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
The export uses the standard `KHR_mesh_quantization` extension: positions and
animation values retain float precision; UVs use normalized unsigned 16-bit
values, normals use signed normalized bytes and joint weights use bytes whose
sum is exactly 255. Three.js supports this directly without a decoder or CDN.
The runtime generates tangent space from UVs; the validator notes this and the
usual parented-skinned-mesh advisory. All models are checked in real Chrome.

`createCharacterVisual().update(data, dt)` accepts increasing `data.dashTime`
(or `dodgeTime`) and `data.hitTime` to trigger dodge and recoil. Consecutive basic
attacks alternate `attack` and `attack_alt`; current clip names are exposed as
`root.userData.animation`. Gameplay owns root motion and collision.

This is original stylized browser artwork, not a claim of AAA production parity.
The editable source viewer is `source-art/characters/preview.mjs`.
