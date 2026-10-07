/** Renders small product icons (data URLs) for the HUD using the 3D models. */
import * as THREE from 'three';
import { PRODUCTS } from '../data/products';
import { createProductMesh } from './productMeshes';

export function renderThumbnails(renderer: THREE.WebGLRenderer, size = 96): Record<string, string> {
  const out: Record<string, string> = {};
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8899aa, 2.2));
  const dir = new THREE.DirectionalLight(0xffffff, 2.2);
  dir.position.set(1, 2, 2);
  scene.add(dir);
  const camera = new THREE.PerspectiveCamera(30, 1, 0.01, 10);
  const target = new THREE.WebGLRenderTarget(size, size, { colorSpace: THREE.SRGBColorSpace });
  const pixels = new Uint8Array(size * size * 4);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const prevTarget = renderer.getRenderTarget();
  const prevClear = renderer.getClearColor(new THREE.Color());
  const prevAlpha = renderer.getClearAlpha();
  renderer.setClearColor(0x000000, 0);

  for (const p of PRODUCTS) {
    const mesh = createProductMesh(p);
    scene.add(mesh);
    const box = new THREE.Box3().setFromObject(mesh);
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    const dist = sphere.radius / Math.sin(THREE.MathUtils.degToRad(15)) * 1.02;
    const dirV = new THREE.Vector3(0.55, 0.45, 1).normalize();
    camera.position.copy(sphere.center).addScaledVector(dirV, dist);
    camera.near = dist * 0.1;
    camera.far = dist * 3;
    camera.updateProjectionMatrix();
    camera.lookAt(sphere.center);
    renderer.setRenderTarget(target);
    renderer.clear();
    renderer.render(scene, camera);
    renderer.readRenderTargetPixels(target, 0, 0, size, size, pixels);
    const img = ctx.createImageData(size, size);
    // flip Y
    for (let y = 0; y < size; y++) {
      const src = (size - 1 - y) * size * 4;
      img.data.set(pixels.subarray(src, src + size * 4), y * size * 4);
    }
    ctx.putImageData(img, 0, 0);
    out[p.id] = canvas.toDataURL('image/png');
    scene.remove(mesh);
  }
  renderer.setRenderTarget(prevTarget);
  renderer.setClearColor(prevClear, prevAlpha);
  target.dispose();
  return out;
}
