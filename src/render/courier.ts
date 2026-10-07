/**
 * Courier: rides in on a scooter, walks through the sliding doors to the
 * delivery point, waits (waves), takes the bags and rides off.
 */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { createCharacter, type CharacterInstance } from './assets';
import { attachToBone } from './people';
import { bannerTexture, bubbleTexture } from './textures';
import { toonify } from './toon';
import { t } from '../i18n';

const std = (color: string, rough = 0.5, metal = 0) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal });

export type CourierState = 'hidden' | 'ridingIn' | 'walkingIn' | 'waiting' | 'receiving' | 'walkingOut' | 'ridingOut' | 'gone';

function rbox(w: number, h: number, d: number, r: number, m: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D) {
  const mesh = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 2, r), m);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  parent.add(mesh);
  return mesh;
}

function deliveryBox(): THREE.Group {
  const g = new THREE.Group();
  rbox(0.5, 0.46, 0.46, 0.05, std('#FF5B4F', 0.5), 0, 0, 0, g);
  const logo = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.2), new THREE.MeshBasicMaterial({ map: bannerTexture('Order Dash', '', '#FFD23F', '#1b1730', 512, 240), toneMapped: false }));
  logo.position.set(0, 0.05, 0.232);
  g.add(logo);
  const logo2 = logo.clone();
  logo2.position.z = -0.232;
  logo2.rotation.y = Math.PI;
  g.add(logo2);
  rbox(0.52, 0.05, 0.48, 0.02, std('#b91c1c', 0.5), 0, 0.24, 0, g);
  return g;
}

function buildScooter(): THREE.Group {
  const g = new THREE.Group();
  const body = std('#ef4444', 0.35, 0.1);
  const cream = std('#fef3c7', 0.5);
  const dark = std('#1f2328', 0.7);
  const chrome = std('#d1d5db', 0.25, 0.85);
  for (const z of [0.62, -0.55]) {
    const tyre = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.08, 10, 20).rotateY(Math.PI / 2), dark);
    tyre.position.set(0, 0.28, z);
    tyre.castShadow = true;
    g.add(tyre);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.12, 14).rotateZ(Math.PI / 2), chrome);
    hub.position.set(0, 0.28, z);
    g.add(hub);
  }
  rbox(0.36, 0.34, 0.95, 0.12, body, 0, 0.52, -0.18, g);
  rbox(0.32, 0.12, 0.62, 0.05, dark, 0, 0.75, -0.22, g);
  rbox(0.32, 0.75, 0.22, 0.08, body, 0, 0.68, 0.46, g);
  rbox(0.3, 0.06, 0.5, 0.02, cream, 0, 0.36, 0.16, g);
  const fork = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.55, 8), chrome);
  fork.position.set(0, 0.55, 0.6);
  fork.rotation.x = -0.25;
  g.add(fork);
  const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.62, 8).rotateZ(Math.PI / 2), dark);
  bar.position.set(0, 1.12, 0.58);
  g.add(bar);
  const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.06, 14).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#fffbe0', emissive: '#fff3b0', emissiveIntensity: 2 }));
  lamp.position.set(0, 1.0, 0.66);
  g.add(lamp);
  const box = deliveryBox();
  box.position.set(0, 1.08, -0.56);
  g.add(box);
  return g;
}

export class CourierView {
  readonly group = new THREE.Group();
  state: CourierState = 'hidden';
  private scooter = buildScooter();
  private ch: CharacterInstance;
  private rider = new THREE.Group();
  private t = 0;
  private path: THREE.Vector3[] = [];
  private carried: THREE.Object3D[] = [];
  private onArrive?: () => void;
  private onGone?: () => void;
  private bubble: THREE.Sprite;
  private bubbleT = 0;
  doorCallback?: (open: boolean) => void;
  engineLevel = 0;
  private hands = new THREE.Object3D();
  private waveT = 0;

  constructor(private parking: { x: number; z: number }, private spot: { x: number; z: number }, private doorZ: number) {
    this.ch = createCharacter('Rogue', { tint: '#ef4444', hue: 0 });
    this.rider.add(this.ch.root);
    // helmet
    const helmet = new THREE.Group();
    const shell = new THREE.Mesh(new THREE.SphereGeometry(0.5, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.58), std('#f8fafc', 0.3));
    shell.castShadow = true;
    const stripe = new THREE.Mesh(new THREE.SphereGeometry(0.505, 20, 14, -0.25, 0.5, 0, Math.PI * 0.58), std('#ef4444', 0.3));
    const visor = new THREE.Mesh(new THREE.SphereGeometry(0.52, 16, 10, -0.9, 1.8, Math.PI * 0.36, Math.PI * 0.16), std('#1f2937', 0.15, 0.4));
    helmet.add(shell, stripe, visor);
    helmet.position.set(0, 0.5, 0.02);
    attachToBone(this.ch, 'head', helmet, 0.62);
    const pack = deliveryBox();
    pack.rotation.y = Math.PI;
    pack.position.set(0, 0.3, -0.5);
    attachToBone(this.ch, 'chest', pack, 0.9);
    this.rider.add(this.hands);
    this.hands.position.set(0, 1.0, 0.45);
    this.group.add(this.scooter, this.rider);
    this.group.visible = false;
    toonify(this.group);
    this.bubble = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, alphaTest: 0.5 }));
    this.bubble.scale.set(1.3, 0.49, 1);
    this.bubble.position.y = 2.3;
    this.bubble.visible = false;
    this.rider.add(this.bubble);
  }

  get character(): CharacterInstance {
    return this.ch;
  }

  isVisibleNear(x: number, z: number, r: number): boolean {
    if (!this.group.visible || (this.state !== 'waiting' && this.state !== 'walkingIn')) return false;
    const p = this.riderPosition();
    return Math.hypot(p.x - x, p.z - z) < r;
  }

  riderPosition(): THREE.Vector3 {
    return this.rider.getWorldPosition(new THREE.Vector3());
  }

  say(text: string, dur = 3) {
    const m = this.bubble.material as THREE.SpriteMaterial;
    m.map?.dispose();
    m.map = bubbleTexture(text, '#FFD23F', '#1b1730');
    m.needsUpdate = true;
    this.bubble.visible = true;
    this.bubbleT = dur;
  }

  arrive(onArrive: () => void) {
    this.onArrive = onArrive;
    this.group.visible = true;
    this.state = 'ridingIn';
    this.t = 0;
    this.scooter.position.set(-60, 0, this.parking.z + 2.5);
    this.scooter.rotation.y = Math.PI / 2;
    this.mount();
  }

  skipArrival() {
    if (this.state !== 'ridingIn' && this.state !== 'walkingIn') return;
    this.scooter.position.set(this.parking.x, 0, this.parking.z);
    this.scooter.rotation.y = Math.PI;
    this.dismount();
    this.rider.position.set(this.spot.x, 0, this.spot.z);
    this.rider.rotation.y = Math.PI;
    this.finishArrival();
  }

  private finishArrival() {
    this.state = 'waiting';
    this.ch.play('Idle');
    this.doorCallback?.(false);
    this.say(t('courier.ready'));
    this.onArrive?.();
  }

  private mount() {
    this.scooter.add(this.rider);
    this.rider.position.set(0, 0.32, -0.25);
    this.rider.rotation.set(0, 0, 0);
    this.ch.play('Sit_Chair_Idle', 0);
  }

  private dismount() {
    const pos = new THREE.Vector3();
    this.scooter.localToWorld(pos.set(0.7, 0, 0));
    this.group.add(this.rider);
    this.rider.position.set(pos.x, 0, pos.z);
    this.rider.rotation.set(0, 0, 0);
    this.ch.play('Walking_A');
  }

  /** Bags (already in world space) fly into the courier's hands. */
  /** A callback that runs after a delay in game time (pauses with the game). */
  private pending: { t: number; fn: () => void } | null = null;

  receive(bags: THREE.Object3D[], onDone: () => void) {
    this.state = 'receiving';
    this.t = 0;
    this.carried = bags;
    const starts = bags.map((b) => b.position.clone());
    const root = this.group.parent!;
    for (const b of bags) root.add(b);
    this.ch.play('PickUp', 0.2, true);
    this.say(t('courier.thanks'), 2.5);
    const handsW = new THREE.Vector3();
    this.receiveAnim = (t: number) => {
      this.hands.getWorldPosition(handsW);
      bags.forEach((b, i) => {
        const k = Math.min(1, Math.max(0, (t - i * 0.22) / 0.65));
        const e = k * k * (3 - 2 * k);
        const target = handsW.clone().add(new THREE.Vector3((i - 1) * 0.3, 0, 0).applyQuaternion(this.rider.quaternion));
        b.position.lerpVectors(starts[i], target, e);
        b.position.y += Math.sin(e * Math.PI) * 0.7;
        b.rotation.y += 0.05 * (1 - e);
      });
      if (t > 1.5) {
        bags.forEach((b, i) => {
          this.hands.add(b);
          b.position.set((i - 1) * 0.3, -0.25, 0);
          b.rotation.set(0, Math.PI / 2, 0);
        });
        this.receiveAnim = undefined;
        this.ch.play('Cheer', 0.2, true);
        this.pending = { t: 0.9, fn: onDone };
      }
    };
  }
  private receiveAnim?: (t: number) => void;

  leave(onGone: () => void) {
    this.onGone = onGone;
    this.state = 'walkingOut';
    this.doorCallback?.(true);
    this.ch.play('Walking_A');
    this.path = [new THREE.Vector3(this.spot.x, 0, this.doorZ + 1.4), new THREE.Vector3(this.parking.x - 0.8, 0, this.parking.z)];
  }

  private walk(dt: number, speed: number): boolean {
    const target = this.path[0];
    if (!target) return true;
    const p = this.rider.position;
    const dx = target.x - p.x;
    const dz = target.z - p.z;
    const dist = Math.hypot(dx, dz);
    const step = speed * dt;
    this.rider.rotation.y = Math.atan2(dx, dz);
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
    if (this.pending) {
      this.pending.t -= dt;
      if (this.pending.t <= 0) {
        const fn = this.pending.fn;
        this.pending = null;
        fn();
      }
    }
    this.ch.mixer.update(dt);
    if (this.bubbleT > 0) {
      this.bubbleT -= dt;
      (this.bubble.material as THREE.SpriteMaterial).opacity = Math.min(1, this.bubbleT * 3);
      if (this.bubbleT <= 0) this.bubble.visible = false;
    }
    switch (this.state) {
      case 'ridingIn': {
        const dur = 4.5;
        const k = Math.min(1, this.t / dur);
        const e = 1 - Math.pow(1 - k, 3);
        this.scooter.position.x = -60 + (this.parking.x + 60) * e;
        this.scooter.position.z = this.parking.z + 2.5 * (1 - Math.min(1, Math.max(0, (k - 0.6) / 0.4)));
        this.scooter.rotation.y = Math.PI / 2 + (k > 0.75 ? ((k - 0.75) / 0.25) * (Math.PI / 2) : 0);
        this.scooter.rotation.z = -Math.sin(k * Math.PI) * 0.08;
        this.engineLevel = 1 - k * 0.6;
        if (k >= 1) {
          this.scooter.rotation.z = 0;
          this.engineLevel = 0;
          this.dismount();
          this.state = 'walkingIn';
          this.path = [new THREE.Vector3(this.spot.x, 0, this.doorZ + 1.4), new THREE.Vector3(this.spot.x, 0, this.spot.z)];
        }
        break;
      }
      case 'walkingIn':
        if (this.rider.position.z < this.doorZ + 2.6) this.doorCallback?.(true);
        if (this.walk(dt, 1.7)) {
          this.rider.rotation.y = Math.PI;
          this.finishArrival();
        }
        break;
      case 'waiting':
        this.waveT -= dt;
        if (this.waveT <= 0) {
          this.ch.play(this.ch.current === 'Cheer' ? 'Idle' : 'Cheer', 0.3, this.ch.current !== 'Cheer');
          this.waveT = this.ch.current === 'Cheer' ? 1.8 : 4;
        }
        break;
      case 'receiving':
        this.receiveAnim?.(this.t);
        break;
      case 'walkingOut':
        if (this.rider.position.z > this.doorZ + 1.0) this.doorCallback?.(false);
        if (this.walk(dt, 2.0)) {
          for (const b of this.carried) b.removeFromParent();
          this.carried = [];
          this.mount();
          this.state = 'ridingOut';
          this.t = 0;
        }
        break;
      case 'ridingOut': {
        const k = Math.min(1, this.t / 3.2);
        this.scooter.rotation.y = Math.PI - Math.min(1, k * 4) * (Math.PI / 2);
        this.scooter.position.x = this.parking.x + Math.pow(k, 2) * 50;
        this.scooter.position.z = this.parking.z + Math.min(1, k * 3) * 2.5;
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
