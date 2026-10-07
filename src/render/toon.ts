/**
 * Cel shading: converts PBR materials to MeshToonMaterial with a crisp
 * 3-band gradient. Converted materials share colour objects with their
 * source and proxy emissiveIntensity, so code that tweaks the original
 * (mood lighting, night street) keeps working.
 */
import * as THREE from 'three';

function gradient(levels: number[]): THREE.DataTexture {
  const data = new Uint8Array(levels.length * 4);
  levels.forEach((v, i) => {
    data[i * 4] = data[i * 4 + 1] = data[i * 4 + 2] = v;
    data[i * 4 + 3] = 255;
  });
  const t = new THREE.DataTexture(data, levels.length, 1, THREE.RGBAFormat);
  t.minFilter = THREE.NearestFilter;
  t.magFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.needsUpdate = true;
  return t;
}

/** shadow · mid · lit · highlight */
export const TOON_GRADIENT = gradient([96, 168, 222, 255]);

const cache = new WeakMap<THREE.Material, THREE.Material>();

export function toToon(src: THREE.Material): THREE.Material {
  const hit = cache.get(src);
  if (hit) return hit;
  const s = src as THREE.MeshStandardMaterial;
  if (!s.isMeshStandardMaterial) return src;
  const m = new THREE.MeshToonMaterial({
    map: s.map,
    gradientMap: TOON_GRADIENT,
    emissiveMap: s.emissiveMap,
    transparent: s.transparent,
    opacity: s.opacity,
    side: s.side,
    alphaTest: s.alphaTest,
    depthWrite: s.depthWrite,
    vertexColors: s.vertexColors,
  });
  m.color = s.color;
  m.emissive = s.emissive;
  Object.defineProperty(m, 'emissiveIntensity', {
    get: () => s.emissiveIntensity,
    set: (v: number) => {
      s.emissiveIntensity = v;
    },
  });
  Object.defineProperty(m, 'opacity', {
    get: () => s.opacity,
    set: (v: number) => {
      s.opacity = v;
    },
  });
  m.name = s.name;
  m.userData = s.userData;
  cache.set(src, m);
  cache.set(m, m);
  return m;
}

/** Converts every PBR material under `root` (including material arrays). */
export function toonify(root: THREE.Object3D) {
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || !mesh.material) return;
    mesh.material = Array.isArray(mesh.material) ? mesh.material.map(toToon) : toToon(mesh.material);
  });
}
