/** Builds the supermarket interior (static geometry + instanced products). */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { Display, StoreLayout } from '../data/layout';
import { getProduct, SECTIONS, formatPrice, type ProductDef } from '../data/products';
import { getProductAsset } from './productMeshes';
import { prop } from './assets';
import { aisleSignTexture, bannerTexture, ceilingTexture, floorTexture, glowTexture, posterTexture, priceTagAtlas, wainscotTexture, wallTexture } from './textures';
import { bakeStatic } from './batch';

interface Slot {
  pos: THREE.Vector3;
  rotY: number;
  tilt?: number;
  tiltPivot?: THREE.Vector3;
}

interface DisplayStock {
  productId: string;
  instances: number[];
}

export const SHELF_LEVELS: Record<Display['kind'], number[]> = {
  shelf: [0.14, 0.54, 0.94, 1.34, 1.74],
  fridge: [0.36, 0.74, 1.12, 1.5],
  bakery: [0.34, 0.8, 1.26, 1.72],
  drinks: [0.12, 0.62, 1.12, 1.62],
  produce: [],
  endcap: [],
};

const std = (color: string, rough = 0.6, metal = 0) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal });

export class StoreView {
  readonly group = new THREE.Group();
  private statics = new THREE.Group();
  private stock = new Map<string, DisplayStock>();
  private meshes = new Map<string, THREE.InstancedMesh>();
  private instanceOwner = new Map<string, string[]>();
  private displayById = new Map<string, Display>();
  readonly productMeshes: THREE.InstancedMesh[] = [];
  /** Emissive materials the mood system tunes. */
  readonly fixtureMaterials: THREE.MeshStandardMaterial[] = [];
  readonly glowMaterials: THREE.MeshBasicMaterial[] = [];
  readonly neonMaterials: THREE.MeshStandardMaterial[] = [];
  readonly lightSpots: THREE.Vector3[] = [];
  private doorL!: THREE.Mesh;
  private doorR!: THREE.Mesh;
  private doorOpen = 0;
  doorTarget = 0;
  private hover: THREE.Mesh;
  private hoverMat: THREE.MeshBasicMaterial;
  private hoverGlow: THREE.Mesh;
  private deliveryRing: THREE.Mesh;
  private deliveryArrow: THREE.Mesh;
  deliveryActive = false;
  private belts: THREE.Texture[] = [];
  private time = 0;
  private zero = new THREE.Matrix4().makeScale(0, 0, 0);
  private fixtureMat = new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#fff4e0', emissiveIntensity: 3.2 });

  constructor(private layout: StoreLayout) {
    for (const d of layout.displays) this.displayById.set(d.id, d);
    this.fixtureMaterials.push(this.fixtureMat);
    this.buildShell();
    this.buildLights();
    this.buildFurniture();
    this.buildDecor();
    this.buildSigns();
    this.group.add(bakeStatic(this.statics));
    this.buildProducts();

    this.hoverMat = new THREE.MeshBasicMaterial({ color: 0xfff3a0, side: THREE.BackSide, transparent: true, opacity: 0.95, depthWrite: false, toneMapped: false });
    this.hover = new THREE.Mesh(new THREE.BufferGeometry(), this.hoverMat);
    this.hover.visible = false;
    this.hover.renderOrder = 2;
    this.group.add(this.hover);
    this.hoverGlow = new THREE.Mesh(
      new THREE.BufferGeometry(),
      new THREE.MeshBasicMaterial({ color: 0xfff7c2, transparent: true, opacity: 0.3, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }),
    );
    this.hoverGlow.renderOrder = 3;
    this.hover.add(this.hoverGlow);
    this.hoverGlow.scale.setScalar(1 / 1.1 * 1.02);

    const { delivery } = layout;
    this.deliveryRing = new THREE.Mesh(
      new THREE.RingGeometry(delivery.radius - 0.18, delivery.radius, 64).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0x22c55e, transparent: true, opacity: 0.6, depthWrite: false, toneMapped: false }),
    );
    this.deliveryRing.position.set(delivery.x, 0.015, delivery.z);
    this.deliveryArrow = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.45, 4).rotateX(Math.PI), new THREE.MeshBasicMaterial({ color: 0x22c55e, toneMapped: false }));
    this.deliveryArrow.position.set(delivery.x, 2.4, delivery.z);
    this.deliveryRing.visible = false;
    this.deliveryArrow.visible = false;
    this.group.add(this.deliveryRing, this.deliveryArrow);
  }

  private add<T extends THREE.Object3D>(o: T, x = 0, y = 0, z = 0, rotY = 0): T {
    o.position.set(x, y, z);
    o.rotation.y = rotY;
    this.statics.add(o);
    return o;
  }

  private box(w: number, h: number, d: number, material: THREE.Material, x: number, y: number, z: number, r = 0, rotY = 0): THREE.Mesh {
    const geo = r > 0 ? new RoundedBoxGeometry(w, h, d, 2, r) : new THREE.BoxGeometry(w, h, d);
    const m = new THREE.Mesh(geo, material);
    m.castShadow = true;
    m.receiveShadow = true;
    return this.add(m, x, y, z, rotY);
  }

  // ---------------------------------------------------------------- shell
  private buildShell() {
    const { bounds, wallHeight: H, door } = this.layout;
    const W = bounds.maxX - bounds.minX;
    const D = bounds.maxZ - bounds.minZ;

    const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, D).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: floorTexture(), roughness: 0.22, metalness: 0 }));
    floor.receiveShadow = true;
    this.statics.add(floor);
    const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(W, D).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ map: ceilingTexture(), roughness: 0.95 }));
    ceiling.position.y = H;
    this.statics.add(ceiling);

    const wall = new THREE.MeshStandardMaterial({ map: wallTexture(), roughness: 0.9 });
    const wains = new THREE.MeshStandardMaterial({ map: wainscotTexture('#1f8a70'), roughness: 0.5 });
    const stripe = std('#f2b33d', 0.5);
    const skirting = std('#2b2f36', 0.6);
    const addWall = (len: number, x: number, z: number, rotY: number, from = 0, to = H) => {
      const h = to - from;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(len, h), wall);
      m.position.set(x, from + h / 2, z);
      m.rotation.y = rotY;
      m.receiveShadow = true;
      this.statics.add(m);
      if (from === 0) {
        const wsc = new THREE.Mesh(new THREE.PlaneGeometry(len, 1.1), wains);
        wsc.position.set(x, 0.55, z);
        wsc.rotation.y = rotY;
        wsc.translateZ(0.005);
        this.statics.add(wsc);
        const st = new THREE.Mesh(new THREE.PlaneGeometry(len, 0.12), stripe);
        st.position.set(x, 1.14, z);
        st.rotation.y = rotY;
        st.translateZ(0.008);
        this.statics.add(st);
        const sk = new THREE.Mesh(new THREE.BoxGeometry(len, 0.12, 0.04), skirting);
        sk.position.set(x, 0.06, z);
        sk.rotation.y = rotY;
        sk.translateZ(0.02);
        this.statics.add(sk);
      }
    };
    addWall(W, 0, bounds.minZ, 0);
    addWall(D, bounds.minX, 0, Math.PI / 2);
    addWall(D, bounds.maxX, 0, -Math.PI / 2);

    // front: glass storefront
    const frontZ = bounds.maxZ;
    addWall(W, 0, frontZ, Math.PI, 3.2, H);
    const sill = std('#2b2f36', 0.5, 0.2);
    const glass = new THREE.MeshStandardMaterial({ color: '#d6ecff', roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.16, depthWrite: false });
    for (const [x0, x1] of [
      [bounds.minX, door.minX - 0.3],
      [door.maxX + 0.3, bounds.maxX],
    ]) {
      const len = x1 - x0;
      const pane = new THREE.Mesh(new THREE.PlaneGeometry(len, 2.65), glass);
      pane.position.set((x0 + x1) / 2, 0.55 + 2.65 / 2, frontZ);
      pane.renderOrder = 1;
      const pane2 = pane.clone();
      pane2.rotation.y = Math.PI;
      this.group.add(pane, pane2);
      this.box(len, 0.55, 0.3, sill, (x0 + x1) / 2, 0.275, frontZ);
      this.box(len, 0.12, 0.25, sill, (x0 + x1) / 2, 3.2, frontZ);
      const n = Math.round(len / 2.4);
      for (let i = 0; i <= n; i++) this.box(0.1, 2.75, 0.2, sill, x0 + (i * len) / n, 0.55 + 1.375, frontZ);
    }
    this.box(0.25, 3.2, 0.3, sill, door.minX - 0.15, 1.6, frontZ);
    this.box(0.25, 3.2, 0.3, sill, door.maxX + 0.15, 1.6, frontZ);
    this.box(door.maxX - door.minX + 0.6, 0.3, 0.32, sill, 0, 3.05, frontZ);
    const doorGlass = new THREE.MeshStandardMaterial({ color: '#d7ecff', roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.25, depthWrite: false });
    const half = (door.maxX - door.minX) / 2;
    const mkDoor = () => {
      const g = new THREE.Mesh(new THREE.BoxGeometry(half, 2.85, 0.04), doorGlass);
      const frame = new THREE.Mesh(new THREE.BoxGeometry(half, 0.08, 0.06), sill);
      frame.position.y = -1.42;
      const top = frame.clone();
      top.position.y = 1.42;
      const handle = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.6, 0.08), std('#d1d5db', 0.3, 0.8));
      g.add(frame, top, handle);
      g.renderOrder = 1;
      return g;
    };
    this.doorL = mkDoor();
    this.doorR = mkDoor();
    this.doorL.position.set(-half / 2, 1.425, frontZ);
    this.doorR.position.set(half / 2, 1.425, frontZ);
    this.group.add(this.doorL, this.doorR);
    this.box(4.6, 0.012, 2.2, std('#2f3640', 0.95), 0, 0.006, frontZ - 1.3);
    const welcome = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 1.0), new THREE.MeshBasicMaterial({ map: bannerTexture('HOŞ GELDİNİZ', 'Mahalle Market · 08:00 – 23:00', '#1f8a70'), toneMapped: false }));
    welcome.position.set(0, 3.85, frontZ - 0.05);
    welcome.rotation.y = Math.PI;
    this.statics.add(welcome);
  }

  // ---------------------------------------------------------------- light fixtures
  private buildLights() {
    const H = this.layout.wallHeight;
    const housing = std('#3a3f47', 0.5, 0.4);
    const poolMat = new THREE.MeshBasicMaterial({ map: glowTexture(), color: '#fff3d6', transparent: true, opacity: 0.1, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
    this.glowMaterials.push(poolMat);
    const cable = std('#222', 0.5);
    for (const x of [-13.8, -8, -4, 0, 4, 8, 13.8]) {
      for (const [z0, z1] of [
        [-12.6, -6.2],
        [-4.6, 2.2],
      ]) {
        const len = z1 - z0;
        const zc = (z0 + z1) / 2;
        this.box(0.24, 0.08, len, housing, x, H - 0.55, zc);
        this.add(new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.02, len - 0.1), this.fixtureMat), x, H - 0.6, zc);
        for (const zz of [z0 + 0.3, z1 - 0.3]) this.add(new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.5, 4), cable), x, H - 0.27, zz);
        const pool = new THREE.Mesh(new THREE.PlaneGeometry(2.6, len + 1.6).rotateX(-Math.PI / 2), poolMat);
        pool.position.set(x, 0.01, zc);
        this.group.add(pool);
        this.lightSpots.push(new THREE.Vector3(x, H - 0.7, zc));
      }
    }
    for (let x = -13.8; x <= 14; x += 4.6) {
      for (const z of [6.4, 11.2]) {
        this.box(1.2, 0.06, 1.2, housing, x, H - 0.03, z);
        this.add(new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.1).rotateX(Math.PI / 2), this.fixtureMat), x, H - 0.065, z);
        const pool = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 3.2).rotateX(-Math.PI / 2), poolMat);
        pool.position.set(x, 0.011, z);
        this.group.add(pool);
      }
    }
    this.lightSpots.push(new THREE.Vector3(-11, H - 0.7, 8.5), new THREE.Vector3(0, H - 0.7, 10), new THREE.Vector3(10, H - 0.7, 9));
  }

  // ---------------------------------------------------------------- furniture
  private buildFurniture() {
    const white = std('#f7f7f2', 0.45, 0.05);
    const metal = std('#d5dae0', 0.35, 0.5);
    const dark = std('#2f343c', 0.6);
    const wood = std('#b9824f', 0.75);
    const woodDark = std('#8a5a33', 0.8);
    for (const f of this.layout.furniture) {
      const b = f.box;
      const w = b.maxX - b.minX;
      const d = b.maxZ - b.minZ;
      const cx = (b.minX + b.maxX) / 2;
      const cz = (b.minZ + b.maxZ) / 2;
      const color = f.section ? SECTIONS[f.section].color : '#888';
      const accent = std(color, 0.45);
      const pale = std(new THREE.Color(color).lerp(new THREE.Color('#ffffff'), 0.72).getStyle(), 0.7);
      if (f.kind === 'gondola') {
        this.box(w, 0.12, d, dark, cx, 0.06, cz, 0.02);
        this.box(0.06, 2.06, d - 0.02, pale, cx, 1.15, cz);
        for (const y of SHELF_LEVELS.shelf) {
          this.box(w - 0.02, 0.035, d - 0.04, white, cx, y - 0.018, cz, 0.012);
          for (const s of [-1, 1]) this.box(0.025, 0.07, d - 0.06, accent, cx + s * (w / 2 - 0.02), y + 0.005, cz, 0.008);
        }
        this.box(w + 0.04, 0.16, d + 0.04, accent, cx, 2.16, cz, 0.05);
        for (const s of [-1, 1]) this.box(w + 0.08, 2.24, 0.08, accent, cx, 1.12, cz + s * (d / 2 + 0.02), 0.03);
      } else if (f.kind === 'endcap') {
        this.box(w, 0.72, d, accent, cx, 0.36, cz, 0.06);
        this.box(w + 0.04, 0.05, d + 0.04, white, cx, 0.72, cz, 0.02);
        const board = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.42), new THREE.MeshBasicMaterial({ map: bannerTexture('İNDİRİM', '%25 kampanya', '#e11d48', '#fff', 512, 240), toneMapped: false }));
        this.add(board, cx, 1.9, cz + 0.2);
        this.box(0.03, 1.2, 0.03, metal, cx, 1.2, cz + 0.18);
      } else if (f.kind === 'fridge') {
        const inner = std('#cfe7f7', 0.4);
        this.box(w, 2.3, 0.12, white, cx, 1.15, b.minZ + 0.06);
        this.box(w, 2.0, 0.04, inner, cx, 1.25, b.minZ + 0.14);
        this.box(w, 0.32, d, white, cx, 0.16, cz, 0.03);
        this.box(w, 0.08, d * 0.3, accent, cx, 0.34, b.maxZ - d * 0.15, 0.02);
        this.box(w + 0.02, 0.26, d * 0.7, accent, cx, 2.25, b.minZ + d * 0.35, 0.05);
        this.add(new THREE.Mesh(new THREE.BoxGeometry(w - 0.1, 0.03, 0.05), this.fixtureMat), cx, 2.1, b.minZ + d * 0.62);
        for (const y of SHELF_LEVELS.fridge.slice(1)) this.box(w, 0.025, d * 0.78, std('#e2f2ff', 0.1, 0.1), cx, y - 0.013, b.minZ + d * 0.42);
        const cols = Math.round(w / 1.2);
        for (let i = 0; i <= cols; i++) this.box(0.05, 2.0, d * 0.85, white, b.minX + i * 1.2, 1.25, b.minZ + d * 0.42, 0.01);
      } else if (f.kind === 'wallShelf') {
        const facing = cx < 0 ? 1 : -1;
        const isBakery = f.section === 'bakery';
        const shelfMat = isBakery ? wood : white;
        this.box(0.06, 2.3, d, isBakery ? woodDark : pale, cx - facing * (w / 2 - 0.03), 1.15, cz);
        for (const y of SHELF_LEVELS[isBakery ? 'bakery' : 'drinks']) {
          this.box(w, 0.035, d, shelfMat, cx, y - 0.018, cz, 0.01);
          this.box(0.03, 0.07, d, accent, cx + facing * (w / 2 - 0.015), y, cz, 0.008);
        }
        this.box(w, 0.12, d, dark, cx, 0.06, cz);
        this.box(w + 0.04, 0.2, d, accent, cx, 2.38, cz, 0.04);
        const cols = Math.round(d / 1.2);
        for (let i = 0; i <= cols; i++) this.box(w, 2.3, 0.04, shelfMat, cx, 1.15, b.minZ + i * 1.2);
      } else if (f.kind === 'produceIsland') {
        this.box(w, 0.5, d, woodDark, cx, 0.25, cz, 0.04);
        this.box(w * 0.98, 0.42, 0.12, wood, cx, 0.92, cz, 0.03);
      } else if (f.kind === 'checkout') {
        this.box(w, 0.9, d, std('#f3f4f6', 0.5), cx, 0.45, cz, 0.05);
        this.box(w - 0.04, 0.06, d - 0.04, accent, cx, 0.88, cz, 0.02);
        const beltTex = beltTexture();
        this.belts.push(beltTex);
        const belt = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.62, d * 0.62).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: beltTex, roughness: 0.8 }));
        belt.position.set(cx - 0.08, 0.915, cz - d * 0.12);
        this.group.add(belt);
        this.box(0.36, 0.14, 0.3, dark, cx, 0.98, cz + d / 2 - 0.4, 0.02);
        this.box(0.32, 0.22, 0.03, dark, cx + 0.05, 1.22, cz + d / 2 - 0.5, 0.01, -0.6);
        const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.28, 0.18), new THREE.MeshBasicMaterial({ color: '#4ade80', toneMapped: false }));
        scr.position.set(cx + 0.05, 1.22, cz + d / 2 - 0.5);
        scr.rotation.y = -0.6;
        scr.translateZ(0.017);
        this.statics.add(scr);
        this.box(0.08, 0.14, 0.05, dark, cx - 0.25, 0.97, cz + d / 2 - 0.25, 0.01);
        this.box(0.05, 1.3, 0.05, metal, cx + w / 2 - 0.05, 1.55, cz + d / 2 - 0.1);
        const lampMat = new THREE.MeshStandardMaterial({ color, emissive: '#ff4d6d', emissiveIntensity: 2 });
        this.neonMaterials.push(lampMat);
        this.add(new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.08, 20).rotateX(Math.PI / 2), lampMat), cx + w / 2 - 0.05, 2.25, cz + d / 2 - 0.1);
        this.box(0.35, 1.1, 0.5, accent, cx - w / 2 - 0.2, 0.55, cz + d / 2 - 0.3, 0.03);
      } else if (f.kind === 'pillar') {
        const p = prop('pillar_A', 1);
        p.scale.set(1, this.layout.wallHeight / 4.1, 1);
        this.add(p, cx, 0, cz);
      }
    }

    for (const d of this.layout.displays) {
      if (d.kind !== 'produce') continue;
      const frame = this.displayFrame(d);
      const crate = prop('crate');
      crate.scale.set((d.width - 0.1) / 2, 0.42, (d.depth - 0.05) / 2);
      crate.position.set(0, 0.62, 0.02);
      crate.rotation.x = 0.26;
      frame.add(crate);
      this.statics.add(frame);
    }

    const ids = [...new Set(this.layout.displays.map((d) => d.productId))];
    const promos = new Set(this.layout.displays.filter((d) => d.kind === 'endcap').map((d) => d.productId));
    const atlas = priceTagAtlas(
      ids.map((id) => {
        const p = getProduct(id);
        return { key: id, name: p.name, price: formatPrice(promos.has(id) ? p.price * 0.75 : p.price), color: SECTIONS[p.section].color, promo: promos.has(id) };
      }),
    );
    const tagMat = new THREE.MeshBasicMaterial({ map: atlas.texture, toneMapped: false });
    for (const d of this.layout.displays) {
      const [u0, v0, u1, v1] = atlas.uv.get(d.productId)!;
      const geo = new THREE.PlaneGeometry(0.42, 0.105);
      const uv = geo.attributes.uv as THREE.BufferAttribute;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) ? u1 : u0, uv.getY(i) ? v1 : v0);
      const frame = this.displayFrame(d);
      const levels = SHELF_LEVELS[d.kind];
      const ys = d.kind === 'produce' ? [0.48] : d.kind === 'endcap' ? [0.6] : [levels[1] - 0.045, levels[3] - 0.045];
      for (const y of ys) {
        const tag = new THREE.Mesh(geo, tagMat);
        const z = d.kind === 'produce' ? d.depth / 2 + 0.03 : d.depth / 2 + 0.005;
        tag.position.set(0, y, z);
        frame.add(tag);
      }
      this.statics.add(frame);
    }
  }

  // ---------------------------------------------------------------- decor
  private buildDecor() {
    for (const dc of this.layout.decor) {
      const a = dc.angle ?? 0;
      switch (dc.kind) {
        case 'plant':
          this.add(prop(dc.model!, 0.95), dc.x, 0, dc.z, a);
          break;
        case 'boxes':
          for (let i = 0; i < 4; i++) {
            const bx = prop(i % 2 ? 'box_B' : 'box_A', i % 2 ? 4.6 : 4.2);
            this.add(bx, dc.x + ((i % 2) - 0.5) * 0.7, i < 2 ? 0 : 0.78, dc.z + (i > 1 ? 0.05 : 0), a + i * 0.3);
          }
          break;
        case 'crateRow': {
          const crates = ['crate_tomatoes', 'crate_potatoes', 'crate_onions', 'crate_carrots', 'crate_lettuce'];
          for (let i = 0; i < 5; i++) this.add(prop(crates[i], 0.36), dc.x, 0, dc.z - dc.hz + 0.7 + i * 1.45, Math.PI / 2);
          break;
        }
        case 'baskets':
          for (let i = 0; i < 6; i++) this.add(shoppingBasket(), dc.x, 0.02 + i * 0.09, dc.z, 0.1);
          break;
        case 'trash':
          this.add(prop('trash_A', 6), dc.x, 0, dc.z, a);
          break;
        case 'wetSign':
          this.add(wetFloorSign(), dc.x, 0, dc.z, a);
          break;
        case 'buns':
          this.add(prop('crate_buns', 0.4), dc.x, 0, dc.z, a);
          break;
      }
    }
    this.add(prop('menu', 1.4), -17.0, 2.5, -10.9, Math.PI / 2);
    const posters: [string, string, string, number, number, 'star' | 'leaf' | 'drop'][] = [
      ['%30', 'Tüm cipslerde indirim!', '#e11d48', -17.96, 6.2, 'star'],
      ['TAZE', 'Her sabah tarladan', '#16a34a', -17.96, 10.6, 'leaf'],
      ['2 AL', '1 öde · İçeceklerde', '#0ea5b7', 17.96, 5.4, 'drop'],
      ['YENİ', 'Kapında! ile 15 dk teslimat', '#f59e0b', 17.96, 11.8, 'star'],
    ];
    for (const [t, s, c, x, z, icon] of posters) {
      const frame = new THREE.Group();
      const back = new THREE.Mesh(new RoundedBoxGeometry(1.3, 1.8, 0.06, 2, 0.03), std('#2b2f36', 0.5));
      const pic = new THREE.Mesh(new THREE.PlaneGeometry(1.18, 1.66), new THREE.MeshStandardMaterial({ map: posterTexture(t, s, c, '#fff', icon), roughness: 0.6 }));
      pic.position.z = 0.032;
      frame.add(back, pic);
      frame.position.set(x, 2.55, z);
      frame.rotation.y = x < 0 ? Math.PI / 2 : -Math.PI / 2;
      this.statics.add(frame);
    }
    const duct = std('#b8bec7', 0.45, 0.6);
    for (const x of [-11, 11]) this.add(new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 28, 16).rotateX(Math.PI / 2), duct), x, this.layout.wallHeight - 0.4, -0.5);
  }

  private buildSigns() {
    for (const s of this.layout.signs) {
      const sec = SECTIONS[s.section];
      const h = s.width / 4;
      const material = new THREE.MeshBasicMaterial({ map: aisleSignTexture(sec.name, sec.color, sec.aisle), toneMapped: false });
      const front = new THREE.Mesh(new THREE.PlaneGeometry(s.width, h), material);
      front.position.set(s.x, s.y, s.z);
      front.rotation.y = s.angle;
      front.translateZ(0.025);
      this.statics.add(front);
      if (!s.hanging) continue;
      const back = new THREE.Mesh(new THREE.PlaneGeometry(s.width, h), material);
      back.position.set(s.x, s.y, s.z);
      back.rotation.y = s.angle + Math.PI;
      back.translateZ(0.025);
      this.statics.add(back);
      const edge = new THREE.Mesh(new RoundedBoxGeometry(s.width + 0.05, h + 0.05, 0.04, 2, 0.02), std('#ffffff', 0.5));
      edge.position.set(s.x, s.y, s.z);
      edge.rotation.y = s.angle;
      this.statics.add(edge);
      const len = Math.max(0.1, this.layout.wallHeight - (s.y + h / 2));
      for (const sx of [-1, 1]) {
        const wire = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, len, 4), std('#444', 0.5));
        wire.position.set(s.x + Math.cos(s.angle) * sx * s.width * 0.4, s.y + h / 2 + len / 2, s.z - Math.sin(s.angle) * sx * s.width * 0.4);
        this.statics.add(wire);
      }
    }
  }

  private displayFrame(d: Display): THREE.Group {
    const g = new THREE.Group();
    g.position.set(d.x, 0, d.z);
    g.rotation.y = d.angle;
    return g;
  }

  private slotsFor(d: Display, p: ProductDef): Slot[] {
    const [w, ph, pd] = p.size;
    const slots: Slot[] = [];
    if (d.kind === 'produce') {
      const cw = d.width - 0.32;
      const cd = d.depth - 0.28;
      const nx = Math.max(2, Math.floor(cw / (w * 1.12)));
      const nz = Math.max(2, Math.floor(cd / (pd * 1.12)));
      let seed = Math.abs(Math.round(d.x * 13 + d.z * 7)) + 1;
      const rnd = () => {
        seed = (seed * 9301 + 49297) % 233280;
        return seed / 233280;
      };
      for (let layer = 0; layer < 2; layer++) {
        for (let i = 0; i < nx - layer; i++) {
          for (let j = 0; j < nz - layer; j++) {
            if (layer === 1 && (i + j) % 2 === 1) continue;
            const x = -cw / 2 + (i + 0.5 + layer * 0.5) * (cw / nx) + (rnd() - 0.5) * 0.02;
            const z = -cd / 2 + (j + 0.5 + layer * 0.5) * (cd / nz);
            slots.push({ pos: new THREE.Vector3(x, 0.05 + layer * ph * 0.7, z), rotY: rnd() * Math.PI * 2, tilt: 0.26, tiltPivot: new THREE.Vector3(0, 0.62, 0.02) });
          }
        }
      }
      return slots;
    }
    if (d.kind === 'endcap') {
      const baseN = Math.max(2, Math.min(5, Math.floor((d.width - 0.1) / (w + 0.02))));
      const rows = Math.max(1, Math.min(3, Math.floor((d.depth - 0.1) / (pd + 0.02))));
      for (let layer = 0; layer < Math.min(baseN, 4); layer++) {
        const n = baseN - layer;
        const r2 = Math.max(1, rows - layer);
        for (let r = 0; r < r2; r++) {
          for (let i = 0; i < n; i++) {
            slots.push({ pos: new THREE.Vector3((i - (n - 1) / 2) * (w + 0.02), 0.745 + layer * (ph + 0.004), (r - (r2 - 1) / 2) * (pd + 0.02)), rotY: 0 });
          }
        }
      }
      return slots;
    }
    const levels = SHELF_LEVELS[d.kind];
    const usableW = d.width - 0.14;
    const n = Math.max(1, Math.min(6, Math.floor(usableW / (w + 0.025))));
    const usableD = d.kind === 'shelf' ? 0.44 : 0.75;
    const rows = d.kind === 'shelf' ? 1 : Math.max(1, Math.min(2, Math.floor(usableD / (pd + 0.035))));
    const stackable = ph < 0.09 && ['block', 'box', 'can', 'eggbox'].includes(p.shape);
    for (const y of levels) {
      for (let r = rows - 1; r >= 0; r--) {
        for (let i = 0; i < n; i++) {
          const x = -usableW / 2 + (i + 0.5) * (usableW / n);
          const z = d.depth / 2 - 0.05 - pd / 2 - r * (pd + 0.03);
          const layers = stackable ? Math.min(2, Math.floor(0.3 / (ph + 0.005))) : 1;
          for (let s = 0; s < layers; s++) slots.push({ pos: new THREE.Vector3(x, y + 0.002 + s * (ph + 0.003), z), rotY: 0 });
        }
      }
    }
    return slots;
  }

  private buildProducts() {
    const perProduct = new Map<string, { display: string; matrix: THREE.Matrix4 }[]>();
    const frame = new THREE.Object3D();
    const tilt = new THREE.Object3D();
    const item = new THREE.Object3D();
    frame.add(tilt);
    tilt.add(item);
    for (const d of this.layout.displays) {
      const p = getProduct(d.productId);
      frame.position.set(d.x, 0, d.z);
      frame.rotation.set(0, d.angle, 0);
      for (const s of this.slotsFor(d, p)) {
        if (s.tilt && s.tiltPivot) {
          tilt.position.copy(s.tiltPivot);
          tilt.rotation.set(s.tilt, 0, 0);
        } else {
          tilt.position.set(0, 0, 0);
          tilt.rotation.set(0, 0, 0);
        }
        item.position.copy(s.pos);
        item.rotation.set(0, s.rotY, 0);
        frame.updateMatrixWorld(true);
        const list = perProduct.get(p.id) ?? [];
        list.push({ display: d.id, matrix: item.matrixWorld.clone() });
        perProduct.set(p.id, list);
      }
    }
    for (const [pid, list] of perProduct) {
      const asset = getProductAsset(getProduct(pid));
      const mesh = new THREE.InstancedMesh(asset.geometry, asset.materials, list.length);
      mesh.castShadow = false;
      mesh.receiveShadow = true;
      const owners: string[] = [];
      list.forEach((e, i) => {
        mesh.setMatrixAt(i, e.matrix);
        owners.push(e.display);
        let st = this.stock.get(e.display);
        if (!st) {
          st = { productId: pid, instances: [] };
          this.stock.set(e.display, st);
        }
        st.instances.push(i);
      });
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
      mesh.computeBoundingBox();
      mesh.name = `products:${pid}`;
      this.instanceOwner.set(mesh.uuid, owners);
      this.meshes.set(pid, mesh);
      this.productMeshes.push(mesh);
      this.group.add(mesh);
    }
  }

  /** Display + instance under a raycast hit on a product mesh. */
  resolveHit(mesh: THREE.Object3D, instanceId: number | undefined): { display: Display; instance: number } | null {
    if (instanceId === undefined) return null;
    const owners = this.instanceOwner.get(mesh.uuid);
    if (!owners) return null;
    const did = owners[instanceId];
    const st = this.stock.get(did);
    if (!st || !st.instances.includes(instanceId)) return null;
    return { display: this.displayById.get(did)!, instance: instanceId };
  }

  /** World positions (centres) of the products still on a display. */
  instancePositions(displayId: string): THREE.Vector3[] {
    const st = this.stock.get(displayId);
    if (!st) return [];
    const mesh = this.meshes.get(st.productId)!;
    const c = mesh.geometry.boundingBox!.getCenter(new THREE.Vector3());
    const m = new THREE.Matrix4();
    return st.instances.map((i) => {
      mesh.getMatrixAt(i, m);
      return c.clone().applyMatrix4(m);
    });
  }

  stockOf(displayId: string): number {
    return this.stock.get(displayId)?.instances.length ?? 0;
  }

  /** Removes a product instance (a specific one, or the last) from a display. */
  take(displayId: string, instance?: number): { position: THREE.Vector3; quaternion: THREE.Quaternion } | null {
    const st = this.stock.get(displayId);
    if (!st || st.instances.length === 0) return null;
    let idx: number;
    if (instance !== undefined && st.instances.includes(instance)) {
      st.instances.splice(st.instances.indexOf(instance), 1);
      idx = instance;
    } else idx = st.instances.pop()!;
    const mesh = this.meshes.get(st.productId)!;
    const mat = new THREE.Matrix4();
    mesh.getMatrixAt(idx, mat);
    const position = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    mat.decompose(position, quaternion, new THREE.Vector3());
    mesh.setMatrixAt(idx, this.zero);
    mesh.instanceMatrix.needsUpdate = true;
    if (this.hover.userData.key === `${st.productId}:${idx}`) this.setHover(null);
    return { position, quaternion };
  }

  /** Outline around the hovered product instance. */
  setHover(hit: { display: Display; instance: number } | null, color = 0xfff3a0) {
    if (!hit) {
      this.hover.visible = false;
      this.hover.userData.key = '';
      return;
    }
    const mesh = this.meshes.get(hit.display.productId)!;
    const key = `${hit.display.productId}:${hit.instance}`;
    if (this.hover.userData.key !== key) {
      this.hover.geometry = mesh.geometry;
      this.hoverGlow.geometry = mesh.geometry;
      const m = new THREE.Matrix4();
      mesh.getMatrixAt(hit.instance, m);
      const pos = new THREE.Vector3();
      const q = new THREE.Quaternion();
      const s = new THREE.Vector3();
      m.decompose(pos, q, s);
      const k = 1.1;
      const c = mesh.geometry.boundingBox!.getCenter(new THREE.Vector3()).applyQuaternion(q);
      this.hover.position.copy(pos).addScaledVector(c, 1 - k);
      this.hover.quaternion.copy(q);
      this.hover.scale.copy(s).multiplyScalar(k);
      this.hover.userData.key = key;
    }
    this.hoverMat.color.setHex(color);
    this.hover.visible = true;
  }

  displayById_(id: string): Display | undefined {
    return this.displayById.get(id);
  }

  update(dt: number) {
    this.time += dt;
    this.doorOpen += (this.doorTarget - this.doorOpen) * Math.min(1, dt * 4);
    const half = (this.layout.door.maxX - this.layout.door.minX) / 2;
    this.doorL.position.x = -half / 2 - this.doorOpen * half * 0.95;
    this.doorR.position.x = half / 2 + this.doorOpen * half * 0.95;
    for (const b of this.belts) b.offset.y = (b.offset.y + dt * 0.25) % 1;
    const pulse = 0.5 + 0.5 * Math.sin(this.time * 4);
    this.deliveryRing.visible = this.deliveryActive;
    this.deliveryArrow.visible = this.deliveryActive;
    (this.deliveryRing.material as THREE.MeshBasicMaterial).opacity = 0.45 + 0.45 * pulse;
    this.deliveryArrow.position.y = 2.3 + Math.sin(this.time * 3) * 0.15;
    this.deliveryArrow.rotation.y += dt * 2;
    this.hoverMat.opacity = 0.55 + 0.4 * pulse;
    (this.hoverGlow.material as THREE.MeshBasicMaterial).opacity = 0.12 + 0.2 * pulse;
  }
}

function beltTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#1f2328';
  ctx.fillRect(0, 0, 64, 64);
  ctx.fillStyle = '#2c3138';
  for (let y = 0; y < 64; y += 8) ctx.fillRect(0, y, 64, 3);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(1, 6);
  return t;
}

/** Red plastic shopping basket (entrance stack; customers carry them). */
export function shoppingBasket(color = '#e11d48'): THREE.Group {
  const g = new THREE.Group();
  const m = std(color, 0.5);
  const w = 0.42;
  const d = 0.3;
  const h = 0.22;
  const bottom = new THREE.Mesh(new RoundedBoxGeometry(w * 0.95, 0.02, d * 0.95, 2, 0.008), m);
  bottom.position.y = 0.01;
  g.add(bottom);
  for (let i = 0; i < 4; i++) {
    const y = 0.03 + i * (h / 4);
    for (const s of [-1, 1]) {
      const a = new THREE.Mesh(new THREE.BoxGeometry(w, 0.022, 0.014), m);
      a.position.set(0, y, (s * d) / 2);
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.022, d), m);
      b.position.set((s * w) / 2, y, 0);
      g.add(a, b);
    }
  }
  for (const [x, z] of [
    [-w / 2, -d / 2],
    [w / 2, -d / 2],
    [-w / 2, d / 2],
    [w / 2, d / 2],
    [0, d / 2],
    [0, -d / 2],
  ]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.016, h, 0.016), m);
    post.position.set(x, h / 2, z);
    g.add(post);
  }
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.012, 6, 16, Math.PI), std('#1f2937', 0.5));
  handle.position.y = h;
  g.add(handle);
  g.traverse((o) => ((o as THREE.Mesh).castShadow = true));
  return g;
}

function wetFloorSign(): THREE.Group {
  const g = new THREE.Group();
  const yellow = std('#facc15', 0.5);
  const face = new THREE.MeshStandardMaterial({ map: bannerTexture('DİKKAT!', 'Kaygan zemin', '#facc15', '#1f2937', 256, 256), roughness: 0.5 });
  for (const s of [-1, 1]) {
    const board = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.62, 0.015), yellow);
    board.position.set(0, 0.3, s * 0.1);
    board.rotation.x = s * 0.18;
    const sticker = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.3), face);
    sticker.position.set(0, 0.36, s * 0.112);
    sticker.rotation.x = s * 0.18;
    if (s < 0) sticker.rotation.y = Math.PI;
    g.add(board, sticker);
  }
  g.traverse((o) => ((o as THREE.Mesh).castShadow = true));
  return g;
}
