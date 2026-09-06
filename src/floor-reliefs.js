import * as THREE from 'three';

// Stone-cut radial mosaics. Every surface is flush with the existing floor;
// segmented borders and pointed petals give the inlay a carved silhouette.
function sector(inner, outer, start, span) {
  const points = [];
  const steps = Math.max(3, Math.ceil(span * 18));
  for (let i = 0; i <= steps; i++) {
    const a = start + (span * i) / steps;
    points.push(new THREE.Vector2(Math.cos(a) * outer, Math.sin(a) * outer));
  }
  for (let i = steps; i >= 0; i--) {
    const a = start + (span * i) / steps;
    points.push(new THREE.Vector2(Math.cos(a) * inner, Math.sin(a) * inner));
  }
  return new THREE.ShapeGeometry(new THREE.Shape(points));
}
const sectors = Array.from({ length: 16 }, (_, i) =>
  sector(0.86, 1, (i * Math.PI) / 8 + 0.015, Math.PI / 8 - 0.03),
);
const innerBorder = new THREE.RingGeometry(0.49, 0.51, 64);
const outerBorder = new THREE.RingGeometry(1.015, 1.027, 64);
const petal = new THREE.Shape();
petal.moveTo(0, 0.12);
petal.bezierCurveTo(-0.19, 0.39, -0.14, 0.61, 0, 0.81);
petal.bezierCurveTo(0.14, 0.61, 0.19, 0.39, 0, 0.12);
const leaf = new THREE.ShapeGeometry(petal, 10);
const heart = new THREE.CircleGeometry(0.105, 12);
const crack = new THREE.Shape();
crack.moveTo(0, 0);
crack.lineTo(0.014, 0.23);
crack.lineTo(-0.035, 0.42);
crack.lineTo(0.02, 0.65);
crack.lineTo(-0.02, 0.45);
crack.lineTo(0.036, 0.24);
crack.closePath();
const fracture = new THREE.ShapeGeometry(crack);

export function addFloorRelief({ batch, surface, x, z, size, voidTheme = false, seed = 0 }) {
  const pale = surface.stoneMaterial(voidTheme ? '#655d75' : '#888a92', 'runestone');
  const dark = surface.stoneMaterial(voidTheme ? '#34323e' : '#41495a', 'flagstone');
  const border = surface.stoneMaterial(voidTheme ? '#918b8d' : '#988566', 'metal');
  const cut = surface.material('#24252c');
  for (let i = 0; i < 16; i++) {
    if (voidTheme && (i + seed) % 7 === 0) continue;
    batch.add(
      sectors[i],
      i % 2 ? dark : pale,
      [x, 0.007, z],
      [size, size, 1],
      [-Math.PI / 2, 0, 0],
    );
  }
  batch.add(innerBorder, border, [x, 0.01, z], [size, size, 1], [-Math.PI / 2, 0, 0]);
  batch.add(outerBorder, border, [x, 0.009, z], [size, size, 1], [-Math.PI / 2, 0, 0]);
  for (let i = 0; i < 8; i++) {
    const angle = (i * Math.PI) / 4 + (voidTheme ? 0.13 : 0);
    batch.add(leaf, i % 2 ? pale : dark, [x, 0.008, z], [size, size, 1], [-Math.PI / 2, 0, angle]);
    if ((i + seed) % 3 === 0)
      batch.add(
        fracture,
        cut,
        [x + Math.sin(angle) * size * 0.2, 0.013, z + Math.cos(angle) * size * 0.2],
        [size * 0.8, size, 1],
        [-Math.PI / 2, 0, angle],
      );
  }
  batch.add(heart, border, [x, 0.012, z], [size, size, 1], [-Math.PI / 2, 0, 0]);
}
