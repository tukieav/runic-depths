"""Original bestiary workshop: Blender 4.5 LTS, thirty authored enemy rigs.
Shared PBR surfaces avoid duplicating textures per model. No third-party art.
Run blender --background --python scripts/build-enemy-assets.py
RUNIC_ENEMY=<id> limits development export. Runtime coordinates Y up, Z forward.
"""
import bpy, math, random, os, json, struct, ast, hashlib, re
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parent.parent
OUT=ROOT/'assets/enemies'; SOURCE=ROOT/'source-art/enemies'
OUT.mkdir(parents=True,exist_ok=True);SOURCE.mkdir(parents=True,exist_ok=True)
(OUT/'lod').mkdir(exist_ok=True)
# Reuse geometry tools only: importing the character generator would overwrite heroes.
source=ast.parse((ROOT/'scripts/build-character-assets.py').read_text())
keep=['p','ball','tube','plate','profile','fabric','silhouette','open_hood','secondary_weights','make_rig','animate','compact_glb']
exec(compile(ast.Module(body=[n for n in source.body if isinstance(n,ast.FunctionDef) and n.name in keep],type_ignores=[]),'original_workshop_tools','exec'))
KIND='enemy'; WIDTHS={'enemy':1};PARTS=[]
# id, body topology, weapon, theme, signature
SPECS=[
('hollow_guard','humanoid','sword','crypt','empty_visor'),
('crypt_crawler','spider','claws','crypt','prayer_carapace'),
('candle_wisp','float','orb','crypt','lantern'),
('bell_hound','hound','fangs','crypt','bell_collar'),
('thorn_lurker','humanoid','bow','grove','antlers'),
('spore_weaver','spider','claws','grove','mushrooms'),
('bark_colossus','golem','fists','grove','bark'),
('moss_caller','humanoid','staff','grove','branches'),
('mirror_knight','humanoid','sword','glass','mirror_shield'),
('prism_mote','float','orb','glass','prism'),
('shard_skitter','spider','claws','glass','crystals'),
('glass_scribe','humanoid','staff','glass','book'),
('chain_sentinel','humanoid','hammer','forge','chains'),
('furnace_hound','hound','fangs','forge','furnace'),
('slag_titan','golem','fists','forge','slag'),
('ember_channeler','humanoid','bow','forge','flame_bow'),
('tidebound','humanoid','trident','tide','barnacles'),
('abyss_jelly','float','orb','tide','jelly'),
('coral_maw','hound','fangs','tide','coral'),
('undertow_cantor','humanoid','staff','tide','shells'),
('void_paladin','humanoid','sword','void','eclipse'),
('star_devourer','hound','fangs','void','void_spines'),
('null_weaver','spider','claws','void','void_eggs'),
('echo_archon','float','orb','void','masks'),
('bell_keeper','golem','hammer','crypt','bell_boss'),
('root_matriarch','spider','claws','grove','tree_boss'),
('glass_oracle','float','orb','glass','oracle_boss'),
('iron_judge','golem','hammer','forge','anvil_boss'),
('drowned_king','humanoid','trident','tide','king_boss'),
('first_keeper','humanoid','orb','void','cosmic_boss')]
PALETTES={
'crypt':[(.22,.26,.29),(.18,.21,.26),(.32,.23,.14),(.72,.65,.45),(.28,.30,.29),(.36,.25,.19),(.20,.55,.62),(.60,.41,.16)],
'grove':[(.22,.29,.19),(.13,.29,.15),(.29,.18,.075),(.65,.61,.37),(.24,.31,.17),(.44,.25,.43),(.36,.76,.26),(.56,.43,.12)],
'glass':[(.48,.52,.62),(.23,.16,.38),(.23,.19,.29),(.64,.69,.76),(.31,.33,.44),(.50,.35,.57),(.42,.70,.95),(.71,.60,.38)],
'forge':[(.25,.23,.22),(.37,.12,.055),(.20,.12,.065),(.56,.46,.28),(.30,.22,.16),(.43,.20,.09),(.95,.24,.025),(.64,.35,.095)],
'tide':[(.19,.37,.38),(.08,.29,.31),(.22,.27,.20),(.70,.65,.46),(.20,.33,.34),(.64,.30,.34),(.21,.76,.78),(.54,.48,.20)],
'void':[(.25,.21,.37),(.20,.085,.29),(.20,.14,.26),(.57,.49,.65),(.25,.19,.35),(.42,.20,.46),(.69,.31,.94),(.62,.48,.26)]}

def finish(obj,name,material,bone,bevel=0):
    obj.name=name;obj.data.materials.append(material)
    if bevel:
        m=obj.modifiers.new('Rounded forged edges','BEVEL');m.width=bevel;m.segments=2
        bpy.context.view_layer.objects.active=obj;bpy.ops.object.modifier_apply(modifier=m.name)
    if not obj.data.uv_layers:
        uv=obj.data.uv_layers.new(name='UVMap')
        for poly in obj.data.polygons:
            for li in poly.loop_indices:
                co=obj.data.vertices[obj.data.loops[li].vertex_index].co;uv.data[li].uv=(co.x*2+.5,co.z*2+.5)
    region=material['region']
    for loop in obj.data.uv_layers.active.data:loop.uv=((region%4)/4+.004+(loop.uv.x%1)*.242,(region//4)/2+.004+(loop.uv.y%1)*.492)
    for poly in obj.data.polygons:poly.use_smooth=not any(w in name.lower() for w in ['plate','blade','crystal','facet','anvil'])
    obj.vertex_groups.new(name=bone).add(list(range(len(obj.data.vertices))),1,'REPLACE');PARTS.append(obj);return obj

def surfaces():
    # Each material receives a 256 x 512 texel surface, not a tiny flat swatch.
    # Coherent height derivatives produce a tangent normal, with roughness and
    # albedo wear following the very same engraved/weave/crack features.
    size=1024; arrays={k:[] for k in ['color','normal','roughmetal','emission']}
    def height(slot,u,v):
        grain=math.sin(u*.81+math.sin(v*.31))*math.sin(v*.73)*.025
        if slot==0: # hammered iron, etched panel boundaries, thin diagonal scars
            seam=-.13 if u%128<3 or v%128<3 else 0
            scratch=-.06 if (u+v*.27)%73<1.7 else 0
            return grain+seam+scratch+.025*math.sin(u*.13)*math.sin(v*.19)
        if slot==1: # perpendicular woven thread, stitched selvage
            weave=.04*math.sin(u*math.pi/2)+.04*math.sin(v*math.pi/2)
            stitch=.12 if (u%128 in [7,8,9] and v%18<8) else 0
            return weave+stitch+.025*math.sin(u*.04+math.sin(v*.014))
        if slot==2: # directional bark ridges and deep meandering fissures
            phase=u*.23+math.sin(v*.018)*2+math.sin(v*.073)*.3
            return .10*math.sin(phase)+.035*math.sin(phase*3)+grain*.5
        if slot==3: # aged porous bone, hairline surface fractures
            return grain*.65+.03*math.sin(u*.034+v*.012)+(-.06 if (u-v*.12)%109<1.5 else 0)
        if slot==4: # stone stratification and irregular mineral seams
            return grain+.045*math.sin(v*.13+math.sin(u*.025)*2)+(-.1 if (u+math.sin(v*.024)*13)%101<2 else 0)
        if slot==5: # coral pores and chitin growth rings
            return .065*math.sin(u*.19)*math.sin(v*.17)+.028*math.sin(math.hypot(u-128,v-240)*.18)
        if slot==6:return .012*math.sin(u*.04+v*.025)
        # brass with narrow angular rune engraving and edge wear
        ru=u%64;rv=v%96
        rune=-.10 if abs(ru-32)<2 or (abs(ru-rv*.66)<2 and rv<48) else 0
        return grain*.5+rune
    for y in range(size):
      for x in range(size):
        slot=(y//512)*4+x//256;u=x%256;v=y%512;h=height(slot,u,v)
        base=[.61,.62,.52,.70,.53,.61,.86,.68][slot]
        cavity=min(0,h)*.85;raised=max(0,h)*.45
        val=max(.25,min(.98,base+cavity+raised));val=round(val*96)/96
        arrays['color'] += [val,val,val,1]
        dx=(height(slot,u+1,v)-height(slot,u-1,v))*2.0
        dy=(height(slot,u,v+1)-height(slot,u,v-1))*2.0
        length=math.sqrt(dx*dx+dy*dy+1)
        arrays['normal'] += [.5-dx/length*.5,.5-dy/length*.5,.5+.5/length,1]
        rough=max(.18,min(.97,[.50,.92,.88,.73,.88,.77,.28,.44][slot]-raised*.9-cavity*.3))
        arrays['roughmetal'] += [1,rough,[.78,0,0,0,.06,0,.25,.75][slot],1]
        arrays['emission'] += ([1,1,1,1] if slot==6 else [0,0,0,1])
    images=[]
    for key,values in arrays.items():
        im=bpy.data.images.new('bestiary_'+key,size,size)
        if key in ['normal','roughmetal']:im.colorspace_settings.name='Non-Color'
        im.pixels=values
        im.filepath_raw=str(OUT/(key+'.png'));im.file_format='PNG';im.save();images.append(im)
    return images
IMAGES=surfaces()
def materials(theme):
    result=[]
    for i,rgb in enumerate(PALETTES[theme]):
        m=bpy.data.materials.new(theme+'_'+str(i));m['region']=i;m['rgb']=rgb;result.append(m)
    return result

def unify(mesh):
    mats=list(mesh.data.materials);colors=mesh.data.color_attributes.new(name='ArtColor',type='FLOAT_COLOR',domain='CORNER')
    for poly in mesh.data.polygons:
        rgb=mats[poly.material_index]['rgb']
        for li in poly.loop_indices:colors.data[li].color=(*rgb,1)
        poly.material_index=0
    mat=bpy.data.materials.new('Original bestiary shared PBR');mat.use_nodes=True
    n=mat.node_tree.nodes;l=mat.node_tree.links;bs=n.get('Principled BSDF')
    tex=n.new('ShaderNodeTexImage');tex.image=IMAGES[0];vertex=n.new('ShaderNodeVertexColor');vertex.layer_name='ArtColor'
    mul=n.new('ShaderNodeMixRGB');mul.blend_type='MULTIPLY';mul.inputs[0].default_value=1;l.new(tex.outputs['Color'],mul.inputs[1]);l.new(vertex.outputs['Color'],mul.inputs[2]);l.new(vertex.outputs['Color'],bs.inputs['Base Color'])
    orm=n.new('ShaderNodeTexImage');orm.image=IMAGES[2];sep=n.new('ShaderNodeSeparateColor');l.new(orm.outputs['Color'],sep.inputs['Color']);l.new(sep.outputs['Green'],bs.inputs['Roughness']);l.new(sep.outputs['Blue'],bs.inputs['Metallic'])
    norm=n.new('ShaderNodeTexImage');norm.image=IMAGES[1];nm=n.new('ShaderNodeNormalMap');nm.inputs['Strength'].default_value=.45;l.new(norm.outputs['Color'],nm.inputs['Color']);l.new(nm.outputs['Normal'],bs.inputs['Normal'])
    em=n.new('ShaderNodeTexImage');em.image=IMAGES[3];l.new(em.outputs['Color'],bs.inputs['Emission Color']);bs.inputs['Emission Strength'].default_value=.35
    mesh.data.materials.clear();mesh.data.materials.append(mat)

def curve(name,points,radius,material,bone='spine'):
    for a,b in zip(points,points[1:]):tube(name,a,b,radius,radius*.9,material,bone,8)
def tube(name,a,b,r1,r2,material,bone='spine',vertices=12):
    # Thin organic and forged rods do not need hidden cap micro-bevel rings.
    # Their cross section and silhouette retain full tessellation.
    start,end=p(*a),p(*b);delta=end-start
    bpy.ops.mesh.primitive_cone_add(vertices=vertices,radius1=r1,radius2=r2,depth=delta.length,location=(start+end)/2)
    ob=bpy.context.object;ob.rotation_euler=delta.to_track_quat('Z','Y').to_euler()
    return finish(ob,name,material,bone)

def ring(name,center,radius,material,bone='spine',axis='z',segments=16,thickness=.012):
    x,y,z=center;points=[]
    for i in range(segments+1):
        a=i*math.tau/segments
        points.append((x+math.cos(a)*radius,y+math.sin(a)*radius,z) if axis=='z' else (x+math.cos(a)*radius,y,z+math.sin(a)*radius))
    curve(name,points,thickness,material,bone)
def spike(name,a,b,r,mat,bone='spine'):return tube(name,a,b,r,0,mat,bone,8)

def humanoid(spec, mats):
    id,body,weapon,theme,signature=spec;iron,cloth,wood,bone,stone,coral,glow,gold=mats
    rig=make_rig();robed=weapon in ['staff','orb'];bow=weapon=='bow'
    profile('Anatomical layered torso',[(.66,.145,.10,0),(.79,.16,.11,0),(.97,.215,.135,0),(1.09,.22,.11,0),(1.14,.125,.085,0)],cloth,sides=20)
    if robed:
        profile('Continuous embroidered cloth chest',[(.70,.185,.143,.012),(.92,.225,.152,.012),(1.08,.218,.127,.005)],cloth,sides=20)
        for side in [-1,1]:
            tube('Caster vertical embroidered stole',(side*.085,.73,.161),(side*.12,1.08,.131),.018,.020,gold,'chest',8)
    elif bow:
        profile('Fitted archer bark cuirass' if theme=='grove' else 'Fitted archer hardened leather jerkin',[(.73,.177,.138,.014),(.91,.213,.147,.013),(1.075,.209,.125,.008)],wood,sides=20)
        for j in range(6):tube('Archer crossed chest lacing',(-.045,.77+j*.043,.166),(.045,.80+j*.043,.163),.006,.006,gold,'chest',6)
    else:
        for i in range(4):profile('Overlapping articulated abdominal armor',[(.71+i*.065,.18-i*.003,.133,.015),(.76+i*.065,.178,.13,.01)],iron,sides=16)
    profile('Broad leather belt',[(.68,.183,.141,0),(.733,.18,.14,0)],wood,'root')
    plate('Engraved belt clasp',(0,.709,.155),(.077,.057,.025),gold,'root')
    for side,s in [('L',-1),('R',1)]:
        th,sh,ft,ua,fo,ha=[n+'_'+side for n in ['thigh','shin','foot','upper_arm','forearm','hand']]
        tube('Tailored trouser thigh',(s*.11,.66,0),(s*.12,.39,0),.077,.059,cloth,th)
        ball('Anatomical knee',(s*.12,.38,.01),(.068,.067,.075),iron,sh)
        tube('Fluted shin guard',(s*.12,.33,0),(s*.12,.11,0),.065,.051,iron,sh)
        ball('Pointed articulated boot',(s*.12,.065,.05),(.068,.063,.13),wood,ft)
        for yy in [.14,.24,.31]:tube('Greave fastening strap',(s*.12-.05,yy,.058),(s*.12+.05,yy,.058),.008,.008,gold,sh,6)
        tube('Upper arm anatomy',(s*.23,1.075,0),(s*.30,.88,0),.074,.052,cloth,ua)
        for j in range(3):
            ball('Layered shoulder lamella',(s*(.245+j*.025),1.105-j*.027,0),(.095,.034,.12),cloth if robed else wood if bow else iron,ua,12,6)
            for k in range(3):ball('Shoulder brass rivet',(s*(.21+k*.035),1.122-j*.024,.106),(.007,.007,.007),gold,ua,6,4)
        tube('Wrist and forearm',(s*.30,.865,0),(s*.333,.70,.05),.05,.039,cloth,fo)
        tube('Engraved vambrace',(s*.315,.80,.018),(s*.332,.71,.045),.057,.049,iron,fo)
        plate('Articulated glove palm',(s*.333,.668,.061),(.075,.068,.057),wood,ha)
        for f in range(4):tube('Individual gloved finger',(s*(.31+f*.015),.65,.076),(s*(.31+f*.015),.614,.085),.008,.006,wood,'fingers_'+side,6)
        tube('Opposed glove thumb',(s*.297,.682,.06),(s*.289,.65,.086),.012,.008,wood,'thumb_'+side,6)
    profile('Collared neck',[(1.115,.067,.06,0),(1.235,.063,.06,0)],cloth,'head')
    ball('Sculpted head planes',(0,1.33,0),(.116,.146,.10),bone,'head',20,12)
    ball('Defined lower jaw',(0,1.248,.028),(.084,.06,.074),bone,'head')
    for s in [-1,1]:
        plate('Inset eye socket',(s*.046,1.342,.093),(.036,.022,.022),cloth,'head')
        ball('Glowing inset eye',(s*.046,1.342,.108),(.009,.007,.006),glow,'head',8,4)
        tube('Sculpted eyebrow ridge',(s*.018,1.37,.095),(s*.078,1.361,.087),.009,.010,bone,'head',8)
        ball('Angular cheek bone',(s*.065,1.297,.078),(.03,.022,.025),bone,'head')
    spike('Nasal ridge',(0,1.35,.10),(0,1.30,.143),.018,bone,'head')
    if robed or bow:
        # Open cowl leaves the carved face visible from gameplay camera.
        for i in range(11):
            a=math.radians(135)+i*math.radians(270)/10
            curve('Segmented open hood seam',[(math.cos(a)*.14,1.21,math.sin(a)*.12-.03),(math.cos(a)*.15,1.38,math.sin(a)*.14-.03),(math.cos(a)*.07,1.49,math.sin(a)*.08-.03)],.022,cloth,'head')
        secondary_weights(fabric('Weighted ragged cloak',[(1.11,.40,-.13),(.92,.48,-.19),(.73,.51,-.23),(.54,.55,-.27),(.35,.50,-.31)],cloth))
    else:
        profile('Riveted angular closed helmet',[(1.27,.132,.11,-.03),(1.39,.138,.12,-.015),(1.49,.052,.05,-.02)],iron,'head',16)
        plate('Dark visor slit',(0,1.35,.114),(.185,.025,.022),cloth,'head')
        tube('Helmet central reinforced ridge',(0,1.285,.139),(0,1.49,.021),.016,.01,gold,'head',8)
    if robed:
        secondary_weights(profile('Layered pleated ceremonial robe',[(.11,.25,.19,0),(.22,.28,.20,0),(.40,.235,.175,0),(.60,.195,.155,0),(.72,.18,.145,0)],cloth,'root',24),'robe')
        for s in [-1,1]:tube('Robe gold embroidered edge',(s*.15,.19,.17),(s*.065,.68,.15),.009,.009,gold,'root',8)
    x=.36;hand='hand_R'
    if weapon=='bow':
        pts=[(x,.22,.04),(x,.36,.19),(x,.53,.28),(x,.70,.29),(x,.88,.25),(x,1.08,.13),(x,1.19,.015)]
        curve('Weapon_Bow_Recurve_Limb',pts,.022,wood,hand)
        for yy,zz in [(.37,.19),(.52,.28),(.87,.25),(1.05,.14)]:ring('Bow gold binding',(x,yy,zz),.026,gold,hand,segments=8,thickness=.005)
        # Dedicated deforming bowstring bone and nocked arrow visibly draw back.
        bpy.context.view_layer.objects.active=rig;bpy.ops.object.mode_set(mode='EDIT')
        bn=rig.data.edit_bones.new('bow_draw');bn.head=p(x,.695,.01);bn.tail=p(x,.695,.12);bn.parent=rig.data.edit_bones[hand];bpy.ops.object.mode_set(mode='OBJECT')
        for start in [pts[0],pts[-1]]:
            ob=tube('Weapon_Bow_String',start,(x,.695,.01),.003,.003,bone,hand,6)
            ob.vertex_groups.new(name='bow_draw')
            for v in ob.data.vertices:
                co=ob.matrix_world@v.co;dist=(co-p(x,.695,.01)).length
                if dist<.09:ob.vertex_groups[hand].remove([v.index]);ob.vertex_groups['bow_draw'].add([v.index],1,'REPLACE')
        tube('Weapon_Nocked_Arrow',(x,.695,-.16),(x,.695,.56),.006,.006,wood,'bow_draw',6)
        spike('Weapon_Arrowhead',(x,.695,.53),(x,.695,.64),.022,iron,'bow_draw')
        tube('Back quiver',(-.13,.68,-.20),(-.18,1.08,-.27),.067,.079,wood,'spine')
        for i in range(5):
            tube('Spare arrow shaft',(-.22+i*.025,.86,-.26),(-.25+i*.025,1.27,-.29),.005,.004,bone,'spine',6)
            plate('Spare arrow fletching',(-.245+i*.025,1.20,-.29),(.017,.07,.025),cloth,'spine')
        if theme=='forge':
            for yy in [.32,.49,.89,1.10]:spike('Flame shaped bow ornament',(x,yy,.13),(x+.075,yy+.09,.15),.028,glow,hand)
    elif weapon in ['staff','trident','hammer']:
        tube('Weapon_'+weapon+'_shaft',(x,.10,.06),(x,1.47,.06),.026,.020,wood,hand)
        for yy in [.31,.68,1.15]:tube('Weapon handle binding',(x,yy,.06),(x,yy+.065,.06),.031,.031,gold,hand)
        if weapon=='trident':
            for s in [-1,0,1]:curve('Weapon_Trident_Prong',[(x,.1+1.15,.06),(x+s*.13,1.38,.06),(x+s*.16,1.63-(.08 if s else 0),.06)],.019,iron,hand)
            for s in [-1,0,1]:spike('Trident pointed tine',(x+s*.16,1.54,.06),(x+s*.16,1.68-(.08 if s else 0),.06),.032,gold,hand)
        elif weapon=='hammer':
            plate('Weapon_Hammer_Head',(x,1.28,.06),(.40,.22,.21),iron,hand)
            for s in [-1,1]:plate('Hammer striking face',(x+s*.215,1.28,.06),(.035,.25,.24),gold,hand)
            ball('Hammer seal',(x,1.28,.18),(.055,.055,.016),glow,hand)
        else:
            ring('Staff crown',(x,1.49,.06),.12,gold,hand,segments=12)
            ball('Weapon_Staff_Focus',(x,1.49,.06),(.063,.12,.058),glow,hand,10,8)
            for s in [-1,1]:spike('Staff focus prong',(x+s*.10,1.44,.06),(x+s*.13,1.69,.06),.020,gold,hand)
    elif weapon=='sword':
        tube('Weapon_Sword_Grip',(x,.61,.06),(x,.79,.06),.024,.024,wood,hand)
        tube('Sword crossguard',(x-.11,.81,.06),(x+.11,.81,.06),.02,.017,gold,hand,8)
        blade=profile('Weapon_Sword_Blade',[(.83,.04,.017,0),(1.28,.03,.012,0),(1.47,.001,.001,0)],iron,hand,4);blade.location=p(x,0,.06)
        shield=profile('Heraldic shield',[(.38,.02,.028,0),(.59,.18,.04,0),(.84,.19,.04,0),(.98,.12,.03,0)],iron,'hand_L',8);shield.location=p(-.40,0,.15)
        ring('Shield embossed crest',(-.40,.76,.201),.085,gold,'hand_L',segments=12)
        spike('Shield crest tip',(-.4,.67,.21),(-.4,.87,.21),.03,glow,'hand_L')
    elif weapon=='orb':
        ball('Weapon_Orbiting_Focus',(.40,.84,.14),(.105,.105,.105),glow,hand,16,10)
        ring('Orb carved orbit',(.40,.84,.14),.155,gold,hand)
    if signature in ['antlers','branches']:
        for s in [-1,1]:
            curve('Living branch antler',[(s*.09,1.42,-.02),(s*.18,1.61,-.02),(s*.25,1.72,-.08)],.028,wood,'head')
            spike('Antler branching tip',(s*.16,1.57,-.02),(s*.30,1.61,.01),.018,wood,'head')
        for i in range(8):spike('Shoulder growing thorn',((i%2*2-1)*.23,1.05-i//2*.04,-.07),((i%2*2-1)*.40,1.16-i//2*.045,-.14),.025,wood,'chest')
    if signature=='mirror_shield':
        mirror=profile('Mirror knight polished octagonal shield inset',[(.52,.02,.015,0),(.65,.13,.025,0),(.86,.13,.025,0),(.92,.07,.015,0)],glow,'hand_L',8);mirror.location=p(-.40,0,.219)
        for j in range(5):
            spike('Mirror crown faceted fan',(-.10+j*.05,1.44,-.04),(-.19+j*.095,1.67-abs(j-2)*.025,-.07),.036,iron,'head')
        for side in [-1,1]:
            plate('Suspended mirror shoulder facet',(side*.30,1.12,.115),(.105,.15,.018),glow,'upper_arm_'+('L' if side<0 else 'R'))
    if signature=='book':
        plate('Floating open grimoire cover',(-.37,.80,.12),(.29,.045,.23),wood,'hand_L')
        for i in range(4):plate('Layered grimoire pages',(-.37,.83+i*.005,.12),(.27,.006,.21),bone,'hand_L')
        for s in [-1,1]:spike('Glass scribe quill',(-.1*s,1.42,-.03),(-.23*s,1.66,-.05),.037,glow,'head')
    if signature=='chains':
        for side in [-1,1]:
            for j in range(7):ring('Articulated chain link',(side*.17,.99-j*.052,.17),.026,iron,'spine',axis='z' if j%2 else 'y',segments=8,thickness=.009)
    if signature in ['barnacles','shells','king_boss']:
        for s in [-1,1]:
            for j in range(4):ring('Barnacle shell opening',(s*(.19+j*.021),1.08-j*.022,.095),.025+j*.003,bone,'chest',segments=8,thickness=.008)
        for s in [-1,1]:spike('Coral crown branch',(s*.08,1.43,0),(s*.13,1.68,-.04),.025,coral,'head')
    if signature in ['eclipse','cosmic_boss']:
        ring('Eclipse crown halo',(0,1.43,-.14),.24,gold,'head',segments=20,thickness=.016)
        for i in range(7):
            a=i*math.pi/6
            spike('Eclipse halo ray',(math.cos(a)*.25,1.43+math.sin(a)*.25,-.14),(math.cos(a)*.34,1.43+math.sin(a)*.34,-.14),.018,glow,'head')
    if signature=='king_boss':
        for i in range(7):spike('Royal crown tine',(-.12+i*.04,1.44,0),(-.15+i*.05,1.64+(.06 if i==3 else 0),-.01),.025,gold,'head')
        secondary_weights(fabric('Royal fur bordered mantle',[(1.12,.56,-.16),(.94,.68,-.22),(.72,.74,-.30),(.47,.80,-.36),(.20,.77,-.40)],cloth))
    if signature=='cosmic_boss':
        for s in [-1,1]:
            for j in range(4):spike('Seraph floating shoulder blade',(s*(.19+j*.055),1.1+j*.03,-.12),(s*(.44+j*.08),1.45+j*.10,-.19),.044,iron,'chest')
            for j in range(3):ring('Keeper oath orbit',(0,1.05,-.15-j*.05),.31+j*.10,gold,'chest',segments=18,thickness=.009)
    return rig

def creature_rig(body):
    bpy.ops.object.armature_add();rig=bpy.context.object;rig.name='Bestiary_'+body+'_Rig'
    bpy.ops.object.mode_set(mode='EDIT');rig.data.edit_bones.remove(rig.data.edit_bones[0])
    defs=[('root',(0,.55,0),(0,.70,0),None),('spine',(0,.65,0),(0,.9,0),'root'),('head',(0,.65,.28),(0,.70,.55),'spine')]
    if body=='spider':
        for s in [-1,1]:
            for i in range(4):
                z=.36-i*.25;x=s*(.56+(.10 if i in [1,2] else 0))
                defs += [(f'leg_{s}_{i}',(s*.14,.53,z*.7),(x,.43,z),'root'),(f'tip_{s}_{i}',(x,.43,z),(s*.79,.07,z*1.50),f'leg_{s}_{i}')]
    elif body=='hound':
        for s in [-1,1]:
            for i in range(2):
                z=.30 if i==0 else -.29
                defs += [(f'leg_{s}_{i}',(s*.15,.57,z),(s*.17,.30,z+.08),'root'),(f'tip_{s}_{i}',(s*.17,.30,z+.08),(s*.18,.07,z+.1),f'leg_{s}_{i}')]
        defs += [('tail',(0,.58,-.42),(0,.69,-.73),'root'),('jaw',(0,.62,.45),(0,.55,.70),'head')]
    elif body=='float':
        for i in range(8):
            a=i*math.tau/8;x=math.cos(a)*.16;z=math.sin(a)*.16
            defs += [(f'tendril_{i}',(x,.70,z),(x*1.3,.43,z*1.3),'root'),(f'tip_{i}',(x*1.3,.43,z*1.3),(x*1.6,.13,z*1.6),f'tendril_{i}')]
    for name,a,b,parent in defs:
        bn=rig.data.edit_bones.new(name);bn.head=p(*a);bn.tail=p(*b)
        if parent:bn.parent=rig.data.edit_bones[parent]
    bpy.ops.object.mode_set(mode='OBJECT');return rig

def creature(spec,m):
    id,body,weapon,theme,sig=spec;iron,cloth,wood,bone,stone,coral,glow,gold=m
    if body=='golem':return golem(spec,m)
    rig=creature_rig(body)
    if body=='spider':
        ball('Segmented rear abdomen',(0,.55,-.17),(.265,.24,.36),stone,'root',20,12)
        ball('Armored thorax',(0,.55,.20),(.19,.18,.23),iron,'spine',16,10)
        ball('Mandibled head',(0,.52,.39),(.14,.12,.16),bone,'head',16,8)
        for s in [-1,1]:
            for i in range(4):
                z=.36-i*.25;x=s*(.56+(.10 if i in [1,2] else 0));upper=f'leg_{s}_{i}';tip=f'tip_{s}_{i}'
                curve('Eight jointed upper arachnid legs',[(s*.14,.53,z*.7),(s*.35,.64,z),(x,.43,z)],.044,wood if theme=='grove' else iron,upper)
                ball('Arachnid exposed knee',(x,.43,z),(.057,.053,.053),gold,tip,10,6)
                tube('Arachnid tapered shin',(x,.43,z),(s*.79,.075,z*1.50),.032,.009,iron,tip,8)
                spike('Arachnid hooked foot',(s*.79,.075,z*1.50),(s*.86,.025,z*1.53+.05),.016,bone,tip)
                spike('Leg backward barb',(s*.36,.60,z),(s*.44,.74,z-.06),.023,bone,upper)
            curve('Articulated mandible',[(s*.09,.50,.46),(s*.14,.43,.58),(s*.075,.43,.67)],.025,bone,'head')
            for j in range(3):ball('Clustered arachnid eye',(s*(.036+j*.025),.56+j*.016,.521-j*.012),(.016,.015,.010),glow,'head',8,6)
        for j in range(6):
            yy=.60+math.sin(j/5*math.pi)*.16;zz=-.43+j*.09
            plate('Overlapping dorsal carapace',(0,yy,zz),(.31,.035,.073),iron,'root')
        if sig in ['mushrooms','tree_boss']:
            for i in range(7):
                a=i*2.399;x=math.cos(a)*.20;z=-.15+math.sin(a)*.22
                tube('Fungal fruiting stem',(x,.69,z),(x,.83+i%3*.07,z),.018,.025,bone,'root',8)
                ball('Broad fungal cap',(x,.84+i%3*.07,z),(.09,.031,.075),coral,'root',12,6)
                for j in range(3):ball('Spore pore',(x-.04+j*.04,.87+i%3*.07,z),(.009,.008,.008),glow,'root',6,4)
        elif sig=='crystals':
            for i in range(9):
                a=i*2.39;x=math.cos(a)*.21;z=-.15+math.sin(a)*.25
                spike('Dorsal crystal spine',(x,.69,z),(x*1.2,.93+i%3*.06,z-.09),.045,glow,'root')
        elif sig=='void_eggs':
            for i in range(9):
                a=i*2.39;x=math.cos(a)*.18;z=-.16+math.sin(a)*.23
                ball('Null weaver suspended void egg',(x,.73+i%2*.045,z),(.055,.074,.048),coral,'root',12,8)
                ring('Egg luminous binding',(x,.74+i%2*.045,z),.052,glow,'root',axis='y',segments=10,thickness=.006)
            for side in [-1,1]:curve('Trailing void silk strand',[(side*.19,.5,-.35),(side*.28,.28,-.59),(side*.18,.14,-.79)],.008,glow,'root')
        else:
            for i in range(5):ring('Carved prayer seal',(0,.68,-.36+i*.09),.048,gold,'root',axis='y',segments=8,thickness=.006)
        if sig=='tree_boss':
            for s in [-1,1]:
                curve('Ancient flowering crown trunk',[(s*.07,.72,-.21),(s*.14,1.10,-.24),(s*.32,1.37,-.27)],.065,wood,'spine')
                for j in range(3):
                    curve('Matriarch branching crown',[(s*.13,1.03+j*.08,-.24),(s*(.33+j*.1),1.2+j*.12,-.20),(s*(.46+j*.1),1.15+j*.12,-.17)],.027,wood,'spine')
                    ball('Luminous seed pod',(s*(.41+j*.1),1.13+j*.12,-.17),(.04,.075,.04),glow,'spine')
    elif body=='hound':
        ball('Deep rib cage',(0,.54,.10),(.21,.235,.34),cloth,'root',20,12)
        ball('Tapered abdominal flank',(0,.48,-.24),(.15,.17,.26),stone,'root',16,10)
        ball('Muscular neck',(0,.64,.32),(.18,.20,.21),stone,'spine',16,10)
        ball('Canine elongated cranium',(0,.73,.47),(.15,.155,.19),iron,'head',16,10)
        ball('Long canine muzzle',(0,.65,.64),(.105,.065,.16),bone,'head',16,8)
        ball('Lower hinged jaw',(0,.565,.63),(.086,.035,.16),stone,'jaw',12,6)
        for s in [-1,1]:
            spike('Alert pointed ear',(s*.09,.82,.40),(s*.14,1.00,.38),.065,stone,'head')
            ball('Deep set canine eye',(s*.126,.76,.535),(.024,.020,.012),glow,'head',8,6)
            for j in range(5):spike('Individual canine tooth',(s*.079,.626,.55+j*.035),(s*.071,.58,.55+j*.035),.013,bone,'head')
            for i in range(2):
                z=.30 if i==0 else -.29;up=f'leg_{s}_{i}';tip=f'tip_{s}_{i}'
                ball('Canine shoulder muscle',(s*.16,.51,z),(.10,.16,.12),stone,up,12,8)
                tube('Digitigrade upper leg',(s*.15,.53,z),(s*.17,.30,z+.08),.061,.036,cloth,up)
                tube('Digitigrade lower leg',(s*.17,.30,z+.08),(s*.18,.075,z+.10),.032,.021,stone,tip)
                ball('Wide articulated paw',(s*.18,.045,z+.16),(.059,.04,.095),stone,tip,12,6)
                for j in range(3):spike('Paw hooked claw',(s*.18-.038+j*.038,.04,z+.21),(s*.18-.038+j*.038,.019,z+.28),.012,bone,tip)
        curve('Flexible armored tail',[(0,.58,-.42),(0,.64,-.62),(0,.74,-.80),(0,.70,-.95)],.045,stone,'tail')
        for i in range(7):plate('Overlapping armored dorsal ridge',(0,.74-i*.012,.21-i*.09),(.23-i*.01,.052,.08),iron,'root')
        if sig=='bell_collar':
            ring('Heavy forged collar',(0,.65,.31),.21,gold,'spine',segments=16,thickness=.025)
            profile('Hanging warning bell',[(.36,.055,.055,0),(.40,.065,.065,0),(.49,.035,.035,0)],gold,'spine',12).location=p(0,0,.36)
        if sig=='furnace':
            for s in [-1,1]:
                for i in range(5):tube('Furnace rib grille',(s*.20,.48,.22-i*.09),(s*.21,.66,.22-i*.09),.014,.014,iron,'root',8)
            ball('Furnace chest ember',(0,.63,.345),(.085,.09,.035),glow,'spine')
            for z in [-.2,-.33]:tube('Back furnace chimney',(0,.69,z),(0,.91,z),.045,.032,iron,'root')
        if sig in ['coral','void_spines']:
            for i in range(8):
                s=(-1)**i;z=.18-i//2*.13
                curve('Branching coral antler' if sig=='coral' else 'Void dorsal spine',[(s*.12,.69,z),(s*.25,.92,z-.03),(s*.32,1.02,z-.10)],.027,coral if sig=='coral' else glow,'root')
        if sig=='void_spines':
            ring('Devourer eclipse jaw halo',(0,.73,.57),.185,gold,'head',segments=14,thickness=.012)
            for side in [-1,1]:
                spike('Star devourer swept crown horn',(side*.11,.82,.43),(side*.27,1.18,.10),.055,glow,'head')
                silhouette('Devourer caudal star blade',[(0,.72,-.70),(side*.23,.77,-.84),(side*.05,.80,-1.05),(0,.84,-.89)],.025,iron,'tail')
    elif body=='float':
        if sig=='lantern':
            ball('Candle captive flame',(0,.90,0),(.12,.22,.12),glow,'root',16,10)
            for i in range(8):
                a=i*math.tau/8;x=math.cos(a)*.21;z=math.sin(a)*.21
                curve('Wrought lantern cage',[(x,.66,z),(x*1.1,.99,z*1.1),(x*.6,1.18,z*.6)],.019,iron,'root')
            for yy in [.65,1.05,1.17]:ring('Lantern metal rim',(0,yy,0),.21 if yy<1.1 else .13,gold,'root',axis='y')
            ring('Lantern hanging handle',(0,1.29,0),.09,iron,'head',segments=12)
        elif sig=='jelly':
            profile('Ribbed abyssal bell',[(.75,.24,.24,0),(.85,.30,.30,0),(1.02,.22,.22,0),(1.12,.08,.08,0)],coral,'root',24)
            ball('Bioluminescent lantern organ',(0,.87,0),(.16,.18,.16),glow,'root',16,10)
        elif sig in ['masks','oracle_boss']:
            ball('Suspended crystalline heart',(0,.91,0),(.13,.22,.13),glow,'root',10,8)
            for i in range(5):
                a=i*math.tau/5;x=math.cos(a)*.25;z=math.sin(a)*.25
                ball('Faceted floating porcelain mask',(x,.97,z),(.075,.12,.04),bone,'head',12,8)
                for s in [-1,1]:ball('Mask empty eye',(x+s*.025,1.00,z+.042),(.01,.013,.008),glow,'head',8,4)
            ring('Suspended engraved halo',(0,1.22,0),.30,gold,'head',axis='y',segments=20)
        else:
            for i in range(6):
                a=i*math.tau/6;x=math.cos(a)*.14;z=math.sin(a)*.14
                spike('Prismatic floating crystal',(x,.64,z),(x*.3,1.16+i%2*.12,z*.3),.087,glow,'root')
        for i in range(8):
            a=i*math.tau/8;x=math.cos(a)*.16;z=math.sin(a)*.16
            curve('Articulated floating tendril',[(x,.70,z),(x*1.3,.43,z*1.3)],.019,glow if sig=='jelly' else cloth,f'tendril_{i}')
            curve('Tendril tapered tip',[(x*1.3,.43,z*1.3),(x*1.65,.25,z*1.4),(x*1.4,.15,z*1.8)],.012,glow if sig=='jelly' else cloth,f'tip_{i}')
        if sig=='oracle_boss':
            for s in [-1,1]:
                for j in range(4):spike('Oracle prismatic wing feather',(s*.17,1.00,-.07),(s*(.45+j*.12),1.35-j*.07,-.13),.061,iron,'spine')
            for i in range(8):
                a=i*math.tau/8;spike('Oracle star crown',(math.cos(a)*.31,1.22,math.sin(a)*.31),(math.cos(a)*.40,1.40,math.sin(a)*.40),.022,gold,'head')
    return rig

def golem(spec,m):
    id,body,weapon,theme,sig=spec;iron,cloth,wood,bone,stone,coral,glow,gold=m
    rig=make_rig();bark=theme=='grove';outer=wood if bark else iron
    profile('Massive sculpted golem chest',[(.61,.20,.145,0),(.79,.27,.19,0),(1.05,.34,.18,0),(1.19,.22,.13,0)],outer,sides=16)
    for j in range(4):profile('Overlapping carved chest segment',[(.72+j*.09,.29,.20,0),(.78+j*.09,.29,.19,0)],stone,sides=12)
    ball('Inset luminous chest furnace',(0,.98,.208),(.073,.09,.025),glow,'chest',12,8)
    for s,side in [(-1,'L'),(1,'R')]:
        for y in [.24,.43,.62]:ball('Massive segmented armored leg',(s*.15,y,0),(.115,.135,.12),outer,'thigh_'+side if y>.4 else 'shin_'+side,12,8)
        plate('Wide articulated golem foot',(s*.15,.07,.055),(.23,.12,.28),stone,'foot_'+side)
        if bark:
            shoulder=profile('Angular broken tree shoulder',[(.96,.16,.15,0),(1.09,.19,.18,0),(1.26,.14,.14,-.01),(1.33,.105,.09,-.04)],wood,'upper_arm_'+side,9);shoulder.location=p(s*.30,0,0)
            for j in range(4):curve('Shoulder exposed twisting root',[(s*.22,1.22,-.06+j*.05),(s*.38,1.15,-.10+j*.05),(s*.43,.95,-.13+j*.05)],.016,gold,'upper_arm_'+side)
        else:ball('Golem shoulder layered boulder',(s*.30,1.12,0),(.18,.17,.17),outer,'upper_arm_'+side,16,10)
        tube('Golem upper arm',(s*.28,1.09,0),(s*.37,.88,0),.11,.10,stone,'upper_arm_'+side)
        tube('Golem heavy bracer',(s*.37,.86,0),(s*.38,.64,.07),.12,.13,outer,'forearm_'+side)
        ball('Massive articulated fist',(s*.38,.61,.085),(.13,.12,.13),outer,'hand_'+side,16,8)
        for f in range(4):ball('Golem individual finger',(s*.38-.07+f*.046,.55,.18),(.024,.047,.029),stone,'fingers_'+side,8,6)
        for j in range(4):spike('Shoulder branching root' if bark else 'Forged shoulder spike',(s*(.22+j*.05),1.21,0),(s*(.29+j*.065),1.43-j*.015,-.03),.038,outer,'upper_arm_'+side)
    if sig=='bell_boss':
        profile('Great engraved bell head',[(1.12,.225,.205,0),(1.17,.25,.23,0),(1.29,.19,.18,0),(1.49,.13,.13,0),(1.57,.08,.08,0)],gold,'head',24)
        for yy in [1.13,1.18,1.37]:ring('Bell engraved band',(0,yy,0),.24 if yy<1.2 else .17,iron,'head',axis='y',segments=20)
        ring('Great bell handle',(0,1.64,0),.09,iron,'head')
        for j in range(6):plate('Bell runic relief',(-.13+j*.052,1.30,.185),(.022,.08,.012),iron,'head')
    else:
        profile('Carved monolithic head',[(1.18,.105,.09,0),(1.26,.14,.105,0),(1.44,.12,.10,0),(1.51,.07,.06,0)],outer,'head',12)
        for s in [-1,1]:ball('Deep glowing golem eye',(s*.053,1.36,.108),(.025,.012,.012),glow,'head',8,6)
        tube('Monolithic nose ridge',(0,1.30,.12),(0,1.42,.115),.022,.02,stone,'head',8)
    if sig=='anvil_boss':
        plate('Iron judge anvil crown',(0,1.53,0),(.48,.15,.24),iron,'head')
        for s in [-1,1]:spike('Anvil crown horn',(s*.20,1.54,0),(s*.38,1.60,0),.075,gold,'head')
        for s in [-1,1]:
            for j in range(8):ring('Judge hanging chain',(s*.22,1.1-j*.055,.17),.025,iron,'chest',axis='z' if j%2 else 'y',segments=8,thickness=.008)
    if bark:
        for i in range(12):
            s=(-1)**i;j=i//2;curve('Carved twisting bark vein',[(s*.05,.74+j*.035,.21),(s*.17,.8+j*.035,.19),(s*.25,.83+j*.035,.13)],.011,gold,'chest')
        for s in [-1,1]:curve('Golem living branch crown',[(s*.05,1.43,0),(s*.17,1.66,0),(s*.28,1.80,-.04)],.042,wood,'head')
    if sig=='slag':
        for i in range(10):
            a=i*2.399;ball('Molten vein broken slag',(math.cos(a)*.23,.79+i*.031,math.sin(a)*.19),(.028,.067,.025),glow,'chest',8,6)
    if weapon=='hammer':
        tube('Weapon_Hammer_Heavy_Shaft',(.39,.22,.07),(.39,1.34,.07),.035,.03,wood,'hand_R')
        plate('Weapon_Hammer_Monument_Head',(.39,1.31,.07),(.54,.32,.30),iron,'hand_R')
        for s in [-1,1]:plate('Hammer engraved striking plate',(.39+s*.28,1.31,.07),(.04,.35,.34),gold,'hand_R')
        ring('Hammer oath seal',(.39,1.31,.235),.096,gold,'hand_R',segments=12)
    return rig

def creature_animation(rig,body):
    actions=[]
    for name,duration in [('idle',72),('walk',28),('attack',24),('attack_alt',24),('cast',30),('dodge',18),('hit',12),('death',42)]:
        rig.animation_data_create();action=bpy.data.actions.new(name);rig.animation_data.action=action
        for frame in range(0,duration+1,2):
            t=frame/duration;wave=math.sin(t*math.tau);pulse=math.sin(min(1,t/.72)*math.pi) if t<.72 else 0
            for b in rig.pose.bones:b.rotation_mode='XYZ';b.rotation_euler=(0,0,0);b.location=(0,0,0)
            if name=='idle':
                rig.pose.bones['spine'].rotation_euler.x=.025*wave;rig.pose.bones['head'].rotation_euler.z=.05*wave
                if body=='float':rig.pose.bones['root'].location.y=.045*wave
            elif name=='walk':
                rig.pose.bones['root'].location.y=.018*math.cos(t*math.tau*2)
                for b in rig.pose.bones:
                    if b.name.startswith(('leg_','tip_')) and body!='float':
                        _,s,i=b.name.split('_');phase=t*math.tau+int(i)*math.pi*.75+(0 if s=='1' else math.pi)
                        b.rotation_euler.x=.35*math.sin(phase);b.rotation_euler.z=.18*math.cos(phase)
                    if b.name=='tail':b.rotation_euler.y=.24*wave
            elif name in ['attack','attack_alt','cast']:
                rig.pose.bones['spine'].rotation_euler.x=-.18*pulse;rig.pose.bones['head'].rotation_euler.x=.24*pulse
                if body=='hound':rig.pose.bones['jaw'].rotation_euler.x=.65*pulse
                if body=='spider':
                    for s in [-1,1]:rig.pose.bones[f'leg_{s}_0'].rotation_euler.x=-.62*pulse;rig.pose.bones[f'tip_{s}_0'].rotation_euler.x=.32*pulse
                if body=='float':rig.pose.bones['root'].location.y=.12*pulse
            elif name=='hit':rig.pose.bones['root'].rotation_euler.x=.18*math.sin(t*math.pi)
            elif name=='dodge':rig.pose.bones['root'].location.y=-.13*math.sin(t*math.pi)
            elif name=='death':rig.pose.bones['root'].rotation_euler.z=1.15*t;rig.pose.bones['root'].location.y=-.30*t
            if body=='float':
                for i in range(8):
                    rig.pose.bones[f'tendril_{i}'].rotation_euler.x=.18*math.sin(t*math.tau+i*.6)
                    rig.pose.bones[f'tip_{i}'].rotation_euler.z=.26*math.sin(t*math.tau+i*.6-.7)
            for b in rig.pose.bones:
                b.keyframe_insert('rotation_euler',frame=frame,group=b.name)
                if b.name=='root':b.keyframe_insert('location',frame=frame,group=b.name)
        action.use_fake_user=True;actions.append(action)
    rig.animation_data.action=None
    for action in actions:
        track=rig.animation_data.nla_tracks.new();track.name=action.name;track.strips.new(action.name,0,action);track.mute=True
    return actions

def patch_draw(rig,actions):
    b=rig.pose.bones.get('bow_draw')
    if not b:return
    for action in actions:
        if action.name not in ['attack','attack_alt']:continue
        rig.animation_data.action=action
        for frame,f in [(0,0),(6,1),(9,1),(11,0),(24,0),(28,0)]:
            # Bow draw local Y follows arrow shaft, preserving string endpoints.
            b.location=(0,-.22*f,0);b.keyframe_insert('location',frame=frame,group='bow_draw')
    rig.animation_data.action=None;b.location=(0,0,0)

def externalize(path,directory):
    raw=path.read_bytes();n=struct.unpack_from('<I',raw,12)[0];doc=json.loads(raw[20:20+n]);binary=raw[28+n:]
    # Exporter may omit texture through its vertex-color multiply node. Restore
    # canonical PBR surface slots and external URIs explicitly, then remove all
    # embedded image data while preserving exact accessor slices.
    doc['images']=[{'uri':('../' if directory else '')+key+'.png'} for key in ['color','normal','roughmetal','emission']]
    doc['samplers']=[{'magFilter':9729,'minFilter':9987,'wrapS':10497,'wrapT':10497}]
    doc['textures']=[{'sampler':0,'source':i} for i in range(4)]
    doc['materials']=[{'name':'Original shared bestiary PBR','pbrMetallicRoughness':{'baseColorTexture':{'index':0},'metallicRoughnessTexture':{'index':2},'metallicFactor':1,'roughnessFactor':1},'normalTexture':{'index':1,'scale':.45},'emissiveTexture':{'index':3},'emissiveFactor':[.20,.20,.20],'doubleSided':True}]
    used=sorted(set(a['bufferView'] for a in doc['accessors']));mapping={old:new for new,old in enumerate(used)};rebuilt=bytearray();views=[]
    for i in used:
        view=doc['bufferViews'][i].copy();start=view.get('byteOffset',0);rebuilt.extend(b'\0'*((-len(rebuilt))%4));view['byteOffset']=len(rebuilt);rebuilt.extend(binary[start:start+view['byteLength']]);views.append(view)
    for a in doc['accessors']:a['bufferView']=mapping[a['bufferView']]
    doc['bufferViews']=views;rebuilt.extend(b'\0'*((-len(rebuilt))%4));doc['buffers']=[{'byteLength':len(rebuilt)}]
    encoded=json.dumps(doc,separators=(',',':')).encode();encoded+=b' '*((-len(encoded))%4)
    path.write_bytes(struct.pack('<III',0x46546c67,2,28+len(encoded)+len(rebuilt))+struct.pack('<II',len(encoded),0x4e4f534a)+encoded+struct.pack('<II',len(rebuilt),0x004e4942)+rebuilt)
    return doc

def export(spec):
    global PARTS,WIDTHS
    id,body,weapon,theme,sig=spec;PARTS=[];WIDTHS['enemy']=1.2 if body=='golem' else 1
    bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
    for a in list(bpy.data.actions):bpy.data.actions.remove(a)
    mats=materials(theme);rig=humanoid(spec,mats) if body=='humanoid' else creature(spec,mats)
    parts=list(dict.fromkeys(re.sub(r'\.\d+$','',ob.name) for ob in PARTS))
    bpy.ops.object.select_all(action='DESELECT')
    for ob in PARTS:ob.select_set(True)
    bpy.context.view_layer.objects.active=PARTS[0];bpy.ops.object.join();mesh=bpy.context.object;mesh.name=id+'_AuthoredBody'
    bpy.ops.object.transform_apply(location=True,rotation=True,scale=True);unify(mesh)
    mesh['parts']=parts;mesh['weapon']=weapon;mesh['anatomy']=body;mesh['enemyId']=id
    modifier=mesh.modifiers.new('Authored skeletal deformation','ARMATURE');modifier.object=rig;mesh.parent=rig
    actions=animate(rig,'ranger' if weapon=='bow' else 'wraith' if weapon in ['staff','orb'] else 'warden') if body in ['humanoid','golem'] else creature_animation(rig,body)
    patch_draw(rig,actions)
    if weapon=='bow':
        for original,name in [(actions[2],'shoot'),(actions[3],'shoot_alt')]:
            action=original.copy();action.name=name;action.use_fake_user=True;actions.append(action)
            track=rig.animation_data.nla_tracks.new();track.name=name;track.strips.new(name,0,action);track.mute=True
    bpy.context.scene.render.fps=30;bpy.context.scene.frame_set(0)
    for b in rig.pose.bones:b.rotation_euler=(0,0,0);b.location=(0,0,0)
    bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE/(id+'.blend')),compress=True)
    records=[]
    for detail in ['high','low']:
        if detail=='low':
            bpy.context.view_layer.objects.active=mesh;mesh.data.calc_loop_triangles()
            dec=mesh.modifiers.new('Performance silhouette budget','DECIMATE');dec.ratio=min(1,1800/len(mesh.data.loop_triangles));dec.use_collapse_triangulate=True
            bpy.ops.object.modifier_move_to_index(modifier=dec.name,index=0);bpy.ops.object.modifier_apply(modifier=dec.name)
        output=OUT/('lod' if detail=='low' else '')/(id+'.glb')
        bpy.ops.export_scene.gltf(filepath=str(output),export_format='GLB',export_yup=True,export_animations=True,export_animation_mode='ACTIONS',export_frame_range=False,export_force_sampling=True,export_optimize_animation_size=True,export_frame_step=4,export_skins=True,export_def_bones=True,export_all_influences=False,export_materials='EXPORT',export_image_format='AUTO',export_apply=False,export_tangents=False,export_extras=True)
        compact_glb(str(output));doc=externalize(output,detail=='low')
        mesh.data.calc_loop_triangles()
        records.append({'id':id,'detail':detail,'body':body,'weapon':weapon,'theme':theme,'signature':sig,'triangles':len(mesh.data.loop_triangles),'bones':len(rig.data.bones),'clips':[a['name'] for a in doc['animations']],'parts':parts,'bytes':output.stat().st_size,'sha256':hashlib.sha256(output.read_bytes()).hexdigest()})
    print('ENEMY_COMPLETE',id,[(r['detail'],r['triangles'],r['bytes']) for r in records],flush=True);return records
records=[]
for spec in SPECS:
    if os.environ.get('RUNIC_ENEMY') and os.environ['RUNIC_ENEMY']!=spec[0]:continue
    records.extend(export(spec))
manifest={'generator':'Blender 4.5.3 / scripts/build-enemy-assets.py','license':'CC0-1.0','original':True,'coordinates':'+Y up, +Z forward; gameplay owns movement','textureSize':1024,'surfaceTextures':['color.png','normal.png','roughmetal.png','emission.png'],'surfaceAssets':[{'file':name+'.png','bytes':(OUT/(name+'.png')).stat().st_size,'sha256':hashlib.sha256((OUT/(name+'.png')).read_bytes()).hexdigest()} for name in ['color','normal','roughmetal','emission']],'assets':records}
(OUT/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
print('BESTIARY_COMPLETE',len(records),sum(r['bytes'] for r in records),flush=True)
