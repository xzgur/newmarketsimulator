/**
 * Loads the packed KayKit models (CC0, by Kay Lousberg) and hands out clones.
 * public/models/kit.glb        → props: root nodes named after their source file
 * public/models/characters.glb → Rogue / Barbarian / Knight / Mage + animations
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';

export interface Assets {
  props: Map<string, THREE.Object3D>;
  characters: Map<string, THREE.Object3D>;
  animations: THREE.AnimationClip[];
}

let loaded: Assets | null = null;

const base = import.meta.env.BASE_URL;

export async function loadAssets(onProgress?: (p: number) => void): Promise<Assets> {
  if (loaded) return loaded;
  const loader = new GLTFLoader();
  let kitP = 0;
  let charP = 0;
  const report = () => onProgress?.((kitP + charP) / 2);
  const [kit, chars] = await Promise.all([
    loader.loadAsync(`${base}models/kit.glb`, (e) => {
      kitP = e.total ? e.loaded / e.total : 0.5;
      report();
    }),
    loader.loadAsync(`${base}models/characters.glb`, (e) => {
      charP = e.total ? e.loaded / e.total : 0.5;
      report();
    }),
  ]);
  const props = new Map<string, THREE.Object3D>();
  for (const child of kit.scene.children) {
    child.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        m.castShadow = true;
        m.receiveShadow = true;
        tuneMaterial(m.material as THREE.MeshStandardMaterial);
      }
    });
    props.set(child.name, child);
  }
  const characters = new Map<string, THREE.Object3D>();
  for (const child of chars.scene.children) {
    child.traverse((o) => {
      // GLTFLoader makes duplicate names unique (wristl_1…); the shared clips target the plain names
      if (o !== child && (o as THREE.Bone).isBone) o.name = o.name.replace(/_\d+$/, '');
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        m.castShadow = true;
        m.receiveShadow = false;
        m.frustumCulled = false;
        tuneMaterial(m.material as THREE.MeshStandardMaterial);
      }
    });
    characters.set(child.name, child);
  }
  loaded = { props, characters, animations: chars.animations };
  return loaded;
}

function tuneMaterial(m: THREE.MeshStandardMaterial) {
  if (!m || !m.isMeshStandardMaterial) return;
  m.roughness = Math.max(0.55, m.roughness);
  m.metalness = Math.min(0.1, m.metalness);
  if (m.map) {
    m.map.anisotropy = 4;
  }
}

export function getAssets(): Assets {
  if (!loaded) throw new Error('assets not loaded');
  return loaded;
}

/** Clones a prop; geometry/materials are shared. */
export function prop(name: string, scale = 1): THREE.Object3D {
  const src = getAssets().props.get(name);
  if (!src) throw new Error(`Unknown prop ${name}`);
  const o = src.clone(true);
  o.position.set(0, 0, 0);
  o.scale.setScalar(scale);
  return o;
}

/** Collects (geometry, material, local matrix) of a prop so it can be instanced/merged. */
export function propParts(name: string): { geometry: THREE.BufferGeometry; material: THREE.Material; matrix: THREE.Matrix4 }[] {
  const src = getAssets().props.get(name);
  if (!src) throw new Error(`Unknown prop ${name}`);
  const root = src.clone(true);
  root.position.set(0, 0, 0);
  root.rotation.set(0, 0, 0);
  root.scale.setScalar(1);
  root.updateMatrixWorld(true);
  const parts: { geometry: THREE.BufferGeometry; material: THREE.Material; matrix: THREE.Matrix4 }[] = [];
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) parts.push({ geometry: m.geometry, material: m.material as THREE.Material, matrix: m.matrixWorld.clone() });
  });
  return parts;
}

// ------------------------------------------------------------------ characters

export type CharacterBase = 'Rogue' | 'Barbarian' | 'Knight' | 'Mage';

export interface Outfit {
  /** Hue rotation (degrees) for clothing pixels. */
  hue: number;
  /** Saturation multiplier for clothing pixels. */
  sat?: number;
  /** Lightness offset for clothing pixels (-1..1). */
  light?: number;
  /** Replace clothing with a solid colour family instead of a hue shift. */
  tint?: string;
}

const outfitCache = new Map<string, THREE.Texture>();

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return [h * 60, s, l];
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  h = ((h % 360) + 360) % 360 / 360;
  if (s === 0) return [l, l, l];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const f = (t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [f(h + 1 / 3), f(h), f(h - 1 / 3)];
}

/** Skin and hair keep their colour; everything else (clothing) is recoloured. */
function isSkinOrHair(h: number, s: number, l: number): boolean {
  const warm = h >= 8 && h <= 42;
  return warm && s > 0.18 && l > 0.25 && l < 0.85;
}

function recolor(texture: THREE.Texture, outfit: Outfit): THREE.Texture {
  const img = texture.image as HTMLImageElement | ImageBitmap;
  const key = `${texture.uuid}|${JSON.stringify(outfit)}`;
  const hit = outfitCache.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = img.width;
  c.height = img.height;
  const ctx = c.getContext('2d')!;
  ctx.drawImage(img as CanvasImageSource, 0, 0);
  const data = ctx.getImageData(0, 0, c.width, c.height);
  const d = data.data;
  const tint = outfit.tint ? new THREE.Color(outfit.tint) : null;
  const tintHsl = tint ? tint.getHSL({ h: 0, s: 0, l: 0 }) : null;
  for (let i = 0; i < d.length; i += 4) {
    const [h, s, l] = rgbToHsl(d[i] / 255, d[i + 1] / 255, d[i + 2] / 255);
    if (isSkinOrHair(h, s, l) || s < 0.08) continue;
    let nh = h + outfit.hue;
    let ns = Math.min(1, s * (outfit.sat ?? 1));
    let nl = Math.max(0, Math.min(1, l + (outfit.light ?? 0)));
    if (tintHsl) {
      nh = tintHsl.h * 360;
      ns = Math.min(1, tintHsl.s * 0.9 + 0.1);
      nl = Math.max(0.08, Math.min(0.92, tintHsl.l + (l - 0.45) * 0.8));
    }
    const [r, g, b] = hslToRgb(nh, ns, nl);
    d[i] = r * 255;
    d[i + 1] = g * 255;
    d[i + 2] = b * 255;
  }
  ctx.putImageData(data, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.flipY = texture.flipY;
  t.magFilter = texture.magFilter;
  t.minFilter = texture.minFilter;
  outfitCache.set(key, t);
  return t;
}

export interface CharacterInstance {
  root: THREE.Object3D;
  mixer: THREE.AnimationMixer;
  actions: Map<string, THREE.AnimationAction>;
  current: string;
  play(name: string, fade?: number, once?: boolean): THREE.AnimationAction | undefined;
  bone(name: string): THREE.Object3D | undefined;
}

export const CHARACTER_SCALE = 0.74;

export function createCharacter(base: CharacterBase, outfit?: Outfit): CharacterInstance {
  const a = getAssets();
  const src = a.characters.get(base);
  if (!src) throw new Error(`Unknown character ${base}`);
  const root = SkeletonUtils.clone(src);
  root.position.set(0, 0, 0);
  root.scale.setScalar(CHARACTER_SCALE);
  if (outfit) {
    root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        const mat = (m.material as THREE.MeshStandardMaterial).clone();
        if (mat.map) mat.map = recolor(mat.map, outfit);
        m.material = mat;
      }
    });
  }
  const mixer = new THREE.AnimationMixer(root);
  const actions = new Map<string, THREE.AnimationAction>();
  for (const clip of a.animations) actions.set(clip.name, mixer.clipAction(clip));
  const inst: CharacterInstance = {
    root,
    mixer,
    actions,
    current: '',
    play(name, fade = 0.25, once = false) {
      const next = actions.get(name);
      if (!next || inst.current === name) return next;
      const prev = actions.get(inst.current);
      next.reset();
      next.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
      next.clampWhenFinished = once;
      next.enabled = true;
      next.setEffectiveWeight(1);
      next.play();
      if (prev) prev.crossFadeTo(next, fade, false);
      inst.current = name;
      return next;
    },
    bone(name) {
      let found: THREE.Object3D | undefined;
      const clean = THREE.PropertyBinding.sanitizeNodeName(name);
      root.traverse((o) => {
        if (!found && (o.name === name || o.name === clean)) found = o;
      });
      return found;
    },
  };
  return inst;
}
