/** The street outside the storefront: pavement, road, buildings, traffic. */
import * as THREE from 'three';
import { prop } from './assets';
import { asphaltTexture, pavementTexture, bannerTexture } from './textures';
import { bakeStatic } from './batch';

const CITY = 5; // KayKit city kit → metres

interface Car {
  obj: THREE.Object3D;
  lane: number;
  speed: number;
  x: number;
}

export class OutsideView {
  readonly group = new THREE.Group();
  private cars: Car[] = [];
  readonly streetLampMaterials: THREE.MeshStandardMaterial[] = [];
  readonly lampSpots: THREE.Vector3[] = [];
  readonly windowMaterials: THREE.MeshStandardMaterial[] = [];

  constructor(frontZ: number) {
    const statics = new THREE.Group();
    const sidewalkZ0 = frontZ;
    const roadZ0 = frontZ + 5.5;
    const roadZ1 = roadZ0 + 8;
    const farWalkZ1 = roadZ1 + 3.5;

    const pave = new THREE.Mesh(new THREE.PlaneGeometry(140, roadZ0 - sidewalkZ0).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: pavementTexture(), roughness: 0.9 }));
    pave.position.set(0, 0.02, (sidewalkZ0 + roadZ0) / 2);
    pave.receiveShadow = true;
    const curb = new THREE.Mesh(new THREE.BoxGeometry(140, 0.15, 0.3), new THREE.MeshStandardMaterial({ color: '#9ca3af', roughness: 0.8 }));
    curb.position.set(0, 0.05, roadZ0);
    const road = new THREE.Mesh(new THREE.PlaneGeometry(140, roadZ1 - roadZ0).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: asphaltTexture(), roughness: 0.92 }));
    road.position.set(0, 0, (roadZ0 + roadZ1) / 2);
    road.receiveShadow = true;
    const far = pave.clone();
    far.scale.z = (farWalkZ1 - roadZ1) / (roadZ0 - sidewalkZ0);
    far.position.z = (roadZ1 + farWalkZ1) / 2;
    const curb2 = curb.clone();
    curb2.position.z = roadZ1;
    statics.add(pave, curb, road, far, curb2);
    const lineMat = new THREE.MeshBasicMaterial({ color: '#f5d061' });
    for (let x = -66; x <= 66; x += 5) {
      const dash = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.18).rotateX(-Math.PI / 2), lineMat);
      dash.position.set(x, 0.01, (roadZ0 + roadZ1) / 2);
      statics.add(dash);
    }
    // zebra crossing in front of the door
    for (let i = 0; i < 7; i++) {
      const stripe = new THREE.Mesh(new THREE.PlaneGeometry(0.7, roadZ1 - roadZ0 - 0.6).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#f1f1f1' }));
      stripe.position.set(-6 + i * 1.3, 0.012, (roadZ0 + roadZ1) / 2);
      statics.add(stripe);
    }
    const grass = new THREE.Mesh(new THREE.PlaneGeometry(400, 400).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#86b06a', roughness: 1 }));
    grass.position.y = -0.03;
    statics.add(grass);

    // building row across the street
    const names = ['building_C', 'building_E', 'building_G', 'building_D', 'building_H', 'building_F', 'building_C', 'building_G', 'building_E', 'building_D'];
    names.forEach((n, i) => {
      const b = prop(n, CITY);
      b.position.set(-45 + i * 10, 0, farWalkZ1 + 5);
      b.rotation.y = Math.PI;
      statics.add(b);
    });
    // buildings to the sides of the store (seen through the side of the windows)
    for (const [n, x] of [
      ['building_A', -25],
      ['building_B', 25],
    ] as const) {
      const b = prop(n, CITY);
      b.position.set(x, 0, frontZ - 5);
      b.rotation.y = Math.PI;
      statics.add(b);
    }
    // street furniture
    const lampMat = new THREE.MeshStandardMaterial({ color: '#fff7d6', emissive: '#ffd27a', emissiveIntensity: 0 });
    this.streetLampMaterials.push(lampMat);
    for (let x = -30; x <= 30; x += 12) {
      const l = prop('streetlight', CITY);
      l.position.set(x, 0, roadZ0 - 0.5);
      l.rotation.y = Math.PI / 2;
      statics.add(l);
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.18, 10, 8), lampMat);
      bulb.position.set(x, 4.55, roadZ0 + 0.35);
      this.group.add(bulb);
      this.lampSpots.push(new THREE.Vector3(x, 4.3, roadZ0 + 0.4));
    }
    for (let x = -36; x <= 36; x += 9) {
      if (Math.abs(x) < 6) continue;
      const t = prop('bush', 7);
      t.position.set(x + 2, 0, roadZ0 - 1.4);
      statics.add(t);
    }
    const hydrant = prop('firehydrant', CITY);
    hydrant.position.set(-8, 0, roadZ0 - 0.8);
    statics.add(hydrant);
    const bench = prop('bench', CITY);
    bench.position.set(9, 0, frontZ + 1.4);
    statics.add(bench);
    const dumpster = prop('dumpster', CITY);
    dumpster.position.set(-20, 0, frontZ + 1.4);
    statics.add(dumpster);

    // storefront sign above the door, outside
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(8, 1.5), new THREE.MeshBasicMaterial({ map: bannerTexture('MAHALLE MARKET', 'Taze · Hızlı · Kapında!', '#1f8a70'), toneMapped: false }));
    sign.position.set(0, 4.0, frontZ + 0.08);
    statics.add(sign);
    // awning
    const awning = new THREE.Mesh(new THREE.BoxGeometry(36.2, 0.12, 1.6), new THREE.MeshStandardMaterial({ color: '#1f8a70', roughness: 0.7 }));
    awning.position.set(0, 3.35, frontZ + 0.75);
    awning.rotation.x = 0.12;
    statics.add(awning);
    // exterior facade band
    const facade = new THREE.Mesh(new THREE.BoxGeometry(36.4, 1.6, 0.3), new THREE.MeshStandardMaterial({ color: '#f4efe4', roughness: 0.9 }));
    facade.position.set(0, 4.0, frontZ + 0.02);
    statics.add(facade);

    this.group.add(bakeStatic(statics));

    // traffic
    const carNames = ['car_taxi', 'car_sedan', 'car_hatchback', 'car_stationwagon', 'car_police'];
    for (let i = 0; i < 5; i++) {
      const lane = i % 2;
      const obj = prop(carNames[i], CITY);
      obj.rotation.y = lane === 0 ? Math.PI / 2 : -Math.PI / 2;
      this.group.add(obj);
      this.cars.push({ obj, lane, speed: 6 + Math.random() * 4, x: -70 + i * 30 });
    }
    this.roadZ = [roadZ0 + 2.1, roadZ1 - 2.1];
  }

  private roadZ: [number, number];

  private baseColors = new Map<THREE.Material, THREE.Color>();

  /** Scales the brightness of everything outside (night = darker street, lit windows by lamps). */
  setDaylight(k: number) {
    this.group.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
      if (!m || !m.color || this.streetLampMaterials.includes(m)) return;
      if (!this.baseColors.has(m)) this.baseColors.set(m, m.color.clone());
      m.color.copy(this.baseColors.get(m)!).multiplyScalar(k);
    });
  }

  update(dt: number) {
    for (const c of this.cars) {
      const dir = c.lane === 0 ? 1 : -1;
      c.x += dir * c.speed * dt;
      if (c.x > 75) c.x = -75;
      if (c.x < -75) c.x = 75;
      c.obj.position.set(c.x, 0, this.roadZ[c.lane]);
    }
  }
}
