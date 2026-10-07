/**
 * Delivery courier: rides in on a scooter, walks to the store's delivery
 * point, takes the bags and rides off. Scripted with a tiny state machine.
 */
import * as THREE from 'three';

const std = (color: string, rough = 0.6, metal = 0) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal });

export type CourierState = 'hidden' | 'ridingIn' | 'walkingIn' | 'waiting' | 'receiving' | 'walkingOut' | 'ridingOut' | 'gone';

function buildScooter(): THREE.Group {
  const g = new THREE.Group();
  const body = std('#e63946', 0.4, 0.2);
  const dark = std('#1d1d1f', 0.8);
  const chrome = std('#c9ced6', 0.25, 0.8);
  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    g.add(m);
    return m;
  };
  // local +Z = forward
  for (const z of [0.6, -0.55]) add(new THREE.TorusGeometry(0.22, 0.08, 8, 16).rotateY(Math.PI / 2), dark, 0, 0.3, z);
  for (const z of [0.6, -0.55]) add(new THREE.CylinderGeometry(0.1, 0.1, 0.1, 10).rotateZ(Math.PI / 2), chrome, 0, 0.3, z);
  add(new THREE.BoxGeometry(0.34, 0.3, 0.9), body, 0, 0.5, -0.15);
  add(new THREE.BoxGeometry(0.3, 0.12, 0.6), dark, 0, 0.72, -0.2); // seat
  add(new THREE.BoxGeometry(0.3, 0.7, 0.2), body, 0, 0.65, 0.45); // front shield
  add(new THREE.CylinderGeometry(0.03, 0.03, 0.5, 6).rotateX(-0.3), chrome, 0, 1.0, 0.55);
  add(new THREE.CylinderGeometry(0.025, 0.025, 0.6, 6).rotateZ(Math.PI / 2), dark, 0, 1.22, 0.6);
  const lamp = add(new THREE.CylinderGeometry(0.07, 0.07, 0.05, 10).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#fffbe0', emissive: '#fff3b0', emissiveIntensity: 1.5 }), 0, 1.0, 0.62);
  lamp.castShadow = false;
  // delivery box
  const box = add(new THREE.BoxGeometry(0.55, 0.5, 0.5), std('#ffb703', 0.5), 0, 1.05, -0.55);
  box.name = 'deliveryBox';
  add(new THREE.BoxGeometry(0.56, 0.06, 0.51), std('#d48c00', 0.5), 0, 1.31, -0.55);
  return g;
}

function buildRider(): { root: THREE.Group; legL: THREE.Group; legR: THREE.Group; armL: THREE.Group; armR: THREE.Group; hands: THREE.Group } {
  const root = new THREE.Group();
  const jacket = std('#ffb703', 0.7);
  const pants = std('#2b2d42', 0.8);
  const skin = std('#e0ac69', 0.7);
  const helmet = std('#e63946', 0.3, 0.1);
  const mk = (geo: THREE.BufferGeometry, mat: THREE.Material, parent: THREE.Object3D, x: number, y: number, z: number) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    parent.add(m);
    return m;
  };
  const leg = (x: number) => {
    const g = new THREE.Group();
    g.position.set(x, 0.9, 0);
    mk(new THREE.BoxGeometry(0.16, 0.85, 0.18), pants, g, 0, -0.43, 0);
    mk(new THREE.BoxGeometry(0.17, 0.1, 0.28), std('#111', 0.9), g, 0, -0.85, 0.05);
    root.add(g);
    return g;
  };
  const legL = leg(-0.11);
  const legR = leg(0.11);
  mk(new THREE.BoxGeometry(0.46, 0.62, 0.28), jacket, root, 0, 1.22, 0);
  mk(new THREE.BoxGeometry(0.47, 0.06, 0.29), std('#e9ecef', 0.4), root, 0, 1.12, 0); // reflective stripe
  mk(new THREE.BoxGeometry(0.42, 0.45, 0.3), std('#ff8c00', 0.6), root, 0, 1.25, -0.28); // backpack
  mk(new THREE.SphereGeometry(0.13, 12, 10), skin, root, 0, 1.68, 0);
  mk(new THREE.SphereGeometry(0.155, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.6), helmet, root, 0, 1.71, 0);
  mk(new THREE.BoxGeometry(0.2, 0.06, 0.03), std('#222', 0.2), root, 0, 1.68, 0.12); // visor
  const arm = (x: number) => {
    const g = new THREE.Group();
    g.position.set(x, 1.48, 0);
    mk(new THREE.BoxGeometry(0.12, 0.6, 0.14), jacket, g, 0, -0.28, 0);
    mk(new THREE.SphereGeometry(0.06, 8, 6), skin, g, 0, -0.6, 0);
    root.add(g);
    return g;
  };
  const armL = arm(-0.3);
  const armR = arm(0.3);
  const hands = new THREE.Group();
  hands.position.set(0, 1.05, 0.35);
  root.add(hands);
  return { root, legL, legR, armL, armR, hands };
}

export class CourierView {
  readonly group = new THREE.Group();
  state: CourierState = 'hidden';
  private scooter = buildScooter();
  private rider = buildRider();
  private t = 0;
  private walkPhase = 0;
  private path: THREE.Vector3[] = [];
  private carried: THREE.Object3D[] = [];
  private onArrive?: () => void;
  private onGone?: () => void;
  /** Called with true/false to open/close the store doors. */
  doorCallback?: (open: boolean) => void;
  engineLevel = 0;

  constructor(private parking: { x: number; z: number }, private spot: { x: number; z: number }, private doorZ: number) {
    this.group.add(this.scooter, this.rider.root);
    this.group.visible = false;
  }

  /** World position of the rider (for camera framing). */
  riderPosition(): THREE.Vector3 {
    return this.rider.root.position.clone();
  }

  isVisible(): boolean {
    return this.group.visible;
  }

  arrive(onArrive: () => void) {
    this.onArrive = onArrive;
    this.group.visible = true;
    this.state = 'ridingIn';
    this.t = 0;
    this.scooter.position.set(-34, 0, this.parking.z);
    this.scooter.rotation.y = Math.PI / 2;
    this.rider.root.visible = true;
    this.mountRider();
  }

  /** Skip straight to the waiting state (used by the debug API). */
  skipArrival() {
    if (this.state !== 'ridingIn' && this.state !== 'walkingIn') return;
    this.scooter.position.set(this.parking.x, 0, this.parking.z);
    this.scooter.rotation.y = Math.PI;
    this.dismount();
    this.rider.root.position.set(this.spot.x, 0, this.spot.z);
    this.rider.root.rotation.y = Math.PI;
    this.finishArrival();
  }

  private finishArrival() {
    this.state = 'waiting';
    this.doorCallback?.(false);
    this.onArrive?.();
  }

  private mountRider() {
    this.scooter.add(this.rider.root);
    this.rider.root.position.set(0, 0.0, -0.15);
    this.rider.root.rotation.set(0, 0, 0);
    this.rider.legL.rotation.x = -1.2;
    this.rider.legR.rotation.x = -1.2;
    this.rider.armL.rotation.x = -1.0;
    this.rider.armR.rotation.x = -1.0;
    this.rider.root.position.y = -0.18;
  }

  private dismount() {
    const pos = new THREE.Vector3();
    this.scooter.localToWorld(pos.set(0.6, 0, 0));
    this.group.add(this.rider.root);
    this.rider.root.position.set(pos.x, 0, pos.z);
    this.rider.root.rotation.set(0, 0, 0);
    this.rider.legL.rotation.x = 0;
    this.rider.legR.rotation.x = 0;
    this.rider.armL.rotation.x = 0;
    this.rider.armR.rotation.x = 0;
  }

  /** Bags (already in world space) fly into the rider's hands. */
  receive(bags: THREE.Object3D[], onDone: () => void) {
    this.state = 'receiving';
    this.t = 0;
    this.carried = bags;
    const starts = bags.map((b) => b.position.clone());
    for (const b of bags) this.group.parent?.add(b);
    const hands = new THREE.Vector3();
    const anim = { starts, onDone };
    this.receiveAnim = (t: number) => {
      this.rider.hands.getWorldPosition(hands);
      bags.forEach((b, i) => {
        const k = Math.min(1, Math.max(0, (t - i * 0.25) / 0.7));
        const e = k * k * (3 - 2 * k);
        const target = hands.clone().add(new THREE.Vector3((i - 1) * 0.28, 0, 0));
        b.position.lerpVectors(anim.starts[i], target, e);
        b.position.y += Math.sin(e * Math.PI) * 0.6;
      });
      this.rider.armL.rotation.x = -1.1 * Math.min(1, t * 2);
      this.rider.armR.rotation.x = -1.1 * Math.min(1, t * 2);
      if (t > 1.4) {
        // parent bags to hands so they follow the rider
        bags.forEach((b, i) => {
          this.rider.hands.add(b);
          b.position.set((i - 1) * 0.28, -0.1, 0);
          b.rotation.set(0, Math.PI / 2, 0);
          b.scale.setScalar(0.9);
        });
        this.receiveAnim = undefined;
        anim.onDone();
      }
    };
  }
  private receiveAnim?: (t: number) => void;

  leave(onGone: () => void) {
    this.onGone = onGone;
    this.state = 'walkingOut';
    this.doorCallback?.(true);
    this.path = [new THREE.Vector3(this.spot.x, 0, this.doorZ + 1.2), new THREE.Vector3(this.parking.x - 0.7, 0, this.parking.z)];
  }

  private walkTowards(dt: number, speed: number): boolean {
    const target = this.path[0];
    if (!target) return true;
    const p = this.rider.root.position;
    const dx = target.x - p.x;
    const dz = target.z - p.z;
    const dist = Math.hypot(dx, dz);
    const step = speed * dt;
    const desired = Math.atan2(dx, dz);
    this.rider.root.rotation.y = desired;
    this.walkPhase += dt * 9;
    const swing = Math.sin(this.walkPhase) * 0.6;
    this.rider.legL.rotation.x = swing;
    this.rider.legR.rotation.x = -swing;
    if (!this.carried.length) {
      this.rider.armL.rotation.x = -swing * 0.8;
      this.rider.armR.rotation.x = swing * 0.8;
    }
    if (dist <= step) {
      p.set(target.x, 0, target.z);
      this.path.shift();
      return this.path.length === 0;
    }
    p.x += (dx / dist) * step;
    p.z += (dz / dist) * step;
    return false;
  }

  update(dt: number) {
    if (!this.group.visible) return;
    this.t += dt;
    switch (this.state) {
      case 'ridingIn': {
        const dur = 3.2;
        const k = Math.min(1, this.t / dur);
        const e = 1 - Math.pow(1 - k, 3);
        // along the road, then a little turn into the parking spot
        this.scooter.position.x = -34 + (this.parking.x + 34) * e;
        this.scooter.position.z = this.parking.z + Math.sin(k * Math.PI) * 0.8;
        this.scooter.rotation.y = Math.PI / 2 + (k > 0.8 ? ((k - 0.8) / 0.2) * (Math.PI / 2) : 0);
        this.scooter.rotation.z = -Math.sin(k * Math.PI) * 0.08;
        this.engineLevel = 1 - k * 0.6;
        if (k >= 1) {
          this.scooter.rotation.z = 0;
          this.engineLevel = 0;
          this.dismount();
          this.state = 'walkingIn';
          this.doorCallback?.(true);
          this.path = [new THREE.Vector3(this.spot.x, 0, this.doorZ + 1.2), new THREE.Vector3(this.spot.x, 0, this.spot.z)];
        }
        break;
      }
      case 'walkingIn':
        if (this.walkTowards(dt, 1.8)) {
          this.rider.root.rotation.y = Math.PI;
          this.rider.legL.rotation.x = this.rider.legR.rotation.x = 0;
          this.rider.armL.rotation.x = this.rider.armR.rotation.x = 0;
          this.finishArrival();
        }
        break;
      case 'waiting': {
        // idle: wave every few seconds
        const wave = Math.max(0, Math.sin(this.t * 2.2));
        this.rider.armR.rotation.z = wave * 2.4;
        break;
      }
      case 'receiving':
        this.rider.armR.rotation.z = 0;
        this.receiveAnim?.(this.t);
        break;
      case 'walkingOut':
        if (this.rider.root.position.z > this.doorZ + 0.8) this.doorCallback?.(false);
        if (this.walkTowards(dt, 2.0)) {
          for (const b of this.carried) b.removeFromParent();
          this.carried = [];
          this.mountRider();
          this.state = 'ridingOut';
          this.t = 0;
        }
        break;
      case 'ridingOut': {
        const k = Math.min(1, this.t / 3);
        this.scooter.rotation.y = Math.PI - Math.min(1, k * 4) * (Math.PI / 2);
        this.scooter.position.x = this.parking.x + Math.pow(k, 2) * 40;
        this.engineLevel = 0.4 + k * 0.6;
        if (k >= 1) {
          this.state = 'gone';
          this.engineLevel = 0;
          this.group.visible = false;
          this.onGone?.();
        }
        break;
      }
      default:
        break;
    }
  }
}
