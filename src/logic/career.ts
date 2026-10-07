/**
 * Career mode: endless work days. Each day has a handful of generated orders
 * and a delivery goal; every order earns pay + speed bonus + tip and a
 * customer review. Cash buys permanent upgrades. Pure logic (no DOM / three).
 */
import { PRODUCTS, getProduct, type ProductDef } from '../data/products';
import { buildLayout } from '../data/layout';
import type { BagRules, LevelDef, OrderDef } from '../data/order';
import type { MoodId } from '../render/moodIds';
import { bagConflict } from './order';

// ---------------------------------------------------------------- upgrades
export type UpgradeId = 'wheels' | 'overtime' | 'bags' | 'radar' | 'courier' | 'smile';

export interface UpgradeDef {
  id: UpgradeId;
  icon: string;
  cost: number[];
}

export const UPGRADES: UpgradeDef[] = [
  { id: 'wheels', icon: '🛞', cost: [25, 60, 120] },
  { id: 'overtime', icon: '⏰', cost: [20, 50, 100] },
  { id: 'radar', icon: '🧭', cost: [35] },
  { id: 'bags', icon: '🛍️', cost: [45, 120] },
  { id: 'courier', icon: '🛵', cost: [30] },
  { id: 'smile', icon: '😊', cost: [40, 110] },
];

// ---------------------------------------------------------------- ranks
/** The long-term goal: climb from Trainee to Legend (Golden Cart) with review stars. */
export interface RankDef {
  id: 'trainee' | 'picker' | 'pro' | 'lead' | 'manager' | 'legend';
  stars: number;
  bonus: number;
  paint: string;
}

export const RANKS: RankDef[] = [
  { id: 'trainee', stars: 0, bonus: 0, paint: '#FF5B4F' },
  { id: 'picker', stars: 12, bonus: 20, paint: '#3FA2F7' },
  { id: 'pro', stars: 35, bonus: 40, paint: '#4FBF5A' },
  { id: 'lead', stars: 70, bonus: 60, paint: '#7C5CFF' },
  { id: 'manager', stars: 120, bonus: 90, paint: '#1b1730' },
  { id: 'legend', stars: 200, bonus: 150, paint: '#FFD23F' },
];

export function rankIndex(c: Career): number {
  let i = 0;
  while (i + 1 < RANKS.length && (c.stars ?? 0) >= RANKS[i + 1].stars) i++;
  return i;
}

/** Progress towards the next rank (null at the top). */
export function rankProgress(c: Career): { rank: RankDef; next: RankDef | null; have: number; need: number; k: number } {
  const i = rankIndex(c);
  const rank = RANKS[i];
  const next = RANKS[i + 1] ?? null;
  const have = c.stars ?? 0;
  if (!next) return { rank, next, have, need: have, k: 1 };
  return { rank, next, have, need: next.stars, k: (have - rank.stars) / (next.stars - rank.stars) };
}

export interface Career {
  day: number;
  cash: number;
  earned: number;
  delivered: number;
  ratingSum: number;
  ratingCount: number;
  bestDay: number;
  /** Lifetime review stars from delivered orders: drives the rank. */
  stars: number;
  upgrades: Partial<Record<UpgradeId, number>>;
}

export function newCareer(): Career {
  return { day: 1, cash: 0, earned: 0, delivered: 0, ratingSum: 0, ratingCount: 0, bestDay: 0, stars: 0, upgrades: {} };
}

export function upgradeLevel(c: Career, id: UpgradeId): number {
  return c.upgrades[id] ?? 0;
}

export function nextUpgradeCost(c: Career, id: UpgradeId): number | null {
  const def = UPGRADES.find((u) => u.id === id)!;
  const lvl = upgradeLevel(c, id);
  return lvl < def.cost.length ? def.cost[lvl] : null;
}

/** Returns the updated career, or null if it can't be bought. */
export function buyUpgrade(c: Career, id: UpgradeId): Career | null {
  const cost = nextUpgradeCost(c, id);
  if (cost === null || c.cash < cost) return null;
  return { ...c, cash: c.cash - cost, upgrades: { ...c.upgrades, [id]: upgradeLevel(c, id) + 1 } };
}

export function rating(c: Career): number {
  return c.ratingCount ? c.ratingSum / c.ratingCount : 0;
}

export const speedMultiplier = (c: Career) => 1 + 0.08 * upgradeLevel(c, 'wheels');

// ---------------------------------------------------------------- generation
/** Deterministic PRNG so a retried day brings the same orders. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const CUSTOMERS = ['Maya R.', 'Leo B.', 'Ayşe K.', 'Sam T.', 'Noah W.', 'Elif D.', 'Lucía M.', 'Jonas F.', 'Priya S.', 'Omar H.', 'Zoe L.', 'Mert A.', 'Hana Y.', 'Carlos G.', 'Ines P.', 'Felix K.', 'Aiko N.', 'Ben O.'];
const STREETS = ['Maple Street', 'Moda Street', 'Harbor Road', 'Linden Ave', 'Sunset Blvd', 'Cherry Lane', 'Mill Road', 'Park Row', 'Rose Court', 'Elm Street'];
const COURIERS = ['Leo', 'Mert', 'Kai', 'Nina', 'Deniz', 'Rafa'];

let displayed: Set<string> | null = null;
function stockedProducts(): ProductDef[] {
  if (!displayed) displayed = new Set(buildLayout().displays.map((d) => d.productId));
  return PRODUCTS.filter((p) => displayed!.has(p.id));
}

export function ordersInDay(day: number): number {
  return Math.min(6, 2 + Math.ceil(day / 2));
}

export function dayGoal(day: number): number {
  return ordersInDay(day) - 1;
}

export function rulesForDay(day: number): BagRules {
  return { chemical: day >= 2, fragile: day >= 3 };
}

/** The rule a day introduces (shown on the day banner). */
export function newRuleOn(day: number): 'chem' | 'fragile' | null {
  return day === 2 ? 'chem' : day === 3 ? 'fragile' : null;
}

/** Backtracking packer: a bag index per item (lines expanded by qty), or null. */
export function packOrder(order: Pick<OrderDef, 'lines' | 'bagCount' | 'bagCapacity' | 'rules'>): number[] | null {
  const items = order.lines.flatMap((l) => Array.from({ length: l.qty }, () => getProduct(l.productId)));
  const bags: ProductDef[][] = Array.from({ length: order.bagCount }, () => []);
  const out: number[] = [];
  const go = (i: number): boolean => {
    if (i === items.length) return true;
    for (let b = 0; b < bags.length; b++) {
      const bag = bags[b];
      if (bag.length >= order.bagCapacity || bagConflict(items[i], bag, order.rules)) continue;
      // empty bags are interchangeable: only try the first one
      if (!bag.length && bags.slice(0, b).some((x) => !x.length)) continue;
      bag.push(items[i]);
      out[i] = b;
      if (go(i + 1)) return true;
      bag.pop();
    }
    return false;
  };
  return go(0) ? out : null;
}

function moodFor(index: number, total: number): MoodId {
  const k = total <= 1 ? 0 : index / (total - 1);
  if (total >= 4 && k >= 0.99) return 'night';
  return k >= 0.6 ? 'sunset' : 'day';
}

export interface DayPlan {
  day: number;
  goal: number;
  orders: LevelDef[];
}

export function planDay(day: number, career: Career, notes: string[] = ['']): DayPlan {
  const n = ordersInDay(day);
  const rand = rng(day * 7919 + 17);
  const expressAt = day >= 3 ? 1 + Math.floor(rand() * (n - 1)) : -1;
  const orders: LevelDef[] = [];
  for (let i = 0; i < n; i++) orders.push(makeOrder(day, i, n, i === expressAt, career, rand, notes));
  return { day, goal: dayGoal(day), orders };
}

function makeOrder(day: number, index: number, total: number, express: boolean, career: Career, rand: () => number, notes: string[]): LevelDef {
  const rules = rulesForDay(day);
  const capacity = 4 + upgradeLevel(career, 'bags');
  const items = Math.min(10, 2 + Math.ceil(day * 0.7) + Math.floor(index / 2));
  const pool = stockedProducts();
  const pickFrom = (list: ProductDef[]) => list[Math.floor(rand() * list.length)];
  let lines: { productId: string; qty: number }[] = [];
  let bagCount = 1;
  for (let attempt = 0; attempt < 60; attempt++) {
    const chosen = new Map<string, number>();
    let count = 0;
    // once a rule is active, orders usually contain something that tests it
    if (rules.chemical && rand() < 0.7) {
      chosen.set(pickFrom(pool.filter((p) => p.tags.includes('chemical'))).id, 1);
      count++;
    }
    if (rules.fragile && rand() < 0.5) {
      chosen.set(pickFrom(pool.filter((p) => p.tags.includes('fragile'))).id, 1);
      chosen.set(pickFrom(pool.filter((p) => p.tags.includes('heavy'))).id, 1);
      count += 2;
    }
    while (count < items) {
      const p = pickFrom(pool);
      if (!rules.chemical && p.tags.includes('chemical') && rand() < 0.5) continue;
      const qty = day >= 2 && count + 2 <= items && rand() < 0.22 ? 2 : 1;
      chosen.set(p.id, (chosen.get(p.id) ?? 0) + qty);
      count += qty;
    }
    lines = [...chosen].map(([productId, qty]) => ({ productId, qty }));
    const total = lines.reduce((a, l) => a + l.qty, 0);
    bagCount = Math.ceil(total / capacity);
    while (bagCount <= 3 && !packOrder({ lines, bagCount, bagCapacity: capacity, rules })) bagCount++;
    if (bagCount <= 3) break;
  }
  bagCount = Math.min(3, bagCount);
  const itemCount = lines.reduce((a, l) => a + l.qty, 0);
  let time = 60 + itemCount * 20 + (day === 1 ? 40 : 0) + upgradeLevel(career, 'overtime') * 15;
  if (express) time *= 0.72;
  const order: OrderDef = {
    id: `#${1000 + day * 10 + index}`,
    customer: CUSTOMERS[Math.floor(rand() * CUSTOMERS.length)],
    address: `${1 + Math.floor(rand() * 98)} ${STREETS[Math.floor(rand() * STREETS.length)]}`,
    note: notes[Math.floor(rand() * notes.length)],
    distanceKm: Math.round((0.6 + rand() * 3) * 10) / 10,
    courier: COURIERS[Math.floor(rand() * COURIERS.length)],
    timeLimit: Math.round(time / 5) * 5,
    bagCount,
    bagCapacity: capacity,
    trayCapacity: 1,
    rules,
    lines,
  };
  const mood = moodFor(index, total);
  return {
    day,
    index,
    total,
    mood,
    express,
    tutorial: day === 1 && index === 0,
    shoppers: Math.round(Math.min(14, 4 + day) * (mood === 'night' ? 0.6 : 1)),
    order,
  };
}

// ---------------------------------------------------------------- scoring
export interface OrderResult {
  delivered: boolean;
  stars: number; // 1-5
  pay: number;
  speedBonus: number;
  tip: number;
  total: number;
}

const TIPS = [0, 0, 0.5, 1.5, 3, 5];

export function scoreOrder(level: LevelDef, career: Career, delivered: boolean, timeLeft: number, mistakes: number): OrderResult {
  if (!delivered) return { delivered, stars: 1, pay: 0, speedBonus: 0, tip: 0, total: 0 };
  const ratio = timeLeft / level.order.timeLimit;
  let stars = ratio > 0.45 ? 5 : ratio > 0.3 ? 4 : ratio > 0.15 ? 3 : ratio > 0.05 ? 2 : 1;
  stars = Math.max(1, stars - Math.floor(mistakes / 2));
  const items = level.order.lines.reduce((a, l) => a + l.qty, 0);
  const pay = round2((3 + items * 1.2) * (level.express ? 1.5 : 1));
  const speedBonus = round2(Math.max(0, ratio) * 5);
  const tip = round2(TIPS[stars] * (1 + 0.25 * upgradeLevel(career, 'smile')) * (level.express ? 2 : 1));
  return { delivered, stars, pay, speedBonus, tip, total: round2(pay + speedBonus + tip) };
}

const round2 = (v: number) => Math.round(v * 100) / 100;

/** Books an order. A rank-up pays its bonus right away (`promoted` = new rank). */
export function applyResult(c: Career, r: OrderResult): { career: Career; promoted: RankDef | null } {
  const before = rankIndex(c);
  let next: Career = {
    ...c,
    cash: round2(c.cash + r.total),
    earned: round2(c.earned + r.total),
    delivered: c.delivered + (r.delivered ? 1 : 0),
    ratingSum: c.ratingSum + r.stars,
    ratingCount: c.ratingCount + 1,
    stars: (c.stars ?? 0) + (r.delivered ? r.stars : 0),
  };
  const after = rankIndex(next);
  let promoted: RankDef | null = null;
  if (after > before) {
    promoted = RANKS[after];
    const bonus = RANKS.slice(before + 1, after + 1).reduce((a, x) => a + x.bonus, 0);
    next = { ...next, cash: round2(next.cash + bonus) };
  }
  return { career: next, promoted };
}

/** Day over: advance if the goal was met. */
export function finishDay(c: Career, plan: DayPlan, delivered: number): { career: Career; passed: boolean } {
  const passed = delivered >= plan.goal;
  return { passed, career: passed ? { ...c, day: c.day + 1, bestDay: Math.max(c.bestDay, c.day) } : c };
}
