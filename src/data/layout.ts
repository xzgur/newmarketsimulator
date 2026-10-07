/**
 * Store floor plan. Pure data (no Three.js) so it can be unit tested.
 *
 * Coordinates: metres, X to the right, Z towards the entrance (south).
 * A display's `angle` is its Y rotation; the display faces the direction
 * (sin(angle), cos(angle)) on the XZ plane, i.e. towards the aisle.
 */
import type { SectionId } from './products';
import type { AABB } from '../logic/collision';

export type DisplayKind = 'shelf' | 'fridge' | 'bakery' | 'drinks' | 'produce' | 'endcap';

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
  /** Where a customer stands to browse this display + the node they reach it from. */
  stand: { x: number; z: number; via: { x: number; z: number }[]; node: number };
}

export interface SignDef {
  section: SectionId;
  x: number;
  y: number;
  z: number;
  angle: number;
  width: number;
  hanging: boolean;
}

export type FurnitureKind = 'gondola' | 'endcap' | 'fridge' | 'wallShelf' | 'produceIsland' | 'checkout' | 'pillar' | 'deco';

export interface Furniture {
  kind: FurnitureKind;
  box: AABB;
  section?: SectionId;
  /** Facing angle for directional furniture (checkouts). */
  angle?: number;
}

export interface DecorItem {
  kind: 'plant' | 'boxes' | 'crateRow' | 'baskets' | 'trash' | 'wetSign' | 'buns';
  x: number;
  z: number;
  angle?: number;
  model?: string;
  /** half extents of the blocking box */
  hx: number;
  hz: number;
}

export interface NavNode {
  x: number;
  z: number;
  links: number[];
}

export interface StoreLayout {
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  wallHeight: number;
  door: { minX: number; maxX: number; z: number };
  displays: Display[];
  furniture: Furniture[];
  colliders: AABB[];
  signs: SignDef[];
  decor: DecorItem[];
  nav: NavNode[];
  checkoutSpots: { x: number; z: number; angle: number }[];
  start: { x: number; z: number; heading: number };
  delivery: { x: number; z: number; radius: number };
  courierSpot: { x: number; z: number };
  courierParking: { x: number; z: number };
}

export const COL = 1.2; // display column width
export const GONDOLA_X = [-10, -6, -2, 2, 6, 10];
export const GONDOLA_Z0 = -9;
export const GONDOLA_Z1 = 3;
const FRONT_Z = 5; // front cross corridor
const BACK_Z = -11.2; // back cross corridor
const LANES = [-13.8, -8, -4, 0, 4, 8, 13.8];

function cycle<T>(list: T[], n: number, offset = 0): T[] {
  return Array.from({ length: n }, (_, i) => list[(i + offset) % list.length]);
}

export function buildLayout(): StoreLayout {
  const bounds = { minX: -18, maxX: 18, minZ: -15, maxZ: 15 };
  const displays: Display[] = [];
  const furniture: Furniture[] = [];
  const signs: SignDef[] = [];

  // ---------------------------------------------------------- nav graph
  const nav: NavNode[] = [];
  const node = (x: number, z: number) => {
    nav.push({ x, z, links: [] });
    return nav.length - 1;
  };
  const link = (a: number, b: number) => {
    nav[a].links.push(b);
    nav[b].links.push(a);
  };
  const back = LANES.map((x) => node(x, BACK_Z));
  const front = LANES.map((x) => node(x, FRONT_Z));
  for (let i = 0; i < LANES.length; i++) {
    link(back[i], front[i]);
    if (i > 0) {
      link(back[i - 1], back[i]);
      link(front[i - 1], front[i]);
    }
  }
  const midProduceW = node(-14.6, 8.3);
  const midProduce = node(-11.2, 8.3);
  const westGate = node(-6.6, 8.3);
  const frontWestGate = node(-6.6, FRONT_Z);
  link(frontWestGate, front[1]);
  link(frontWestGate, front[2]);
  link(frontWestGate, westGate);
  link(midProduceW, midProduce);
  link(midProduce, westGate);
  const entryW = node(-6.6, 12.6);
  const entryC = node(0, 11.4);
  const entryE = node(4.6, 11.4);
  link(westGate, entryW);
  link(entryW, entryC);
  link(entryC, entryE);
  const southProduce = node(-12.4, 12.6);
  link(southProduce, entryW);
  const checkoutLane = node(4.6, 7.2);
  link(checkoutLane, front[4]);
  link(checkoutLane, entryE);
  const nearestLane = (x: number) => LANES.reduce((b, l, i) => (Math.abs(l - x) < Math.abs(LANES[b] - x) ? i : b), 0);

  let n = 0;
  const add = (d: Omit<Display, 'id'>) => displays.push({ ...d, id: `d${n++}` });

  // ---------------------------------------------------------- gondolas
  const cols = Math.round((GONDOLA_Z1 - GONDOLA_Z0) / COL);
  const gondolas: { section: SectionId; products: string[]; promo: string }[] = [
    { section: 'snacks', products: ['chips_corn', 'biscuit', 'chips_potato', 'chocolate', 'nuts', 'popcorn'], promo: 'chips_corn' },
    { section: 'breakfast', products: ['jam', 'honey', 'cereal', 'tuna', 'tomato_paste', 'ketchup', 'mustard'], promo: 'honey' },
    { section: 'pantry', products: ['pasta', 'rice', 'lentil', 'flour', 'sugar'], promo: 'pasta' },
    { section: 'coffee', products: ['tea', 'coffee', 'instant', 'herbal'], promo: 'tea' },
    { section: 'cleaning', products: ['laundry', 'softener', 'bleach', 'dish_soap', 'sponge', 'papertowel'], promo: 'laundry' },
    { section: 'care', products: ['shampoo', 'toothpaste', 'soap', 'tissue'], promo: 'tissue' },
  ];
  GONDOLA_X.forEach((gx, gi) => {
    const g = gondolas[gi];
    furniture.push({ kind: 'gondola', section: g.section, box: { minX: gx - 0.5, maxX: gx + 0.5, minZ: GONDOLA_Z0, maxZ: GONDOLA_Z1 } });
    const west = cycle(g.products, cols, gi);
    const east = cycle(g.products, cols, gi + 3);
    for (let i = 0; i < cols; i++) {
      const z = GONDOLA_Z0 + COL / 2 + i * COL;
      for (const side of [-1, 1]) {
        const laneIdx = nearestLane(gx + side * 2);
        const lx = LANES[laneIdx];
        const viaNode = z < (GONDOLA_Z0 + GONDOLA_Z1) / 2 ? back[laneIdx] : front[laneIdx];
        add({
          productId: side < 0 ? west[i] : east[i],
          section: g.section,
          kind: 'shelf',
          x: gx + side * 0.25,
          z,
          angle: (side * Math.PI) / 2,
          width: COL,
          depth: 0.5,
          stand: { x: gx + side * 1.05, z, via: [{ x: lx, z }], node: viaNode },
        });
      }
    }
    // promo end cap at the front end of each gondola
    furniture.push({ kind: 'endcap', section: g.section, box: { minX: gx - 0.55, maxX: gx + 0.55, minZ: GONDOLA_Z1, maxZ: GONDOLA_Z1 + 0.7 } });
    add({
      productId: g.promo,
      section: g.section,
      kind: 'endcap',
      x: gx,
      z: GONDOLA_Z1 + 0.35,
      angle: 0,
      width: 1.1,
      depth: 0.7,
      stand: { x: gx, z: FRONT_Z - 0.3, via: [], node: front[nearestLane(gx)] },
    });
    signs.push({ section: g.section, x: gx, y: 2.95, z: GONDOLA_Z1 - 0.3, angle: 0, width: 2.4, hanging: true });
    signs.push({ section: g.section, x: gx, y: 2.95, z: GONDOLA_Z0 + 0.3, angle: Math.PI, width: 2.4, hanging: true });
  });

  // ---------------------------------------------------------- chillers (back wall)
  const dairy = ['milk_half', 'milk_lactose', 'milk_full', 'ayran', 'yogurt', 'cheese_kasar', 'butter', 'cheese_white', 'olives', 'eggs_6', 'eggs_10'];
  const fridgeX0 = -12;
  const fridgeCols = 20;
  furniture.push({ kind: 'fridge', section: 'dairy', box: { minX: fridgeX0, maxX: fridgeX0 + fridgeCols * COL, minZ: -15, maxZ: -14.05 } });
  cycle(dairy, fridgeCols).forEach((pid, i) => {
    const x = fridgeX0 + COL / 2 + i * COL;
    add({ productId: pid, section: 'dairy', kind: 'fridge', x, z: -14.52, angle: 0, width: COL, depth: 0.95, stand: { x, z: -12.9, via: [], node: back[nearestLane(x)] } });
  });
  signs.push({ section: 'dairy', x: 0, y: 3.2, z: -14.96, angle: 0, width: 5.5, hanging: false });

  // ---------------------------------------------------------- bakery (left wall) & drinks (right wall)
  const wallZ0 = -10.2;
  const wallCols = 12;
  const bakery = ['bread_whole', 'simit', 'bread_white', 'lavash', 'buns'];
  const drinks = ['water_15', 'cola', 'water_5l', 'soda', 'juice'];
  for (const [side, section, list, kind] of [
    [-1, 'bakery', bakery, 'bakery'],
    [1, 'drinks', drinks, 'drinks'],
  ] as const) {
    const wx = side * 17.55;
    furniture.push({ kind: 'wallShelf', section, box: { minX: side < 0 ? -18 : 17.1, maxX: side < 0 ? -17.1 : 18, minZ: wallZ0, maxZ: wallZ0 + wallCols * COL } });
    cycle([...list], wallCols).forEach((pid, i) => {
      const z = wallZ0 + COL / 2 + i * COL;
      const laneIdx = side < 0 ? 0 : LANES.length - 1;
      add({
        productId: pid,
        section,
        kind,
        x: wx,
        z,
        angle: (-side * Math.PI) / 2,
        width: COL,
        depth: 0.9,
        stand: { x: wx - side * 1.45, z, via: [{ x: LANES[laneIdx], z }], node: z < -3 ? back[laneIdx] : front[laneIdx] },
      });
    });
    signs.push({ section, x: side * 17.96, y: 3.0, z: -3, angle: (-side * Math.PI) / 2, width: 4, hanging: false });
  }

  // ---------------------------------------------------------- produce (two islands of tilted crates)
  const pW = 1.5;
  const islandX0 = -15.6;
  const islands = [
    { z: 6.6, front: ['tomato', 'potato', 'onion'], back: ['banana', 'apple', 'orange'] },
    { z: 10.0, front: ['carrot', 'lettuce', 'lemon'], back: ['cucumber', 'pepper', 'tomato'] },
  ];
  islands.forEach((isl, ii) => {
    furniture.push({ kind: 'produceIsland', section: 'produce', box: { minX: islandX0, maxX: islandX0 + 3 * pW, minZ: isl.z - 0.9, maxZ: isl.z + 0.9 } });
    for (let i = 0; i < 3; i++) {
      const x = islandX0 + pW / 2 + i * pW;
      const frontStandZ = isl.z + 1.65;
      const backStandZ = isl.z - 1.65;
      add({
        productId: isl.front[i],
        section: 'produce',
        kind: 'produce',
        x,
        z: isl.z + 0.45,
        angle: 0,
        width: pW,
        depth: 0.9,
        stand: { x, z: frontStandZ, via: [], node: ii === 0 ? midProduce : southProduce },
      });
      add({
        productId: isl.back[i],
        section: 'produce',
        kind: 'produce',
        x,
        z: isl.z - 0.45,
        angle: Math.PI,
        width: pW,
        depth: 0.9,
        stand: { x, z: backStandZ, via: [], node: ii === 0 ? front[0] : midProduce },
      });
    }
  });
  signs.push({ section: 'produce', x: islandX0 + 1.5 * pW, y: 2.8, z: 8.3, angle: 0, width: 3.2, hanging: true });

  // ---------------------------------------------------------- checkouts
  const checkoutSpots: StoreLayout['checkoutSpots'] = [];
  for (const cx of [7.2, 10.7, 14.2]) {
    furniture.push({ kind: 'checkout', angle: 0, box: { minX: cx - 0.45, maxX: cx + 0.45, minZ: 7.6, maxZ: 10.4 } });
    checkoutSpots.push({ x: cx + 0.95, z: 9.6, angle: -Math.PI / 2 });
  }

  // ---------------------------------------------------------- pillars + decor blockers
  for (const [px, pz] of [
    [-14, -3],
    [14, -3],
  ]) {
    furniture.push({ kind: 'pillar', box: { minX: px - 0.3, maxX: px + 0.3, minZ: pz - 0.3, maxZ: pz + 0.3 } });
  }

  // ---------------------------------------------------------- decor props (also block movement)
  const decor: DecorItem[] = [
    { kind: 'plant', model: 'cactus_medium_A', x: -3.3, z: 14.1, hx: 0.4, hz: 0.4 },
    { kind: 'plant', model: 'cactus_medium_B', x: 3.3, z: 14.1, hx: 0.4, hz: 0.4 },
    { kind: 'plant', model: 'cactus_medium_A', x: -17.2, z: 14.2, hx: 0.4, hz: 0.4 },
    { kind: 'plant', model: 'cactus_medium_B', x: 17.2, z: -14.3, hx: 0.4, hz: 0.4 },
    { kind: 'boxes', x: -16.7, z: -13.7, angle: 0.3, hx: 0.7, hz: 0.6 },
    { kind: 'boxes', x: 15.6, z: 13.6, angle: 0.4, hx: 0.7, hz: 0.6 },
    { kind: 'boxes', x: 16.4, z: -11.6, angle: 0, hx: 0.7, hz: 0.6 },
    { kind: 'crateRow', x: -17.15, z: 8.2, hx: 0.55, hz: 3.6 },
    { kind: 'baskets', x: -3.7, z: 12.7, hx: 0.3, hz: 0.25 },
    { kind: 'trash', x: 5.8, z: 14.4, hx: 0.3, hz: 0.3 },
    { kind: 'wetSign', x: 12.6, z: -12.9, angle: 0.6, hx: 0.25, hz: 0.25 },
    { kind: 'buns', x: -16.7, z: -11.4, angle: 0.3, hx: 0.5, hz: 0.5 },
  ];

  // ---------------------------------------------------------- colliders
  const colliders: AABB[] = furniture.map((f) => ({ ...f.box }));
  for (const d of decor) colliders.push({ minX: d.x - d.hx, maxX: d.x + d.hx, minZ: d.z - d.hz, maxZ: d.z + d.hz });
  const t = 1;
  colliders.push(
    { minX: bounds.minX - t, maxX: bounds.maxX + t, minZ: bounds.minZ - t, maxZ: bounds.minZ },
    { minX: bounds.minX - t, maxX: bounds.maxX + t, minZ: bounds.maxZ, maxZ: bounds.maxZ + t },
    { minX: bounds.minX - t, maxX: bounds.minX, minZ: bounds.minZ, maxZ: bounds.maxZ },
    { minX: bounds.maxX, maxX: bounds.maxX + t, minZ: bounds.minZ, maxZ: bounds.maxZ },
  );

  return {
    bounds,
    wallHeight: 4.6,
    door: { minX: -2.2, maxX: 2.2, z: bounds.maxZ },
    displays,
    furniture,
    colliders,
    signs,
    decor,
    nav,
    checkoutSpots,
    start: { x: 2.5, z: 12.2, heading: Math.PI },
    delivery: { x: 0, z: 12.6, radius: 1.7 },
    courierSpot: { x: 0, z: 14.1 },
    courierParking: { x: 4.5, z: 18.2 },
  };
}

/** Shortest path (node indices) through the nav graph (Dijkstra; the graph is tiny). */
export function navPath(nav: NavNode[], from: number, to: number): number[] {
  const dist = nav.map(() => Infinity);
  const prev = nav.map(() => -1);
  const done = nav.map(() => false);
  dist[from] = 0;
  for (;;) {
    let u = -1;
    for (let i = 0; i < nav.length; i++) if (!done[i] && (u < 0 || dist[i] < dist[u])) u = i;
    if (u < 0 || dist[u] === Infinity) break;
    if (u === to) break;
    done[u] = true;
    for (const v of nav[u].links) {
      const d = dist[u] + Math.hypot(nav[u].x - nav[v].x, nav[u].z - nav[v].z);
      if (d < dist[v]) {
        dist[v] = d;
        prev[v] = u;
      }
    }
  }
  if (dist[to] === Infinity) return [];
  const path: number[] = [];
  for (let c = to; c >= 0; c = prev[c]) path.unshift(c);
  return path;
}

export function nearestNode(nav: NavNode[], x: number, z: number): number {
  let best = 0;
  let bd = Infinity;
  nav.forEach((nd, i) => {
    const d = (nd.x - x) ** 2 + (nd.z - z) ** 2;
    if (d < bd) {
      bd = d;
      best = i;
    }
  });
  return best;
}
