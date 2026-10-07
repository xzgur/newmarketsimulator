/**
 * Procedural low-poly product models. Each product becomes one merged
 * BufferGeometry (one group per part) + a material array, so it can be drawn
 * with a single InstancedMesh on the shelves.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { ProductDef } from '../data/products';
import { labelTexture } from './textures';
import { normalizeGeometry } from './batch';

export interface ProductAsset {
  geometry: THREE.BufferGeometry;
  materials: THREE.Material[];
  /** Height of the model (origin is at bottom centre). */
  height: number;
}

const matCache = new Map<string, THREE.MeshStandardMaterial>();
function mat(color: string, opts: { rough?: number; metal?: number } = {}): THREE.MeshStandardMaterial {
  const key = `${color}|${opts.rough ?? 0.6}|${opts.metal ?? 0}`;
  let m = matCache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness: opts.rough ?? 0.6, metalness: opts.metal ?? 0 });
    matCache.set(key, m);
  }
  return m;
}

function labelMat(p: ProductDef): THREE.MeshStandardMaterial {
  const key = `label|${p.id}`;
  let m = matCache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({
      map: labelTexture(p.color, p.accent, p.label ?? p.name.toUpperCase()),
      roughness: 0.5,
    });
    matCache.set(key, m);
  }
  return m;
}

interface Part {
  geo: THREE.BufferGeometry;
  mat: THREE.Material;
}

function box(w: number, h: number, d: number, x = 0, y = 0, z = 0): THREE.BufferGeometry {
  return new THREE.BoxGeometry(w, h, d).translate(x, y + h / 2, z);
}

function cyl(rt: number, rb: number, h: number, y = 0, seg = 9): THREE.BufferGeometry {
  return new THREE.CylinderGeometry(rt, rb, h, seg).translate(0, y + h / 2, 0);
}

function buildParts(p: ProductDef): Part[] {
  const [w, h, d] = p.size;
  const body = mat(p.color);
  const accent = mat(p.accent);
  const label = labelMat(p);
  switch (p.shape) {
    case 'carton': {
      const bh = h * 0.82;
      const gh = h - bh;
      const shape = new THREE.Shape();
      shape.moveTo(-d / 2, 0);
      shape.lineTo(d / 2, 0);
      shape.lineTo(0, gh);
      shape.closePath();
      const gable = new THREE.ExtrudeGeometry(shape, { depth: w, bevelEnabled: false })
        .translate(0, 0, -w / 2)
        .rotateY(Math.PI / 2)
        .translate(0, bh, 0);
      return [
        { geo: box(w, bh, d), mat: label },
        { geo: gable, mat: body },
        { geo: cyl(w * 0.14, w * 0.14, gh * 0.5, bh + gh * 0.35, 10).translate(w * 0.22, 0, d * 0.18), mat: accent },
      ];
    }
    case 'bottle': {
      const r = w / 2;
      const bodyH = h * 0.66;
      return [
        { geo: cyl(r, r, bodyH), mat: label },
        { geo: cyl(r * 0.42, r, h * 0.16, bodyH), mat: body },
        { geo: cyl(r * 0.36, r * 0.36, h * 0.1, bodyH + h * 0.16), mat: body },
        { geo: cyl(r * 0.44, r * 0.44, h * 0.08, bodyH + h * 0.26), mat: accent },
      ];
    }
    case 'jug': {
      const bh = h * 0.82;
      return [
        { geo: new THREE.BoxGeometry(w, bh, d).translate(0, bh / 2, 0), mat: mat(p.color, { rough: 0.15 }) },
        { geo: box(w * 1.01, bh * 0.38, d * 1.01, 0, bh * 0.28), mat: label },
        { geo: cyl(w * 0.12, w * 0.2, h * 0.08, bh), mat: mat(p.color, { rough: 0.15 }) },
        { geo: cyl(w * 0.13, w * 0.13, h * 0.08, bh + h * 0.08), mat: accent },
        { geo: box(w * 0.5, h * 0.05, d * 0.18, 0, bh + h * 0.02, -d * 0.25), mat: accent },
      ];
    }
    case 'eggbox': {
      const parts: Part[] = [
        { geo: box(w, h * 0.55, d), mat: body },
        { geo: box(w * 0.98, h * 0.35, d * 0.98, 0, h * 0.55), mat: label },
      ];
      const n = Math.round(w / 0.06);
      for (let i = 0; i < n; i++) {
        const x = -w / 2 + (i + 0.5) * (w / n);
        parts.push({
          geo: new THREE.SphereGeometry(0.022, 6, 4).scale(1, 0.8, 1).translate(x, h * 0.92, d * 0.22),
          mat: mat(p.accent),
        });
      }
      return parts;
    }
    case 'block':
      return [{ geo: box(w, h, d), mat: label }];
    case 'box':
      return [
        { geo: box(w, h, d), mat: label },
        { geo: box(w * 1.01, h * 0.12, d * 1.01, 0, h * 0.88), mat: accent },
      ];
    case 'loaf': {
      const r = Math.min(h, d) / 2;
      const geo = new THREE.CapsuleGeometry(r, Math.max(0.01, w - 2 * r), 4, 9)
        .rotateZ(Math.PI / 2)
        .scale(1, h / (2 * r), d / (2 * r))
        .translate(0, h / 2, 0);
      const parts: Part[] = [{ geo, mat: body }];
      for (let i = -1; i <= 1; i++) {
        parts.push({ geo: box(0.02, 0.012, d * 0.7, i * w * 0.22, h * 0.95).rotateY(0.5), mat: accent });
      }
      return parts;
    }
    case 'simit': {
      const R = w * 0.36;
      return [
        { geo: new THREE.TorusGeometry(R, w * 0.13, 8, 18).rotateX(Math.PI / 2).translate(0, w * 0.13, 0), mat: body },
      ];
    }
    case 'round': {
      const r = w / 2;
      return [
        { geo: new THREE.SphereGeometry(r, 10, 7).scale(1, h / w, 1).translate(0, h / 2, 0), mat: mat(p.color, { rough: 0.35 }) },
        { geo: cyl(r * 0.12, r * 0.12, r * 0.4, h * 0.92, 6), mat: accent },
      ];
    }
    case 'banana': {
      const parts: Part[] = [];
      for (let i = 0; i < 4; i++) {
        const off = (i - 1.5) * 0.028;
        const curve = new THREE.QuadraticBezierCurve3(
          new THREE.Vector3(-w / 2, 0.06, off),
          new THREE.Vector3(0, 0.0, off * 1.6),
          new THREE.Vector3(w / 2, 0.07, off * 2.2),
        );
        parts.push({ geo: new THREE.TubeGeometry(curve, 7, 0.02, 5, false).translate(0, 0.02, 0), mat: body });
      }
      parts.push({ geo: box(0.03, 0.03, 0.06, -w / 2 - 0.01, 0.06), mat: accent });
      return parts;
    }
    case 'long': {
      const r = h / 2;
      return [
        {
          geo: new THREE.CapsuleGeometry(r, Math.max(0.01, w - 2 * r), 4, 8).rotateZ(Math.PI / 2).translate(0, r, 0),
          mat: mat(p.color, { rough: 0.4 }),
        },
        { geo: cyl(r * 0.3, r * 0.3, r, r - r * 0.5).rotateZ(Math.PI / 2).translate(-w / 2, 0, 0), mat: accent },
      ];
    }
    case 'chips':
      return [
        {
          geo: new THREE.SphereGeometry(0.5, 10, 7).scale(w, h * 0.92, d).translate(0, h / 2, 0),
          mat: label,
        },
        { geo: box(w * 0.92, h * 0.05, d * 0.25, 0, h * 0.94), mat: accent },
        { geo: box(w * 0.92, h * 0.05, d * 0.25, 0, 0.0), mat: accent },
      ];
    case 'jar':
      return [
        { geo: cyl(w / 2, w / 2, h * 0.82), mat: label },
        { geo: cyl(w * 0.46, w * 0.46, h * 0.18, h * 0.82), mat: accent },
      ];
    case 'can':
      return [
        { geo: cyl(w / 2, w / 2, h * 0.9, 0, 12), mat: label },
        { geo: cyl(w * 0.48, w * 0.5, h * 0.1, h * 0.9, 12), mat: mat('#b0bec5', { rough: 0.3, metal: 0.6 }) },
      ];
  }
}

const assetCache = new Map<string, ProductAsset>();

export function getProductAsset(p: ProductDef): ProductAsset {
  const hit = assetCache.get(p.id);
  if (hit) return hit;
  // merge parts that share a material so each product is only a few draw calls
  const byMat = new Map<THREE.Material, THREE.BufferGeometry[]>();
  for (const pt of buildParts(p)) {
    const list = byMat.get(pt.mat) ?? [];
    list.push(normalizeGeometry(pt.geo));
    byMat.set(pt.mat, list);
  }
  const materials = [...byMat.keys()];
  const groups = materials.map((mt) => {
    const list = byMat.get(mt)!;
    return list.length === 1 ? list[0] : mergeGeometries(list, false)!;
  });
  const geometry = mergeGeometries(groups, true);
  if (!geometry) throw new Error(`Failed to merge geometry for ${p.id}`);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  const asset: ProductAsset = {
    geometry,
    materials,
    height: geometry.boundingBox!.max.y,
  };
  assetCache.set(p.id, asset);
  return asset;
}

/** A standalone mesh (for animations / the cart tray / thumbnails). */
export function createProductMesh(p: ProductDef): THREE.Mesh {
  const a = getProductAsset(p);
  const m = new THREE.Mesh(a.geometry, a.materials);
  m.castShadow = true;
  return m;
}
