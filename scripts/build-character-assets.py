"""Original Runic Depths character workshop. Blender 4.5 LTS, no add-ons required.

Run: blender --background --python scripts/build-character-assets.py
Authors geometry, UV material atlases, a 32-bone rig and eight authored animation actions.
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
KIND = 'warden'
WIDTHS = {'warden':1.15,'ranger':.88,'arcanist':.94,'reaver':1.20,'oracle':.90,'skeleton':.90,'wraith':.92,'brute':1.40}

def p(x=0, y=0, z=0):
    """Design coordinates: X right, Y up, Z facing the viewer."""
    return Vector((x * WIDTHS[KIND], -z, y if y < 1.16 else 1.16+(y-1.16)*.86))

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
    for poly in obj.data.polygons: poly.use_smooth=not any(word in name.lower() for word in ('plate','rim','blade','cuirass','pauldron','guard','buckle','sole'))
    group=obj.vertex_groups.new(name=bone);group.add(list(range(len(obj.data.vertices))),1,'REPLACE')
    PARTS.append(obj)
    return obj

def ball(name,center,scale,material,bone='spine',segments=12,rings=8):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments,ring_count=rings,location=p(*center))
    ob=bpy.context.object;ob.scale=(scale[0]*WIDTHS[KIND],scale[2],scale[1]*(.86 if bone=='head' else 1))
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    return finish(ob,name,material,bone)

def tube(name,a,b,r1,r2,material,bone='spine',vertices=12):
    start,end=p(*a),p(*b);delta=end-start
    bpy.ops.mesh.primitive_cone_add(vertices=vertices,radius1=r1,radius2=r2,depth=delta.length,location=(start+end)/2)
    ob=bpy.context.object;ob.rotation_euler=delta.to_track_quat('Z','Y').to_euler()
    return finish(ob,name,material,bone, min(r1,r2,.02)*.22)

def plate(name,center,scale,material,bone='spine',angle=0):
    bpy.ops.mesh.primitive_cube_add(size=1,location=p(*center))
    ob=bpy.context.object;ob.scale=(scale[0]*WIDTHS[KIND],scale[2],scale[1]*(.86 if bone=='head' else 1));ob.rotation_euler.y=angle
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    return finish(ob,name,material,bone,min(scale)*.22)

def profile(name,rings,material,bone='spine',sides=16):
    """Hand-designed elliptical cross-sections for fitted armor, cloth and hoods."""
    vertices=[]
    for height,width,depth,offset in rings:
        for i in range(sides):
            a=i*math.tau/sides
            fold=1+(.045*math.cos(i*math.pi) if 'robe' in name.lower() else 0)
            vertices.append(p(math.cos(a)*width*fold,height,math.sin(a)*depth*fold+offset))
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

def silhouette(name,points,depth,material,bone='spine',bevel=.005):
    """Extruded hand-drawn outlines, useful for armor and actual bladed weapons."""
    vertices=[p(x,y,z+d) for d in [-depth/2,depth/2] for x,y,z in points]
    n=len(points);faces=[tuple(range(n-1,-1,-1)),tuple(range(n,2*n))]
    faces += [(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
    mesh=bpy.data.meshes.new(name);mesh.from_pydata(vertices,[],faces);mesh.update()
    ob=bpy.data.objects.new(name,mesh);bpy.context.collection.objects.link(ob)
    return finish(ob,name,material,bone,bevel)

def open_hood(material,trim):
    """A real open cowl: the front third is absent, preserving the sculpted face."""
    rows=[(1.20,.142,.112,-.035),(1.34,.150,.135,-.025),(1.45,.127,.118,-.020),(1.50,.076,.083,-.028)]
    vertices=[];cols=17
    for yy,w,d,z in rows:
        for i in range(cols):
            a=math.radians(135)+i/(cols-1)*math.radians(270)
            vertices.append(p(math.cos(a)*w,yy,math.sin(a)*d+z))
    vertices.append(p(0,1.53,-.05));faces=[]
    for j in range(len(rows)-1):
        for i in range(cols-1):q=j*cols+i;faces.append((q,q+cols,q+cols+1,q+1))
    for i in range(cols-1):faces.append(((len(rows)-1)*cols+i,len(vertices)-1,(len(rows)-1)*cols+i+1))
    mesh=bpy.data.meshes.new('Open tailored hood');mesh.from_pydata(vertices,[],faces);mesh.update()
    ob=bpy.data.objects.new('Open tailored hood',mesh);bpy.context.collection.objects.link(ob)
    material.use_backface_culling=False;finish(ob,ob.name,material,'head')
    for side in [0,cols-1]:
        for j in range(len(rows)-1):
            av=vertices[j*cols+side];bv=vertices[(j+1)*cols+side]
            # Edge cords in design coordinates, converted back from authored p().
            def unp(v):return (v.x/WIDTHS[KIND],v.z if v.z<1.16 else 1.16+(v.z-1.16)/.86,-v.y)
            tube('Hand stitched hood piping',unp(av),unp(bv),.006,.006,trim,'head',8)

def secondary_weights(ob,kind='cape'):
    ob.vertex_groups.clear()
    if kind=='cape':
        names=['cape','cape_mid','cape_tip'];heights=[1.05,.70,.35]
        groups=[ob.vertex_groups.new(name=n) for n in names]
        for v in ob.data.vertices:
            h=v.co.z;weights=[max(0,1-abs(h-a)/.38) for a in heights];total=sum(weights) or 1
            for group,w in zip(groups,weights):
                if w:group.add([v.index],w/total,'REPLACE')
    else:
        names=['root','tabard_L','tabard_R','hem_L','hem_R'];groups=[ob.vertex_groups.new(name=n) for n in names]
        for v in ob.data.vertices:
            h=v.co.z;side=max(0,min(1,v.co.x/.17+.5));top=max(0,min(1,(h-.52)/.18));hem=max(0,min(1,(.43-h)/.25))
            weights=[top,(1-top)*(1-hem)*(1-side),(1-top)*(1-hem)*side,(1-top)*hem*(1-side),(1-top)*hem*side]
            for group,w in zip(groups,weights):
                if w:group.add([v.index],w,'REPLACE')
    return ob

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
    bone_defs=[('root',(0,.65,0),(0,.8,0),None),('spine',(0,.72,0),(0,.98,0),'root'),('chest',(0,.98,0),(0,1.13,0),'spine'),('neck',(0,1.13,0),(0,1.23,0),'chest'),('head',(0,1.23,0),(0,1.44,0),'neck'),('cape',(0,1.11,-.13),(0,.87,-.20),'chest'),('cape_mid',(0,.87,-.20),(0,.59,-.28),'cape'),('cape_tip',(0,.59,-.28),(0,.31,-.34),'cape_mid')]
    for side,k in [('L',-1),('R',1)]:
        bone_defs += [(f'clavicle_{side}',(k*.04,1.08,0),(k*.24,1.09,0),'chest'),(f'upper_arm_{side}',(k*.24,1.09,0),(k*.30,.88,0),f'clavicle_{side}'),(f'forearm_{side}',(k*.30,.88,0),(k*.33,.70,.05),f'upper_arm_{side}'),(f'hand_{side}',(k*.33,.70,.05),(k*.33,.62,.05),f'forearm_{side}'),(f'thigh_{side}',(k*.115,.68,0),(k*.12,.38,0),'root'),(f'shin_{side}',(k*.12,.38,0),(k*.12,.10,0),f'thigh_{side}'),(f'foot_{side}',(k*.12,.10,0),(k*.12,.06,.13),f'shin_{side}'),(f'toe_{side}',(k*.12,.06,.10),(k*.12,.04,.21),f'foot_{side}'),(f'fingers_{side}',(k*.34,.66,.08),(k*.34,.61,.10),f'hand_{side}'),(f'thumb_{side}',(k*.30,.69,.065),(k*.29,.65,.10),f'hand_{side}'),(f'tabard_{side}',(k*.10,.70,.12),(k*.10,.42,.17),'root'),(f'hem_{side}',(k*.10,.42,.17),(k*.12,.14,.23),f'tabard_{side}')]
    for name,a,b,parent in bone_defs:
        bone=rig.data.edit_bones.new(name);bone.head=p(*a);bone.tail=p(*b)
        if parent:bone.parent=rig.data.edit_bones[parent]
    bpy.ops.object.mode_set(mode='OBJECT')
    return rig

def animate(rig,kind):
    """30fps weight-shift cycles and asymmetric anticipation/contact/recovery.
    Each class has a deliberate weapon grammar; clips retain planted root motion
    so gameplay owns collision while shoulders, pelvis, ankles and cloth react.
    """
    actions=[]
    def lerp_keys(t,keys):
        for (ta,va),(tb,vb) in zip(keys,keys[1:]):
            if t<=tb:
                f=max(0,min(1,(t-ta)/(tb-ta)));f=f*f*(3-2*f)
                return va+(vb-va)*f
        return keys[-1][1]
    for name,duration in [('idle',96),('walk',28),('attack',24),('attack_alt',28),('cast',36),('dodge',19),('hit',14),('death',48)]:
        rig.animation_data_create();action=bpy.data.actions.new(name);rig.animation_data.action=action
        for frame in range(duration+1):
            t=frame/duration;wave=math.sin(t*math.tau);cos=math.cos(t*math.tau)
            for bone in rig.pose.bones:
                bone.rotation_mode='XYZ';bone.rotation_euler=(0,0,0);bone.location=(0,0,0)
            poses={'upper_arm_L':(-.10,0,-.06),'upper_arm_R':(-.14,0,.06),'forearm_R':(-.18,0,0),'forearm_L':(-.12,0,0),'shin_L':(.045,0,0),'shin_R':(.045,0,0)}
            if name=='idle':
                breath=math.sin(t*math.tau)
                poses.update({'spine':(.012*breath,.025*breath,.01*cos),'chest':(.02*breath,0,0),'head':(-.018*breath,.055*math.sin(t*math.tau),0),'clavicle_L':(0,0,-.01*breath),'clavicle_R':(0,0,.01*breath),'cape':(.025*breath,0,.01*cos),'cape_mid':(.035*math.sin(t*math.tau-.5),0,0),'cape_tip':(.05*math.sin(t*math.tau-1),0,0)})
                rig.pose.bones['root'].location.y=.005*breath
            elif name=='walk':
                amp=.43 if kind in ('arcanist','oracle') else .55
                for side,k in [('L',1),('R',-1)]:
                    phase=t*math.tau+(0 if k==1 else math.pi);swing=math.sin(phase)
                    poses[f'thigh_{side}']=(amp*swing,0,k*.022)
                    poses[f'shin_{side}']=(.08+.72*max(0,-math.sin(phase+.45)),0,0)
                    poses[f'foot_{side}']=(-.22*swing-.16*max(0,-swing),0,0)
                    poses[f'toe_{side}']=(.16*max(0,swing),0,0)
                    poses[f'upper_arm_{side}']=(-.12-.25*swing,0,k*-.075)
                    poses[f'forearm_{side}']=(-.2-.12*max(0,-swing),0,0)
                    poses[f'tabard_{side}']=(-.11+.16*swing,0,k*.05)
                    poses[f'hem_{side}']=(.10+.20*math.sin(phase-.7),0,k*.04)
                poses.update({'root':(0,.055*wave,.035*wave),'spine':(.045,-.085*wave,-.027*wave),'chest':(-.025,.045*wave,0),'head':(-.025,.02*wave,0),'cape':(.12+.055*cos,0,-.06*wave),'cape_mid':(.10+.09*math.sin(t*math.tau-.55),0,.045*wave),'cape_tip':(.09+.14*math.sin(t*math.tau-1.0),0,-.07*wave)})
                rig.pose.bones['root'].location.y=.013*math.cos(t*math.tau*2)
            elif name in ('attack','attack_alt'):
                alt=name=='attack_alt'
                wind=lerp_keys(t,[(0,0),(.27,1),(.44,1),(.61,0),(1,0)])
                strike=lerp_keys(t,[(0,0),(.30,0),(.43,.15),(.55,1),(.68,.70),(1,0)])
                recovery=lerp_keys(t,[(0,0),(.4,0),(.58,1),(1,0)])
                if kind=='ranger':
                    poses.update({'upper_arm_R':(-1.22*(wind+strike*.65),-.12, -.08),'forearm_R':(-.06,0,0),'upper_arm_L':(-.85*(wind+strike*.45),.88*wind,.28*wind),'forearm_L':(-1.05*wind,0,0),'chest':(0,.32*wind-.10*strike,0),'head':(0,-.22*wind,0),'clavicle_L':(0,.18*wind,0)})
                elif kind in ('arcanist','oracle','wraith'):
                    poses.update({'upper_arm_R':(-.65*wind-1.1*strike,.22*wind,.15*wind),'forearm_R':(-.45*wind+.12*strike,0,0),'upper_arm_L':(-.38*wind-.9*strike,-.3*wind,-.38*strike),'forearm_L':(-.6*wind,0,0),'chest':(-.08*wind+.17*strike,.25*wind-.32*strike,0),'head':(-.08*wind,0,0)})
                elif alt:
                    poses.update({'upper_arm_R':(-.75*wind-.4*strike,.90*wind-1.2*strike,.65*wind-.35*strike),'forearm_R':(-.7*wind+.2*strike,0,0),'spine':(-.04*wind+.14*strike,.52*wind-.65*strike,0),'chest':(0,.2*wind-.15*strike,0),'upper_arm_L':(-.4*wind-.3*strike,0,-.24),'head':(0,-.15*wind+.12*strike,0)})
                else:
                    poses.update({'upper_arm_R':(-2.05*wind-.72*strike,-.25*wind,.25*wind),'forearm_R':(-.65*wind+.2*strike,0,0),'spine':(-.13*wind+.32*strike,.28*wind-.24*strike,0),'chest':(-.08*wind+.16*strike,0,0),'head':(.08*strike,0,0),'upper_arm_L':(-.28-.40*wind,0,-.18)})
                poses.update({'thigh_L':(-.12*wind-.22*strike,0,-.035),'thigh_R':(.13*wind+.20*strike,0,.035),'shin_L':(.14+.16*strike,0,0),'shin_R':(.08+.18*wind,0,0),'cape':(.07+.18*recovery,0,-.16*strike),'cape_mid':(.13*recovery,0,-.12*strike),'cape_tip':(.22*recovery,0,-.10*strike)})
                rig.pose.bones['root'].location.y=-.035*strike
            elif name=='cast':
                gather=lerp_keys(t,[(0,0),(.35,1),(.55,1),(.72,.55),(1,0)])
                release=lerp_keys(t,[(0,0),(.45,0),(.63,1),(.8,.75),(1,0)])
                oracle=kind=='oracle'
                poses.update({'upper_arm_L':(-.70*gather-1.5*release,-.30*gather,-.70*gather),'upper_arm_R':(-1.2*gather-.35*release,.18*gather,.42*gather),'forearm_L':(-.75*gather+.45*release,0,0),'forearm_R':(-.6*gather,0,0),'spine':(-.10*gather+.17*release,-.20*gather,0),'chest':(-.04*gather,.20*release,0),'head':(-.16*gather+.1*release,.12*gather,0),'cape':(.10+.18*release,0,.08*gather),'cape_mid':(.2*release,0,.1*gather),'cape_tip':(.32*release,0,.12*gather),'clavicle_L':(0,0,-.09*release)})
                if oracle:poses['upper_arm_L']=(-1.7*gather,-.25*gather,-.42*gather)
                rig.pose.bones['root'].location.y=.014*gather-.03*release
            elif name=='dodge':
                crouch=math.sin(math.pi*t)**.55
                poses.update({'root':(.23*crouch,0,-.17*crouch),'spine':(.33*crouch,0,.14*crouch),'head':(-.2*crouch,0,0),'thigh_L':(-.8*crouch,0,-.15*crouch),'thigh_R':(.3*crouch,0,.1*crouch),'shin_L':(.9*crouch,0,0),'shin_R':(.55*crouch,0,0),'upper_arm_L':(-.65*crouch,0,-.4*crouch),'upper_arm_R':(-.8*crouch,0,.12*crouch),'cape':(.55*crouch,0,.1*crouch),'cape_mid':(.3*crouch,0,0),'cape_tip':(.3*crouch,0,0)})
                rig.pose.bones['root'].location.y=-.13*crouch
            elif name=='hit':
                pulse=lerp_keys(t,[(0,0),(.2,1),(.4,.75),(1,0)])
                poses.update({'spine':(-.25*pulse,0,.09*pulse),'chest':(-.14*pulse,0,0),'head':(.23*pulse,0,-.10*pulse),'upper_arm_L':(-.45*pulse,0,-.3*pulse),'upper_arm_R':(-.35*pulse,0,.2*pulse),'thigh_R':(.20*pulse,0,0),'cape':(-.13*pulse,0,0),'cape_tip':(.18*pulse,0,0)})
            else:
                sink=lerp_keys(t,[(0,0),(.22,.15),(.52,.50),(.78,1),(1,1)])
                roll=lerp_keys(t,[(0,0),(.28,.12),(.65,.9),(.9,1),(1,1)])
                poses.update({'root':(.25*roll,0,1.38*roll),'spine':(.25*sink,0,0),'head':(.25*sink,0,-.17*roll),'upper_arm_L':(-.40*sink,0,-.55*roll),'upper_arm_R':(.4*roll,0,.28*roll),'thigh_L':(-.3*sink,0,0),'thigh_R':(.40*sink,0,0),'shin_L':(.6*sink,0,0),'shin_R':(.3*sink,0,0),'cape':(.18*roll,0,0),'cape_mid':(.10*roll,0,0)})
                rig.pose.bones['root'].location.y=-.37*sink
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
    size=512;colors=[];pbr=[];normal_pixels=[];emission=[]
    for y in range(size):
        for x in range(size):
            slot=(y//128)*2+x//256
            source=materials[min(slot,len(materials)-1)]
            region=int(source['atlas_region']);rgb=source['base_color_factor']
            sx=(region%2)*128+(x%256)//2;sy=(region//2)*128+y%128
            idx=(sy*256+sx)*4
            # Material-specific, color-correct surfaces. Raised thread and wear are
            # offline authored into the atlas rather than a uniform noisy gloss.
            u,v=(x%256)/256,(y%128)/128
            weave=(.025 if (x+y)%4==0 else -.008) if region==1 else 0
            grain=math.sin(x*.21+math.sin(y*.13))*.025 if region==2 else 0
            edge=min(u,1-u,v,1-v)
            wear=(.12 if edge<.025 else 0) if region in (0,3) else 0
            shade=round(max(.45,min(1,base[idx]+weave+grain+wear))*48)/48
            if 'skin' in source.name:shade=.86+math.sin(x*.04)*math.sin(y*.04)*.006
            colors.extend((shade*rgb[0],shade*rgb[1],shade*rgb[2],1))
            bs=source.node_tree.nodes.get('Principled BSDF')
            pbr.extend((1,min(1,bs.inputs['Roughness'].default_value+weave*.4-wear*.5),bs.inputs['Metallic'].default_value,1))
            normal_pixels.extend((.5,.5,1,1) if 'skin' in source.name else normals[idx:idx+4])
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

def compact_glb(path):
    """Standard KHR_mesh_quantization vertex packing; geometry positions stay
    full float precision. No decoder/plugin or compressed extension is needed.
    Weights retain an exact integer sum of 255, UVs retain 16-bit precision.
    """
    with open(path,'rb') as f:raw=f.read()
    js=struct.unpack_from('<I',raw,12)[0];doc=json.loads(raw[20:20+js]);binary=raw[28+js:]
    replacements={};strides={}
    for mesh in doc.get('meshes',[]):
        for primitive in mesh['primitives']:
            for semantic,ctype,components in [('NORMAL',5120,3),('TANGENT',5120,4),('TEXCOORD_0',5123,2),('WEIGHTS_0',5121,4)]:
                idx=primitive['attributes'].get(semantic)
                if idx is None:continue
                acc=doc['accessors'][idx];view=doc['bufferViews'][acc['bufferView']]
                if acc['componentType']!=5126:continue
                start=view.get('byteOffset',0)+acc.get('byteOffset',0);count=acc['count']
                values=struct.unpack_from('<'+'f'*(count*components),binary,start)
                if semantic=='NORMAL':
                    packed=b''.join(struct.pack('<bbbB',*[round(max(-1,min(1,v))*127) for v in values[j:j+3]],0) for j in range(0,len(values),3))
                    strides[acc['bufferView']]=4
                elif semantic=='TANGENT':packed=struct.pack('<'+'b'*len(values),*[round(max(-1,min(1,v))*127) for v in values])
                elif semantic=='TEXCOORD_0':packed=struct.pack('<'+'H'*len(values),*[round(max(0,min(1,v))*65535) for v in values])
                else:
                    integers=[]
                    for j in range(0,len(values),4):
                        group=[round(max(0,min(1,v))*255) for v in values[j:j+4]]
                        group[group.index(max(group))]+=255-sum(group);integers.extend(group)
                    packed=bytes(integers)
                    joints_acc=doc['accessors'][primitive['attributes']['JOINTS_0']];joints_view=doc['bufferViews'][joints_acc['bufferView']]
                    if joints_acc['componentType']==5121:
                        jo=joints_view.get('byteOffset',0)+joints_acc.get('byteOffset',0)
                        joints=bytearray(binary[jo:jo+count*4])
                        for j,w in enumerate(integers):
                            if w==0:joints[j]=0
                        replacements[joints_acc['bufferView']]=bytes(joints)
                replacements[acc['bufferView']]=packed
                acc['componentType']=ctype;acc['normalized']=True;acc['byteOffset']=0
                acc.pop('min',None);acc.pop('max',None)
    for animation in doc.get('animations',[]):
        channels=[]
        for channel in animation['channels']:
            sampler=animation['samplers'][channel['sampler']];acc=doc['accessors'][sampler['output']];view=doc['bufferViews'][acc['bufferView']]
            target=channel['target'];prop=target['path'];dims=4 if prop=='rotation' else 3
            start=view.get('byteOffset',0)+acc.get('byteOffset',0)
            vals=struct.unpack_from('<'+'f'*(acc['count']*dims),binary,start)
            rest=doc['nodes'][target['node']].get(prop,[0,0,0,1] if prop=='rotation' else [1,1,1] if prop=='scale' else [0,0,0])
            if all(abs(v-rest[j%dims])<1e-6 for j,v in enumerate(vals)):continue
            channels.append(channel)
        animation['channels']=channels
        used=sorted(set(c['sampler'] for c in channels));mapping={old:new for new,old in enumerate(used)}
        animation['samplers']=[animation['samplers'][i] for i in used]
        for channel in channels:channel['sampler']=mapping[channel['sampler']]
    used_accessors=set()
    for mesh in doc.get('meshes',[]):
        for primitive in mesh['primitives']:
            used_accessors.update(primitive['attributes'].values())
            if 'indices' in primitive:used_accessors.add(primitive['indices'])
    for skin in doc.get('skins',[]):
        if 'inverseBindMatrices' in skin:used_accessors.add(skin['inverseBindMatrices'])
    for animation in doc.get('animations',[]):
        for sampler in animation['samplers']:used_accessors.update([sampler['input'],sampler['output']])
    kept=sorted(used_accessors);mapping={old:new for new,old in enumerate(kept)}
    doc['accessors']=[doc['accessors'][i] for i in kept]
    for mesh in doc.get('meshes',[]):
        for primitive in mesh['primitives']:
            primitive['attributes']={k:mapping[v] for k,v in primitive['attributes'].items()}
            if 'indices' in primitive:primitive['indices']=mapping[primitive['indices']]
    for skin in doc.get('skins',[]):
        if 'inverseBindMatrices' in skin:skin['inverseBindMatrices']=mapping[skin['inverseBindMatrices']]
    for animation in doc.get('animations',[]):
        for sampler in animation['samplers']:
            sampler['input']=mapping[sampler['input']];sampler['output']=mapping[sampler['output']]
    used_views=set(a['bufferView'] for a in doc['accessors'])|set(i['bufferView'] for i in doc.get('images',[]))
    view_indices=sorted(used_views);view_mapping={old:new for new,old in enumerate(view_indices)}
    for acc in doc['accessors']:acc['bufferView']=view_mapping[acc['bufferView']]
    for img in doc.get('images',[]):img['bufferView']=view_mapping[img['bufferView']]

    for key in ['extensionsUsed','extensionsRequired']:

        if 'KHR_mesh_quantization' not in doc.setdefault(key,[]):doc[key].append('KHR_mesh_quantization')
    rebuilt=bytearray()
    for i in view_indices:
        view=doc['bufferViews'][i]
        rebuilt.extend(b'\0'*((-len(rebuilt))%4));off=view.get('byteOffset',0)
        data=replacements.get(i,binary[off:off+view['byteLength']])
        view['byteOffset']=len(rebuilt);view['byteLength']=len(data)
        if i in replacements:view.pop('byteStride',None)
        if i in strides:view['byteStride']=strides[i]
        rebuilt.extend(data)
    doc['bufferViews']=[doc['bufferViews'][i] for i in view_indices]
    rebuilt.extend(b'\0'*((-len(rebuilt))%4));doc['buffers'][0]['byteLength']=len(rebuilt)
    encoded=json.dumps(doc,separators=(',',':')).encode();encoded+=b' '*((-len(encoded))%4)
    with open(path,'wb') as f:
        f.write(struct.pack('<III',0x46546c67,2,28+len(encoded)+len(rebuilt)))
        f.write(struct.pack('<II',len(encoded),0x4e4f534a));f.write(encoded)
        f.write(struct.pack('<II',len(rebuilt),0x004e4942));f.write(rebuilt)

def create(kind):
    global PARTS,KIND
    KIND=kind
    PARTS=[]
    bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
    primary,steel,gold=PALETTES[kind]
    cloth=mat(kind+' dyed woven linen',primary,1,0,.94)
    armor=mat(kind+' hammered steel',steel,0,.80,.47)
    trim=mat(kind+' engraved brass',gold,3,.72,.43)
    leather=mat(kind+' stitched oxhide',(.17,.115,.08),2,0,.82)
    skin=mat(kind+' skin',(.55,.32,.20),2,0,.86)
    dark=mat(kind+' shadowed fabric',(.035,.031,.028),1,0,.98)
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
        secondary_weights(fabric('Weighted pleated travelling cape',[(1.12,.38,-.145),(1.00,.43,-.18),(.88,.47,-.215),(.76,.50,-.24),(.64,.53,-.27),(.52,.55,-.295),(.40,.56,-.315),(.28,.55,-.34)],cloth))
        for x in [-.14,.14]:ball('Cloak clasp',(x,1.09,.105),(.028,.029,.019),trim)
    if is_robed:
        secondary_weights(profile('Weighted pleated long robe',[(.12,.265,.195,0),(.19,.275,.20,0),(.30,.25,.19,0),(.40,.225,.18,0),(.50,.20,.16,0),(.62,.18,.14,0),(.70,.165,.13,0)],cloth,'root',32),'robe')
        for x in [-.13,.13]:tube('Robe embroidery',(x,.19,.185),(x*.55,.66,.134),.010,.009,trim,'root',8)
        secondary_weights(fabric('Front woven embroidered stole',[(.94,.105,.156),(.80,.11,.166),(.69,.11,.166),(.55,.12,.18),(.40,.13,.196),(.20,.16,.211)],cloth,'root'),'robe')
    elif not is_skeleton:
        secondary_weights(fabric('Split war tabard',[(.69,.25,.152),(.59,.27,.164),(.49,.29,.174),(.39,.30,.18),(.29,.28,.18)],cloth,'root'),'robe')
    for side,s in [('L',-1),('R',1)]:
        thigh,shin,foot=[f'{n}_{side}' for n in ('thigh','shin','foot')]
        tube('Thigh',(s*.115,.63,0),(s*.12,.39,0),.040 if is_skeleton else .084,.032 if is_skeleton else .070,body,thigh)
        silhouette('Articulated pointed knee plate',[(s*.12-.065,.39,.060),(s*.12,.44,.092),(s*.12+.065,.39,.06),(s*.12+.052,.34,.073),(s*.12,.31,.084),(s*.12-.052,.34,.073)],.029,armor if not is_skeleton else bone_mat,shin)
        tube('Shaped greave',(s*.12,.33,0),(s*.12,.12,0),.075,.058,leather if kind=='ranger' else armor,shin)
        ball('Leather boot',(s*.12,.075,.045),(.077,.072,.139),leather,foot)
        plate('Layered boot sole',(s*.12,.022,.055),(.16,.035,.255),dark,foot)
        if kind in ('warden','reaver','brute'):tube('Greave raised ridge',(s*.12,.15,.066),(s*.12,.31,.08),.009,.011,trim,shin,8)
        upper,fore,hand=[f'{n}_{side}' for n in ('upper_arm','forearm','hand')]
        tube('Sleeve',(s*.24,1.075,0),(s*.30,.885,0),.032 if is_skeleton else .086,.024 if is_skeleton else .064,skin if kind=='reaver' and s<0 else body,upper)
        if kind in ('warden','reaver','brute'):
            for tier in range(3):
                xx=s*(.24+tier*.038);yy=1.125-tier*.040;w=.115-tier*.012
                silhouette('Overlapping angular pauldron plate',[(xx-w,yy-.035,.075),(xx-w*.7,yy+.045,.040),(xx,yy+.070,-.005),(xx+w*.8,yy+.035,.035),(xx+w,yy-.065,.085),(xx,yy-.085,.115)],.12,armor,upper)
                tube('Forged pauldron brass lip',(xx-w*.8,yy-.04,.150),(xx+w*.9,yy-.055,.145),.007,.007,trim,upper,8)
        elif not is_skeleton:
            profile_part=ball('Tailored shoulder sleeve',(s*.245,1.06,0),(.091,.105,.100),cloth,upper,16,10)
            for tier in range(2):
                plate('Leather layered shoulder guard',(s*(.26+tier*.015),1.09-tier*.050,.076),(.105,.055,.035),leather,upper,s*.2)
        if kind in ('warden','reaver','brute'):

            for j in range(3):ball('Shoulder rivet',(s*(.19+j*.05),1.131,.07),(.009,.009,.009),trim,upper,8,4)
        tube('Forearm',(s*.30,.875,0),(s*.33,.705,.05),.027 if is_skeleton else .057,.020 if is_skeleton else .052,body,fore)
        tube('Bracer',(s*.318,.795,.027),(s*.333,.715,.051),.067,.064,armor if kind!='ranger' else leather,fore)
        tube('Bracer edging',(s*.32,.79,.029),(s*.322,.776,.035),.071,.071,trim,fore,10)
        plate('Fitted leather palm',(s*.333,.676,.05),(.077,.078,.066),leather,hand,s*.03)
        for finger in range(4):
            xx=s*(.309+finger*.017)
            tube('Articulated gloved finger',(xx,.652,.070),(xx,.625,.088),.009,.008,leather,f'fingers_{side}',8)
            ball('Finger knuckle',(xx,.654,.083),(.010,.010,.009),armor if kind=='warden' else leather,f'fingers_{side}',8,4)
        tube('Opposed thumb',(s*.296,.685,.061),(s*.290,.655,.097),.014,.010,leather,f'thumb_{side}',8)
    # Face has chin, brow, nose and ears, with a fitted helmet/hood instead of a sphere.
    profile('Neck',[(1.11,.064,.061,0),(1.24,.067,.065,0)],skin,'head',12)
    ball('Cranium',(0,1.325,.002),(.119,.149,.106),bone_mat if is_skeleton else skin,'head',16,10)
    ball('Defined jaw',(0,1.255,.033),(.089,.075,.083),bone_mat if is_skeleton else skin,'head')
    ball('Nose',(0,1.318,.104),(.023,.031,.032),skin if not is_skeleton else dark,'head',8,6)
    for s in [-1,1]:
        if not is_skeleton:ball('Ear',(s*.12,1.31,0),(.024,.039,.022),skin,'head',8,6)
        plate('Eye recess',(s*.046,1.345,.100),(.035,.010,.010),dark,'head')
        ball('Eye glint',(s*.046,1.345,.111),(.010,.008,.004),luminous if kind in ('wraith','skeleton') else dark,'head',8,4)
    if kind=='warden':
        profile('Forged close helmet',[(1.28,.129,.105,-.018),(1.37,.134,.120,-.014),(1.44,.104,.09,-.015),(1.48,.025,.03,-.018)],armor,'head')
        plate('Helmet visor shadow',(0,1.348,.111),(.174,.027,.021),dark,'head')
        tube('Helmet nose guard',(0,1.29,.131),(0,1.40,.127),.014,.018,trim,'head',8)
        for s in [-1,1]:plate('Engraved cheek plate',(s*.095,1.279,.067),(.053,.092,.041),armor,'head',s*.15)
        fabric('Sapphire crest',[(1.50,.037,-.02),(1.57,.04,-.04),(1.55,.036,-.14)],cloth,'head')
    elif kind in ('ranger','arcanist','wraith'):
        open_hood(cloth,trim)
        if kind=='arcanist':
            tube('Rune crown fin',(0,1.455,-.005),(0,1.665,-.085),.065,.002,armor,'head',8)
            ball('Forehead oath gem',(0,1.425,.099),(.030,.046,.017),luminous,'head')
    elif kind in ('oracle','reaver','brute'):
        ball('Swept back hair',(0,1.423,-.025),(.124,.077,.114),dark,'head',20,12)
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
            silhouette('Sharpened crescent axe blade',[(x+s*.045,.96,.06),(x+s*.18,.93,.06),(x+s*.275,.965,.06),(x+s*.31,1.04,.06),(x+s*.30,1.17,.06),(x+s*.255,1.235,.06),(x+s*.15,1.20,.06),(x+s*.05,1.17,.06),(x+s*.08,1.09,.06)],.035,armor,hand,.004)
            tube('Blade bevel',(x+s*.22,.99,.06),(x+s*.235,1.20,.06),.015,.009,trim,hand,8)
        ball('Axe emberstone',(x,1.10,.087),(.030,.035,.012),luminous,hand)
    if is_skeleton:
        plate('Skull jaw opening',(0,1.255,.106),(.111,.028,.016),dark,'head')
        for i in range(5):plate('Carved skull tooth',(-.043+i*.021,1.259,.117),(.012,.025,.012),bone_mat,'head')
        for i in range(5):
            for s in [-1,1]:
                points=[(s*.018,.82+i*.045,.135),(s*.075,.805+i*.045,.143),(s*(.14-i*.008),.815+i*.045,.10),(s*(.15-i*.008),.83+i*.045,.02),(s*.09,.845+i*.045,-.065),(s*.02,.85+i*.045,-.075)]
                for a,b in zip(points,points[1:]):tube('Anatomical curved rib',a,b,.010,.010,bone_mat,'spine',8)
    if kind=='brute':
        for s in [-1,1]:
            for i in range(3):tube('Pauldron forged spike',(s*(.22+i*.045),1.12,0),(s*(.24+i*.07),1.27+i*.02,-.02),.035,.002,armor,f'upper_arm_{"L" if s<0 else "R"}',8)
    # Tailored equipment tells a class story through silhouette and workmanship.
    if not is_skeleton:
        for side,k in [('L',-1),('R',1)]:
            # Shoulder-to-belt harness, side buckles, boot straps, and visible seams.
            tube('Stitched diagonal chest harness',(k*.145,1.085,.105),(-k*.08,.765,.15),.017,.019,leather,'spine',8)
            for j in range(5):
                f=j/5;xx=k*.145*(1-f)-k*.08*f;yy=1.085*(1-f)+.765*f
                plate('Harness brass stitch',(xx,yy,.168),(.019,.006,.006),trim,'spine',k*.5)
            for yy in [.17,.25]:
                tube('Boot fastening strap',(k*.12-.057,yy,.063),(k*.12+.057,yy,.063),.013,.013,leather,f'shin_{side}',8)
                plate('Boot strap buckle',(k*.12+.032,yy,.078),(.027,.026,.008),trim,f'shin_{side}')
            # Eyelids, brows and cheekbones form an actual face inside open hoods.
            if kind!='warden':
                ball('Sculpted cheekbone',(k*.062,1.294,.080),(.029,.028,.015),skin,'head',16,8)
                tube('Upper brow',(k*.023,1.365,.097),(k*.081,1.356,.090),.004,.005,dark,'head',8)
                tube('Fine upper eyelid',(k*.027,1.342,.112),(k*.066,1.340,.108),.004,.004,skin,'head',8)
                ball('Iris',(k*.046,1.343,.114),(.009,.007,.004),bone_mat,'head',8,4)
                ball('Pupil',(k*.046,1.343,.118),(.004,.005,.002),dark,'head',8,4)
        tube('Lower lip line',(-.025,1.269,.108),(.025,1.269,.108),.003,.003,dark,'head',8)
        if kind in ('ranger','arcanist','oracle','reaver'):
            # Individually shaped swept locks; no helmet-shaped hair sphere alone.
            for i in range(9):
                xx=-.098+i*.024
                tube('Swept hair strand',(xx,1.426-abs(xx)*.2,-.00),(xx*.8,1.405,-.096),.013,.010,dark,'head',8)
                tube('Back hair strand',(xx*.8,1.405,-.096),(xx*.65,1.29,-.122),.010,.004,dark,'head',8)
    if kind=='warden':
        silhouette('Heraldic angular breastplate crest',[(-.09,1.04,.166),(0,1.078,.179),(.09,1.04,.166),(.068,.96,.18),(0,.895,.191),(-.068,.96,.18)],.013,trim,'chest')
        silhouette('Sapphire breastplate enamel',[(-.053,1.025,.181),(0,1.052,.195),(.053,1.025,.181),(.040,.976,.196),(0,.933,.208),(-.040,.976,.196)],.008,cloth,'chest')
        for side,k in [('L',-1),('R',1)]:
            for j in range(3):
                yy=.66-j*.055
                silhouette('Articulated fluted tasset',[(k*.18-.06,yy,.125),(k*.18+.06,yy,.125),(k*.18+.08,yy-.07,.145),(k*.18,yy-.095,.16),(k*.18-.07,yy-.07,.145)],.025,armor,'root')
                tube('Tasset engraved line',(k*.18,yy-.015,.17),(k*.18,yy-.075,.18),.004,.004,trim,'root',6)
        for yy in [.57,.65,.85]:
            for k in [-1,1]:ball('Shield border rivet',(-.40+k*(.13 if yy>.6 else .07),yy,.209),(.010,.01,.007),trim,'hand_L',8,4)
    elif kind=='ranger':
        for k in [-1,1]:
            plate('Belt utility pouch',(k*.17,.68,.11),(.10,.12,.063),leather,'root')
            plate('Pouch overlapping flap',(k*.17,.72,.15),(.102,.049,.025),cloth,'root')
            ball('Pouch button',(k*.17,.70,.17),(.011,.011,.007),trim,'root',8,4)
        for j in range(3):
            tube('Chest arrow tool',(-.135+j*.035,.93,.16),(-.135+j*.035,1.00,.16),.008,.008,trim,'spine',8)
    elif kind in ('arcanist','oracle','wraith'):
        profile('Layered ritual collar',[(1.06,.225,.115,0),(1.11,.23,.11,-.012),(1.155,.135,.09,-.012)],cloth,'chest',24)
        for k in [-1,1]:
            tube('Collar embroidered edging',(k*.08,1.135,.095),(k*.20,1.095,.105),.008,.008,trim,'chest',8)
            for j in range(6):
                yy=.62-j*.072;xx=k*(.075+j*.008)
                silhouette('Embroidered robe rune',[(xx-.009,yy,.18+j*.004),(xx,yy+.016,.18+j*.004),(xx+.009,yy,.18+j*.004),(xx,yy-.016,.18+j*.004)],.003,trim,f'tabard_{"L" if k<0 else "R"}' if j<3 else f'hem_{"L" if k<0 else "R"}',.001)
        if kind=='oracle':
            for i in range(7):
                a=(i/6)*math.pi
                ball('Pearl necklace',(math.cos(a)*.104,1.05-math.sin(a)*.070,.135),(.011,.011,.010),bone_mat,'chest',8,5)
    elif kind in ('reaver','brute'):
        for k in [-1,1]:
            for j in range(4):
                xx=k*(.07+j*.035)
                tube('Wolf fur mantle tuft',(xx,1.09,-.08),(xx*1.18,1.01,-.125),.033,.003,dark,'chest',8)
            tube('Leather chest lacing',(k*.08,.94,.173),(k*.10,.88,.172),.006,.006,trim,'spine',6)
        for j in range(3):
            silhouette('Battle scored armor slash',[(-.075+j*.018,1.015,.168),(-.01+j*.018,.93,.19),(-.015+j*.018,.93,.192),(-.081+j*.018,1.014,.17)],.002,dark,'spine',.001)
    face_parts=[ob for ob in PARTS if ob.name.startswith(('Cranium','Defined jaw','Sculpted cheekbone','Nose','Ear')) and ob.data.materials[0]==skin]
    if face_parts:
        bpy.ops.object.select_all(action='DESELECT')
        for ob in face_parts:ob.select_set(True);PARTS.remove(ob)
        bpy.context.view_layer.objects.active=face_parts[0];bpy.ops.object.join();face=bpy.context.object
        bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
        face.data.remesh_voxel_size=.006;bpy.ops.object.voxel_remesh()
        modifier=face.modifiers.new('Sculpted anatomical facial planes','SMOOTH');modifier.factor=.55;modifier.iterations=3;bpy.ops.object.modifier_apply(modifier=modifier.name)
        modifier=face.modifiers.new('Portrait topology budget','DECIMATE');modifier.ratio=.5;bpy.ops.object.modifier_apply(modifier=modifier.name)
        face.data.materials.clear();face.vertex_groups.clear();finish(face,'Unified sculpted face',skin,'head')
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
        export_force_sampling=True,export_optimize_animation_size=True,export_frame_step=2,export_nla_strips_merged_animation_name='idle',
        export_skins=True,export_def_bones=True,export_all_influences=False,
        export_materials='EXPORT',export_image_format='AUTO',export_apply=False,export_tangents=False)
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
    compact_glb(glb_path)
    return {'id':kind,'vertices':len(mesh.data.vertices),'polygons':len(mesh.data.polygons),'bones':len(rig.data.bones),'clips':[a.name for a in actions],'bytes':os.path.getsize(os.path.join(OUT,kind+'.glb'))}

records=[]
for kind in ([os.environ['RUNIC_CHARACTER']] if os.environ.get('RUNIC_CHARACTER') else PALETTES):
    # Remove old actions so each GLB has exactly its own five clips.
    for action in list(bpy.data.actions):bpy.data.actions.remove(action)
    records.append(create(kind))
with open(os.path.join(OUT,'manifest.json'),'w') as f:json.dump({'generator':'Blender 4.5 LTS / scripts/build-character-assets.py','license':'CC0-1.0','original':True,'coordinates':'+Y up, +Z forward, feet at Y=0','assets':records},f,indent=2)
print('RUNIC_ASSETS_COMPLETE',json.dumps(records))
