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
  for (let i = 0; i < world.rooms.length; i++) {
    const room = world.rooms[i];
    for (const offset of [2, room.w - 3]) {
      const x = room.x + offset,
        z = room.y - 1;
      if (isFloor(x, z) || !isFloor(x, z + 1)) continue;
      // A stone bay and pointed stained-glass lancet on the rear wall.
      batch.add(geo.box, wall, [x, 1.08, z], [1.55, 2.16, 0.8]);
      batch.add(arch, trim, [x, 0.48, z + 0.43], [1, 1, 1]);
      batch.add(glass, dark, [x, 0.48, z + 0.435], [1, 1, 1]);
      batch.add(glass, glow, [x, 0.51, z + 0.45], [0.89, 0.92, 1]);
      batch.add(geo.box, metal, [x, 1.2, z + 0.49], [0.045, 1.38, 0.035]);
      for (const y of [0.75, 1.12, 1.49]) {
        batch.add(geo.box, metal, [x, y, z + 0.49], [0.86, 0.027, 0.035]);
        for (const sx of [-1, 1])
          batch.add(diamond, pane, [x + sx * 0.22, y + 0.15, z + 0.49], [0.16, 0.18, 0.018]);
      }
      for (const sx of [-1, 1]) {
        batch.add(shaft, trim, [x + sx * 0.76, 0.02, z + 0.35], [1, 1, 1]);
        batch.add(geo.cone, wall, [x + sx * 0.76, 2.01, z + 0.35], [0.25, 0.3, 0.25]);
      }
      batch.add(geo.box, trim, [x, 0.4, z + 0.5], [1.6, 0.12, 0.46]);
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
          pane,
          [x + 0.35 + (c - 1) * 0.17, 1.26 + h / 2, z + 0.06 * (c % 2)],
          [0.05, h, 0.05],
        );
        batch.add(
          diamond,
          glow,
          [x + 0.35 + (c - 1) * 0.17, 1.3 + h, z + 0.06 * (c % 2)],
          [0.025, 0.075, 0.025],
        );
      }
    }
  }
}
