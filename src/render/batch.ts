/**
 * Static batching: merges every (non-instanced) mesh under `root` into one
 * mesh per material, cutting hundreds of draw calls down to a few dozen.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

function materialKey(m: THREE.Material): string {
  const anyM = m as THREE.MeshStandardMaterial & THREE.MeshBasicMaterial;
  return [
    m.type,
    anyM.color ? anyM.color.getHexString() : '',
    anyM.map ? anyM.map.uuid : '',
    anyM.roughness ?? '',
    anyM.metalness ?? '',
    anyM.emissive ? anyM.emissive.getHexString() : '',
    m.transparent ? `t${m.opacity}` : '',
    m.side,
    anyM.toneMapped,
  ].join('|');
}

/** Converts to non-indexed and keeps only position/normal/uv so all geometries merge. */
export function normalizeGeometry(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const ng = g.index ? g.toNonIndexed() : g.clone();
  ng.clearGroups();
  for (const name of Object.keys(ng.attributes)) {
    if (name !== 'position' && name !== 'normal' && name !== 'uv') ng.deleteAttribute(name);
  }
  if (!ng.attributes.uv) {
    const count = ng.attributes.position.count;
    ng.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(count * 2), 2));
  }
  if (!ng.attributes.normal) ng.computeVertexNormals();
  return ng;
}

export function bakeStatic(root: THREE.Object3D): THREE.Group {
  root.updateMatrixWorld(true);
  const buckets = new Map<string, { material: THREE.Material; geos: THREE.BufferGeometry[]; cast: boolean; receive: boolean }>();
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || (mesh as THREE.InstancedMesh).isInstancedMesh || Array.isArray(mesh.material)) return;
    const key = materialKey(mesh.material);
    let b = buckets.get(key);
    if (!b) {
      b = { material: mesh.material, geos: [], cast: false, receive: false };
      buckets.set(key, b);
    }
    const g = normalizeGeometry(mesh.geometry);
    g.applyMatrix4(mesh.matrixWorld);
    b.geos.push(g);
    b.cast ||= mesh.castShadow;
    b.receive ||= mesh.receiveShadow;
  });
  const out = new THREE.Group();
  out.name = 'static-batched';
  for (const b of buckets.values()) {
    const merged = mergeGeometries(b.geos, false);
    if (!merged) continue;
    const mesh = new THREE.Mesh(merged, b.material);
    mesh.castShadow = b.cast;
    mesh.receiveShadow = b.receive;
    out.add(mesh);
  }
  return out;
}
