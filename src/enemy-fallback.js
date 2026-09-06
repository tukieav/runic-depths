import * as THREE from 'three';
import { enemyPresentation } from './enemy-presentation.js';

// Small articulated stand-ins preserve the bestiary's combat language while
// authored assets stream or fail. Geometry/materials are shared across actors.
const G = {
  sphere: new THREE.SphereGeometry(1, 12, 8),
  box: new THREE.BoxGeometry(1, 1, 1),
  cylinder: new THREE.CylinderGeometry(1, 1, 1, 8),
  cone: new THREE.ConeGeometry(1, 1, 8),
  gem: new THREE.OctahedronGeometry(1),
  ring: new THREE.TorusGeometry(1, 0.06, 5, 24),
};
const materials = new Map();
function material(color, metal = false, glow = false) {
  const key = `${color}:${metal}:${glow}`;
  if (!materials.has(key))
    materials.set(
      key,
      new THREE.MeshStandardMaterial({
        color,
        roughness: metal ? 0.4 : 0.84,
        metalness: metal ? 0.7 : 0,
        emissive: glow ? color : 0,
        emissiveIntensity: glow ? 1.5 : 0,
      }),
    );
  return materials.get(key);
}

export function createEnemyFallback(type) {
  const p = enemyPresentation(type);
  if (!p) return null;
  const root = new THREE.Group();
  root.name = `fallback-${type}`;
  root.userData.fallback = true;
  root.userData.weapon = p.weapon;
  const body = new THREE.Group();
  root.add(body);
  const m = Object.fromEntries(
    Object.entries(p.palette).map(([k, v]) => [
      k,
      material(v, k === 'armor' || k === 'accent', k === 'glow'),
    ]),
  );
  const mesh = (parent, geometry, mat, name, position, scale) => {
    const node = new THREE.Mesh(G[geometry], mat);
    node.name = name;
    node.position.set(...position);
    node.scale.set(...scale);
    node.castShadow = true;
    node.receiveShadow = true;
    parent.add(node);
    return node;
  };
  const joint = (parent, name, position) => {
    const group = new THREE.Group();
    group.name = name;
    group.position.set(...position);
    parent.add(group);
    return group;
  };
  const legs = [],
    arms = [];
  let bowString, bowArrow, head, weapon;
  if (p.body === 'spider') {
    mesh(body, 'sphere', m.body, 'segmented-abdomen', [0, 0.51, -0.24], [0.32, 0.27, 0.43]);
    mesh(body, 'sphere', m.armor, 'thorax', [0, 0.44, 0.27], [0.24, 0.21, 0.25]);
    for (const side of [-1, 1]) {
      for (let i = 0; i < 4; i++) {
        const leg = joint(body, `leg-${side}-${i}`, [side * 0.19, 0.42, -0.39 + i * 0.22]);
        leg.rotation.z = side * 0.65;
        mesh(
          leg,
          'cylinder',
          m.armor,
          'upper-leg',
          [side * 0.2, 0, 0],
          [0.045, 0.4, 0.045],
        ).rotation.z = Math.PI / 2;
        const knee = joint(leg, 'knee', [side * 0.4, 0, 0]);
        mesh(
          knee,
          'cone',
          m.body,
          'lower-leg',
          [side * 0.07, -0.2, 0],
          [0.047, 0.45, 0.047],
        ).rotation.z = side * -0.3;
        legs.push({ node: leg, knee, side, phase: (i * Math.PI) / 2, rest: leg.rotation.z });
      }
      mesh(
        body,
        'cone',
        m.accent,
        'mandible',
        [side * 0.14, 0.33, 0.51],
        [0.055, 0.24, 0.07],
      ).rotation.x = 1.5;
      mesh(body, 'sphere', m.glow, 'eyes', [side * 0.085, 0.51, 0.45], [0.045, 0.035, 0.03]);
    }
    if (p.attackStyle === 'cast')
      for (let i = 0; i < 5; i++)
        mesh(
          body,
          'sphere',
          m.glow,
          'spore-sac',
          [Math.sin(i * 2) * 0.22, 0.67, -0.28 + i * 0.05],
          [0.07, 0.075, 0.07],
        );
  } else if (p.body === 'hound') {
    mesh(body, 'sphere', m.body, 'ribcage', [0, 0.63, -0.04], [0.24, 0.3, 0.47]);
    head = joint(body, 'head', [0, 0.7, 0.37]);
    mesh(head, 'sphere', m.armor, 'skull', [0, 0.02, 0.08], [0.2, 0.2, 0.23]);
    mesh(head, 'box', m.body, 'muzzle', [0, -0.05, 0.31], [0.25, 0.17, 0.3]);
    for (const side of [-1, 1]) {
      mesh(head, 'cone', m.armor, 'ear', [side * 0.14, 0.23, 0], [0.075, 0.25, 0.07]);
      mesh(head, 'sphere', m.glow, 'eye', [side * 0.16, 0.07, 0.2], [0.035, 0.04, 0.03]);
      for (let i = 0; i < 3; i++)
        mesh(
          head,
          'cone',
          m.accent,
          'fang',
          [side * 0.095, -0.16, 0.21 + i * 0.07],
          [0.02, 0.09, 0.023],
        ).rotation.x = Math.PI;
      for (const z of [-0.3, 0.29]) {
        const leg = joint(body, `leg-${side}-${z}`, [side * 0.19, 0.52, z]);
        mesh(leg, 'cylinder', m.body, 'upper-leg', [0, -0.14, 0], [0.07, 0.29, 0.075]);
        const knee = joint(leg, 'knee', [0, -0.27, 0]);
        mesh(knee, 'cylinder', m.armor, 'lower-leg', [0, -0.1, 0.02], [0.045, 0.23, 0.05]);
        mesh(knee, 'box', m.body, 'paw', [0, -0.2, 0.075], [0.12, 0.09, 0.18]);
        legs.push({
          node: leg,
          knee,
          side,
          phase: (z < 0 ? Math.PI : 0) + (side < 0 ? Math.PI : 0),
        });
      }
    }
    const collar = mesh(body, 'ring', m.accent, 'collar', [0, 0.64, 0.34], [0.27, 0.27, 0.27]);
    collar.rotation.y = 0;
    for (let i = 0; i < 5; i++)
      mesh(body, 'cone', m.armor, 'spinal-plate', [0, 0.88, -0.4 + i * 0.16], [0.09, 0.19, 0.08]);
  } else if (p.body === 'wisp') {
    mesh(body, 'sphere', m.glow, 'floating-core', [0, 0.92, 0], [0.17, 0.23, 0.17]);
    for (let i = 0; i < 6; i++) {
      const a = (i * Math.PI) / 3;
      mesh(
        body,
        p.theme === 'glass' ? 'gem' : 'cylinder',
        m.accent,
        'lantern-rib',
        [Math.sin(a) * 0.28, 0.92, Math.cos(a) * 0.28],
        [0.03, 0.65, 0.035],
      );
      mesh(
        body,
        'cone',
        m.cloth,
        'floating-tendril',
        [Math.sin(a) * 0.15, 0.4, Math.cos(a) * 0.15],
        [0.05, 0.5, 0.045],
      ).rotation.x = Math.PI;
    }
    for (const y of [0.61, 1.24])
      mesh(body, 'ring', m.armor, 'lantern-ring', [0, y, 0], [0.3, 0.3, 0.3]).rotation.x =
        Math.PI / 2;
  } else {
    const broad = p.body === 'golem' ? 1.5 : 1;
    mesh(body, 'sphere', m.body, 'torso', [0, 0.9, 0], [0.26 * broad, 0.37, 0.18 * broad]);
    mesh(body, 'box', m.armor, 'breastplate', [0, 0.96, 0.13], [0.43 * broad, 0.39, 0.14]);
    mesh(body, 'sphere', m.armor, 'helmet', [0, 1.43, 0], [0.18 * broad, 0.22, 0.17]);
    mesh(body, 'box', m.cloth, 'visor', [0, 1.45, 0.157], [0.23, 0.075, 0.03]);
    for (const side of [-1, 1]) {
      mesh(body, 'sphere', m.glow, 'eye', [side * 0.065, 1.45, 0.18], [0.025, 0.019, 0.015]);
      const leg = joint(body, `leg-${side}`, [side * 0.14 * broad, 0.62, 0]);
      mesh(leg, 'cylinder', m.body, 'upper-leg', [0, -0.14, 0], [0.085 * broad, 0.3, 0.09]);
      const knee = joint(leg, 'knee', [0, -0.29, 0]);
      mesh(knee, 'cylinder', m.armor, 'greave', [0, -0.13, 0], [0.07 * broad, 0.27, 0.075]);
      mesh(knee, 'box', m.armor, 'boot', [0, -0.24, 0.07], [0.17 * broad, 0.11, 0.25]);
      legs.push({ node: leg, knee, side, phase: side < 0 ? Math.PI : 0 });
      const arm = joint(body, `arm-${side}`, [side * 0.3 * broad, 1.13, 0]);
      mesh(arm, 'sphere', m.armor, 'pauldron', [0, 0, 0], [0.14 * broad, 0.15, 0.15]);
      mesh(arm, 'cylinder', m.body, 'upper-arm', [0, -0.14, 0], [0.07 * broad, 0.27, 0.075]);
      const elbow = joint(arm, 'elbow', [0, -0.27, 0]);
      mesh(elbow, 'cylinder', m.armor, 'forearm', [0, -0.11, 0], [0.065 * broad, 0.23, 0.07]);
      mesh(elbow, 'sphere', m.body, 'hand', [0, -0.24, 0], [0.075 * broad, 0.09, 0.075]);
      arms.push({ node: arm, elbow, side });
    }
    const hand = arms[p.weapon === 'bow' ? 0 : 1].elbow;
    weapon = joint(hand, `weapon-${p.weapon}`, [0, -0.24, 0]);
    if (p.weapon === 'bow') {
      for (let i = 0; i < 12; i++) {
        const a = -0.98 + (i / 11) * 1.96;
        mesh(
          weapon,
          'cylinder',
          m.accent,
          'bow-limb',
          [0, Math.sin(a) * 0.59, Math.cos(a) * 0.24],
          [0.027, 0.12, 0.027],
        ).rotation.x = -a * 0.45;
      }
      bowString = mesh(
        weapon,
        'cylinder',
        m.cloth,
        'bow-string',
        [0, 0, 0.135],
        [0.006, 0.98, 0.006],
      );
      bowArrow = mesh(
        weapon,
        'cylinder',
        m.armor,
        'nocked-arrow',
        [0, 0, 0.25],
        [0.013, 0.65, 0.013],
      );
      bowArrow.rotation.x = Math.PI / 2;
      mesh(
        body,
        'cylinder',
        m.cloth,
        'quiver',
        [0.16, 1.04, -0.23],
        [0.09, 0.52, 0.09],
      ).rotation.z = -0.2;
      for (let i = 0; i < 4; i++)
        mesh(
          body,
          'cylinder',
          m.accent,
          'quiver-arrow',
          [0.11 + i * 0.025, 1.34, -0.24],
          [0.009, 0.35, 0.009],
        ).rotation.z = -0.2;
    } else if (p.weapon === 'staff' || p.weapon === 'trident') {
      mesh(weapon, 'cylinder', m.accent, 'staff-shaft', [0, 0.15, 0], [0.033, 1.25, 0.033]);
      if (p.weapon === 'staff')
        mesh(weapon, 'gem', m.glow, 'staff-focus', [0, 0.85, 0], [0.12, 0.19, 0.12]);
      else
        for (const x of [-0.12, 0, 0.12])
          mesh(weapon, 'cone', m.armor, 'trident-prong', [x, 0.83, 0], [0.035, 0.29, 0.035]);
    } else if (p.weapon === 'sword' || p.weapon === 'hammer') {
      mesh(weapon, 'cylinder', m.accent, 'weapon-grip', [0, 0.11, 0], [0.035, 0.47, 0.035]);
      if (p.weapon === 'sword') {
        mesh(weapon, 'box', m.armor, 'sword-blade', [0, 0.6, 0], [0.08, 0.62, 0.03]);
        mesh(weapon, 'box', m.accent, 'sword-guard', [0, 0.29, 0], [0.28, 0.045, 0.07]);
      } else mesh(weapon, 'box', m.armor, 'hammer-head', [0, 0.49, 0], [0.38, 0.24, 0.24]);
    } else if (p.weapon === 'orb')
      mesh(weapon, 'sphere', m.glow, 'casting-orb', [0, 0, 0.1], [0.13, 0.13, 0.13]);
  }
  if (p.boss)
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      mesh(
        body,
        'gem',
        m.accent,
        'boss-crown',
        [Math.sin(a) * 0.28, p.body === 'spider' ? 1.0 : 1.68, Math.cos(a) * 0.28],
        [0.055, 0.16 + (i % 2) * 0.06, 0.055],
      );
    }
  let phase = 0;
  let triangles = 0;
  root.traverse((n) => {
    if (n.isMesh)
      triangles += (n.geometry.index?.count || n.geometry.attributes.position.count) / 3;
  });
  return {
    root,
    stats: {
      id: type,
      detail: 'fallback',
      triangles,
      bones: 0,
      weapon: p.weapon,
      height: p.body === 'spider' ? 1.15 : 1.85,
      clips: [],
    },
    update(data, dt, time) {
      phase += dt * (data.moving ? 11 : 2);
      const attack = (data.attackTime || 0) > 0,
        cast = (data.castTime || 0) > 0;
      root.userData.animation = data.dead
        ? 'death'
        : cast
          ? 'cast'
          : attack
            ? p.attackStyle === 'shoot'
              ? 'shoot'
              : 'attack'
            : data.moving
              ? 'walk'
              : 'idle';
      body.rotation.z = data.dead ? Math.min(Math.PI / 2, (body.rotation.z || 0) + dt * 3) : 0;
      body.position.y = p.body === 'wisp' ? Math.sin(time * 2) * 0.06 : 0;
      for (const l of legs) {
        const stride = data.moving ? Math.sin(phase + l.phase) : 0;
        if (p.body === 'spider') {
          l.node.rotation.y = stride * 0.2;
          l.node.rotation.z = l.rest + Math.max(0, stride) * l.side * 0.18;
        } else {
          l.node.rotation.x = stride * 0.47;
          l.knee.rotation.x = Math.max(0, -stride) * 0.55;
        }
      }
      for (const arm of arms) {
        arm.node.rotation.x =
          p.weapon === 'bow' && attack
            ? -Math.PI / 2
            : cast
              ? -1.2
              : attack
                ? -1.1 + Math.sin((0.65 - data.attackTime) * 10) * 0.7
                : data.moving
                  ? Math.sin(phase + arm.side) * 0.2
                  : 0;
        arm.elbow.rotation.x =
          p.weapon === 'bow' && attack && arm.side > 0 ? -1.0 : cast ? -0.4 : 0;
      }
      if (bowString)
        bowString.position.z = 0.135 - Math.min(1, (data.rangedWindup || 0) / 0.32) * 0.13;
      if (bowArrow) bowArrow.visible = !attack || data.rangedWindup > 0;
      if (head) head.rotation.x = attack ? Math.sin(data.attackTime * 10) * 0.35 : 0;
    },
    dispose() {
      root.removeFromParent();
    },
  };
}
