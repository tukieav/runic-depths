"""Original Runic Depths character workshop. Blender 4.5 LTS, no add-ons required.

Run: blender --background --python scripts/build-character-assets.py
Authors geometry, UV material atlases, a 16-bone rig and five animation actions.
Source scenes are saved outside the browser payload in source-art/characters/.
"""
import bpy, math, random, os, json, struct
from mathutils import Vector

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'assets', 'models')
SOURCE = os.path.join(ROOT, 'source-art', 'characters')
os.makedirs(OUT, exist_ok=True)
os.makedirs(SOURCE, exist_ok=True)
random.seed(723)

def p(x=0, y=0, z=0):
    """Design coordinates: X right, Y up, Z facing the viewer."""
    return Vector((x, -z, y))

def image_atlas():
    size = 256
    image = bpy.data.images.new('Covenant handwoven and hammered atlas', size, size)
    normal = bpy.data.images.new('Covenant surface normal', size, size)
    pixels, normals = [], []
    for y in range(size):
        for x in range(size):
            local_x, local_y = x % 128, y % 128
            noise = random.uniform(-0.045, 0.045)
            if x < 128 and y < 128: # fine hammering, panel seams and rivets
                v = 0.80 + noise + 0.025 * math.sin(x * 0.7) * math.sin(y * 0.8)
                if local_x % 64 < 2 or local_y % 64 < 2: v -= 0.16
                if (local_x % 64 - 6)**2 + (local_y % 64 - 6)**2 < 5: v += .13
            elif x >= 128 and y < 128: # woven cloth with an embroidered border
                v = .78 + noise + (.045 if (x+y) % 4 == 0 else -.015)
                if local_x < 6 or local_x > 121: v += .11 if y % 10 < 5 else -.12
            elif x < 128: # creased leather, stitched edges
                v = .72 + noise + .025 * math.sin(x * .25 + math.sin(y*.11))
                if local_x % 64 == 5 and local_y % 8 < 3: v += .23
                if local_x % 64 < 2: v -= .14
            else: # engraved bronze with a repeating angular rune
                v = .84 + noise
                rx, ry = local_x % 32, local_y % 32
                if abs(rx-16) < 2 or (abs(rx-ry)<2 and ry<17) or (abs(rx+ry-32)<2 and ry>16): v -= .22
            v=max(.3,min(.98,v))
            pixels.extend((v,v*.98,v*.94,1))
            normals.extend((.5+noise*.75,.5+noise*.65,1,1))
    image.pixels = pixels
    image.filepath_raw = os.path.join(SOURCE, 'covenant-surfaces.png')
    image.file_format='PNG'; image.save(); image.pack()
    normal.pixels = normals; normal.colorspace_settings.name='Non-Color'
    normal.filepath_raw = os.path.join(SOURCE, 'covenant-normal.png')
    normal.file_format='PNG'; normal.save(); normal.pack()
    return image,normal

atlas, normal_atlas = image_atlas()
MATERIALS = {}
PARTS=[]
def mat(name, rgb, region=0, metal=0, rough=.65, glow=0):
    material=bpy.data.materials.new(name)
    material.use_nodes=True
    material.use_backface_culling=True
    material['base_color_factor']=list(rgb)
    bs=material.node_tree.nodes.get('Principled BSDF')
    bs.inputs['Base Color'].default_value=(*rgb,1)
    bs.inputs['Metallic'].default_value=metal
    bs.inputs['Roughness'].default_value=rough
    tex=material.node_tree.nodes.new('ShaderNodeTexImage'); tex.image=atlas
    mix=material.node_tree.nodes.new('ShaderNodeMixRGB');mix.blend_type='MULTIPLY'
    mix.inputs[0].default_value=1;mix.inputs[2].default_value=(*rgb,1)
    material.node_tree.links.new(tex.outputs['Color'],mix.inputs[1])
    material.node_tree.links.new(mix.outputs[0],bs.inputs['Base Color'])
    # glTF exporter supports a texture multiplied by the base-color factor.
    if glow:
        bs.inputs['Emission Color'].default_value=(*rgb,1)
        bs.inputs['Emission Strength'].default_value=glow
    ntex=material.node_tree.nodes.new('ShaderNodeTexImage');ntex.image=normal_atlas
    nm=material.node_tree.nodes.new('ShaderNodeNormalMap');nm.inputs['Strength'].default_value=.28
    material.node_tree.links.new(ntex.outputs['Color'],nm.inputs['Color'])
    material.node_tree.links.new(nm.outputs['Normal'],bs.inputs['Normal'])
    material['atlas_region']=region
    return material

def finish(obj,name,material,bone,bevel=0):
    obj.name=name;obj.data.materials.append(material)
    if bevel:
        modifier=obj.modifiers.new('Forged rounded edges','BEVEL');modifier.width=bevel;modifier.segments=2
        bpy.context.view_layer.objects.active=obj
        bpy.ops.object.modifier_apply(modifier=modifier.name)
    if not obj.data.uv_layers:
        uv=obj.data.uv_layers.new(name='UVMap')
        for polygon in obj.data.polygons:
            for li in polygon.loop_indices:
                co=obj.data.vertices[obj.data.loops[li].vertex_index].co
                uv.data[li].uv=(co.x*2+.5,co.z*2+.5)
    region=int(material['atlas_region']); ox=(region%2)*.5;oy=(region//2)*.5
    for loop in obj.data.uv_layers.active.data:
        loop.uv=(ox+.015+(loop.uv.x%1)*.47,oy+.015+(loop.uv.y%1)*.47)
    for poly in obj.data.polygons: poly.use_smooth=True
    group=obj.vertex_groups.new(name=bone);group.add(list(range(len(obj.data.vertices))),1,'REPLACE')
    PARTS.append(obj)
    return obj

def ball(name,center,scale,material,bone='spine',segments=12,rings=8):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments,ring_count=rings,location=p(*center))
    ob=bpy.context.object;ob.scale=(scale[0],scale[2],scale[1])
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    return finish(ob,name,material,bone)

def tube(name,a,b,r1,r2,material,bone='spine',vertices=12):
    start,end=p(*a),p(*b);delta=end-start
    bpy.ops.mesh.primitive_cone_add(vertices=vertices,radius1=r1,radius2=r2,depth=delta.length,location=(start+end)/2)
    ob=bpy.context.object;ob.rotation_euler=delta.to_track_quat('Z','Y').to_euler()
    return finish(ob,name,material,bone, min(r1,r2,.02)*.22)

def plate(name,center,scale,material,bone='spine',angle=0):
    bpy.ops.mesh.primitive_cube_add(size=1,location=p(*center))
    ob=bpy.context.object;ob.scale=(scale[0],scale[2],scale[1]);ob.rotation_euler.y=angle
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    return finish(ob,name,material,bone,min(scale)*.22)

def profile(name,rings,material,bone='spine',sides=16):
    """Hand-designed elliptical cross-sections for fitted armor, cloth and hoods."""
    vertices=[]
    for height,width,depth,offset in rings:
        for i in range(sides):
            a=i*math.tau/sides
            vertices.append(p(math.cos(a)*width,height,math.sin(a)*depth+offset))
    faces=[]
    for j in range(len(rings)-1):
        for i in range(sides):faces.append((j*sides+i,j*sides+(i+1)%sides,(j+1)*sides+(i+1)%sides,(j+1)*sides+i))
    faces.extend([tuple(range(sides-1,-1,-1)),tuple((len(rings)-1)*sides+i for i in range(sides))])
    faces=[tuple(reversed(face)) for face in faces]
    mesh=bpy.data.meshes.new(name);mesh.from_pydata(vertices,[],faces);mesh.update()
    ob=bpy.data.objects.new(name,mesh);bpy.context.collection.objects.link(ob)
    uv=mesh.uv_layers.new(name='UVMap')
    for poly in mesh.polygons:
        for li in poly.loop_indices:
            vi=mesh.loops[li].vertex_index;uv.data[li].uv=((vi%sides)/(sides-1),(vi//sides)/(len(rings)-1))
    return finish(ob,name,material,bone)

def fabric(name,rows,material,bone='cape'):
    vertices=[];cols=9
    for y,w,z in rows:
        for i in range(cols):
            u=i/(cols-1);vertices.append(p((u-.5)*w,y,z+math.cos(u*math.pi*6)*.018))
    faces=[]
    for r in range(len(rows)-1):
        for c in range(cols-1):a=r*cols+c;faces.append((a,a+1,a+1+cols,a+cols))
    mesh=bpy.data.meshes.new(name);mesh.from_pydata(vertices,[],faces);mesh.update()
    ob=bpy.data.objects.new(name,mesh);bpy.context.collection.objects.link(ob)
    uv=mesh.uv_layers.new(name='UVMap')
    for poly in mesh.polygons:
        for li in poly.loop_indices:
            vi=mesh.loops[li].vertex_index;uv.data[li].uv=((vi%cols)/(cols-1),(vi//cols)/(len(rows)-1))
    material.use_backface_culling=False
    return finish(ob,name,material,bone)

PALETTES={
 'warden':((.20,.38,.70),(.63,.70,.77),(.83,.61,.24)),
 'ranger':((.19,.43,.25),(.33,.40,.36),(.62,.43,.20)),
 'arcanist':((.42,.19,.66),(.47,.45,.62),(.78,.61,.32)),
 'reaver':((.64,.18,.10),(.26,.29,.32),(.74,.40,.16)),
 'oracle':((.08,.54,.61),(.56,.74,.73),(.82,.69,.36)),
 'skeleton':((.24,.24,.32),(.57,.54,.43),(.46,.32,.18)),
 'wraith':((.18,.30,.40),(.32,.41,.48),(.34,.69,.66)),
 'brute':((.42,.16,.18),(.30,.30,.34),(.63,.38,.19)),
}

def make_rig():
    bpy.ops.object.armature_add(location=(0,0,0));rig=bpy.context.object;rig.name='Covenant_Rig'
    bpy.ops.object.mode_set(mode='EDIT');rig.data.edit_bones.remove(rig.data.edit_bones[0])
    bone_defs=[('root',(0,.65,0),(0,.8,0),None),('spine',(0,.72,0),(0,1.13,0),'root'),('head',(0,1.15,0),(0,1.44,0),'spine'),('cape',(0,1.11,-.13),(0,.53,-.24),'spine')]
    for side,s in [('L',-1),('R',1)]:
        bone_defs += [(f'upper_arm_{side}',(s*.24,1.09,0),(s*.30,.88,0),'spine'),(f'forearm_{side}',(s*.30,.88,0),(s*.33,.70,.05),f'upper_arm_{side}'),(f'hand_{side}',(s*.33,.70,.05),(s*.33,.62,.05),f'forearm_{side}'),(f'thigh_{side}',(s*.115,.68,0),(s*.12,.38,0),'root'),(f'shin_{side}',(s*.12,.38,0),(s*.12,.10,0),f'thigh_{side}'),(f'foot_{side}',(s*.12,.10,0),(s*.12,.06,.13),f'shin_{side}')]
    for name,a,b,parent in bone_defs:
        bone=rig.data.edit_bones.new(name);bone.head=p(*a);bone.tail=p(*b)
        if parent:bone.parent=rig.data.edit_bones[parent]
    bpy.ops.object.mode_set(mode='OBJECT')
    return rig

def animate(rig,kind):
    actions=[]
    for name,duration in [('idle',72),('walk',24),('attack',18),('cast',30),('death',36)]:
        rig.animation_data_create();action=bpy.data.actions.new(name);rig.animation_data.action=action
        for frame in range(0,duration+1,3):
            t=frame/duration;wave=math.sin(t*math.tau)
            for bone in rig.pose.bones:
                bone.rotation_mode='XYZ';bone.rotation_euler=(0,0,0);bone.location=(0,0,0)
            poses={}
            if name=='idle':
                poses={'spine':(.016*wave,0,0),'head':(0,.04*wave,0),'cape':(.035*wave,0,0),'upper_arm_L':(.015*wave,0,-.04),'upper_arm_R':(-.015*wave,0,.04)}
            elif name=='walk':
                poses={'thigh_L':(.62*wave,0,0),'thigh_R':(-.62*wave,0,0),'shin_L':(.30*max(0,-wave),0,0),'shin_R':(.30*max(0,wave),0,0),'upper_arm_L':(-.35*wave,0,-.08),'upper_arm_R':(.35*wave,0,.08),'spine':(.055, .04*wave,0),'cape':(.13+.05*wave,0,0)}
                rig.pose.bones['root'].location.y=abs(wave)*.022
            elif name=='attack':
                pulse=math.sin(math.pi*t)
                if kind=='ranger':poses={'upper_arm_R':(-1.08*pulse,0,-.12),'forearm_R':(-.20*pulse,0,0),'upper_arm_L':(-.65*pulse,.55*pulse,.65*pulse),'forearm_L':(-.75*pulse,0,0),'spine':(0,.23*pulse,0)}
                else:poses={'upper_arm_R':(-1.85*pulse,-.30*pulse,.32*pulse),'forearm_R':(-.52*pulse,0,0),'spine':(.16*pulse,.38*math.sin(t*math.tau),0),'upper_arm_L':(-.36*pulse,0,-.12)}
            elif name=='cast':
                pulse=math.sin(math.pi*t);poses={'upper_arm_L':(-1.8*pulse,0,-.38*pulse),'upper_arm_R':(-1.3*pulse,0,.34*pulse),'forearm_L':(-.35*pulse,0,0),'head':(-.13*pulse,0,0),'cape':(.14*pulse,0,0)}
            else:
                ease=min(1,t*1.5);poses={'root':(0,0,1.45*ease),'head':(.3*ease,0,0),'upper_arm_L':(-.25*ease,0,-.4*ease),'upper_arm_R':(.5*ease,0,.2*ease),'thigh_L':(.22*ease,0,0)}
                rig.pose.bones['root'].location.y=-.37*ease
            for bn,angles in poses.items():rig.pose.bones[bn].rotation_euler=angles
            for bone in rig.pose.bones:
                bone.keyframe_insert('rotation_euler',frame=frame,group=bone.name)
                if bone.name=='root':bone.keyframe_insert('location',frame=frame,group=bone.name)
        action.use_fake_user=True;actions.append(action)
    rig.animation_data.action=None
    for action in actions:
        track=rig.animation_data.nla_tracks.new();track.name=action.name
        strip=track.strips.new(action.name,0,action);strip.action_frame_start=0;strip.action_frame_end=action.frame_range[1]
        track.mute=True
    return actions

def consolidate_materials(mesh,kind):
    """Bake analytically generated surfaces into one PBR atlas, one draw call.

    Every source material receives its own UV rectangle. This is an offline bake,
    retaining material coloration, metal/roughness and engraved normal variation.
    """
    materials=list(mesh.data.materials)
    base=list(atlas.pixels);normals=list(normal_atlas.pixels)
    size=256;colors=[];pbr=[];normal_pixels=[];emission=[]
    for y in range(size):
        for x in range(size):
            slot=(y//64)*2+x//128
            source=materials[min(slot,len(materials)-1)]
            region=int(source['atlas_region']);rgb=source['base_color_factor']
            sx=(region%2)*128+x%128;sy=(region//2)*128+(y%64)*2
            idx=(sy*256+sx)*4
            colors.extend((base[idx]*rgb[0],base[idx+1]*rgb[1],base[idx+2]*rgb[2],1))
            bs=source.node_tree.nodes.get('Principled BSDF')
            pbr.extend((1,bs.inputs['Roughness'].default_value,bs.inputs['Metallic'].default_value,1))
            normal_pixels.extend(normals[idx:idx+4])
            intensity=1 if bs.inputs['Emission Strength'].default_value > 0 else 0
            emission.extend((rgb[0]*intensity,rgb[1]*intensity,rgb[2]*intensity,1))
    images=[]
    for suffix,pixels in [('color',colors),('roughmetal',pbr),('normal',normal_pixels),('emission',emission)]:
        image=bpy.data.images.new(kind+'_'+suffix,size,size)
        if suffix not in ('color','emission'):image.colorspace_settings.name='Non-Color'
        image.pixels=pixels;image.filepath_raw=os.path.join(SOURCE,kind+'_'+suffix+'.png')
        image.file_format='PNG';image.save();image.pack();images.append(image)
    uv=mesh.data.uv_layers.active
    for polygon in mesh.data.polygons:
        slot=polygon.material_index;region=int(materials[slot]['atlas_region'])
        for li in polygon.loop_indices:
            old=uv.data[li].uv
            u=(old.x-(region%2)*.5-.015)/.47
            v=(old.y-(region//2)*.5-.015)/.47
            uv.data[li].uv=((slot%2)*.5+.004+u*.492,(slot//2)*.25+.004+v*.242)
        polygon.material_index=0
    unified=bpy.data.materials.new(kind+' baked PBR atlas');unified.use_nodes=True
    unified['base_color_factor']=[1,1,1]
    nodes=unified.node_tree.nodes;links=unified.node_tree.links
    bs=nodes.get('Principled BSDF')
    color_node=nodes.new('ShaderNodeTexImage');color_node.image=images[0];links.new(color_node.outputs['Color'],bs.inputs['Base Color'])
    pbr_node=nodes.new('ShaderNodeTexImage');pbr_node.image=images[1]
    separate=nodes.new('ShaderNodeSeparateColor');links.new(pbr_node.outputs['Color'],separate.inputs['Color'])
    links.new(separate.outputs['Green'],bs.inputs['Roughness']);links.new(separate.outputs['Blue'],bs.inputs['Metallic'])
    normal_node=nodes.new('ShaderNodeTexImage');normal_node.image=images[2]
    nm=nodes.new('ShaderNodeNormalMap');nm.inputs['Strength'].default_value=.28
    links.new(normal_node.outputs['Color'],nm.inputs['Color']);links.new(nm.outputs['Normal'],bs.inputs['Normal'])
    emission_node=nodes.new('ShaderNodeTexImage');emission_node.image=images[3]
    links.new(emission_node.outputs['Color'],bs.inputs['Emission Color']);bs.inputs['Emission Strength'].default_value=1.6
    mesh.data.materials.clear();mesh.data.materials.append(unified)

def create(kind):
    global PARTS
    PARTS=[]
    bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
    primary,steel,gold=PALETTES[kind]
    cloth=mat(kind+' dyed woven linen',primary,1)
    armor=mat(kind+' hammered steel',steel,0,.76,.36)
    trim=mat(kind+' engraved brass',gold,3,.65,.32)
    leather=mat(kind+' stitched oxhide',(.17,.115,.08),2,0,.82)
    skin=mat(kind+' skin',(.69,.43,.28),2,0,.86)
    dark=mat(kind+' shadowed fabric',(.045,.058,.076),1)
    luminous=mat(kind+' oathstone',(.14,.71,.94) if kind not in ('reaver','brute') else (.98,.24,.035),3,.25,.22,2.2)
    bone_mat=mat(kind+' carved bone',(.79,.73,.57),0,0,.8)
    is_robed=kind in ('arcanist','oracle','wraith')
    is_skeleton=kind=='skeleton'
    body=bone_mat if is_skeleton else cloth
    rig=make_rig()
    # Proportioned fitted torso, hips and overlapping breastplate sections.
    if is_skeleton:
        tube('Exposed vertebral column',(0,.72,-.02),(0,1.14,-.02),.035,.032,bone_mat)
        tube('Exposed sternum',(0,.80,.115),(0,1.045,.11),.02,.018,bone_mat)
    else:
        profile('Fitted doublet',[(.62,.16,.115,0),(.76,.165,.12,0),(.96,.205,.13,0),(1.08,.23,.105,0),(1.13,.14,.08,0)],body)
    profile('Layered hip armor',[(.54,.195,.14,0),(.69,.18,.13,0),(.75,.17,.12,0)],leather,'root')
    if kind in ('warden','reaver','brute'):
        profile('Sculpted cuirass',[(.77,.175,.128,.015),(.91,.218,.152,.012),(1.04,.22,.145,0),(1.10,.16,.105,0)],armor)
        for i in range(3):profile('Overlapping waist plate',[(.70+i*.055,.188,.141,0),(.735+i*.055,.181,.138,0)],armor)
        tube('Central cuirass engraving',(0,.82,.164),(0,1.06,.145),.010,.008,trim)
    profile('Bound leather belt',[(.68,.19,.148,0),(.735,.185,.145,0)],leather,'root')
    plate('Rune buckle',(0,.705,.154),(.085,.075,.029),trim,'root')
    ball('Buckle inset',(0,.705,.174),(.027,.028,.012),luminous,'root')
    # A swinging cape has its own bone. Folded surface geometry catches real light.
    if kind not in ('skeleton','reaver','brute'):
        fabric('Folded travelling cape',[(1.12,.38,-.135),(.95,.46,-.17),(.73,.48,-.23),(.48,.53,-.30),(.33,.52,-.32)],cloth)
        for x in [-.14,.14]:ball('Cloak clasp',(x,1.09,.105),(.028,.029,.019),trim)
    if is_robed:
        profile('Pleated long robe',[(.12,.28,.20,0),(.19,.29,.21,0),(.40,.235,.18,0),(.62,.19,.14,0),(.70,.17,.13,0)],cloth,'root',24)
        for x in [-.13,.13]:tube('Robe embroidery',(x,.19,.185),(x*.55,.66,.134),.010,.009,trim,'root',8)
        fabric('Front embroidered stole',[(.94,.105,.156),(.69,.11,.166),(.40,.13,.196),(.20,.16,.211)],trim,'spine')
    elif not is_skeleton:
        fabric('Split war tabard',[(.69,.25,.152),(.52,.29,.17),(.34,.30,.175)],cloth,'root')
    for side,s in [('L',-1),('R',1)]:
        thigh,shin,foot=[f'{n}_{side}' for n in ('thigh','shin','foot')]
        tube('Thigh',(s*.115,.63,0),(s*.12,.39,0),.040 if is_skeleton else .084,.032 if is_skeleton else .070,body,thigh)
        ball('Articulated knee',(s*.12,.365,.045),(.083,.080,.087),armor if not is_skeleton else bone_mat,shin)
        tube('Shaped greave',(s*.12,.33,0),(s*.12,.12,0),.075,.058,leather if kind=='ranger' else armor,shin)
        ball('Leather boot',(s*.12,.075,.045),(.077,.072,.139),leather,foot)
        plate('Layered boot sole',(s*.12,.022,.055),(.16,.035,.255),dark,foot)
        if kind in ('warden','reaver','brute'):tube('Greave raised ridge',(s*.12,.15,.066),(s*.12,.31,.08),.009,.011,trim,shin,8)
        upper,fore,hand=[f'{n}_{side}' for n in ('upper_arm','forearm','hand')]
        tube('Sleeve',(s*.24,1.075,0),(s*.30,.885,0),.032 if is_skeleton else .086,.024 if is_skeleton else .064,skin if kind=='reaver' and s<0 else body,upper)
        ball('Layered pauldron',(s*.253,1.074,0),(.134,.10,.151),armor if kind in ('warden','reaver','brute') else cloth,upper)
        if kind in ('warden','reaver','brute'):
            ball('Pauldron outer rim',(s*.288,1.05,.012),(.121,.036,.153),trim,upper)
            for j in range(3):ball('Shoulder rivet',(s*(.19+j*.05),1.131,.07),(.009,.009,.009),trim,upper,8,4)
        tube('Forearm',(s*.30,.875,0),(s*.33,.705,.05),.027 if is_skeleton else .057,.020 if is_skeleton else .052,body,fore)
        tube('Bracer',(s*.318,.795,.027),(s*.333,.715,.051),.067,.064,armor if kind!='ranger' else leather,fore)
        tube('Bracer edging',(s*.32,.79,.029),(s*.322,.776,.035),.071,.071,trim,fore,10)
        ball('Gloved hand',(s*.333,.676,.05),(.054,.072,.051),leather,hand)
    # Face has chin, brow, nose and ears, with a fitted helmet/hood instead of a sphere.
    profile('Neck',[(1.11,.064,.061,0),(1.24,.067,.065,0)],skin,'head',12)
    ball('Cranium',(0,1.325,.002),(.119,.149,.106),bone_mat if is_skeleton else skin,'head',16,10)
    ball('Defined jaw',(0,1.255,.033),(.089,.075,.083),bone_mat if is_skeleton else skin,'head')
    ball('Nose',(0,1.318,.104),(.023,.031,.032),skin if not is_skeleton else dark,'head',8,6)
    for s in [-1,1]:
        if not is_skeleton:ball('Ear',(s*.12,1.31,0),(.024,.039,.022),skin,'head',8,6)
        plate('Eye recess',(s*.046,1.345,.100),(.049,.018,.018),dark,'head')
        ball('Eye glint',(s*.046,1.345,.111),(.010,.008,.004),luminous if kind in ('wraith','skeleton') else dark,'head',8,4)
    if kind=='warden':
        profile('Forged close helmet',[(1.28,.129,.105,-.018),(1.37,.134,.120,-.014),(1.44,.104,.09,-.015),(1.48,.025,.03,-.018)],armor,'head')
        plate('Helmet visor shadow',(0,1.348,.111),(.174,.027,.021),dark,'head')
        tube('Helmet nose guard',(0,1.29,.131),(0,1.40,.127),.014,.018,trim,'head',8)
        for s in [-1,1]:plate('Engraved cheek plate',(s*.095,1.279,.067),(.053,.092,.041),armor,'head',s*.15)
        fabric('Sapphire crest',[(1.50,.037,-.02),(1.57,.04,-.04),(1.55,.036,-.14)],cloth,'head')
    elif kind in ('ranger','arcanist','wraith'):
        profile('Sculpted hood',[(1.22,.13,.105,-.045),(1.33,.145,.133,-.044),(1.43,.122,.123,-.042),(1.50,.062,.080,-.050),(1.52,.014,.02,-.065)],cloth,'head')
        # Opening is a separate curved face mask, making the silhouette readable overhead.
        ball('Hood face opening',(0,1.315,.071),(.095,.112,.048),dark if kind=='wraith' else skin,'head')
        for s in [-1,1]:tube('Hood piping',(s*.07,1.43,.058),(s*.112,1.24,.076),.008,.011,trim,'head',8)
        if kind=='arcanist':
            tube('Rune crown fin',(0,1.455,-.005),(0,1.665,-.085),.065,.002,armor,'head',8)
            ball('Forehead oath gem',(0,1.425,.099),(.030,.046,.017),luminous,'head')
    elif kind in ('oracle','reaver','brute'):
        ball('Swept back hair',(0,1.39,-.039),(.122,.098,.116),dark,'head')
        for s in [-1,1]:tube('Braided hair',(s*.10,1.35,-.01),(s*.09,1.15,-.10),.035,.018,dark,'head',8)
        profile('Circlet',[(1.387,.121,.108,0),(1.412,.118,.106,0)],trim,'head')
        if kind=='oracle':
            for s in [-1,1]:
                tube('Tidal crown horn',(s*.09,1.405,-.012),(s*.18,1.575,-.025),.029,.006,trim,'head',8)
                ball('Pearl diadem',(s*.05,1.42,.10),(.017,.025,.011),luminous,'head')
        else:
            plate('Ember face wrap',(0,1.256,.098),(.174,.062,.041),cloth,'head')
    # Class-specific, held, independently skeletal-animated weapons.
    hand='hand_R';x=.36
    if kind=='warden':
        tube('Sword leather grip',(x,.61,.06),(x,.80,.06),.024,.024,leather,hand,10)
        tube('Sword crossguard',(x-.12,.81,.06),(x+.12,.81,.06),.021,.015,trim,hand,8)
        # Diamond-profile blade has a visible central ridge, bevel and tapered point.
        blade=profile('Oath sword blade',[(.84,.039,.014,0),(1.27,.032,.012,0),(1.43,.001,.001,0)],armor,hand,4)
        blade.location=p(x,0,.06)
        tube('Blade luminous inlay',(x,.88,.075),(x,1.25,.075),.004,.003,luminous,hand,6)
        shield=profile('Kite shield sculpted steel',[(.43,.02,.028,0),(.57,.17,.041,0),(.83,.19,.049,0),(.95,.13,.035,0)],armor,'hand_L',8)
        shield.location=p(-.40,0,.155)
        tube('Shield gold spine',(-.40,.47,.205),(-.40,.91,.205),.011,.013,trim,'hand_L',8)
        ball('Shield oathstone',(-.40,.77,.225),(.049,.065,.022),luminous,'hand_L')
    elif kind=='ranger':
        points=[(x,.24,.07),(x,.37,.20),(x,.53,.26),(x,.70,.27),(x,.88,.23),(x,1.04,.14),(x,1.13,.045)]
        for i in range(len(points)-1):tube('Carved recurve bow',points[i],points[i+1],.018,.018,trim,hand,8)
        tube('Bowstring',points[0],points[-1],.003,.003,bone_mat,hand,6)
        tube('Nocked arrow',(x,.695,-.16),(x,.695,.52),.006,.006,leather,hand,6)
        tube('Steel arrowhead',(x,.695,.49),(x,.695,.57),.027,0,armor,hand,6)
        tube('Back quiver',(-.12,.69,-.20),(-.16,1.065,-.25),.068,.068,leather,'spine')
        for i in range(4):
            tube('Spare arrow',(-.20+i*.026,.87,-.25),(-.23+i*.026,1.21,-.28),.005,.005,trim,'spine',6)
            plate('Arrow feather',(-.22+i*.026,1.16,-.28),(.012,.065,.024),bone_mat,'spine')
    elif kind in ('arcanist','oracle','wraith'):
        tube('Staff shaft',(x,.13,.06),(x,1.43,.06),.025,.018,leather,hand)
        for height in [.35,.73,1.21]:tube('Staff brass binding',(x,height,.06),(x,height+.035,.06),.030,.030,trim,hand)
        ball('Faceted focus crystal',(x,1.50,.06),(.09,.15,.08),luminous,hand,8,5)
        for s in [-1,1]:tube('Sweeping staff prong',(x+s*.03,1.34,.06),(x+s*.115,1.61,.06),.025,.006,trim,hand,8)
        if kind=='oracle':
            for i in range(5):ball('Tidal pearl',(x+math.cos(i*1.26)*.1,1.47+math.sin(i*1.26)*.1,.06),(.018,.018,.018),bone_mat,hand,8,4)
        plate('Belt grimoire',(-.19,.72,.02),(.068,.19,.13),leather,'root',-.12)
        plate('Grimoire clasp',(-.225,.73,.028),(.014,.025,.12),trim,'root')
    else:
        tube('Long axe haft',(x,.31,.06),(x,1.20,.06),.027,.022,leather,hand)
        for yy in [.42,.49,.56]:tube('Leather axe binding',(x,yy,.06),(x,yy+.025,.06),.032,.032,trim,hand,8)
        for s in [-1,1]:
            ball('Crescent axe blade',(x+s*.115,1.09,.06),(.165,.153,.021),armor,hand,12,6)
            tube('Blade bevel',(x+s*.22,.99,.06),(x+s*.235,1.20,.06),.015,.009,trim,hand,8)
        ball('Axe emberstone',(x,1.10,.087),(.030,.035,.012),luminous,hand)
    if is_skeleton:
        plate('Skull jaw opening',(0,1.255,.106),(.111,.028,.016),dark,'head')
        for i in range(5):plate('Carved skull tooth',(-.043+i*.021,1.259,.117),(.012,.025,.012),bone_mat,'head')
        for i in range(5):
            for s in [-1,1]:tube('Exposed rib',(s*.025,.82+i*.045,.15),(s*(.14-i*.008),.81+i*.045,.11),.012,.010,bone_mat,'spine',8)
    if kind=='brute':
        for s in [-1,1]:
            for i in range(3):tube('Pauldron forged spike',(s*(.22+i*.045),1.12,0),(s*(.24+i*.07),1.27+i*.02,-.02),.035,.002,armor,f'upper_arm_{"L" if s<0 else "R"}',8)
    # Join all material sections into a single skinned mesh: a handful of draw calls.
    bpy.ops.object.select_all(action='DESELECT')
    for ob in PARTS:ob.select_set(True)
    bpy.context.view_layer.objects.active=PARTS[0];bpy.ops.object.join();mesh=bpy.context.object;mesh.name=kind+'_SkinnedCharacter'
    bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
    consolidate_materials(mesh,kind)
    modifier=mesh.modifiers.new('Covenant skeletal deformation','ARMATURE');modifier.object=rig
    mesh.parent=rig
    actions=animate(rig,kind)
    bpy.context.scene.render.fps=30;bpy.context.scene.frame_set(0)
    for pose in rig.pose.bones:pose.rotation_euler=(0,0,0);pose.location=(0,0,0)
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(SOURCE,kind+'.blend'),compress=True)
    bpy.ops.export_scene.gltf(filepath=os.path.join(OUT,kind+'.glb'),export_format='GLB',export_yup=True,
        export_animations=True,export_animation_mode='ACTIONS',export_frame_range=False,
        export_force_sampling=True,export_nla_strips_merged_animation_name='idle',
        export_skins=True,export_def_bones=True,export_all_influences=False,
        export_materials='EXPORT',export_image_format='AUTO',export_apply=False)
    # Blender's glTF exporter does not preserve a Multiply node's constant tint.
    # Keep the editable shader in the source scene and set the equivalent standard
    # glTF baseColorFactor explicitly without changing any mesh or binary offsets.
    glb_path=os.path.join(OUT,kind+'.glb')
    with open(glb_path,'rb') as f: raw=f.read()
    json_size=struct.unpack_from('<I',raw,12)[0]
    document=json.loads(raw[20:20+json_size])
    for exported in document.get('materials',[]):
        source_material=bpy.data.materials[exported['name']]
        exported['pbrMetallicRoughness']['baseColorFactor']=[*source_material['base_color_factor'],1]
    encoded=json.dumps(document,separators=(',',':')).encode()
    encoded+=b' '*((-len(encoded))%4)
    tail=raw[20+json_size:]
    with open(glb_path,'wb') as f:
        f.write(struct.pack('<III',0x46546c67,2,20+len(encoded)+len(tail)))
        f.write(struct.pack('<II',len(encoded),0x4e4f534a));f.write(encoded);f.write(tail)
    return {'id':kind,'vertices':len(mesh.data.vertices),'polygons':len(mesh.data.polygons),'bones':len(rig.data.bones),'clips':[a.name for a in actions],'bytes':os.path.getsize(os.path.join(OUT,kind+'.glb'))}

records=[]
for kind in PALETTES:
    # Remove old actions so each GLB has exactly its own five clips.
    for action in list(bpy.data.actions):bpy.data.actions.remove(action)
    records.append(create(kind))
with open(os.path.join(OUT,'manifest.json'),'w') as f:json.dump({'generator':'Blender 4.5 LTS / scripts/build-character-assets.py','license':'CC0-1.0','original':True,'coordinates':'+Y up, +Z forward, feet at Y=0','assets':records},f,indent=2)
print('RUNIC_ASSETS_COMPLETE',json.dumps(records))
