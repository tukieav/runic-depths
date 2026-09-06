import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { loadCharacterAssets, createCharacterVisual } from '../../src/character-assets.js';
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(1800, 1100);
renderer.setPixelRatio(1);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.25;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color('#11141c');
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.add(new THREE.HemisphereLight(0xc9dcff, 0x333328, 2));
for (const [x, y, z, c, p] of [
  [-4, 6, 5, 0xffdcaa, 4],
  [5, 3, -3, 0x86bfff, 5],
]) {
  const light = new THREE.DirectionalLight(c, p);
  light.position.set(x, y, z);
  light.castShadow = true;
  light.shadow.bias = -0.0004;
  light.shadow.normalBias = 0.025;
  light.shadow.mapSize.set(2048, 2048);
  scene.add(light);
}
const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(40, 40),
  new THREE.MeshStandardMaterial({ color: 0x242936, roughness: 0.95 }),
);
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);
const camera = new THREE.PerspectiveCamera(35, 1800 / 1100, 0.01, 50);
camera.position.set(0, 2.4, 7);
camera.lookAt(0, 0.75, 0);
await loadCharacterAssets({ timeout: 30000 });
const ids = ['warden', 'ranger', 'arcanist', 'reaver', 'oracle'];
const chars = ids.map((id, i) => {
  const c = createCharacterVisual(id);
  c.root.position.x = (i - 2) * 0.9;
  scene.add(c.root);
  return c;
});
window.viewer = {
  renderer,
  scene,
  camera,
  chars,
  ids,
  clip(name) {
    for (const c of chars) {
      c.mixer.stopAllAction();
      const clip = c.mixer._actions.find((a) => a._clip.name === name);
      clip.reset().play();
      c.root.userData.animation = name;
    }
  },
  single(id) {
    chars.forEach((c, i) => {
      c.root.visible = ids[i] === id;
      c.root.position.x = 0;
    });
    camera.position.set(2.1, 1.8, 3.0);
    camera.lookAt(0, 0.8, 0);
  },
  all() {
    chars.forEach((c, i) => {
      c.root.visible = true;
      c.root.position.x = (i - 2) * 0.9;
    });
    camera.position.set(0, 2.4, 7);
    camera.lookAt(0, 0.75, 0);
  },
  time(t) {
    chars.forEach((c) => c.mixer.setTime(t));
    renderer.render(scene, camera);
  },
};
window.viewer.time(0);
window.ready = true;
