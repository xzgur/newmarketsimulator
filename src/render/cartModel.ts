/**
 * A classic supermarket trolley: chrome wire basket, red plastic handle and
 * corner caps, child seat, casters. Three order bags stand inside the basket.
 * Local +Z is forward; the origin is the basket centre on the floor.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { getProduct } from '../data/products';
import type { OrderSession } from '../logic/order';
import { createProductMesh } from './productMeshes';
import { normalizeGeometry } from './batch';
import { DISPLAY_FONT, BODY_FONT, roundRect } from './textures';

export const BAG_COLORS = ['#3b82f6', '#f97316', '#10b981'];

const chrome = new THREE.MeshStandardMaterial({ color: '#d9dee5', metalness: 0.85, roughness: 0.38, envMapIntensity: 0.6 });
const red = new THREE.MeshStandardMaterial({ color: '#e11d48', roughness: 0.45 });
const blackPlastic = new THREE.MeshStandardMaterial({ color: '#1f2328', roughness: 0.6 });
const grey = new THREE.MeshStandardMaterial({ color: '#9aa1ab', roughness: 0.5, metalness: 0.3 });

/** Thin wire between two points (as a box: cheap, merges well). */
function wire(a: THREE.Vector3, b: THREE.Vector3, t = 0.007): THREE.BufferGeometry {
  const len = a.distanceTo(b);
  const g = new THREE.BoxGeometry(t, t, len);
  const m = new THREE.Matrix4().lookAt(a, b, new THREE.Vector3(0, 1, 0).applyAxisAngle(new THREE.Vector3(1, 0, 0), Math.abs(a.y - b.y) > len * 0.99 ? 0.01 : 0));
  m.setPosition(a.clone().add(b).multiplyScalar(0.5));
  g.applyMatrix4(m);
  return g;
}

// basket geometry (trapezoid: wider at the top and towards the back)
const BASKET = {
  bottomY: 0.52,
  topY: 0.98,
  bottomFront: -0.0,
  zFrontTop: 0.46,
  zFrontBottom: 0.36,
  zBack: -0.42,
  wTop: 0.56,
  wBottom: 0.46,
};

function buildBasket(): THREE.BufferGeometry {
  const geos: THREE.BufferGeometry[] = [];
  const { bottomY, topY, zFrontTop, zFrontBottom, zBack, wTop, wBottom } = BASKET;
  const corner = (side: number, front: boolean, top: boolean) =>
    new THREE.Vector3((side * (top ? wTop : wBottom)) / 2, top ? topY : bottomY, front ? (top ? zFrontTop : zFrontBottom) : zBack);
  // rims
  for (const top of [true, false]) {
    const fl = corner(-1, true, top);
    const fr = corner(1, true, top);
    const bl = corner(-1, false, top);
    const br = corner(1, false, top);
    const t = top ? 0.016 : 0.01;
    geos.push(wire(fl, fr, t), wire(bl, br, t), wire(fl, bl, t), wire(fr, br, t));
  }
  // horizontal rings
  for (let k = 1; k < 6; k++) {
    const f = k / 6;
    const lerp = (side: number, front: boolean) => corner(side, front, false).lerp(corner(side, front, true), f);
    const fl = lerp(-1, true);
    const fr = lerp(1, true);
    const bl = lerp(-1, false);
    const br = lerp(1, false);
    geos.push(wire(fl, fr), wire(bl, br), wire(fl, bl), wire(fr, br));
  }
  // vertical wires on the long sides
  const nLong = 16;
  for (let i = 0; i <= nLong; i++) {
    const f = i / nLong;
    for (const side of [-1, 1]) {
      const b = corner(side, false, false).lerp(corner(side, true, false), f);
      const t = corner(side, false, true).lerp(corner(side, true, true), f);
      geos.push(wire(b, t));
    }
  }
  // front + back verticals
  const nShort = 10;
  for (let i = 0; i <= nShort; i++) {
    const f = i / nShort;
    for (const front of [true, false]) {
      const b = corner(-1, front, false).lerp(corner(1, front, false), f);
      const t = corner(-1, front, true).lerp(corner(1, front, true), f);
      geos.push(wire(b, t));
    }
  }
  // bottom grid
  for (let i = 0; i <= 8; i++) {
    const f = i / 8;
    geos.push(wire(corner(-1, false, false).lerp(corner(1, false, false), f), corner(-1, true, false).lerp(corner(1, true, false), f), 0.006));
  }
  for (let i = 0; i <= 12; i++) {
    const f = i / 12;
    geos.push(wire(corner(-1, false, false).lerp(corner(-1, true, false), f), corner(1, false, false).lerp(corner(1, true, false), f), 0.006));
  }
  // chassis: frame rails, posts to handle, lower tray
  const railY = 0.12;
  for (const s of [-1, 1]) {
    geos.push(wire(new THREE.Vector3(s * 0.2, railY, 0.42), new THREE.Vector3(s * 0.25, railY, -0.4), 0.02));
    geos.push(wire(new THREE.Vector3(s * 0.25, railY, -0.4), new THREE.Vector3(s * 0.27, 1.02, -0.5), 0.02));
    geos.push(wire(new THREE.Vector3(s * 0.2, railY, 0.38), new THREE.Vector3(s * 0.22, bottomY, 0.3), 0.016));
    geos.push(wire(new THREE.Vector3(s * 0.24, railY + 0.02, -0.34), new THREE.Vector3(s * 0.22, bottomY, -0.36), 0.016));
  }
  for (let i = 0; i <= 6; i++) {
    const z = -0.32 + i * 0.11;
    geos.push(wire(new THREE.Vector3(-0.2, railY + 0.07, z), new THREE.Vector3(0.2, railY + 0.07, z), 0.006));
  }
  geos.push(wire(new THREE.Vector3(-0.2, railY + 0.07, -0.32), new THREE.Vector3(-0.2, railY + 0.07, 0.34), 0.008));
  geos.push(wire(new THREE.Vector3(0.2, railY + 0.07, -0.32), new THREE.Vector3(0.2, railY + 0.07, 0.34), 0.008));
  return mergeGeometries(geos.map(normalizeGeometry), false)!;
}

function bagTexture(n: number, color: string): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(0, 0, 256, 256);
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, 256, 34);
  ctx.beginPath();
  ctx.arc(128, 130, 62, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.font = `700 84px ${DISPLAY_FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(n), 128, 138);
  ctx.fillStyle = '#1f8a70';
  roundRect(ctx, 40, 202, 176, 36, 18);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.font = `800 22px ${BODY_FONT}`;
  ctx.fillText('MAHALLE MARKET', 128, 221);
  // crinkles
  ctx.strokeStyle = 'rgba(0,0,0,0.05)';
  ctx.lineWidth = 3;
  for (let i = 0; i < 14; i++) {
    ctx.beginPath();
    const x = Math.random() * 256;
    ctx.moveTo(x, 40);
    ctx.bezierCurveTo(x + 20, 100, x - 20, 160, x + 10, 256);
    ctx.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function bagBodyGeometry(w: number, h: number, d: number): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(0.5, 0.46, 1, 4, 6, true).rotateY(Math.PI / 4);
  g.scale(w * Math.SQRT2, h, d * Math.SQRT2);
  g.translate(0, h / 2, 0);
  const pos = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i) / h;
    const wob = Math.sin(pos.getX(i) * 40 + y * 9) * 0.006 + Math.sin(pos.getZ(i) * 37) * 0.005;
    pos.setX(i, pos.getX(i) * (1 + Math.sin(y * Math.PI) * 0.06) + wob);
    pos.setZ(i, pos.getZ(i) * (1 + Math.sin(y * Math.PI) * 0.06) - wob);
  }
  g.computeVertexNormals();
  return g;
}

interface BagView {
  root: THREE.Group;
  body: THREE.Group;
  handles: THREE.Group;
  knot: THREE.Mesh;
  items: THREE.Group;
  hit: THREE.Mesh;
  open: number;
  target: number;
  pop: number;
  shake: number;
  closed: boolean;
  itemSig: string;
}

export class ShoppingCart {
  readonly group = new THREE.Group();
  private bags: BagView[] = [];
  private wheels: THREE.Object3D[] = [];
  private bagHolder = new THREE.Group();
  readonly hitTargets: THREE.Object3D[] = [];
  private time = 0;
  private wheelSpin = 0;

  constructor() {
    const basket = new THREE.Mesh(buildBasket(), chrome);
    basket.castShadow = true;
    this.group.add(basket);
    const { topY, zBack, wTop, zFrontTop } = BASKET;
    // handle bar with red grip
    const grip = new THREE.Mesh(new THREE.CapsuleGeometry(0.022, 0.5, 4, 12).rotateZ(Math.PI / 2), red);
    grip.position.set(0, 1.04, -0.52);
    this.group.add(grip);
    for (const s of [-1, 1]) {
      const cap = new THREE.Mesh(new RoundedBoxGeometry(0.06, 0.07, 0.08, 2, 0.02), red);
      cap.position.set(s * 0.275, 1.03, -0.5);
      this.group.add(cap);
      const topCap = new THREE.Mesh(new RoundedBoxGeometry(0.05, 0.04, 0.06, 2, 0.015), red);
      topCap.position.set((s * wTop) / 2, topY + 0.01, zFrontTop);
      this.group.add(topCap);
    }
    // front bumper + child seat panel
    const bumper = new THREE.Mesh(new RoundedBoxGeometry(wTop + 0.04, 0.06, 0.05, 2, 0.02), red);
    bumper.position.set(0, topY - 0.02, zFrontTop + 0.02);
    this.group.add(bumper);
    const seat = new THREE.Mesh(new RoundedBoxGeometry(wTop - 0.06, 0.2, 0.02, 2, 0.008), red);
    seat.position.set(0, topY - 0.14, zBack + 0.03);
    seat.rotation.x = 0.12;
    this.group.add(seat);
    // logo plate on the seat
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.1), new THREE.MeshBasicMaterial({ map: plateTexture(), toneMapped: true }));
    plate.position.set(0, topY - 0.12, zBack + 0.015);
    plate.rotation.set(0.12, Math.PI, 0);
    this.group.add(plate);
    // casters
    for (const [x, z] of [
      [-0.2, 0.4],
      [0.2, 0.4],
      [-0.25, -0.38],
      [0.25, -0.38],
    ]) {
      const fork = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.07, 0.05), grey);
      fork.position.set(x, 0.09, z);
      this.group.add(fork);
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.035, 14).rotateZ(Math.PI / 2), blackPlastic);
      wheel.position.set(x, 0.05, z);
      wheel.castShadow = true;
      this.group.add(wheel);
      this.wheels.push(wheel);
    }

    // bags
    this.bagHolder.position.y = BASKET.bottomY + 0.01;
    this.group.add(this.bagHolder);
    const bagD = 0.25;
    for (let i = 0; i < 3; i++) {
      const v = this.makeBag(i);
      v.root.position.set(0, 0, 0.31 - i * 0.29);
      v.root.userData.baseZ = v.root.position.z;
      v.root.userData.baseD = bagD;
      this.bagHolder.add(v.root);
      this.bags.push(v);
      this.hitTargets.push(v.hit);
    }
  }

  private makeBag(i: number): BagView {
    const root = new THREE.Group();
    const w = 0.42;
    const h = 0.36;
    const d = 0.24;
    const bodyMat = new THREE.MeshStandardMaterial({ map: bagTexture(i + 1, BAG_COLORS[i]), roughness: 0.75, side: THREE.DoubleSide, transparent: true, opacity: 0.93 });
    const body = new THREE.Group();
    const shell = new THREE.Mesh(bagBodyGeometry(w, h, d), bodyMat);
    shell.castShadow = true;
    body.add(shell);
    const bottom = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.9, d * 0.9).rotateX(-Math.PI / 2), bodyMat);
    bottom.position.y = 0.005;
    body.add(bottom);
    root.add(body);
    const handles = new THREE.Group();
    const handleMat = new THREE.MeshStandardMaterial({ color: '#f8fafc', roughness: 0.75 });
    for (const z of [-d / 2 + 0.01, d / 2 - 0.01]) {
      const hnd = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.012, 6, 14, Math.PI), handleMat);
      hnd.position.set(0, h, z);
      handles.add(hnd);
    }
    root.add(handles);
    const knot = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8).scale(1.3, 0.8, 1), handleMat);
    knot.position.y = h + 0.06;
    knot.visible = false;
    root.add(knot);
    const items = new THREE.Group();
    root.add(items);
    const hit = new THREE.Mesh(new THREE.BoxGeometry(w + 0.04, h + 0.1, d + 0.02), new THREE.MeshBasicMaterial({ visible: false }));
    hit.position.y = (h + 0.1) / 2;
    hit.userData.bagIndex = i;
    root.add(hit);
    return { root, body, handles, knot, items, hit, open: 0, target: 0, pop: 0, shake: 0, closed: false, itemSig: '' };
  }

  /** Keep the bag visuals in sync with the order session. */
  sync(session: OrderSession) {
    session.bags.forEach((b, i) => {
      const v = this.bags[i];
      if (b.open && v.target === 0) v.pop = 1;
      v.target = b.open ? 1 : 0;
      if (b.closed && !v.closed) v.pop = 1;
      v.closed = b.closed;
      const sig = b.items.join(',');
      if (sig !== v.itemSig) {
        const added = b.items.length > v.items.children.length;
        v.itemSig = sig;
        v.items.clear();
        b.items.forEach((pid, k) => {
          const mesh = createProductMesh(getProduct(pid));
          const s = 0.82;
          mesh.scale.setScalar(s);
          const col = k % 2;
          const row = Math.floor(k / 2);
          mesh.position.set(-0.09 + col * 0.18, 0.01 + row * 0.1, (k % 3) * 0.035 - 0.035);
          mesh.rotation.y = Math.PI / 2 + (k * 0.7) % 1.2 - 0.6;
          mesh.userData.drop = k === b.items.length - 1 && added ? 0.35 : 0;
          mesh.userData.baseY = mesh.position.y;
          v.items.add(mesh);
        });
        if (added) v.pop = 0.6;
      }
    });
  }

  /** Bag hit index from a raycast object (or -1). */
  static bagIndexOf(o: THREE.Object3D): number {
    return typeof o.userData.bagIndex === 'number' ? o.userData.bagIndex : -1;
  }

  bagWorldPosition(i: number): THREE.Vector3 {
    return this.bags[i].root.localToWorld(new THREE.Vector3(0, 0.45, 0));
  }

  rejectShake(i: number) {
    this.bags[i].shake = 0.4;
  }

  setBagHighlight(i: number, on: boolean) {
    const m = (this.bags[i].body.children[0] as THREE.Mesh).material as THREE.MeshStandardMaterial;
    m.emissive.set(on ? '#fff3a0' : '#000000');
    m.emissiveIntensity = on ? 0.35 : 0;
  }

  /** Detach the bags (world space) for the handover animation. */
  takeBags(): THREE.Object3D[] {
    return this.bags.map((b) => {
      const obj = b.root;
      obj.updateMatrixWorld(true);
      const pos = new THREE.Vector3();
      const quat = new THREE.Quaternion();
      obj.getWorldPosition(pos);
      obj.getWorldQuaternion(quat);
      obj.removeFromParent();
      obj.position.copy(pos);
      obj.quaternion.copy(quat);
      return obj;
    });
  }

  update(dt: number, speed: number) {
    this.time += dt;
    this.wheelSpin += speed * dt * 20;
    for (const w of this.wheels) w.rotation.x = this.wheelSpin;
    for (const b of this.bags) {
      b.open += (b.target - b.open) * Math.min(1, dt * 7);
      b.pop = Math.max(0, b.pop - dt * 2.2);
      b.shake = Math.max(0, b.shake - dt);
      const a = b.open;
      const bounce = Math.sin(b.pop * Math.PI * 3) * b.pop * 0.12;
      b.body.scale.set(1 + bounce * 0.5, 0.08 + 0.92 * a + bounce, 1 + bounce * 0.5);
      b.handles.visible = a > 0.3 && !b.closed;
      b.handles.position.y = -0.36 * (1 - a);
      b.knot.visible = b.closed;
      b.items.visible = a > 0.5;
      b.root.rotation.z = Math.sin(this.time * 50) * b.shake * 0.15;
      for (const it of b.items.children) {
        const drop = it.userData.drop as number;
        if (drop > 0) {
          it.userData.drop = Math.max(0, drop - dt);
          const k = it.userData.drop / 0.35;
          it.position.y = it.userData.baseY + k * k * 0.45;
        }
      }
    }
  }
}

function plateTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 86;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#1f8a70';
  roundRect(ctx, 0, 0, 256, 86, 20);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.font = `700 34px ${DISPLAY_FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('MAHALLE', 128, 34);
  ctx.font = `800 20px ${BODY_FONT}`;
  ctx.fillText('MARKET', 128, 66);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
