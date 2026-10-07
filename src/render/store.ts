/** Builds the supermarket scene (static geometry + instanced products). */
import * as THREE from 'three';
import type { Display, StoreLayout } from '../data/layout';
import { interactionZone } from '../data/layout';
import { getProduct, SECTIONS, type ProductDef } from '../data/products';
import { getProductAsset } from './productMeshes';
import { asphaltTexture, floorTexture, priceTagAtlas, signTexture, textTexture } from './textures';
import { bakeStatic } from './batch';

interface ItemSlot {
  /** transform relative to the display frame */
  pos: THREE.Vector3;
  rotY: number;
  tilt?: number;
  tiltPivot?: THREE.Vector3;
}

interface DisplayStock {
  productId: string;
  instances: number[]; // remaining instance indices (pop from the end)
}

const SHELF_LEVELS: Record<Display['kind'], number[]> = {
  shelf: [0.12, 0.55, 0.98, 1.41],
  fridge: [0.28, 0.66, 1.04, 1.42],
  bakery: [0.3, 0.75, 1.2, 1.65],
  drinks: [0.12, 0.6, 1.08, 1.56],
  produce: [],
};

const PRICES: Record<string, string> = {};
function priceFor(p: ProductDef): string {
  if (!PRICES[p.id]) {
    let h = 0;
    for (const c of p.id) h = (h * 31 + c.charCodeAt(0)) % 997;
    PRICES[p.id] = `₺${(15 + (h % 180)).toString()},${(h % 2 ? 90 : 50)}`;
  }
  return PRICES[p.id];
}

const m = (color: string, rough = 0.7, metal = 0) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal });

export class StoreView {
  readonly group = new THREE.Group();
  /** Everything that never moves; merged into a few meshes after building. */
  private statics = new THREE.Group();
  private stock = new Map<string, DisplayStock>();
  private meshes = new Map<string, THREE.InstancedMesh>();
  private displayById = new Map<string, Display>();
  private highlightFrame: THREE.LineSegments;
  private highlightFloor: THREE.Mesh;
  private doorL!: THREE.Mesh;
  private doorR!: THREE.Mesh;
  private doorOpen = 0;
  doorTarget = 0;
  private deliveryRing: THREE.Mesh;
  private deliveryDisc: THREE.Mesh;
  private deliveryLabel: THREE.Sprite;
  deliveryActive = false;
  private time = 0;
  private zero = new THREE.Matrix4().makeScale(0, 0, 0);

  constructor(private layout: StoreLayout) {
    for (const d of layout.displays) this.displayById.set(d.id, d);
    this.buildShell();
    this.buildFurniture();
    this.buildSigns();
    this.group.add(bakeStatic(this.statics));
    this.buildProducts();

    // highlight helpers
    this.highlightFrame = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)),
      new THREE.LineBasicMaterial({ color: 0xffe14d, transparent: true, opacity: 0.95 }),
    );
    this.highlightFrame.visible = false;
    this.group.add(this.highlightFrame);
    this.highlightFloor = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0xffe14d, transparent: true, opacity: 0.22, depthWrite: false }),
    );
    this.highlightFloor.visible = false;
    this.group.add(this.highlightFloor);

    // delivery zone marker
    const { delivery } = layout;
    this.deliveryRing = new THREE.Mesh(
      new THREE.RingGeometry(delivery.radius - 0.15, delivery.radius, 48).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0x2ecc71, transparent: true, opacity: 0.5, depthWrite: false }),
    );
    this.deliveryRing.position.set(delivery.x, 0.02, delivery.z);
    this.deliveryDisc = new THREE.Mesh(
      new THREE.CircleGeometry(delivery.radius - 0.15, 48).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0x2ecc71, transparent: true, opacity: 0.08, depthWrite: false }),
    );
    this.deliveryDisc.position.set(delivery.x, 0.015, delivery.z);
    this.deliveryLabel = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: textTexture('TESLİMAT NOKTASI', 'rgba(39,174,96,0.92)'), depthTest: false }),
    );
    this.deliveryLabel.scale.set(1.8, 0.45, 1);
    this.deliveryLabel.position.set(delivery.x - 1.9, 1.6, delivery.z);
    this.deliveryLabel.visible = false;
    this.group.add(this.deliveryRing, this.deliveryDisc, this.deliveryLabel);
  }

  // ------------------------------------------------------------------ shell
  private buildShell() {
    const { bounds, wallHeight, door } = this.layout;
    const W = bounds.maxX - bounds.minX;
    const D = bounds.maxZ - bounds.minZ;

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(W, D).rotateX(-Math.PI / 2),
      new THREE.MeshStandardMaterial({ map: floorTexture(), roughness: 0.35, metalness: 0.05 }),
    );
    floor.receiveShadow = true;
    this.statics.add(floor);

    // outside: sidewalk + road
    const sidewalk = new THREE.Mesh(new THREE.PlaneGeometry(W + 30, 5).rotateX(-Math.PI / 2), m('#b9b4aa', 0.9));
    sidewalk.position.set(0, -0.01, bounds.maxZ + 2.5);
    sidewalk.receiveShadow = true;
    const road = new THREE.Mesh(
      new THREE.PlaneGeometry(W + 30, 14).rotateX(-Math.PI / 2),
      new THREE.MeshStandardMaterial({ map: asphaltTexture(), roughness: 0.95 }),
    );
    road.position.set(0, -0.03, bounds.maxZ + 12);
    road.receiveShadow = true;
    const grass = new THREE.Mesh(new THREE.PlaneGeometry(200, 200).rotateX(-Math.PI / 2), m('#7aa86a', 1));
    grass.position.y = -0.06;
    this.statics.add(sidewalk, road, grass);
    // road dashes
    for (let x = -24; x <= 24; x += 4) {
      const dash = new THREE.Mesh(new THREE.PlaneGeometry(2, 0.15).rotateX(-Math.PI / 2), m('#f4f1e6', 0.8));
      dash.position.set(x, -0.02, bounds.maxZ + 12);
      this.statics.add(dash);
    }

    // walls: single sided planes facing inward, so the chase camera can see through them from outside
    const wallMat = new THREE.MeshStandardMaterial({ color: '#f3efe6', roughness: 0.9 });
    const stripeMat = new THREE.MeshStandardMaterial({ color: '#d7263d', roughness: 0.6 });
    const addWall = (len: number, x: number, z: number, rotY: number, h = wallHeight, y = 0) => {
      const w = new THREE.Mesh(new THREE.PlaneGeometry(len, h), wallMat);
      w.position.set(x, y + h / 2, z);
      w.rotation.y = rotY;
      w.receiveShadow = true;
      this.statics.add(w);
      if (y === 0) {
        const s = new THREE.Mesh(new THREE.PlaneGeometry(len, 0.35), stripeMat);
        s.position.set(x, 2.6, z);
        s.rotation.y = rotY;
        s.translateZ(0.01);
        this.statics.add(s);
      }
    };
    addWall(W, 0, bounds.minZ, 0);
    addWall(D, bounds.minX, 0, Math.PI / 2);
    addWall(D, bounds.maxX, 0, -Math.PI / 2);
    const leftLen = door.minX - bounds.minX;
    const rightLen = bounds.maxX - door.maxX;
    addWall(leftLen, bounds.minX + leftLen / 2, bounds.maxZ, Math.PI);
    addWall(rightLen, door.maxX + rightLen / 2, bounds.maxZ, Math.PI);
    addWall(door.maxX - door.minX, (door.minX + door.maxX) / 2, bounds.maxZ, Math.PI, wallHeight - 2.6, 2.6);

    // exterior facade (seen from the street when the courier arrives)
    const facadeMat = new THREE.MeshStandardMaterial({ color: '#2b3a55', roughness: 0.8 });
    const facadeL = new THREE.Mesh(new THREE.PlaneGeometry(leftLen, wallHeight + 0.6), facadeMat);
    facadeL.position.set(bounds.minX + leftLen / 2, (wallHeight + 0.6) / 2, bounds.maxZ + 0.02);
    const facadeR = facadeL.clone();
    facadeR.position.x = door.maxX + rightLen / 2;
    this.statics.add(facadeL, facadeR);

    // entrance mat + sliding glass doors
    const mat = new THREE.Mesh(new THREE.PlaneGeometry(4, 1.6).rotateX(-Math.PI / 2), m('#3b3f46', 1));
    mat.position.set(0, 0.012, bounds.maxZ - 0.9);
    this.statics.add(mat);
    const glass = new THREE.MeshStandardMaterial({ color: '#bfe6ff', transparent: true, opacity: 0.35, roughness: 0.05, metalness: 0.2 });
    const frame = m('#9aa3ad', 0.4, 0.6);
    const mkDoor = () => {
      const g = new THREE.Mesh(new THREE.BoxGeometry(2, 2.5, 0.06), glass);
      const f = new THREE.Mesh(new THREE.BoxGeometry(2, 0.08, 0.08), frame);
      f.position.y = -1.21;
      g.add(f);
      return g;
    };
    this.doorL = mkDoor();
    this.doorR = mkDoor();
    this.doorL.position.set(-1, 1.25, bounds.maxZ);
    this.doorR.position.set(1, 1.25, bounds.maxZ);
    this.group.add(this.doorL, this.doorR);
    const header = new THREE.Mesh(new THREE.PlaneGeometry(6, 0.9), new THREE.MeshBasicMaterial({ map: signTexture('MARKET', '#d7263d', 'Online Sipariş Merkezi'), toneMapped: false }));
    header.position.set(0, 3.25, bounds.maxZ + 0.05);
    this.statics.add(header);
  }

  // -------------------------------------------------------------- furniture
  private buildFurniture() {
    const metal = m('#cfd5dc', 0.45, 0.4);
    const panel = m('#e9edf1', 0.6);
    const dark = m('#3a3f47', 0.6);
    const wood = m('#b07a47', 0.8);

    for (const f of this.layout.furniture) {
      const b = f.box;
      const w = b.maxX - b.minX;
      const d = b.maxZ - b.minZ;
      const cx = (b.minX + b.maxX) / 2;
      const cz = (b.minZ + b.maxZ) / 2;
      const color = f.section ? SECTIONS[f.section].color : '#888';
      const g = new THREE.Group();
      g.position.set(cx, 0, cz);
      this.statics.add(g);
      const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, shadow = true) => {
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(x, y, z);
        mesh.castShadow = shadow;
        mesh.receiveShadow = true;
        g.add(mesh);
        return mesh;
      };
      const accent = m(color, 0.5);

      if (f.kind === 'gondola') {
        add(new THREE.BoxGeometry(w, 0.1, d), dark, 0, 0.05, 0);
        add(new THREE.BoxGeometry(0.08, 1.95, d), panel, 0, 1.0, 0);
        for (const y of SHELF_LEVELS.shelf) {
          add(new THREE.BoxGeometry(w, 0.03, d), metal, 0, y - 0.015, 0, false);
          for (const sx of [-1, 1]) add(new THREE.BoxGeometry(0.02, 0.06, d), accent, sx * (w / 2 - 0.01), y + 0.0, 0, false);
        }
        add(new THREE.BoxGeometry(w, 0.12, d + 0.04), accent, 0, 2.0, 0);
        // end caps
        for (const sz of [-1, 1]) add(new THREE.BoxGeometry(w + 0.04, 2.06, 0.06), accent, 0, 1.03, sz * (d / 2));
      } else if (f.kind === 'fridge') {
        // along X, facing +Z
        add(new THREE.BoxGeometry(w, 2.15, 0.12), m('#dfe6ec', 0.4), 0, 1.07, -d / 2 + 0.06);
        add(new THREE.BoxGeometry(w, 0.25, d), m('#f7f9fb', 0.3), 0, 0.12, 0);
        add(new THREE.BoxGeometry(w, 0.28, d + 0.1), m('#1f4fa3', 0.4), 0, 2.15, 0.05);
        const glow = new THREE.Mesh(new THREE.BoxGeometry(w, 0.04, 0.06), new THREE.MeshBasicMaterial({ color: '#e8f6ff' }));
        glow.position.set(0, 1.98, d / 2 - 0.1);
        g.add(glow);
        for (const y of SHELF_LEVELS.fridge.slice(1)) add(new THREE.BoxGeometry(w, 0.025, d * 0.8), metal, 0, y - 0.013, -d * 0.08, false);
        const cols = Math.round(w / 1.2);
        for (let i = 0; i <= cols; i++) add(new THREE.BoxGeometry(0.05, 2.0, d), m('#cdd5de', 0.4), -w / 2 + i * 1.2, 1.0, 0);
      } else if (f.kind === 'wallShelf') {
        // along Z, against a side wall
        const facing = cx < 0 ? 1 : -1;
        const isBakery = f.section === 'bakery';
        const mat = isBakery ? wood : metal;
        add(new THREE.BoxGeometry(0.06, 2.1, d), isBakery ? m('#8a5a33', 0.9) : panel, -facing * (w / 2 - 0.03), 1.05, 0);
        const levels = SHELF_LEVELS[isBakery ? 'bakery' : 'drinks'];
        for (const y of levels) {
          add(new THREE.BoxGeometry(w, 0.03, d), mat, 0, y - 0.015, 0, false);
          add(new THREE.BoxGeometry(0.03, 0.07, d), accent, facing * (w / 2 - 0.015), y, 0, false);
        }
        add(new THREE.BoxGeometry(w, 0.1, d), dark, 0, 0.05, 0);
        add(new THREE.BoxGeometry(w, 0.14, d), accent, 0, 2.18, 0);
        const cols = Math.round(d / 1.2);
        for (let i = 0; i <= cols; i++) add(new THREE.BoxGeometry(w, 2.1, 0.04), mat, 0, 1.05, -d / 2 + i * 1.2);
      } else if (f.kind === 'produceIsland') {
        add(new THREE.BoxGeometry(w, 0.55, d), m('#7b5434', 0.9), 0, 0.275, 0);
        add(new THREE.BoxGeometry(w * 0.98, 0.5, 0.1), m('#5f3f25', 0.9), 0, 0.85, 0);
      } else if (f.kind === 'checkout') {
        add(new THREE.BoxGeometry(w, 0.85, d), m('#e9ecef', 0.5), 0, 0.425, 0);
        add(new THREE.BoxGeometry(w * 0.7, 0.04, d * 0.8), dark, 0, 0.87, 0.1);
        add(new THREE.BoxGeometry(0.35, 0.3, 0.06), dark, 0.1, 1.15, -d / 2 + 0.3);
        const lamp = add(new THREE.CylinderGeometry(0.06, 0.06, 0.7, 8), m('#d7263d', 0.5), w / 2 - 0.1, 1.2, d / 2 - 0.1);
        lamp.castShadow = false;
      }
    }

    // produce crates (one per display), tilted toward the aisle
    for (const d of this.layout.displays) {
      if (d.kind !== 'produce') continue;
      const frame = this.displayFrame(d);
      const crate = new THREE.Group();
      crate.position.set(0, 0.62, 0.05);
      crate.rotation.x = 0.28;
      frame.add(crate);
      const cm = m('#c99a62', 0.9);
      const cw = d.width - 0.12;
      const cd = d.depth - 0.12;
      const parts: [number, number, number, number, number, number][] = [
        [cw, 0.04, cd, 0, 0, 0],
        [cw, 0.16, 0.03, 0, 0.08, cd / 2],
        [cw, 0.16, 0.03, 0, 0.08, -cd / 2],
        [0.03, 0.16, cd, cw / 2, 0.08, 0],
        [0.03, 0.16, cd, -cw / 2, 0.08, 0],
      ];
      for (const [w, h, dd, x, y, z] of parts) {
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, dd), cm);
        mesh.position.set(x, y, z);
        mesh.castShadow = true;
        crate.add(mesh);
      }
      this.statics.add(frame);
    }

    // price tags along the shelf edges (one per display column), all from one atlas texture
    const ids = [...new Set(this.layout.displays.map((d) => d.productId))];
    const atlas = priceTagAtlas(
      ids.map((id) => {
        const p = getProduct(id);
        return { key: id, name: p.name, price: priceFor(p), color: SECTIONS[p.section].color };
      }),
    );
    const tagMat = new THREE.MeshBasicMaterial({ map: atlas.texture, toneMapped: false });
    for (const d of this.layout.displays) {
      const [u0, v0, u1, v1] = atlas.uv.get(d.productId)!;
      const geo = new THREE.PlaneGeometry(0.7, 0.13);
      const uv = geo.attributes.uv as THREE.BufferAttribute;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) ? u1 : u0, uv.getY(i) ? v1 : v0);
      const tag = new THREE.Mesh(geo, tagMat);
      const frame = this.displayFrame(d);
      const y = d.kind === 'produce' ? 0.48 : (SHELF_LEVELS[d.kind][2] ?? 1) - 0.06;
      tag.position.set(0, y, d.kind === 'produce' ? d.depth / 2 - 0.05 : d.depth / 2 + 0.012);
      frame.add(tag);
      this.statics.add(frame);
    }
  }

  private buildSigns() {
    for (const s of this.layout.signs) {
      const sec = SECTIONS[s.section];
      const tex = signTexture(sec.name.toLocaleUpperCase('tr-TR'), sec.color);
      const h = s.width / 4;
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(s.width, h), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
      sign.position.set(s.x, s.y, s.z);
      sign.rotation.y = s.angle;
      // offset slightly away from the wall it might be mounted on
      sign.translateZ(0.03);
      this.statics.add(sign);
      // wall-mounted signs sit on the side/back walls; everything else hangs from the ceiling
      const b = this.layout.bounds;
      const hanging = s.x > b.minX + 0.5 && s.x < b.maxX - 0.5 && s.z > b.minZ + 0.5;
      if (hanging) {
        // short wires up to the ceiling line
        const len = Math.max(0.1, this.layout.wallHeight - (s.y + h / 2));
        for (const sx of [-1, 1]) {
          const wire = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, len, 4), m('#555', 0.5));
          wire.position.set(sx * s.width * 0.4, h / 2 + len / 2, 0);
          sign.add(wire);
        }
      }
    }
  }

  /** Object3D positioned+rotated like the display (local +Z faces the aisle). */
  private displayFrame(d: Display): THREE.Group {
    const g = new THREE.Group();
    g.position.set(d.x, 0, d.z);
    g.rotation.y = d.angle;
    return g;
  }

  private slotsFor(d: Display, p: ProductDef): ItemSlot[] {
    const [w, , pd] = p.size;
    const slots: ItemSlot[] = [];
    if (d.kind === 'produce') {
      const cw = d.width - 0.2;
      const cd = d.depth - 0.2;
      const nx = Math.max(2, Math.floor(cw / (w * 1.05)));
      const nz = Math.max(2, Math.floor(cd / (pd * 1.05)));
      let seed = d.id.length * 13 + d.x * 7;
      const rnd = () => {
        seed = (seed * 9301 + 49297) % 233280;
        return seed / 233280;
      };
      for (let layer = 0; layer < 2; layer++) {
        for (let i = 0; i < nx - layer; i++) {
          for (let j = 0; j < nz - layer; j++) {
            const x = -cw / 2 + (i + 0.5 + layer * 0.5) * (cw / nx) + (rnd() - 0.5) * 0.02;
            const z = -cd / 2 + (j + 0.5 + layer * 0.5) * (cd / nz);
            slots.push({ pos: new THREE.Vector3(x, 0.02 + layer * p.size[1] * 0.75, z), rotY: rnd() * Math.PI * 2, tilt: 0.28, tiltPivot: new THREE.Vector3(0, 0.62, 0.05) });
          }
        }
      }
      return slots;
    }
    const levels = SHELF_LEVELS[d.kind];
    const usableW = d.width - 0.12;
    const n = Math.max(1, Math.min(6, Math.floor(usableW / (w + 0.03))));
    const usableD = d.kind === 'shelf' ? 0.42 : 0.72;
    // only the front rows are visible from the chase camera
    const rows = d.kind === 'shelf' ? 1 : Math.max(1, Math.min(2, Math.floor(usableD / (pd + 0.04))));
    for (const y of levels) {
      for (let r = rows - 1; r >= 0; r--) {
        for (let i = 0; i < n; i++) {
          const x = -usableW / 2 + (i + 0.5) * (usableW / n);
          const z = d.depth / 2 - 0.06 - pd / 2 - r * (pd + 0.04);
          slots.push({ pos: new THREE.Vector3(x, y + 0.002, z), rotY: 0 });
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
      list.forEach((e, i) => {
        mesh.setMatrixAt(i, e.matrix);
        let st = this.stock.get(e.display);
        if (!st) {
          st = { productId: pid, instances: [] };
          this.stock.set(e.display, st);
        }
        st.instances.push(i);
      });
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
      mesh.name = `products:${pid}`;
      this.meshes.set(pid, mesh);
      this.group.add(mesh);
    }
  }

  stockOf(displayId: string): number {
    return this.stock.get(displayId)?.instances.length ?? 0;
  }

  /** Removes one product instance from a display; returns its world position + rotation. */
  take(displayId: string): { position: THREE.Vector3; quaternion: THREE.Quaternion } | null {
    const st = this.stock.get(displayId);
    if (!st || st.instances.length === 0) return null;
    const idx = st.instances.pop()!;
    const mesh = this.meshes.get(st.productId)!;
    const mat = new THREE.Matrix4();
    mesh.getMatrixAt(idx, mat);
    const position = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    mat.decompose(position, quaternion, new THREE.Vector3());
    mesh.setMatrixAt(idx, this.zero);
    mesh.instanceMatrix.needsUpdate = true;
    return { position, quaternion };
  }

  highlight(d: Display | null) {
    this.highlightFrame.visible = !!d;
    this.highlightFloor.visible = !!d;
    if (!d) return;
    const height = d.kind === 'produce' ? 1.0 : 2.0;
    this.highlightFrame.position.set(d.x, height / 2, d.z);
    this.highlightFrame.rotation.y = d.angle;
    this.highlightFrame.scale.set(d.width - 0.04, height, d.depth + 0.04);
    const zone = interactionZone(d);
    this.highlightFloor.position.set(zone.cx, 0.02, zone.cz);
    this.highlightFloor.rotation.y = d.angle;
    this.highlightFloor.scale.set(d.width - 0.1, 1, zone.halfD * 2);
  }

  displayTop(d: Display): THREE.Vector3 {
    return new THREE.Vector3(d.x, d.kind === 'produce' ? 1.2 : 2.25, d.z);
  }

  update(dt: number) {
    this.time += dt;
    this.doorOpen += (this.doorTarget - this.doorOpen) * Math.min(1, dt * 4);
    this.doorL.position.x = -1 - this.doorOpen * 1.9;
    this.doorR.position.x = 1 + this.doorOpen * 1.9;
    const pulse = 0.5 + 0.5 * Math.sin(this.time * 4);
    const ringMat = this.deliveryRing.material as THREE.MeshBasicMaterial;
    const discMat = this.deliveryDisc.material as THREE.MeshBasicMaterial;
    ringMat.opacity = this.deliveryActive ? 0.55 + 0.4 * pulse : 0.25;
    discMat.opacity = this.deliveryActive ? 0.12 + 0.15 * pulse : 0.05;
    this.deliveryLabel.visible = this.deliveryActive;
    this.deliveryLabel.position.y = 1.6 + Math.sin(this.time * 2.5) * 0.1;
    const fm = this.highlightFrame.material as THREE.LineBasicMaterial;
    fm.opacity = 0.6 + 0.4 * pulse;
  }
}
