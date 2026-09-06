// Original sculptural dungeon props, authored in Three.js and exported to glTF 2.
// Run: node scripts/build-surface-props.mjs
import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

globalThis.FileReader = class {
  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then((buffer) => {
      this.result = buffer;
      this.onloadend?.();
    });
  }
  readAsDataURL(blob) {
    blob.arrayBuffer().then((buffer) => {
      this.result = `data:${blob.type};base64,${Buffer.from(buffer).toString('base64')}`;
      this.onloadend?.();
    });
  }
};

const out = new URL('../assets/props/', import.meta.url);
mkdirSync(out, { recursive: true });
const materials = {
  stone: new THREE.MeshStandardMaterial({
    name: 'surface.flagstone',
    color: '#9d998b',
    roughness: 0.9,
  }),
  dark: new THREE.MeshStandardMaterial({
    name: 'surface.masonry',
    color: '#4d555c',
    roughness: 0.92,
  }),
  pale: new THREE.MeshStandardMaterial({
    name: 'surface.flagstone.pale',
    color: '#c0b49b',
    roughness: 0.9,
  }),
  metal: new THREE.MeshStandardMaterial({
    name: 'surface.metal',
    color: '#b29a62',
    roughness: 0.5,
    metalness: 0.7,
  }),
  cloth: new THREE.MeshStandardMaterial({
    name: 'surface.cloth',
    color: '#625169',
    roughness: 0.96,
  }),
  paper: new THREE.MeshStandardMaterial({ name: 'vellum', color: '#c7b18a', roughness: 0.94 }),
  wax: new THREE.MeshStandardMaterial({ name: 'wax', color: '#ddd1a1', roughness: 0.76 }),
  fire: new THREE.MeshStandardMaterial({
    name: 'candle-flame',
    color: '#ffc35d',
    emissive: '#ff8b2c',
    emissiveIntensity: 1.8,
    roughness: 1,
  }),
  wick: new THREE.MeshStandardMaterial({ name: 'wick', color: '#493b30', roughness: 1 }),
};

function mesh(parent, geometry, material, position, scale = [1, 1, 1], rotation = [0, 0, 0]) {
  const result = new THREE.Mesh(geometry, materials[material]);
  result.position.set(...position);
  result.scale.set(...scale);
  result.rotation.set(...rotation);
  parent.add(result);
  return result;
}
function box(parent, material, p, s, radius = 0.025, r = [0, 0, 0]) {
  return mesh(parent, new RoundedBoxGeometry(...s, 1, radius), material, p, [1, 1, 1], r);
}
function cylinder(
  parent,
  material,
  p,
  radiusTop,
  radiusBottom,
  height,
  r = [0, 0, 0],
  segments = 10,
) {
  return mesh(
    parent,
    new THREE.CylinderGeometry(radiusTop, radiusBottom, height, segments),
    material,
    p,
    [1, 1, 1],
    r,
  );
}
function sphere(parent, material, p, s) {
  return mesh(parent, new THREE.SphereGeometry(1, 10, 7), material, p, s);
}
function gem(parent, material, p, s, r = [0, 0, 0]) {
  return mesh(parent, new THREE.OctahedronGeometry(1), material, p, s, r);
}
function bar(parent, material, a, b, width) {
  const start = new THREE.Vector3(...a),
    end = new THREE.Vector3(...b);
  const center = start.clone().add(end).multiplyScalar(0.5);
  const node = cylinder(parent, material, center.toArray(), width, width, start.distanceTo(end));
  node.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), end.sub(start).normalize());
  return node;
}

function sarcophagus() {
  const g = new THREE.Group();
  g.name = 'Covenant keeper sarcophagus';
  box(g, 'dark', [0, 0.065, 0], [1.1, 0.13, 2.1], 0.035);
  box(g, 'stone', [0, 0.15, 0], [0.99, 0.12, 1.99], 0.035);
  box(g, 'stone', [0, 0.37, 0], [0.89, 0.37, 1.88], 0.04);
  box(g, 'dark', [0, 0.54, 0], [1, 0.045, 1.97], 0.012);
  box(g, 'pale', [0, 0.61, 0], [1.08, 0.11, 2.07], 0.045);
  box(g, 'stone', [0, 0.672, 0], [0.95, 0.035, 1.9], 0.025);
  // Carved effigy: a fully clothed oath keeper, deliberately stylized and non-graphic.
  sphere(g, 'pale', [0, 0.738, -0.62], [0.145, 0.105, 0.16]);
  box(g, 'stone', [0, 0.724, -0.37], [0.35, 0.1, 0.12], 0.02);
  sphere(g, 'pale', [0, 0.722, -0.22], [0.205, 0.072, 0.3]);
  box(g, 'pale', [0, 0.711, 0.25], [0.35, 0.06, 0.66], 0.025);
  for (const s of [-1, 1]) {
    box(g, 'pale', [s * 0.105, 0.715, 0.65], [0.125, 0.09, 0.24], 0.024);
    bar(g, 'pale', [s * 0.175, 0.738, -0.35], [s * 0.16, 0.76, -0.02], 0.05);
    bar(g, 'pale', [s * 0.16, 0.76, -0.02], [0, 0.786, -0.11], 0.046);
    // Drapery grooves and recessed side-panel borders.
    for (let i = 0; i < 3; i++)
      bar(
        g,
        'stone',
        [s * (0.04 + i * 0.05), 0.747, 0.03],
        [s * (0.025 + i * 0.052), 0.746, 0.52],
        0.009,
      );
    for (let i = -1; i <= 1; i++) {
      box(g, 'dark', [s * 0.453, 0.365, i * 0.49], [0.012, 0.21, 0.38], 0.007);
      gem(g, 'pale', [s * 0.47, 0.365, i * 0.49], [0.017, 0.11, 0.11]);
      bar(g, 'stone', [s * 0.472, 0.28, i * 0.49], [s * 0.472, 0.44, i * 0.49], 0.012);
    }
    for (const z of [-0.79, 0.79]) {
      cylinder(g, 'pale', [s * 0.438, 0.365, z], 0.045, 0.045, 0.29, [0, 0, 0], 8);
      box(g, 'pale', [s * 0.438, 0.49, z], [0.1, 0.06, 0.1], 0.015);
    }
  }
  // A ceremonial sword and face visor, all carved from the same stone.
  box(g, 'pale', [0, 0.786, 0.12], [0.029, 0.02, 0.64], 0.006);
  box(g, 'pale', [0, 0.796, -0.16], [0.23, 0.028, 0.035], 0.009);
  cylinder(g, 'pale', [0, 0.79, -0.23], 0.024, 0.024, 0.13, [Math.PI / 2, 0, 0], 8);
  box(g, 'stone', [0, 0.819, -0.646], [0.18, 0.006, 0.016], 0.002);
  box(g, 'pale', [0, 0.817, -0.594], [0.025, 0.012, 0.1], 0.004);
  return g;
}

function shrine() {
  const g = new THREE.Group();
  g.name = 'Shrine of remembered names';
  box(g, 'dark', [0, 0.07, 0], [1.26, 0.14, 0.79], 0.035);
  box(g, 'stone', [0, 0.15, 0], [1.12, 0.08, 0.66], 0.022);
  box(g, 'stone', [0, 0.45, 0], [1.01, 0.56, 0.55], 0.03);
  box(g, 'dark', [0, 0.46, 0.285], [0.78, 0.32, 0.035], 0.01);
  box(g, 'pale', [0, 0.76, 0], [1.25, 0.12, 0.76], 0.03);
  for (const s of [-1, 1]) {
    cylinder(g, 'pale', [s * 0.47, 0.46, 0.28], 0.055, 0.064, 0.55);
    box(g, 'pale', [s * 0.47, 0.22, 0.28], [0.15, 0.1, 0.15], 0.016);
    box(g, 'pale', [s * 0.47, 0.69, 0.28], [0.15, 0.08, 0.15], 0.016);
    bar(g, 'metal', [s * 0.13, 0.46, 0.314], [0, 0.57, 0.314], 0.012);
    bar(g, 'metal', [s * 0.13, 0.46, 0.314], [0, 0.35, 0.314], 0.012);
    cylinder(g, 'dark', [s * 0.52, 1.13, -0.28], 0.06, 0.065, 0.63);
    cylinder(g, 'pale', [s * 0.52, 1.43, -0.28], 0.085, 0.085, 0.08);
    mesh(g, new THREE.ConeGeometry(0.095, 0.25, 8), 'pale', [s * 0.52, 1.575, -0.28]);
  }
  // Pointed rear retable, carved crown and central hanging sigil.
  const shape = new THREE.Shape();
  shape.moveTo(-0.48, 0.82);
  shape.lineTo(0.48, 0.82);
  shape.lineTo(0.48, 1.29);
  shape.lineTo(0, 1.73);
  shape.lineTo(-0.48, 1.29);
  shape.closePath();
  const back = new THREE.ExtrudeGeometry(shape, {
    depth: 0.055,
    bevelEnabled: true,
    bevelSize: 0.012,
    bevelThickness: 0.012,
    bevelSegments: 1,
    steps: 1,
  });
  mesh(g, back, 'dark', [0, 0, -0.33]);
  bar(g, 'metal', [-0.45, 1.3, -0.255], [0, 1.7, -0.255], 0.022);
  bar(g, 'metal', [0.45, 1.3, -0.255], [0, 1.7, -0.255], 0.022);
  bar(g, 'metal', [0, 1.65, -0.255], [0, 1.38, -0.255], 0.012);
  const ring = new THREE.TorusGeometry(0.14, 0.012, 6, 20);
  mesh(g, ring, 'metal', [0, 1.22, -0.245]);
  gem(g, 'metal', [0, 1.22, -0.24], [0.055, 0.105, 0.025]);
  // Five individually sized candles, wax drops and small flame meshes.
  for (let i = -2; i <= 2; i++) {
    const x = i * 0.215,
      z = -0.135,
      height = 0.14 + (Math.abs(i) % 2) * 0.115;
    cylinder(g, 'metal', [x, 0.846, z], 0.08, 0.08, 0.035);
    cylinder(g, 'metal', [x, 0.894, z], 0.025, 0.035, 0.075);
    cylinder(g, 'metal', [x, 0.938, z], 0.069, 0.045, 0.025);
    cylinder(g, 'wax', [x, 0.95 + height / 2, z], 0.035, 0.042, height, [0, 0, 0], 9);
    sphere(g, 'wax', [x + 0.028, 0.943 + height * 0.78, z + 0.008], [0.014, height * 0.19, 0.012]);
    cylinder(g, 'wick', [x, 0.968 + height, z], 0.005, 0.005, 0.025, [0, 0, 0.1], 6);
    sphere(g, 'fire', [x, 1.017 + height, z], [0.023, 0.049, 0.023]);
  }
  // A readable open book: raised spine, bevelled vellum and ink-like page lines.
  box(g, 'cloth', [0, 0.833, 0.23], [0.5, 0.025, 0.27], 0.012);
  for (const s of [-1, 1]) {
    const rot = [0, 0, s * -0.12];
    box(g, 'paper', [s * 0.124, 0.866, 0.23], [0.24, 0.038, 0.246], 0.008, rot);
    for (let row = 0; row < 5; row++)
      box(
        g,
        'metal',
        [s * 0.126, 0.889, 0.15 + row * 0.038],
        [0.155 - (row % 2) * 0.035, 0.0015, 0.004],
        0.001,
        rot,
      );
  }
  return g;
}

function batch(group) {
  const result = new THREE.Group();
  result.name = group.name;
  const bins = new Map();
  group.updateMatrixWorld(true);
  group.traverse((node) => {
    if (!node.isMesh) return;
    let geometry = node.geometry.index ? node.geometry.toNonIndexed() : node.geometry.clone();
    geometry.applyMatrix4(node.matrixWorld);
    if (!bins.has(node.material)) bins.set(node.material, []);
    bins.get(node.material).push(geometry);
  });
  for (const [material, geometries] of bins) {
    const merged = mergeGeometries(geometries, false);
    const geometry = mergeVertices(merged);
    merged.dispose();
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = material.name;
    result.add(mesh);
    geometries.forEach((g) => g.dispose());
  }
  return result;
}

const exporter = new GLTFExporter();
const manifest = {
  version: 1,
  authoring: 'Original modeled geometry for Runic Depths',
  generator: 'scripts/build-surface-props.mjs',
  props: {},
};
for (const [kind, create] of Object.entries({ sarcophagus, shrine })) {
  const model = batch(create());
  const buffer = await exporter.parseAsync(model, { binary: true, onlyVisible: true });
  const data = Buffer.from(buffer);
  const bounds = new THREE.Box3().setFromObject(model);
  let triangles = 0;
  model.traverse((n) => {
    if (n.isMesh)
      triangles += (n.geometry.index?.count ?? n.geometry.attributes.position.count) / 3;
  });
  writeFileSync(new URL(`${kind}.glb`, out), data);
  manifest.props[kind] = {
    url: `assets/props/${kind}.glb`,
    bytes: data.length,
    sha256: createHash('sha256').update(data).digest('hex'),
    triangles,
    drawCalls: model.children.length,
    bounds: { min: bounds.min.toArray(), max: bounds.max.toArray() },
  };
  console.log(
    `${kind}: ${triangles} triangles, ${model.children.length} material batches, ${(data.length / 1024).toFixed(1)} KiB`,
  );
}
const total = Object.values(manifest.props).reduce((sum, p) => sum + p.bytes, 0);
if (total > 400 * 1024) throw new Error(`Props exceed budget: ${total}`);
writeFileSync(new URL('manifest.json', out), `${JSON.stringify(manifest, null, 2)}\n`);
