# Performance character models

These optional LODs are derived from the original editable character scenes by
`scripts/build-character-lods.py`. They are intended for Performance quality;
the full models in the parent directory remain the high-detail presentation.

Each retains the original silhouette, UV regions, one material, 32-joint skin
and all eight authored animation clips. Blender collapse decimation reduces each
model to approximately 3,500 triangles. Skin weights are limited to four and
normalized before export. The original embedded atlases are resized to 256px.
Standard `KHR_mesh_quantization` packing needs no decoder or external service.

The generator only reads `source-art/characters/*.blend` and writes this folder.
It never replaces full models or saves over the editable source scenes.

Regenerate with:

```
blender --background --python scripts/build-character-lods.py
```

`manifest.json` records source paths, original and reduced triangle counts,
texture resolution, clips and exact output sizes. Original artwork is CC0-1.0.
