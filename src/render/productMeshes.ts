/**
 * Product models in a chunky, KayKit-compatible style. Each product becomes
 * one merged BufferGeometry (one group per material) + a material array, so a
 * whole shelf of it is drawn with a single InstancedMesh.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { ProductDef } from '../data/products';
import { productLabel } from './textures';
import { normalizeGeometry } from './batch';
import { propParts } from './assets';

export interface ProductAsset {
  geometry: THREE.BufferGeometry;
  materials: THREE.Material[];
  /** Height of the model (origin at bottom centre). */
  height: number;
}

const matCache = new Map<string, THREE.MeshStandardMaterial>();
function mat(color: string, rough = 0.55, metal = 0, opts: { transparent?: number } = {}): THREE.MeshStandardMaterial {
  const key = `${color}|${rough}|${metal}|${opts.transparent ?? 1}`;
  let m = matCache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal });
    if (opts.transparent !== undefined && opts.transparent < 1) {
      m.transparent = true;
      m.opacity = opts.transparent;
    }
    matCache.set(key, m);
  }
  return m;
}

function labelMat(p: ProductDef, aspect: number, repeat = 1): THREE.MeshStandardMaterial {
  const key = `label|${p.id}|${aspect.toFixed(2)}|${repeat}`;
  let m = matCache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ map: productLabel(p, aspect, repeat), roughness: 0.45 });
    matCache.set(key, m);
  }
  return m;
}

interface Part {
  geo: THREE.BufferGeometry;
  mat: THREE.Material;
}

function rbox(w: number, h: number, d: number, r: number, x = 0, y = 0, z = 0): THREE.BufferGeometry {
  const rr = Math.min(r, w / 2 - 0.001, h / 2 - 0.001, d / 2 - 0.001);
  return new RoundedBoxGeometry(w, h, d, 1, Math.max(0.001, rr)).translate(x, y + h / 2, z);
}

function cyl(rt: number, rb: number, h: number, y = 0, seg = 12, open = false): THREE.BufferGeometry {
  return new THREE.CylinderGeometry(rt, rb, h, seg, 1, open).translate(0, y + h / 2, 0);
}

/** Front + back label planes for box-like products. */
function labelPlanes(p: ProductDef, w: number, h: number, d: number, y0: number): Part[] {
  const m = labelMat(p, w / h);
  const front = new THREE.PlaneGeometry(w, h).translate(0, y0 + h / 2, d / 2 + 0.0015);
  const back = new THREE.PlaneGeometry(w, h).rotateY(Math.PI).translate(0, y0 + h / 2, -d / 2 - 0.0015);
  return [
    { geo: front, mat: m },
    { geo: back, mat: m },
  ];
}

function buildParts(p: ProductDef): Part[] {
  const [w, h, d] = p.size;
  const body = mat(p.color);
  const accent = mat(p.accent);
  switch (p.shape) {
    case 'carton': {
      const bh = h * 0.8;
      const gh = h - bh;
      const shape = new THREE.Shape();
      shape.moveTo(-d / 2, 0);
      shape.lineTo(d / 2, 0);
      shape.lineTo(0, gh);
      shape.closePath();
      const gable = new THREE.ExtrudeGeometry(shape, { depth: w * 0.98, bevelEnabled: false }).translate(0, 0, -w * 0.49).rotateY(Math.PI / 2).translate(0, bh, 0);
      const fin = rbox(w * 0.98, gh * 0.35, 0.01, 0.004, 0, bh + gh * 0.85);
      return [
        { geo: rbox(w, bh, d, 0.008), mat: body },
        ...labelPlanes(p, w * 0.94, bh * 0.92, d, bh * 0.04),
        { geo: gable, mat: body },
        { geo: fin, mat: body },
        { geo: cyl(w * 0.16, w * 0.16, gh * 0.4, bh + gh * 0.3, 12).translate(0, 0, d * 0.2), mat: accent },
      ];
    }
    case 'bottle': {
      const r = w / 2;
      const bodyH = h * 0.66;
      return [
        { geo: cyl(r, r * 0.96, bodyH * 0.08, 0, 12), mat: mat(p.color, 0.3) },
        { geo: cyl(r, r, bodyH * 0.84, bodyH * 0.08, 12, true), mat: labelMat(p, (Math.PI * 2 * r) / (bodyH * 0.84) / 2, 2) },
        { geo: cyl(r * 0.99, r, bodyH * 0.08, bodyH * 0.92, 12), mat: mat(p.color, 0.3) },
        { geo: cyl(r * 0.42, r, h * 0.16, bodyH, 12), mat: mat(p.color, 0.3) },
        { geo: cyl(r * 0.36, r * 0.36, h * 0.1, bodyH + h * 0.16, 10), mat: mat(p.color, 0.3) },
        { geo: cyl(r * 0.46, r * 0.46, h * 0.08, bodyH + h * 0.26, 10), mat: accent },
      ];
    }
    case 'jug': {
      const bh = h * 0.82;
      const water = mat(p.color, 0.12, 0, { transparent: 0.82 });
      return [
        { geo: rbox(w, bh, d, 0.035), mat: water },
        ...labelPlanes(p, w * 0.86, bh * 0.45, d, bh * 0.2),
        { geo: cyl(w * 0.12, w * 0.22, h * 0.09, bh - 0.01, 10), mat: water },
        { geo: cyl(w * 0.13, w * 0.13, h * 0.08, bh + h * 0.08, 10), mat: accent },
        { geo: new THREE.TorusGeometry(w * 0.2, 0.012, 6, 16, Math.PI).translate(0, bh + 0.005, -d * 0.22), mat: accent },
      ];
    }
    case 'eggbox': {
      const parts: Part[] = [
        { geo: rbox(w, h * 0.55, d, 0.012), mat: body },
        { geo: rbox(w * 0.98, h * 0.35, d * 0.98, 0.02, 0, h * 0.55), mat: body },
        ...labelPlanes(p, w * 0.9, h * 0.32, d * 0.98, h * 0.57),
      ];
      const n = Math.round(w / 0.06);
      for (let i = 0; i < n; i++) {
        const x = -w / 2 + (i + 0.5) * (w / n);
        parts.push({ geo: new THREE.SphereGeometry(0.022, 7, 4).scale(1, 0.75, 1).translate(x, h * 0.9, 0), mat: body });
      }
      return parts;
    }
    case 'block':
      return [{ geo: rbox(w, h, d, Math.min(h, d) * 0.22), mat: body }, ...labelPlanes(p, w * 0.92, h * 0.86, d, h * 0.07), ...topLabel(p, w, h, d)];
    case 'box':
      return [
        { geo: rbox(w, h, d, Math.min(w, h, d) * 0.12), mat: body },
        ...labelPlanes(p, w * 0.94, h * 0.94, d, h * 0.03),
        { geo: rbox(w * 1.01, Math.min(0.02, h * 0.1), d * 1.01, 0.004, 0, h * 0.9), mat: accent },
      ];
    case 'sack': {
      const g = rbox(w, h, d, Math.min(w, d) * 0.45);
      // bulge the sack a little
      const pos = g.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < pos.count; i++) {
        const y = pos.getY(i) / h;
        const bulge = 1 + Math.sin(y * Math.PI) * 0.12;
        pos.setX(i, pos.getX(i) * bulge);
        pos.setZ(i, pos.getZ(i) * bulge);
      }
      g.computeVertexNormals();
      return [{ geo: g, mat: body }, ...labelPlanes(p, w * 0.92, h * 0.78, d * 1.18, h * 0.08), { geo: rbox(w * 0.9, 0.02, d * 0.6, 0.008, 0, h - 0.01), mat: accent }];
    }
    case 'loaf': {
      const r = Math.min(h, d) / 2;
      const geo = new THREE.CapsuleGeometry(r, Math.max(0.01, w - 2 * r), 6, 10).rotateZ(Math.PI / 2).scale(1, h / (2 * r), d / (2 * r)).translate(0, h / 2, 0);
      const parts: Part[] = [{ geo, mat: mat(p.color, 0.8) }];
      for (let i = -1; i <= 1; i++) {
        parts.push({ geo: rbox(0.03, 0.012, d * 0.62, 0.005, i * w * 0.22, h * 0.93).rotateY(0.5), mat: mat(p.accent, 0.8) });
      }
      return parts;
    }
    case 'simit':
      return [
        { geo: new THREE.TorusGeometry(w * 0.36, w * 0.13, 10, 22).rotateX(Math.PI / 2).translate(0, w * 0.13, 0), mat: mat(p.color, 0.75) },
        { geo: new THREE.TorusGeometry(w * 0.36, w * 0.135, 6, 22, Math.PI * 2).rotateX(Math.PI / 2).scale(1, 0.4, 1).translate(0, w * 0.2, 0), mat: mat(p.accent, 0.9) },
      ];
    case 'round': {
      const r = w / 2;
      return [
        { geo: new THREE.SphereGeometry(r, 12, 8).scale(1, h / w, 1).translate(0, h / 2, 0), mat: mat(p.color, 0.35) },
        { geo: cyl(r * 0.1, r * 0.12, r * 0.4, h * 0.92, 6), mat: mat(p.accent, 0.8) },
        { geo: new THREE.SphereGeometry(r * 0.3, 8, 6).scale(1.6, 0.25, 0.8).translate(r * 0.3, h * 1.0, 0), mat: mat('#4d7c0f', 0.6) },
      ];
    }
    case 'banana': {
      const parts: Part[] = [];
      for (let i = 0; i < 5; i++) {
        const off = (i - 2) * 0.026;
        const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(-w / 2, 0.065, off * 0.5), new THREE.Vector3(0, -0.005, off * 1.5), new THREE.Vector3(w / 2, 0.075 + Math.abs(off) * 0.3, off * 2.2));
        parts.push({ geo: new THREE.TubeGeometry(curve, 8, 0.021, 6, false).translate(0, 0.022, 0), mat: mat(p.color, 0.5) });
        parts.push({ geo: new THREE.SphereGeometry(0.012, 6, 4).translate(w / 2, 0.097 + Math.abs(off) * 0.3, off * 2.2), mat: mat(p.accent, 0.8) });
      }
      parts.push({ geo: rbox(0.04, 0.035, 0.07, 0.01, -w / 2 - 0.01, 0.05), mat: mat('#65a30d', 0.8) });
      return parts;
    }
    case 'long': {
      const r = h / 2;
      return [
        { geo: new THREE.CapsuleGeometry(r, Math.max(0.01, w - 2 * r), 6, 10).rotateZ(Math.PI / 2).translate(0, r, 0), mat: mat(p.color, 0.4) },
        { geo: cyl(r * 0.3, r * 0.3, r * 1.2, 0, 6).rotateZ(Math.PI / 2).translate(-w / 2, r, 0), mat: mat(p.accent, 0.7) },
      ];
    }
    case 'chips': {
      const g = rbox(w, h, d, Math.min(w, d) * 0.45);
      const pos = g.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < pos.count; i++) {
        const y = pos.getY(i) / h;
        const puff = 0.75 + Math.sin(y * Math.PI) * 0.45;
        pos.setZ(i, pos.getZ(i) * puff);
      }
      g.computeVertexNormals();
      return [
        { geo: g, mat: body },
        ...labelPlanes(p, w * 0.92, h * 0.8, d * 1.18, h * 0.1),
        { geo: rbox(w * 1.02, h * 0.06, d * 0.4, 0.005, 0, h * 0.95), mat: accent },
        { geo: rbox(w * 1.02, h * 0.06, d * 0.4, 0.005, 0, -h * 0.01), mat: accent },
      ];
    }
    case 'jar':
      return [
        { geo: cyl(w / 2, w / 2, h * 0.8, 0, 12, true), mat: labelMat(p, (Math.PI * w) / (h * 0.8) / 2, 2) },
        { geo: cyl(w / 2, w / 2, 0.004, 0, 12), mat: body },
        { geo: rbox(w * 1.02, h * 0.2, w * 1.02, w * 0.12, 0, h * 0.8), mat: mat(p.accent, 0.35, 0.3) },
      ];
    case 'can':
      return [
        { geo: cyl(w / 2, w / 2, h * 0.88, h * 0.06, 12, true), mat: labelMat(p, (Math.PI * w) / (h * 0.88) / 2, 2) },
        { geo: cyl(w * 0.48, w * 0.5, h * 0.06, 0, 12), mat: mat('#b0bec5', 0.3, 0.7) },
        { geo: cyl(w * 0.5, w * 0.48, h * 0.06, h * 0.94, 12), mat: mat('#b0bec5', 0.3, 0.7) },
      ];
    case 'kaykit':
      return kaykitParts(p);
  }
}

function topLabel(p: ProductDef, w: number, h: number, d: number): Part[] {
  if (h > 0.09) return [];
  const m = labelMat(p, w / d);
  return [{ geo: new THREE.PlaneGeometry(w * 0.9, d * 0.86).rotateX(-Math.PI / 2).translate(0, h + 0.0015, 0), mat: m }];
}

/** Uses a KayKit model, normalised to the product's size (bottom-centred). */
function kaykitParts(p: ProductDef): Part[] {
  const parts = propParts(p.model!);
  const geos = parts.map((pt) => normalizeGeometry(pt.geometry).applyMatrix4(pt.matrix));
  const box = new THREE.Box3();
  geos.forEach((g) => {
    g.computeBoundingBox();
    box.union(g.boundingBox!);
  });
  const size = box.getSize(new THREE.Vector3());
  const s = p.size[1] / size.y;
  const cx = (box.min.x + box.max.x) / 2;
  const cz = (box.min.z + box.max.z) / 2;
  return geos.map((g, i) => ({ geo: g.translate(-cx, -box.min.y, -cz).scale(s, s, s), mat: parts[i].material }));
}

const assetCache = new Map<string, ProductAsset>();

export function getProductAsset(p: ProductDef): ProductAsset {
  const hit = assetCache.get(p.id);
  if (hit) return hit;
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
  const asset: ProductAsset = { geometry, materials, height: geometry.boundingBox!.max.y };
  assetCache.set(p.id, asset);
  return asset;
}

/** A standalone mesh (hand, bags, animations, thumbnails). */
export function createProductMesh(p: ProductDef): THREE.Mesh {
  const a = getProductAsset(p);
  const m = new THREE.Mesh(a.geometry, a.materials);
  m.castShadow = true;
  return m;
}
