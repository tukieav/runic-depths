import * as THREE from 'three';

// A tapered, curved blade ribbon and ballistic embers. Generated geometry is
// owned by each short-lived effect; no textures, loading or gameplay changes.
export function createCombatPresentation(type, tint) {
  const group = new THREE.Group();
  const points = [],
    colors = [],
    seeds = [];
  const color = new THREE.Color(tint).multiplyScalar(2.3);
  const count = type === 'hit' ? 18 : type === 'slash' ? 12 : 28;
  for (let i = 0; i < count; i++) {
    const a = i * 2.399963;
    seeds.push([Math.cos(a), Math.sin(a), 0.4 + ((i * 17) % 23) / 23]);
    points.push(0, 0, 0);
    colors.push(color.r, color.g, color.b);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  const material = new THREE.ShaderMaterial({
    uniforms: { opacity: { value: 1 }, size: { value: 4 } },
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: `uniform float size; varying vec3 sparkColor; void main(){ sparkColor=color; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);gl_PointSize=size;}`,
    fragmentShader: `uniform float opacity; varying vec3 sparkColor; void main(){float r=length(gl_PointCoord-.5)*2.;float a=(1.-smoothstep(.05,1.,r))*opacity;gl_FragColor=vec4(sparkColor,a);}`,
  });
  const sparks = new THREE.Points(geometry, material);
  sparks.frustumCulled = false;
  sparks.userData.ownedGeometry = sparks.userData.ownedMaterial = true;
  group.add(sparks);
  let ribbon;
  if (type === 'slash') {
    const positions = [],
      shades = [],
      indices = [];
    const segments = 36;
    for (let i = 0; i <= segments; i++) {
      const t = i / segments,
        a = -0.95 + t * 2.55;
      const width = Math.sin(Math.PI * t) * 0.24;
      for (let side = 0; side < 2; side++) {
        const radius = 0.85 + (side ? width : -width * 0.35);
        positions.push(Math.sin(a) * radius, 0.34 + Math.cos(a) * 0.13, Math.cos(a) * radius);
        const glow = Math.sin(Math.PI * t) * (side ? 0.7 : 1.8);
        shades.push(color.r * glow, color.g * glow, color.b * glow);
      }
      if (i < segments) {
        const n = i * 2;
        indices.push(n, n + 1, n + 2, n + 1, n + 3, n + 2);
      }
    }
    const ribbonGeometry = new THREE.BufferGeometry();
    ribbonGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    ribbonGeometry.setAttribute('color', new THREE.Float32BufferAttribute(shades, 3));
    ribbonGeometry.setIndex(indices);
    ribbon = new THREE.Mesh(
      ribbonGeometry,
      new THREE.MeshBasicMaterial({
        vertexColors: true,
        transparent: true,
        opacity: 0.8,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    ribbon.userData.ownedGeometry = ribbon.userData.ownedMaterial = true;
    group.add(ribbon);
  }
  return {
    group,
    update(progress, reduced) {
      const p = Math.max(0, Math.min(1, progress));
      const travel = reduced ? 0.22 : 0.08 + p * 0.9;
      const position = geometry.attributes.position;
      seeds.forEach(([x, z, speed], i) =>
        position.setXYZ(
          i,
          x * travel * speed,
          0.15 + Math.max(0, p * 1.8 * speed - p * p * 0.9),
          z * travel * speed,
        ),
      );
      position.needsUpdate = true;
      material.uniforms.opacity.value = (1 - p) * (type === 'hit' ? 1 : 0.75);
      material.uniforms.size.value =
        (type === 'hit' ? 4 : 3) * Math.min(devicePixelRatio || 1, 1.5);
      if (ribbon) {
        ribbon.material.opacity = (1 - p) * 0.72;
        ribbon.rotation.y = reduced ? 0 : p * 0.48;
      }
    },
  };
}
