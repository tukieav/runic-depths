import * as THREE from 'three';

const KINDS = Object.freeze(['flagstone', 'masonry', 'metal', 'cloth', 'runestone']);
const DEFAULTS = {
  flagstone: { roughness: 0.95, metalness: 0, normalScale: 0.55 },
  masonry: { roughness: 0.97, metalness: 0, normalScale: 0.6 },
  metal: { roughness: 0.82, metalness: 0.75, normalScale: 0.48 },
  cloth: { roughness: 1, metalness: 0, normalScale: 0.32 },
  runestone: { roughness: 0.96, metalness: 0.04, normalScale: 0.6 },
};

/**
 * Reusable original PBR textures. Geometry must have UVs; the dungeon's boxes,
 * cylinders and planes already do. Map repeat defaults to one authored surface
 * per UV unit. Pass { repeat: [x, y] } for large props or rugs.
 *
 * Loading is asynchronous and gameplay never waits for it. A failed map leaves
 * an opaque neutral fallback texture; there is no black/invisible asset failure.
 * The owner must dispose the library only when disposing the whole renderer.
 */
export function createSurfaceLibrary(renderer) {
  const loader = new THREE.TextureLoader();
  const cache = new Map();
  const allTextures = new Set();
  const variants = new Map();
  const ownedMaterials = new Set();
  const state = { requested: 0, loaded: 0, failed: [], ready: false };
  const anisotropy = Math.min(8, renderer?.capabilities?.getMaxAnisotropy?.() || 1);
  let disposed = false;
  const pending = [];

  function load(kind, role) {
    const key = `${kind}/${role}`;
    if (cache.has(key)) return cache.get(key);
    const neutral = role === 'normal' ? [128, 128, 255, 255] : [255, 255, 255, 255];
    const placeholder = document.createElement('canvas');
    placeholder.width = placeholder.height = 1;
    const context = placeholder.getContext('2d');
    context.fillStyle = `rgb(${neutral[0]}, ${neutral[1]}, ${neutral[2]})`;
    context.fillRect(0, 0, 1, 1);
    const texture = new THREE.Texture(placeholder);
    variants.set(texture, new Set([texture]));
    texture.name = `runic-${kind}-${role}`;
    texture.colorSpace = role === 'albedo' ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.anisotropy = anisotropy;
    texture.magFilter = THREE.LinearFilter;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.generateMipmaps = true;
    texture.needsUpdate = true;
    state.requested++;
    const url = `assets/textures/${kind}-${role}.webp`;
    pending.push(
      new Promise((resolve) => {
        let settled = false;
        const fail = () => {
          if (settled) return;
          settled = true;
          clearTimeout(timeout);
          state.failed.push(url);
          resolve();
        };
        const timeout = setTimeout(fail, 4500);
        loader.load(
          url,
          (loaded) => {
            if (settled) {
              loaded.dispose();
              return;
            }
            settled = true;
            clearTimeout(timeout);
            if (!disposed) {
              // Keep the material's texture identity stable while swapping the image.
              texture.image = loaded.image;
              for (const variant of variants.get(texture)) variant.needsUpdate = true;
              state.loaded++;
            } else state.failed.push(url);
            loaded.dispose();
            resolve();
          },
          undefined,
          fail,
        );
      }),
    );
    cache.set(key, texture);
    allTextures.add(texture);
    return texture;
  }

  function apply(material, kind = 'flagstone', options = {}) {
    if (!KINDS.includes(kind)) throw new Error(`Unknown surface: ${kind}`);
    const defaults = DEFAULTS[kind];
    for (const [role, property] of [
      ['albedo', 'map'],
      ['normal', 'normalMap'],
      ['roughness', 'roughnessMap'],
    ]) {
      let texture = load(kind, role);
      if (options.repeat && (options.repeat[0] !== 1 || options.repeat[1] !== 1)) {
        // A cloned Source stays synchronized with the asynchronously loaded image.
        const original = texture;
        texture = original.clone();
        variants.get(original).add(texture);
        texture.repeat.set(...options.repeat);
        texture.needsUpdate = true;
        allTextures.add(texture);
      }
      material[property] = texture;
    }
    material.normalScale = new THREE.Vector2().setScalar(
      options.normalScale ?? defaults.normalScale,
    );
    material.roughness = options.roughness ?? defaults.roughness;
    material.metalness = options.metalness ?? defaults.metalness;
    material.userData.surfaceKind = kind;
    material.needsUpdate = true;
    return material;
  }

  // Start the five shared sets once, so readiness has a stable meaning.
  for (const kind of KINDS) for (const role of ['albedo', 'normal', 'roughness']) load(kind, role);
  const ready = Promise.all(pending).then(() => {
    state.ready = true;
    return state;
  });

  return {
    kinds: KINDS,
    state,
    ready,
    apply,
    material(kind, options = {}) {
      const { repeat, normalScale, ...parameters } = options;
      const material = new THREE.MeshStandardMaterial({ color: '#ffffff', ...parameters });
      ownedMaterials.add(material);
      return apply(material, kind, { ...options, repeat, normalScale });
    },
    dispose() {
      disposed = true;
      for (const material of ownedMaterials) material.dispose();
      for (const texture of allTextures) texture.dispose();
      cache.clear();
      variants.clear();
      allTextures.clear();
      ownedMaterials.clear();
    },
  };
}
