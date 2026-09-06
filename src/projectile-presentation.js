import * as THREE from 'three';

const G = {
  shaft: new THREE.CylinderGeometry(1, 1, 1, 6),
  head: new THREE.ConeGeometry(1, 1, 4),
  feather: new THREE.BoxGeometry(1, 1, 1),
  sphere: new THREE.SphereGeometry(1, 10, 7),
  shard: new THREE.OctahedronGeometry(1),
  ring: new THREE.TorusGeometry(1, 0.065, 5, 18),
};

export function createProjectilePresentation(renderer, data) {
  const root = new THREE.Group();
  const kind = data.kind || 'arcane';
  root.name = `projectile-${kind}`;
  root.userData.projectileKind = kind;
  root.userData.sourceType = data.sourceType;
  const color = data.color || '#b4dcff';
  const glow = renderer.material(color, { emissive: 2 });
  const soft = renderer.material(color, { basic: true, transparent: true, opacity: 0.42 });
  const mesh = (name, geometry, material, position, scale) => {
    const node = renderer.mesh(G[geometry], material, position, scale, root);
    node.name = name;
    node.castShadow = false;
    return node;
  };
  if (kind === 'arrow') {
    mesh(
      'arrow-shaft',
      'shaft',
      renderer.material('#987654'),
      [0, 0, 0],
      [0.016, 0.78, 0.016],
    ).rotation.x = Math.PI / 2;
    mesh(
      'arrow-head',
      'head',
      data.sourceType === 'ember_channeler'
        ? glow
        : renderer.material('#c5c8c5', { metalness: 0.65 }),
      [0, 0, 0.44],
      [0.057, 0.16, 0.025],
    ).rotation.x = Math.PI / 2;
    for (const angle of [0, Math.PI / 2]) {
      const feather = mesh(
        'arrow-fletching',
        'feather',
        renderer.material(data.enemy ? '#ccb992' : '#9fb7a3'),
        [0, 0, -0.3],
        [0.13, 0.012, 0.18],
      );
      feather.rotation.z = angle;
    }
    if (data.sourceType === 'ember_channeler')
      mesh('ember-arrow-tip', 'sphere', soft, [0, 0, 0.42], [0.065, 0.065, 0.1]);
  } else if (kind === 'spore') {
    mesh('spore-seed', 'sphere', glow, [0, 0, 0], [0.095, 0.105, 0.11]);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      mesh(
        'spore-grain',
        'sphere',
        soft,
        [Math.sin(a) * 0.12, Math.cos(a) * 0.12, -0.12 - i * 0.025],
        [0.04, 0.04, 0.045],
      );
    }
  } else if (kind === 'prism') {
    mesh('prism-crystal', 'shard', glow, [0, 0, 0.05], [0.095, 0.095, 0.28]);
    for (const side of [-1, 1])
      mesh('prism-splinter', 'shard', soft, [side * 0.12, 0, -0.12], [0.035, 0.05, 0.14]);
  } else if (kind === 'tide') {
    mesh('tide-pearl', 'sphere', glow, [0, 0, 0.05], [0.11, 0.11, 0.14]);
    for (let i = 0; i < 3; i++)
      mesh(
        'tide-ripple',
        'ring',
        soft,
        [0, 0, -0.11 * i],
        [0.12 + i * 0.025, 0.12 + i * 0.025, 0.12],
      );
  } else if (kind === 'thorn') {
    mesh('thorn-spine', 'head', glow, [0, 0, 0.1], [0.07, 0.43, 0.06]).rotation.x = Math.PI / 2;
    for (const side of [-1, 1])
      mesh('thorn-barb', 'head', soft, [side * 0.05, 0, -0.02], [0.03, 0.18, 0.03]).rotation.z =
        side * -0.5;
  } else if (kind === 'void') {
    mesh('void-core', 'sphere', renderer.material('#190e2c'), [0, 0, 0], [0.13, 0.13, 0.13]);
    for (const angle of [-0.65, 0.65])
      mesh('void-orbit', 'ring', glow, [0, 0, 0], [0.17, 0.17, 0.17]).rotation.y = angle;
    mesh('void-wake', 'shard', soft, [0, 0, -0.22], [0.07, 0.07, 0.2]);
  } else {
    mesh(
      kind === 'soul' ? 'soul-flame' : 'arcane-core',
      kind === 'soul' ? 'sphere' : 'shard',
      glow,
      [0, 0, 0],
      [0.085, 0.1, 0.18],
    );
    mesh('magic-wake', 'head', soft, [0, 0, -0.23], [0.075, 0.38, 0.075]).rotation.x = -Math.PI / 2;
  }
  return { root };
}

export function projectileHeight(data) {
  const travelled = Math.hypot(
    data.x - (data.originX ?? data.x),
    data.y - (data.originY ?? data.y),
  );
  const t = Math.min(1, travelled / Math.max(0.1, data.aimDistance || 1));
  return THREE.MathUtils.lerp(data.sourceHeight || 0.7, 0.8, t);
}
