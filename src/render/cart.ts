/**
 * The autonomous picking cart (inspired by the reference photo): a dark
 * robot base with LED strips, a lower crate collecting picked products and an
 * upper crate holding three order bags.
 */
import * as THREE from 'three';
import { getProduct } from '../data/products';
import type { OrderSession } from '../logic/order';
import { createProductMesh } from './productMeshes';
import { textTexture } from './textures';

export const BAG_COLORS = ['#3d8bfd', '#fd7e14', '#20c997'];

const std = (color: string, rough = 0.6, metal = 0) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal });

function crate(w: number, h: number, d: number, color: string): THREE.Group {
  const g = new THREE.Group();
  const mat = std(color, 0.7);
  const t = 0.025;
  const parts: [number, number, number, number, number, number][] = [
    [w, t, d, 0, t / 2, 0],
    [w, h, t, 0, h / 2, d / 2 - t / 2],
    [w, h, t, 0, h / 2, -d / 2 + t / 2],
    [t, h, d, w / 2 - t / 2, h / 2, 0],
    [t, h, d, -w / 2 + t / 2, h / 2, 0],
  ];
  for (const [pw, ph, pd, x, y, z] of parts) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(pw, ph, pd), mat);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    g.add(mesh);
  }
  // grille slots (dark stripes) on the long sides for the crate look
  const slotMat = std('#0d1220', 0.9);
  for (const side of [-1, 1]) {
    for (let i = 0; i < 7; i++) {
      const s = new THREE.Mesh(new THREE.BoxGeometry(0.012, h * 0.55, d / 9), slotMat);
      s.position.set(side * (w / 2 + 0.001), h * 0.5, -d / 2 + (i + 1) * (d / 8));
      g.add(s);
    }
  }
  return g;
}

interface BagView {
  root: THREE.Group;
  body: THREE.Mesh;
  handles: THREE.Group;
  knot: THREE.Mesh;
  items: THREE.Group;
  openAmount: number;
  target: number;
}

export class CartView {
  readonly group = new THREE.Group();
  private body = new THREE.Group();
  private led: THREE.MeshStandardMaterial;
  private ledFlash = 0;
  private ledColor = new THREE.Color('#4da3ff');
  private trayItems = new THREE.Group();
  private bags: BagView[] = [];
  private lowerCrate: THREE.Group;
  private upperCrate: THREE.Group;
  private wheelPhase = 0;
  private wheels: THREE.Mesh[] = [];
  private beacon: THREE.Mesh;
  private time = 0;
  private lastSignature = '';

  constructor() {
    this.group.add(this.body);
    const L = 1.0; // along Z (forward)
    const W = 0.78; // along X

    // base
    const base = new THREE.Mesh(new THREE.BoxGeometry(W, 0.28, L), std('#23262c', 0.5, 0.3));
    base.position.y = 0.2;
    base.castShadow = true;
    this.body.add(base);
    const bumper = new THREE.Mesh(new THREE.BoxGeometry(W + 0.04, 0.1, L + 0.04), std('#111317', 0.6));
    bumper.position.y = 0.1;
    this.body.add(bumper);
    for (const [x, z] of [[-0.3, 0.38], [0.3, 0.38], [-0.3, -0.38], [0.3, -0.38]]) {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.05, 12).rotateZ(Math.PI / 2), std('#0b0b0b', 0.9));
      wheel.position.set(x, 0.07, z);
      this.wheels.push(wheel);
      this.body.add(wheel);
    }
    this.led = new THREE.MeshStandardMaterial({ color: '#4da3ff', emissive: '#4da3ff', emissiveIntensity: 2.2 });
    for (const z of [L / 2 + 0.021, -L / 2 - 0.021]) {
      const strip = new THREE.Mesh(new THREE.BoxGeometry(W * 0.75, 0.035, 0.01), this.led);
      strip.position.set(0, 0.29, z);
      this.body.add(strip);
    }
    for (const x of [W / 2 + 0.021, -W / 2 - 0.021]) {
      const strip = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.035, L * 0.75), this.led);
      strip.position.set(x, 0.29, 0);
      this.body.add(strip);
    }
    // front panel: name plate + buttons
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.11), new THREE.MeshBasicMaterial({ map: textTexture('C.011', '#e8e8e8', '#222'), toneMapped: false }));
    plate.position.set(0, 0.2, L / 2 + 0.002);
    this.body.add(plate);
    const estop = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.03, 12).rotateX(Math.PI / 2), std('#e5541b', 0.5));
    estop.position.set(0.28, 0.2, L / 2 + 0.01);
    this.body.add(estop);

    // posts
    const postMat = std('#2d3138', 0.5, 0.5);
    for (const [x, z] of [[-W / 2 + 0.03, L / 2 - 0.03], [W / 2 - 0.03, L / 2 - 0.03], [-W / 2 + 0.03, -L / 2 + 0.03], [W / 2 - 0.03, -L / 2 + 0.03]]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.04, 1.2, 0.04), postMat);
      post.position.set(x, 0.9, z);
      post.castShadow = true;
      this.body.add(post);
    }
    // mid shelf with light strip + top frame
    const shelf = new THREE.Mesh(new THREE.BoxGeometry(W, 0.06, L), std('#3a3f47', 0.4, 0.4));
    shelf.position.y = 0.92;
    shelf.castShadow = true;
    this.body.add(shelf);
    const shelfLed = new THREE.Mesh(new THREE.BoxGeometry(W * 0.7, 0.025, 0.01), new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#dfe9ff', emissiveIntensity: 1.6 }));
    shelfLed.position.set(0, 0.92, L / 2 + 0.006);
    this.body.add(shelfLed);
    const shelfLed2 = shelfLed.clone();
    shelfLed2.position.z = -L / 2 - 0.006;
    this.body.add(shelfLed2);

    // crates
    this.lowerCrate = crate(W - 0.06, 0.34, L - 0.06, '#2747a3');
    this.lowerCrate.position.y = 0.34;
    this.body.add(this.lowerCrate);
    this.lowerCrate.add(this.trayItems);
    this.upperCrate = crate(W - 0.04, 0.3, L - 0.04, '#2747a3');
    this.upperCrate.position.y = 0.95;
    this.body.add(this.upperCrate);

    // three bags in the upper crate (compartments along Z)
    for (let i = 0; i < 3; i++) {
      const bag = this.makeBag(i);
      bag.root.position.set(0, 0.03, -0.31 + i * 0.31);
      this.upperCrate.add(bag.root);
      this.bags.push(bag);
      if (i > 0) {
        const div = new THREE.Mesh(new THREE.BoxGeometry(W - 0.08, 0.26, 0.015), std('#2747a3', 0.7));
        div.position.set(0, 0.13, -0.465 + i * 0.31);
        this.upperCrate.add(div);
      }
    }

    // status beacon
    this.beacon = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), new THREE.MeshStandardMaterial({ color: '#4da3ff', emissive: '#4da3ff', emissiveIntensity: 2 }));
    this.beacon.position.set(W / 2 - 0.03, 1.55, -L / 2 + 0.03);
    this.body.add(this.beacon);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.3, 6), postMat);
    pole.position.set(W / 2 - 0.03, 1.4, -L / 2 + 0.03);
    this.body.add(pole);
  }

  private makeBag(i: number): BagView {
    const root = new THREE.Group();
    const color = BAG_COLORS[i];
    const bodyMat = new THREE.MeshStandardMaterial({ color: '#f5f7fa', roughness: 0.85, transparent: true, opacity: 0.88, side: THREE.DoubleSide });
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.15, 0.34, 4, 1, true).rotateY(Math.PI / 4).translate(0, 0.17, 0), bodyMat);
    body.scale.set(1.9, 1, 1);
    body.castShadow = true;
    root.add(body);
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.172, 0.172, 0.04, 4, 1, true).rotateY(Math.PI / 4).translate(0, 0.3, 0), new THREE.MeshStandardMaterial({ color, side: THREE.DoubleSide }));
    band.scale.set(1.9, 1, 1);
    body.add(band);
    band.scale.set(1, 1, 1);
    const handles = new THREE.Group();
    for (const z of [-0.11, 0.11]) {
      const h = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.012, 6, 12, Math.PI), new THREE.MeshStandardMaterial({ color: '#f5f7fa', roughness: 0.8 }));
      h.position.set(0, 0.34, z);
      handles.add(h);
    }
    root.add(handles);
    const knot = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), new THREE.MeshStandardMaterial({ color: '#f5f7fa', roughness: 0.8 }));
    knot.position.y = 0.4;
    knot.visible = false;
    root.add(knot);
    const items = new THREE.Group();
    root.add(items);
    // number tag
    const tag = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 0.12), new THREE.MeshBasicMaterial({ map: numberTexture(i + 1, color), toneMapped: false }));
    tag.position.set(0.33, 0.2, 0);
    tag.rotation.y = Math.PI / 2;
    root.add(tag);
    const tag2 = tag.clone();
    tag2.position.x = -0.33;
    tag2.rotation.y = -Math.PI / 2;
    root.add(tag2);
    return { root, body, handles, knot, items, openAmount: 0, target: 0 };
  }

  setPose(x: number, z: number, heading: number) {
    this.group.position.set(x, 0, z);
    this.group.rotation.y = heading;
  }

  /** Rebuild product meshes in tray and bags when the session changed. */
  sync(session: OrderSession) {
    const sig = JSON.stringify([session.tray, session.bags]);
    if (sig === this.lastSignature) return;
    this.lastSignature = sig;
    this.trayItems.clear();
    session.tray.forEach((pid, i) => {
      const mesh = createProductMesh(getProduct(pid));
      const col = i % 2;
      const row = Math.floor(i / 2);
      mesh.position.set(-0.17 + col * 0.34, 0.03, -0.3 + row * 0.3);
      mesh.rotation.y = Math.PI / 2;
      mesh.scale.setScalar(0.9);
      this.trayItems.add(mesh);
    });
    session.bags.forEach((b, i) => {
      const view = this.bags[i];
      view.target = b.open ? 1 : 0;
      view.knot.visible = b.closed;
      view.items.clear();
      b.items.forEach((pid, k) => {
        const mesh = createProductMesh(getProduct(pid));
        const s = 0.75;
        mesh.scale.setScalar(s);
        mesh.position.set(-0.16 + (k % 3) * 0.16, 0.03 + Math.floor(k / 3) * 0.12, (k % 2) * 0.06 - 0.03);
        mesh.rotation.y = Math.PI / 2 + k * 0.4;
        view.items.add(mesh);
      });
    });
  }

  /** World position of the lower crate (fly-in target for picked products). */
  trayWorldPosition(): THREE.Vector3 {
    return this.lowerCrate.localToWorld(new THREE.Vector3(0, 0.15, 0));
  }

  bagWorldPosition(i: number): THREE.Vector3 {
    return this.bags[i].root.localToWorld(new THREE.Vector3(0, 0.2, 0));
  }

  /** Detaches all bag objects (for the handover animation). */
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

  flash(color: string) {
    this.ledFlash = 0.6;
    this.led.emissive.set(color);
    this.led.color.set(color);
  }

  setStatusColor(color: string) {
    this.ledColor.set(color);
    (this.beacon.material as THREE.MeshStandardMaterial).emissive.set(color);
    (this.beacon.material as THREE.MeshStandardMaterial).color.set(color);
  }

  update(dt: number, speed: number) {
    this.time += dt;
    this.wheelPhase += speed * dt * 12;
    for (const w of this.wheels) w.rotation.x = this.wheelPhase;
    // suspension wobble
    this.body.position.y = Math.abs(speed) > 0.1 ? Math.sin(this.time * 18) * 0.004 : 0;
    this.body.rotation.x = -speed * 0.006;
    if (this.ledFlash > 0) {
      this.ledFlash -= dt;
      if (this.ledFlash <= 0) {
        this.led.emissive.copy(this.ledColor);
        this.led.color.copy(this.ledColor);
      }
    } else {
      this.led.emissive.copy(this.ledColor);
      this.led.color.copy(this.ledColor);
    }
    const b = (this.beacon.material as THREE.MeshStandardMaterial);
    b.emissiveIntensity = 1.2 + Math.sin(this.time * 5) * 0.8;
    for (const bag of this.bags) {
      bag.openAmount += (bag.target - bag.openAmount) * Math.min(1, dt * 8);
      const a = bag.openAmount;
      bag.body.scale.set(1.9 * (0.65 + 0.35 * a), 0.12 + 0.88 * a, 0.65 + 0.35 * a);
      bag.handles.position.y = -0.3 * (1 - a);
      bag.handles.scale.setScalar(0.5 + 0.5 * a);
      bag.items.visible = a > 0.5;
    }
  }
}

function numberTexture(n: number, color: string): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(32, 32, 30, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 40px Arial';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(n), 32, 34);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
