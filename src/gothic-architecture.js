import * as THREE from 'three';

// Reusable modelled architectural profiles. Everything is batched into the
// existing static scene; decorations stay in wall cells, outside navigation.
const profile = new THREE.Shape();
profile.moveTo(-0.63, 0);
profile.lineTo(-0.63, 0.78);
profile.quadraticCurveTo(-0.63, 1.24, 0, 1.65);
profile.quadraticCurveTo(0.63, 1.24, 0.63, 0.78);
profile.lineTo(0.63, 0);
profile.lineTo(0.48, 0);
profile.lineTo(0.48, 0.78);
profile.quadraticCurveTo(0.48, 1.13, 0, 1.45);
profile.quadraticCurveTo(-0.48, 1.13, -0.48, 0.78);
profile.lineTo(-0.48, 0);
profile.closePath();
const arch = new THREE.ExtrudeGeometry(profile, {
  depth: 0.16,
  bevelEnabled: true,
  bevelSegments: 1,
  steps: 1,
  bevelSize: 0.025,
  bevelThickness: 0.025,
  curveSegments: 10,
});
const lancet = new THREE.Shape();
lancet.moveTo(-0.46, 0);
lancet.lineTo(-0.46, 0.77);
lancet.quadraticCurveTo(-0.46, 1.12, 0, 1.42);
lancet.quadraticCurveTo(0.46, 1.12, 0.46, 0.77);
lancet.lineTo(0.46, 0);
lancet.closePath();
const glass = new THREE.ShapeGeometry(lancet, 12);
const shaft = new THREE.LatheGeometry(
  [
    [0.28, 0],
    [0.28, 0.12],
    [0.23, 0.17],
    [0.22, 0.24],
    [0.16, 0.28],
    [0.145, 0.42],
    [0.13, 1.53],
    [0.17, 1.59],
    [0.19, 1.62],
    [0.19, 1.71],
    [0.25, 1.77],
    [0.25, 1.87],
  ].map(([x, y]) => new THREE.Vector2(x, y)),
  12,
);
const diamond = new THREE.OctahedronGeometry(1, 0);
const chainLink = new THREE.TorusGeometry(1, 0.22, 3, 8);
const rosette = new THREE.TorusGeometry(1, 0.12, 4, 12);
const chippedStone = new THREE.DodecahedronGeometry(1, 0);
const hash = (x, z, salt = 0) => {
  const value = Math.sin(x * 127.1 + z * 311.7 + salt * 74.7) * 43758.5453;
  return value - Math.floor(value);
};

// Sagging folds are modelled rather than painted on a rigid rectangle. Each
// silhouette has a different frayed edge, while sharing one batched cloth shader.
const banners = Array.from({ length: 4 }, (_, variant) => {
  const geometry = new THREE.PlaneGeometry(1, 1, 6, 8);
  const positions = geometry.attributes.position;
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i),
      y = positions.getY(i);
    const down = 0.5 - y;
    positions.setXYZ(
      i,
      x + Math.sin(down * 4 + variant) * 0.025 * down,
      y - Math.sin((x + 0.5) * Math.PI) * 0.07 - (down > 0.99 ? hash(i, variant) * 0.19 : 0),
      Math.sin(x * 24 + down * 2 + variant) * 0.035 * (0.25 + down * 0.75),
    );
  }
  geometry.computeVertexNormals();
  return geometry;
});
const roots = Array.from({ length: 4 }, (_, variant) => {
  const points = Array.from(
    { length: 6 },
    (_, i) =>
      new THREE.Vector3(
        Math.sin(i * 1.2 + variant) * 0.14 + i * 0.035,
        1 - i * 0.24,
        Math.sin(i + variant) * 0.012,
      ),
  );
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 10, 0.025, 4, false);
});

export function addGothicArchitecture({
  batch,
  geo,
  world,
  isFloor,
  wall,
  trim,
  metal,
  dark,
  surface,
}) {
  const glassColors = ['#40778c', '#506d50', '#706797', '#9e5f36', '#368d90', '#855887'];
  const chapterIndex = Math.min(5, Math.floor((world.floor - 1) / 2));
  const glow = surface.material(glassColors[chapterIndex], { emissive: 0.55, metalness: 0.1 });
  const pane = surface.material('#d4ae72', { emissive: 0.25, metalness: 0.1 });
  const wax = surface.material('#bcaa85');
  const flame = surface.material('#ffd59a', { emissive: 1.1 });
  const cloth = surface.material(
    ['#64383c', '#454c34', '#4c4260', '#6f3e2b', '#355456', '#544062'][chapterIndex],
  );
  cloth.side = THREE.DoubleSide;
  if (cloth.userData.surfaceKind !== 'cloth') surface.surfaces?.apply(cloth, 'cloth');
  const clothHem = surface.material('#9e8254', { metalness: 0.35 });
  const oxidized = surface.material('#34332f', { metalness: 0.55 });
  const rootMaterial = surface.material(chapterIndex === 4 ? '#687765' : '#534633');
  const stats = { additionalTriangles: 0, decoratedBays: 0, variants: [0, 0, 0], budget: 9000 };
  const detail = (geometry, material, position, scale, rotation) => {
    const triangles = (geometry.index?.count ?? geometry.attributes.position.count) / 3;
    if (stats.additionalTriangles + triangles > stats.budget) return;
    // Corridor mouths sometimes replace a neighboring wall tile. Check the
    // transformed footprint, including folds and roots, before dressing it.
    if (!geometry.boundingBox) geometry.computeBoundingBox();
    const transform = new THREE.Matrix4().compose(
      new THREE.Vector3(...position),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(...(rotation || [0, 0, 0]))),
      new THREE.Vector3(...scale),
    );
    const bounds = geometry.boundingBox.clone().applyMatrix4(transform);
    for (let z = Math.floor(bounds.min.z + 0.5001); z <= Math.floor(bounds.max.z + 0.4999); z++)
      for (let x = Math.floor(bounds.min.x + 0.5001); x <= Math.floor(bounds.max.x + 0.4999); x++)
        if (isFloor(x, z)) return;
    stats.additionalTriangles += triangles;
    batch.add(geometry, material, position, scale, rotation);
  };
  for (let i = 0; i < world.rooms.length; i++) {
    const room = world.rooms[i];
    for (const offset of [2, room.w - 3]) {
      // Rootbound's first alcove belongs to modelled plants. A solid memorial
      // bay at the same coordinates used to bury their geometry inside stone.
      if (chapterIndex === 1 && offset === 2) continue;
      const x = room.x + offset,
        z = room.y - 1;
      if (isFloor(x, z) || !isFloor(x, z + 1)) continue;
      const seed = hash(x, z, world.floor);
      const variant = Math.floor(seed * 3);
      stats.decoratedBays++;
      stats.variants[variant]++;
      // A stone bay and pointed stained-glass lancet on the rear wall.
      batch.add(geo.box, wall, [x, 1.08, z], [1.55, 2.16, 0.8]);
      batch.add(arch, trim, [x, 0.48, z + 0.43], [1, 1, 1]);
      batch.add(glass, dark, [x, 0.48, z + 0.435], [1, 1, 1]);
      if (variant === 0) {
        batch.add(glass, glow, [x, 0.51, z + 0.45], [0.89, 0.92, 1]);
        batch.add(geo.box, metal, [x, 1.2, z + 0.49], [0.045, 1.38, 0.035]);
        for (const y of [0.75, 1.12, 1.49]) {
          batch.add(geo.box, metal, [x, y, z + 0.49], [0.86, 0.027, 0.035]);
          for (const sx of [-1, 1])
            batch.add(diamond, pane, [x + sx * 0.22, y + 0.15, z + 0.49], [0.16, 0.18, 0.018]);
        }
      } else if (variant === 1) {
        // A sealed memorial effigy gives the eye a quiet solid mass between
        // luminous windows. The worn silhouette stays inside the blocked cell.
        detail(geo.box, wall, [x, 1.05, z + 0.35], [0.66, 1.04, 0.2]);
        detail(chippedStone, trim, [x, 1.54, z + 0.455], [0.12, 0.15, 0.035]);
        detail(geo.cone, trim, [x, 1.01, z + 0.43], [0.19, 0.8, 0.055]);
        detail(geo.box, metal, [x, 1.05, z + 0.48], [0.035, 0.62, 0.018], [0, 0, -0.14]);
        detail(geo.box, metal, [x, 1.27, z + 0.48], [0.27, 0.025, 0.02]);
        for (let line = 0; line < 3; line++)
          detail(
            geo.box,
            dark,
            [x, 0.65 + line * 0.054, z + 0.456],
            [0.26 - line * 0.04, 0.012, 0.012],
          );
      } else {
        detail(banners[Math.floor(seed * 29) % 4], cloth, [x, 1.12, z + 0.451], [0.72, 1.08, 1]);
        detail(geo.box, oxidized, [x, 1.71, z + 0.45], [0.88, 0.04, 0.045]);
        detail(diamond, clothHem, [x, 1.26, z + 0.491], [0.105, 0.17, 0.008]);
        for (const sx of [-1, 1]) {
          detail(geo.box, clothHem, [x + sx * 0.23, 1.23, z + 0.491], [0.016, 0.57, 0.008]);
          detail(chainLink, oxidized, [x + sx * 0.3, 1.7, z + 0.46], [0.035, 0.057, 0.026]);
        }
      }
      for (const sx of [-1, 1]) {
        batch.add(shaft, trim, [x + sx * 0.76, 0.02, z + 0.35], [1, 1, 1]);
        batch.add(geo.cone, wall, [x + sx * 0.76, 2.01, z + 0.35], [0.25, 0.3, 0.25]);
      }
      batch.add(geo.box, trim, [x, 0.4, z + 0.5], [1.6, 0.12, 0.46]);
      // Broken ledge fragments and mortar chips vary density, pose and scale.
      // Their front edge is behind z+.5: no apparent new navigation obstacle.
      for (let chip = 0; chip < 3 + Math.floor(seed * 5); chip++) {
        const r = hash(x + chip, z, 19 + world.floor);
        detail(
          chippedStone,
          chip % 3 ? wall : trim,
          [x - 0.62 + r * 1.22, 0.04 + r * 0.035, z + 0.25 + hash(x, chip) * 0.1],
          [0.045 + r * 0.06, 0.035 + r * 0.04, 0.035 + r * 0.045],
          [r * 0.6, r * 4, r * 0.7],
        );
      }
      if (i % 3 === 0 && offset === 2) {
        // A carved rose and clustered finial mark selected bays as focal points.
        detail(rosette, trim, [x, 2.24, z + 0.38], [0.25, 0.25, 0.1]);
        for (let petal = 0; petal < 6; petal++) {
          const angle = (petal * Math.PI) / 3;
          detail(
            diamond,
            metal,
            [x + Math.cos(angle) * 0.145, 2.24 + Math.sin(angle) * 0.145, z + 0.4],
            [0.055, 0.095, 0.025],
            [0, 0, angle],
          );
        }
        detail(diamond, pane, [x, 2.24, z + 0.405], [0.075, 0.075, 0.025]);
      }
      if ([1, 4, 5].includes(chapterIndex)) {
        const side = seed > 0.5 ? 1 : -1;
        for (let root = 0; root < 2; root++) {
          detail(
            roots[(i + root) % 4],
            rootMaterial,
            [x + side * (0.39 + root * 0.18), 0.77, z + 0.459],
            [side * (0.75 + root * 0.3), 1.14 + seed * 0.3, 1],
          );
        }
        if (chapterIndex === 4)
          for (let shell = 0; shell < 3; shell++)
            detail(
              diamond,
              rootMaterial,
              [x + 0.49 + shell * 0.035, 0.53 + shell * 0.05, z + 0.43],
              [0.06, 0.05, 0.035],
            );
      } else if (seed > 0.35) {
        const side = seed > 0.7 ? 1 : -1;
        for (let link = 0; link < 7; link++) {
          detail(
            chainLink,
            oxidized,
            [x + side * (0.48 + 0.025 * Math.sin(link * 0.4)), 1.77 - link * 0.085, z + 0.445],
            [0.026, 0.043, 0.025],
            [0, link % 2 ? Math.PI / 3 : 0, side * 0.08],
          );
        }
        detail(chippedStone, metal, [x + side * 0.48, 1.12, z + 0.44], [0.055, 0.08, 0.045]);
      }
    }
    // Fragments deliberately placed outside walkable tiles, with narrow ledges
    // and candle clusters making each room read as an inhabited ruin.
    const x = room.x - 1,
      z = room.y + Math.min(room.h - 2, 3);
    if (!isFloor(x, z) && isFloor(x + 1, z)) {
      batch.add(shaft, wall, [x + 0.38, 0, z], [1.3, 0.62, 1.3]);
      batch.add(geo.box, trim, [x + 0.38, 1.19, z], [0.8, 0.13, 0.8], [0, 0.12, 0]);
      for (let c = 0; c < 3; c++) {
        const h = 0.22 + c * 0.07;
        batch.add(
          geo.cylinder,
          wax,
          [x + 0.35 + (c - 1) * 0.17, 1.26 + h / 2, z + 0.06 * (c % 2)],
          [0.05, h, 0.05],
        );
        batch.add(
          diamond,
          flame,
          [x + 0.35 + (c - 1) * 0.17, 1.3 + h, z + 0.06 * (c % 2)],
          [0.025, 0.075, 0.025],
        );
      }
    }
  }
  surface.architectureStats = stats;
}
