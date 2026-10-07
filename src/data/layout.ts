/**
 * Store floor plan. Pure data (no Three.js) so it can be unit tested.
 *
 * Coordinates: metres, X to the right, Z towards the entrance (south).
 * A display's `angle` is its Y rotation; the display faces the direction
 * (sin(angle), cos(angle)) on the XZ plane, i.e. towards the aisle.
 */
import type { SectionId } from './products';
import type { AABB } from '../logic/collision';

export type DisplayKind = 'shelf' | 'fridge' | 'bakery' | 'drinks' | 'produce';

export interface Display {
  id: string;
  productId: string;
  section: SectionId;
  kind: DisplayKind;
  /** Centre of the display footprint. */
  x: number;
  z: number;
  angle: number;
  width: number;
  depth: number;
}

export interface SignDef {
  text: string;
  section: SectionId;
  x: number;
  y: number;
  z: number;
  angle: number;
  width: number;
}

export interface StoreLayout {
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  wallHeight: number;
  door: { minX: number; maxX: number; z: number };
  displays: Display[];
  /** Static furniture footprint (gondola bodies, counters...) used for rendering + collision. */
  furniture: { kind: 'gondola' | 'fridge' | 'wallShelf' | 'produceIsland' | 'checkout'; box: AABB; section?: SectionId }[];
  colliders: AABB[];
  signs: SignDef[];
  start: { x: number; z: number; heading: number };
  delivery: { x: number; z: number; radius: number };
  courierSpot: { x: number; z: number };
  courierParking: { x: number; z: number };
}

const COL = 1.2; // display column width

function cycle<T>(list: T[], n: number, offset = 0): T[] {
  return Array.from({ length: n }, (_, i) => list[(i + offset) % list.length]);
}

export function buildLayout(): StoreLayout {
  const bounds = { minX: -18, maxX: 18, minZ: -14, maxZ: 14 };
  const displays: Display[] = [];
  const furniture: StoreLayout['furniture'] = [];
  const signs: SignDef[] = [];
  let n = 0;
  const add = (d: Omit<Display, 'id'>) => displays.push({ ...d, id: `d${n++}` });

  // ---- Centre gondolas (double sided, running along Z)
  const gondolaZ0 = -9;
  const gondolaZ1 = 3;
  const cols = Math.round((gondolaZ1 - gondolaZ0) / COL);
  const gondolas: { x: number; section: SectionId; products: string[] }[] = [
    { x: -9, section: 'snacks', products: ['chips_corn', 'biscuit', 'chips_potato', 'chocolate', 'nuts'] },
    { x: -3, section: 'breakfast', products: ['jam', 'honey', 'cereal', 'pasta', 'tuna', 'tomato_paste'] },
    { x: 3, section: 'cleaning', products: ['laundry', 'softener', 'bleach', 'dish_soap', 'sponge'] },
    { x: 9, section: 'care', products: ['shampoo', 'toothpaste', 'soap', 'tissue'] },
  ];
  for (const g of gondolas) {
    furniture.push({ kind: 'gondola', section: g.section, box: { minX: g.x - 0.5, maxX: g.x + 0.5, minZ: gondolaZ0, maxZ: gondolaZ1 } });
    const west = cycle(g.products, cols, 0);
    const east = cycle(g.products, cols, 2);
    for (let i = 0; i < cols; i++) {
      const z = gondolaZ0 + COL / 2 + i * COL;
      add({ productId: west[i], section: g.section, kind: 'shelf', x: g.x - 0.25, z, angle: -Math.PI / 2, width: COL, depth: 0.5 });
      add({ productId: east[i], section: g.section, kind: 'shelf', x: g.x + 0.25, z, angle: Math.PI / 2, width: COL, depth: 0.5 });
    }
    signs.push({ text: '', section: g.section, x: g.x, y: 2.9, z: gondolaZ1 + 0.2, angle: 0, width: 2.6 });
    signs.push({ text: '', section: g.section, x: g.x, y: 2.9, z: gondolaZ0 - 0.2, angle: Math.PI, width: 2.6 });
  }

  // ---- Dairy fridges along the back wall, facing +Z
  const dairy = ['milk_half', 'milk_lactose', 'milk_full', 'ayran', 'yogurt', 'cheese_kasar', 'butter', 'cheese_white', 'olives', 'eggs_6', 'eggs_10'];
  const fridgeX0 = -10.8;
  const fridgeCols = 18;
  furniture.push({ kind: 'fridge', section: 'dairy', box: { minX: fridgeX0, maxX: fridgeX0 + fridgeCols * COL, minZ: -14, maxZ: -13.1 } });
  cycle(dairy, fridgeCols).forEach((pid, i) => {
    add({ productId: pid, section: 'dairy', kind: 'fridge', x: fridgeX0 + COL / 2 + i * COL, z: -13.55, angle: 0, width: COL, depth: 0.9 });
  });
  signs.push({ text: '', section: 'dairy', x: 0, y: 3.0, z: -13.9, angle: 0, width: 5 });

  // ---- Bakery wall shelves (left wall), facing +X
  const bakery = ['bread_whole', 'simit', 'bread_white', 'lavash'];
  const wallZ0 = -10.2;
  const wallCols = 12;
  furniture.push({ kind: 'wallShelf', section: 'bakery', box: { minX: -18, maxX: -17.1, minZ: wallZ0, maxZ: wallZ0 + wallCols * COL } });
  cycle(bakery, wallCols).forEach((pid, i) => {
    add({ productId: pid, section: 'bakery', kind: 'bakery', x: -17.55, z: wallZ0 + COL / 2 + i * COL, angle: Math.PI / 2, width: COL, depth: 0.9 });
  });
  signs.push({ text: '', section: 'bakery', x: -17.9, y: 3.0, z: -3, angle: Math.PI / 2, width: 4 });

  // ---- Drinks wall shelves (right wall), facing -X
  const drinks = ['water_15', 'cola', 'water_5l', 'soda', 'juice'];
  furniture.push({ kind: 'wallShelf', section: 'drinks', box: { minX: 17.1, maxX: 18, minZ: wallZ0, maxZ: wallZ0 + wallCols * COL } });
  cycle(drinks, wallCols).forEach((pid, i) => {
    add({ productId: pid, section: 'drinks', kind: 'drinks', x: 17.55, z: wallZ0 + COL / 2 + i * COL, angle: -Math.PI / 2, width: COL, depth: 0.9 });
  });
  signs.push({ text: '', section: 'drinks', x: 17.9, y: 3.0, z: -3, angle: -Math.PI / 2, width: 4 });

  // ---- Produce island near the entrance (two rows of tilted crates, back to back)
  const produceFront = ['tomato', 'pepper', 'cucumber'];
  const produceBack = ['apple', 'banana', 'orange'];
  const pW = 1.4;
  const islandX0 = -12.1;
  const islandZ = 8;
  furniture.push({ kind: 'produceIsland', section: 'produce', box: { minX: islandX0, maxX: islandX0 + 3 * pW, minZ: islandZ - 0.9, maxZ: islandZ + 0.9 } });
  for (let i = 0; i < 3; i++) {
    const x = islandX0 + pW / 2 + i * pW;
    add({ productId: produceFront[i], section: 'produce', kind: 'produce', x, z: islandZ + 0.45, angle: 0, width: pW, depth: 0.9 });
    add({ productId: produceBack[i], section: 'produce', kind: 'produce', x, z: islandZ - 0.45, angle: Math.PI, width: pW, depth: 0.9 });
  }
  signs.push({ text: '', section: 'produce', x: islandX0 + 1.5 * pW, y: 2.7, z: islandZ, angle: 0, width: 3 });

  // ---- Checkout counters (decor + collision)
  for (const cx of [7, 11]) {
    furniture.push({ kind: 'checkout', box: { minX: cx - 0.45, maxX: cx + 0.45, minZ: 7, maxZ: 9.6 } });
  }

  // ---- Colliders: furniture + outer walls
  const colliders: AABB[] = furniture.map((f) => ({ ...f.box }));
  const t = 1;
  colliders.push(
    { minX: bounds.minX - t, maxX: bounds.maxX + t, minZ: bounds.minZ - t, maxZ: bounds.minZ },
    { minX: bounds.minX - t, maxX: bounds.maxX + t, minZ: bounds.maxZ, maxZ: bounds.maxZ + t },
    { minX: bounds.minX - t, maxX: bounds.minX, minZ: bounds.minZ, maxZ: bounds.maxZ },
    { minX: bounds.maxX, maxX: bounds.maxX + t, minZ: bounds.minZ, maxZ: bounds.maxZ },
  );

  return {
    bounds,
    wallHeight: 4.2,
    door: { minX: -2, maxX: 2, z: bounds.maxZ },
    displays,
    furniture,
    colliders,
    signs,
    start: { x: 0, z: 10.5, heading: Math.PI },
    delivery: { x: 0, z: 11.6, radius: 1.5 },
    courierSpot: { x: 0, z: 13.3 },
    courierParking: { x: 3.2, z: 17 },
  };
}

/** Rectangle in front of a display in which the cart can pick from it. */
export function interactionZone(d: Display) {
  const fx = Math.sin(d.angle);
  const fz = Math.cos(d.angle);
  const reach = 0.95;
  return {
    cx: d.x + fx * (d.depth / 2 + reach),
    cz: d.z + fz * (d.depth / 2 + reach),
    halfW: d.width / 2,
    halfD: reach + 0.25,
    angle: d.angle,
  };
}

/**
 * Returns the display whose interaction zone contains the point, preferring
 * the closest zone centre. `null` if none.
 */
export function findDisplayAt(displays: Display[], x: number, z: number): Display | null {
  let best: Display | null = null;
  let bestDist = Infinity;
  for (const d of displays) {
    const zone = interactionZone(d);
    const dx = x - zone.cx;
    const dz = z - zone.cz;
    // rotate into the zone's local frame (local z = facing direction)
    const c = Math.cos(zone.angle);
    const s = Math.sin(zone.angle);
    const lx = dx * c - dz * s;
    const lz = dx * s + dz * c;
    if (Math.abs(lx) <= zone.halfW && Math.abs(lz) <= zone.halfD) {
      const dist = dx * dx + dz * dz;
      if (dist < bestDist) {
        bestDist = dist;
        best = d;
      }
    }
  }
  return best;
}
