import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Original modelled botanical dressing. Tall plants remain entirely inside
// blocked tiles; navigable stone receives only soft, ankle-free ground cover.
const noise = (a, b = 0) => {
  const n = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return n - Math.floor(n);
};
const barkPixels = new Uint8Array(128 * 128 * 4);
for (let y = 0; y < 128; y++) {
  for (let x = 0; x < 128; x++) {
    const groove = Math.pow(Math.abs(Math.sin(y * 0.28 + Math.sin(x * 0.045) * 1.5)), 9);
    const shade = 0.48 + groove * 0.44 + noise(x, y) * 0.12;
    const i = (y * 128 + x) * 4;
    barkPixels.set([142 * shade, 118 * shade, 87 * shade, 255], i);
  }
}
const barkTexture = new THREE.DataTexture(barkPixels, 128, 128);
barkTexture.colorSpace = THREE.SRGBColorSpace;
barkTexture.wrapS = barkTexture.wrapT = THREE.RepeatWrapping;
barkTexture.magFilter = THREE.LinearFilter;
barkTexture.minFilter = THREE.LinearMipmapLinearFilter;
barkTexture.generateMipmaps = true;
barkTexture.needsUpdate = true;
barkTexture.name = 'original-ridged-bark';

function taperedTube(points, radius, segments, radial, ridgeStrength = 0.12) {
  const path = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)));
  const geometry = new THREE.TubeGeometry(path, segments, radius, radial, false);
  const p = geometry.attributes.position;
  for (let ring = 0; ring <= segments; ring++) {
    const t = ring / segments,
      center = path.getPointAt(t);
    for (let side = 0; side <= radial; side++) {
      const i = ring * (radial + 1) + side;
      const taper = Math.pow(1 - t, 0.8) * 0.95 + 0.035;
      const ridge = 1 + Math.cos((side / radial) * Math.PI * 8 + t * 1.2) * ridgeStrength;
      p.setXYZ(
        i,
        center.x + (p.getX(i) - center.x) * taper * ridge,
        center.y + (p.getY(i) - center.y) * taper,
        center.z + (p.getZ(i) - center.z) * taper * ridge,
      );
    }
  }
  geometry.computeVertexNormals();
  return geometry;
}
function rootedBough(variant, high) {
  const sign = variant ? -1 : 1;
  const pieces = [
    taperedTube(
      [
        [0, 0, 0],
        [-0.09 * sign, 0.18, 0.018],
        [-0.055 * sign, 0.43, -0.005],
        [0.055 * sign, 0.64, 0.008],
        [0.03 * sign, 0.86, 0],
        [-0.04 * sign, 1, 0.015],
      ],
      0.082,
      high ? 16 : 12,
      high ? 10 : 7,
      high ? 0.22 : 0.12,
    ),
  ];
  if (high) {
    // Branch collars begin inside the trunk, while spreading buttress roots
    // end on stone. Unequal forks interrupt the old paired-horn silhouette.
    pieces.push(
      taperedTube(
        [
          [-0.055 * sign, 0.43, -0.005],
          [-0.16 * sign, 0.5, 0.025],
          [-0.22 * sign, 0.69, 0.016],
          [-0.2 * sign, 0.77, 0.01],
        ],
        0.035,
        6,
        4,
      ),
    );
    pieces.push(
      taperedTube(
        [
          [0.055 * sign, 0.64, 0.008],
          [0.15 * sign, 0.73, 0.015],
          [0.19 * sign, 0.84, 0.04],
        ],
        0.025,
        6,
        4,
      ),
    );
    pieces.push(
      taperedTube(
        [
          [-0.07 * sign, 0.15, 0.01],
          [0.035 * sign, 0.06, 0.06],
          [0.14 * sign, 0.025, 0.07],
          [0.25 * sign, 0.008, 0.09],
        ],
        0.05,
        6,
        4,
      ),
    );
  }
  const result = mergeGeometries(pieces, false);
  pieces.forEach((geometry) => geometry.dispose());
  return result;
}
const roots = [0, 1].map((variant) => rootedBough(variant, false));
const detailedRoots = [0, 1].map((variant) => rootedBough(variant, true));

// Each leaflet is a folded, pointed six-triangle blade; its raised midrib
// catches the light independently of the serrated silhouette.
function fernGeometry(variant, pairs = 7) {
  const positions = [],
    uvs = [],
    indices = [];
  const vertex = (x, y, z, u, v) => {
    positions.push(x, y, z);
    uvs.push(u, v);
    return positions.length / 3 - 1;
  };
  for (let pair = 0; pair < pairs; pair++) {
    const t = (pair + 0.6) / (pairs + 1);
    const y = t * 0.62;
    const centerZ = Math.sin(t * 1.55) * 0.2;
    const width = Math.sin(t * Math.PI) * 0.19 * (1 + variant * 0.045);
    const spacing = 7 / pairs;
    for (const side of [-1, 1]) {
      const x = side * width;
      const a = vertex(0, y, centerZ, 0, 0);
      const b = vertex(x * 0.48, y + 0.025 * spacing, centerZ + 0.047, 0.4, 0);
      const c = vertex(x, y + 0.095 * spacing, centerZ + 0.086, 1, 0.5);
      const d = vertex(x * 0.6, y + 0.073 * spacing, centerZ + 0.008, 0.6, 1);
      const e = vertex(x * 0.42, y + 0.058 * spacing, centerZ + 0.052, 0.4, 0.5);
      indices.push(a, b, e, b, c, e, c, d, e, d, a, e);
    }
  }
  // A continuous raised rachis joins every leaflet; crossed strips retain
  // a readable stem from either side without adding a separate draw call.
  for (let segment = 0; segment < 8; segment++) {
    const t0 = segment / 8,
      t1 = (segment + 1) / 8;
    for (const plane of [0, 1]) {
      const w0 = 0.009 * (1 - t0 * 0.7),
        w1 = 0.009 * (1 - t1 * 0.7);
      const z0 = Math.sin(t0 * 1.55) * 0.2,
        z1 = Math.sin(t1 * 1.55) * 0.2;
      const a = vertex(plane ? 0 : -w0, t0 * 0.62, z0 - (plane ? w0 : 0), 0, t0);
      const b = vertex(plane ? 0 : w0, t0 * 0.62, z0 + (plane ? w0 : 0), 1, t0);
      const c = vertex(plane ? 0 : w1, t1 * 0.62, z1 + (plane ? w1 : 0), 1, t1);
      const d = vertex(plane ? 0 : -w1, t1 * 0.62, z1 - (plane ? w1 : 0), 0, t1);
      indices.push(a, b, c, a, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(indices);
  g.computeVertexNormals();
  return g;
}
const ferns = [0, 1, 2].map((variant) => fernGeometry(variant));
const detailedFerns = [0, 1, 2].map((variant) => fernGeometry(variant, 12));
const capProfile = [
  [0, 0.18],
  [0.07, 0.165],
  [0.14, 0.11],
  [0.16, 0.08],
  [0.07, 0.098],
  [0.025, 0.11],
].map(([x, y]) => new THREE.Vector2(x, y));
const mushroomCap = new THREE.LatheGeometry(capProfile, 8);
const detailedCap = new THREE.LatheGeometry(capProfile, 12);
const stalkProfile = [
  [0.04, 0],
  [0.026, 0.04],
  [0.017, 0.09],
  [0.025, 0.12],
].map(([x, y]) => new THREE.Vector2(x, y));
const mushroomStalk = new THREE.LatheGeometry(stalkProfile, 5);
const detailedStalk = new THREE.LatheGeometry(stalkProfile, 8);
const gill = new THREE.ConeGeometry(1, 1, 3);
const moss = new THREE.IcosahedronGeometry(1, 0);

function materials(surface) {
  const bark = surface.material('#c1ac90');
  bark.map = barkTexture;
  bark.bumpMap = barkTexture;
  bark.bumpScale = 0.015;
  bark.roughness = 0.97;
  bark.name = 'garden-ridged-bark';
  const leaf = surface.material('#52734b');
  leaf.side = THREE.DoubleSide;
  const leafLight = surface.material('#7b8d58');
  leafLight.side = THREE.DoubleSide;
  return {
    bark,
    leaf,
    leafLight,
    moss: surface.material('#344c38'),
    mossLight: surface.material('#586747'),
    cap: surface.material('#af8260'),
    stalk: surface.material('#b6aa83'),
    gill: surface.material('#715346'),
  };
}

function detailWriter(batch, surface, isFloor) {
  const stats = surface.gardenDetailStats;
  return (
    geometry,
    material,
    position,
    scale = [1, 1, 1],
    rotation = [0, 0, 0],
    ground = false,
  ) => {
    const count = (geometry.index?.count ?? geometry.attributes.position.count) / 3;
    if (stats.triangles + count > stats.budget) return false;
    if (!geometry.boundingBox) geometry.computeBoundingBox();
    const transform = new THREE.Matrix4().compose(
      new THREE.Vector3(...position),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation)),
      new THREE.Vector3(...scale),
    );
    const bounds = geometry.boundingBox.clone().applyMatrix4(transform);
    // Evaluate every covered tile, not only the plant's origin. Ground moss
    // must remain below 6 cm and entirely on existing walkable stone.
    for (let z = Math.floor(bounds.min.z + 0.5001); z <= Math.floor(bounds.max.z + 0.4999); z++)
      for (let x = Math.floor(bounds.min.x + 0.5001); x <= Math.floor(bounds.max.x + 0.4999); x++) {
        if (ground ? !isFloor(x, z) || bounds.max.y > 0.06 : isFloor(x, z)) {
          stats.rejectedFootprints++;
          return false;
        }
      }
    stats.triangles += count;
    stats.pieces++;
    batch.add(geometry, material, position, scale, rotation);
    return true;
  };
}

/** Call once for each rootbound room, in room order, replacing the oval moss. */
export function addGardenDetail({ batch, surface, room, roomIndex, isFloor }) {
  if (roomIndex === 0 || !surface.gardenDetailStats)
    surface.gardenDetailStats = {
      triangles: 0,
      pieces: 0,
      rejectedFootprints: 0,
      budget: surface.quality === 'low' ? 10000 : 18000,
    };
  const add = detailWriter(batch, surface, isFloor),
    mat = materials(surface);
  // Broken clusters at the room edges, never large uniform green disks.
  for (const side of [-1, 1]) {
    const x = room.x + (side < 0 ? 0.14 : room.w - 1.14);
    for (let cluster = 0; cluster < 1; cluster++) {
      const z = room.y + 1 + noise(cluster, roomIndex) * Math.max(1, room.h - 3);
      for (let tuft = 0; tuft < 3; tuft++) {
        const a = tuft * 2.4 + roomIndex;
        add(
          moss,
          tuft % 2 ? mat.moss : mat.mossLight,
          [x + Math.sin(a) * 0.22, 0.022, z + Math.cos(a) * 0.28],
          [0.11 + noise(tuft, cluster) * 0.1, 0.016 + noise(cluster, tuft) * 0.018, 0.1],
          [0, a, 0],
          true,
        );
      }
    }
  }
}

/** Replaces the cylinder-and-gem plant in the existing rootbound alcove. */
export function addGardenAlcove({ batch, surface, isFloor, x, z, seed = 0 }) {
  if (!surface.gardenDetailStats)
    surface.gardenDetailStats = {
      triangles: 0,
      pieces: 0,
      rejectedFootprints: 0,
      budget: surface.quality === 'low' ? 10000 : 18000,
    };
  if (isFloor(x, z) || !isFloor(x, z + 1)) return;
  const write = detailWriter(batch, surface, isFloor);
  // The alcove's stone retaining shelf rises above ground. Lift the entire
  // connected plant composition onto it instead of burying leaves and fungi.
  const add = (geometry, material, position, ...options) =>
    write(geometry, material, [position[0], position[1] + 0.4, position[2]], ...options);
  const mat = materials(surface);
  const high = surface.quality !== 'low';
  for (let root = 0; root < 3; root++) {
    if (root < 2)
      add(
        high ? detailedRoots[root] : roots[root],
        mat.bark,
        [x + (root - 0.5) * 0.24, 0.025, z + 0.23],
        [0.8, (root ? 0.57 : 1.03) + noise(seed, root) * 0.22, 0.75],
        [0, root * 0.25, root ? -0.11 : 0.035],
      );
    add(
      high ? detailedFerns[root] : ferns[root],
      root % 2 ? mat.leaf : mat.leafLight,
      [x + (root - 1) * 0.14, 0.025, z + 0.16],
      [0.9, 0.85, 0.7],
      [0, (root - 1) * 0.65, (root - 1) * -0.28],
    );
  }
  for (let i = 0; i < 2; i++) {
    const px = x + (i - 0.5) * 0.27,
      pz = z + 0.29;
    const y = 0.012;
    const scale = 0.65 + noise(i, seed) * 0.45;
    add(high ? detailedCap : mushroomCap, mat.cap, [px, y, pz], [scale, scale, scale]);
    add(high ? detailedStalk : mushroomStalk, mat.stalk, [px, y, pz], [scale, scale, scale]);
    // Raised radial underside gills remain visible from the isometric camera.
    for (let j = 0; j < 3; j++) {
      const a = (j * Math.PI * 2) / 3;
      add(
        gill,
        mat.gill,
        [px + Math.cos(a) * 0.07 * scale, y + 0.085 * scale, pz + Math.sin(a) * 0.07 * scale],
        [0.008, 0.105 * scale, 0.007],
        [Math.PI / 2, 0, a],
      );
    }
  }
  for (let i = 0; i < 5; i++) {
    add(
      moss,
      i % 2 ? mat.moss : mat.mossLight,
      [x + (noise(i, seed) - 0.5) * 0.7, 0.05 + noise(seed, i) * 0.05, z + 0.24],
      [0.1, 0.065, 0.09],
      [0, i, 0],
    );
  }
}

// Thin ivy is authored in wall-local coordinates. Its complete depth is below
// six centimetres; it follows the face instead of becoming another standing tree.
const wallVine = taperedTube(
  [
    [0, 0.12, 0.024],
    [-0.055, 0.35, 0.024],
    [0.035, 0.58, 0.024],
    [-0.025, 0.84, 0.024],
    [0.025, 1.18, 0.024],
  ],
  0.015,
  8,
  4,
);
const wallLeafGeometry = (() => {
  const p = [],
    uv = [],
    indices = [];
  const path = new THREE.CatmullRomCurve3(
    [
      [0, 0.12, 0.024],
      [-0.055, 0.35, 0.024],
      [0.035, 0.58, 0.024],
      [-0.025, 0.84, 0.024],
      [0.025, 1.18, 0.024],
    ].map((point) => new THREE.Vector3(...point)),
  );
  for (let i = 0; i < 6; i++) {
    const t = 0.12 + i * 0.13,
      origin = path.getPointAt(t);
    for (const side of [-1, 1]) {
      const width = (0.12 - t * 0.065) * side;
      const first = p.length / 3;
      for (const [x, y, z, u, v] of [
        [0, 0, 0, 0, 0],
        [width * 0.55, 0.003, 0.009, 0.55, 0],
        [width, 0.063, 0.003, 1, 0.5],
        [width * 0.46, 0.057, 0.009, 0.5, 1],
        [width * 0.45, 0.028, 0.019, 0.45, 0.5],
      ]) {
        p.push(origin.x + x, origin.y + y, origin.z + z);
        uv.push(u, v);
      }
      indices.push(
        first,
        first + 1,
        first + 4,
        first + 1,
        first + 2,
        first + 4,
        first + 2,
        first + 3,
        first + 4,
        first + 3,
        first,
        first + 4,
      );
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
})();
const wallBudgets = new WeakMap();

/** Replaces the straight-cylinder wall plant. `add` is the existing wall-local
 * transform helper; room dressing retains its own reserved 18k / 10k budget. */
export function addGardenWall({ batch, surface, add, seed = 0 }) {
  let stats = wallBudgets.get(batch);
  if (!stats) {
    stats = { triangles: 0, decoratedWalls: 0, budget: surface.quality === 'low' ? 2000 : 4000 };
    wallBudgets.set(batch, stats);
    surface.gardenWallDetailStats = stats;
  }
  // Spread vines over the chapter before applying the hard cap. Existing room
  // selection is seeded, so repeated builds have the same vegetation placement.
  if (noise(seed, 47) > 0.68) return;
  const triangles = wallVine.index.count / 3 + wallLeafGeometry.index.count / 3;
  if (stats.triangles + triangles > stats.budget) return;
  const mat = materials(surface);
  const scale = 0.72 + noise(seed, 13) * 0.22;
  const mirror = noise(seed, 9) > 0.5 ? 1 : -1;
  // No negative geometry scales: a half-turn would move foliage behind the
  // masonry, so vary the root's lateral offset while keeping face normals valid.
  const position = [mirror * 0.035, 0.07 + noise(seed, 7) * 0.13, 0];
  add(wallVine, mat.bark, position, [1, scale, 1]);
  add(wallLeafGeometry, seed % 2 ? mat.leaf : mat.leafLight, position, [1, scale, 1]);
  stats.triangles += triangles;
  stats.decoratedWalls++;
}
