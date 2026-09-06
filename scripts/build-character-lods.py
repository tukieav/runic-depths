"""Performance-only character LODs derived from the editable original scenes.
Run: blender --background --python scripts/build-character-lods.py
Never modifies source scenes or high-detail shipping models.
"""
import ast
import bpy
import json
import os
import struct
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / 'source-art' / 'characters'
OUT = ROOT / 'assets' / 'models' / 'lod'
OUT.mkdir(parents=True, exist_ok=True)
IDS = ['warden', 'ranger', 'arcanist', 'reaver', 'oracle', 'skeleton', 'wraith', 'brute']
TARGET_TRIANGLES = 3500

# Reuse precisely the shipping quantizer without executing its asset-generation
# module (that would regenerate full models or change the original scenes).
tree = ast.parse((ROOT / 'scripts' / 'build-character-assets.py').read_text())
compact = next(node for node in tree.body if isinstance(node, ast.FunctionDef) and node.name == 'compact_glb')
exec(compile(ast.Module(body=[compact], type_ignores=[]), 'shared_glb_quantizer', 'exec'))

records = []
for kind in IDS:
    bpy.ops.wm.open_mainfile(filepath=str(SOURCE / (kind + '.blend')))
    mesh = next(o for o in bpy.context.scene.objects if o.type == 'MESH')
    rig = next(o for o in bpy.context.scene.objects if o.type == 'ARMATURE')
    bpy.ops.object.select_all(action='DESELECT')
    mesh.select_set(True)
    bpy.context.view_layer.objects.active = mesh
    # Collapse in bind pose before armature deformation. Blender carries UVs and
    # interpolates vertex-group influences; disconnected armor never welds.
    mesh.data.calc_loop_triangles()
    original_triangles = len(mesh.data.loop_triangles)
    lod = mesh.modifiers.new('Performance silhouette-preserving decimation', 'DECIMATE')
    lod.decimate_type = 'COLLAPSE'
    lod.ratio = TARGET_TRIANGLES / original_triangles
    lod.use_collapse_triangulate = True
    bpy.ops.object.modifier_move_to_index(modifier=lod.name, index=0)
    bpy.ops.object.modifier_apply(modifier=lod.name)
    mesh.data.validate(clean_customdata=False)
    bpy.ops.object.vertex_group_limit_total(limit=4)
    bpy.ops.object.vertex_group_normalize_all(lock_active=False)
    mesh.data.calc_loop_triangles()
    # A quarter of the texture pixels is ample at the distant performance view.
    for image in bpy.data.images:
        if image.name.startswith(kind + '_') and image.size[0] > 256:
            image.scale(256, 256)
            image.pack()
    for pose in rig.pose.bones:
        pose.rotation_euler = (0, 0, 0)
        pose.location = (0, 0, 0)
    bpy.context.scene.frame_set(0)
    output = OUT / (kind + '.glb')
    bpy.ops.export_scene.gltf(filepath=str(output), export_format='GLB', export_yup=True,
        export_animations=True, export_animation_mode='ACTIONS', export_frame_range=False,
        export_force_sampling=True, export_optimize_animation_size=True, export_frame_step=2,
        export_skins=True, export_def_bones=True, export_all_influences=False,
        export_materials='EXPORT', export_image_format='AUTO', export_apply=False,
        export_tangents=False)
    compact_glb(str(output))
    raw = output.read_bytes()
    length = struct.unpack_from('<I', raw, 12)[0]
    document = json.loads(raw[20:20+length])
    records.append({
        'id': kind, 'source': 'source-art/characters/' + kind + '.blend',
        'vertices': len(mesh.data.vertices), 'triangles': len(mesh.data.loop_triangles),
        'originalTriangles': original_triangles, 'bones': len(rig.data.bones),
        'clips': [a['name'] for a in document.get('animations', [])],
        'textureSize': 256, 'bytes': len(raw),
    })
(OUT / 'manifest.json').write_text(json.dumps({
    'generator': 'Blender 4.5 LTS / scripts/build-character-lods.py',
    'license': 'CC0-1.0', 'original': True, 'purpose': 'Performance mode only',
    'coordinates': '+Y up, +Z forward, feet at Y=0', 'assets': records,
}, indent=2) + '\n')
print('RUNIC_LODS_COMPLETE', json.dumps(records))
