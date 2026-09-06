# Original bestiary assets

Thirty distinct enemy identities (24 ordinary enemies and six bosses), each with
an original Blender source scene, a skinned High GLB and a Performance LOD.
Geometry, UVs, palettes, shared PBR textures and animation curves are authored in
`scripts/build-enemy-assets.py`; no third-party or Diablo art is included.

The two archers are `thorn_lurker` and `ember_channeler`. Their physical equipment
includes a recurve bow, deforming string, nocked arrow, arrowhead, back quiver and
spare fletched arrows. A dedicated `bow_draw` joint pulls the string and arrow;
`shoot` and `shoot_alt` clips release at the combat windup. Neither carries sword
geometry. Spellcasters retain staffs/orbs, and creatures use mandibles, fangs or
other anatomy appropriate to their attacks.

Bodies use purpose-built humanoid, golem, arachnid, quadruped and floating rigs.
Eight locomotion/action clips are provided per model; archers have two additional
shoot clips. Shared surfaces are `color.png`, `normal.png`, `roughmetal.png` and
`emission.png` (1024 × 1024; 256 × 512 texels per surface). Per-vertex authored palettes distinguish cloth, wood,
metal, bone, stone, coral, luminous crystal and brass. All thirty bodies share
six cached theme materials and four GPU textures; each actor owns only its cloned skeleton.

`manifest.json` records the actual parts, triangles, rig, clips, compressed bytes
and SHA-256 for each export. `EXT_meshopt_compression` uses the decoder already
included with Three.js. No external runtime CDN or paid asset service is used.

Original artwork is dedicated under **CC0-1.0**. Generated character likenesses,
weapons, ornaments and enemy names are original Runic Depths designs. Blender,
Three.js, glTF Transform and meshoptimizer are tools, not imported art sources.
The Three.js and meshoptimizer licenses ship with the game as
`THREE-LICENSE.txt` and `assets/MESHOPTIMIZER-LICENSE.txt`.

These assets improve combat readability and identity; they are stylized game art,
not a claim of AAA fidelity or parity with Diablo III. They do not include
motion-captured performances, cinematic facial rigs or scanned high-resolution
materials.
