import { describe, expect, it } from 'vitest';
import { OrderSession, bagConflict } from '../src/logic/order';
import type { OrderDef } from '../src/data/order';

/** The classic 10-item order (#1042) used by several tests. */
const DEMO_ORDER: OrderDef = {
  id: '#1042',
  customer: 'Ayşe K.',
  address: '17 Moda Street',
  note: '',
  distanceKm: 1.8,
  courier: 'Mert',
  timeLimit: 300,
  bagCount: 3,
  bagCapacity: 5,
  trayCapacity: 1,
  rules: { chemical: true, fragile: true },
  lines: [
    { productId: 'milk_full', qty: 1 },
    { productId: 'eggs_10', qty: 1 },
    { productId: 'cheese_white', qty: 1 },
    { productId: 'bread_white', qty: 1 },
    { productId: 'tomato', qty: 1 },
    { productId: 'banana', qty: 1 },
    { productId: 'water_5l', qty: 1 },
    { productId: 'chips_potato', qty: 2 },
    { productId: 'dish_soap', qty: 1 },
  ],
};
import { getProduct, PRODUCT_BY_ID } from '../src/data/products';
import { buildLayout, navPath } from '../src/data/layout';
import { resolveCircle, circleIntersectsBox } from '../src/logic/collision';
import { cartCenter, createPlayer, lateralSpeed, look, PLAYER, speedOf, stepPlayer } from '../src/logic/player';
import { GameFlow, formatTime } from '../src/logic/gameFlow';

const small: OrderDef = {
  ...DEMO_ORDER,
  bagCount: 2,
  bagCapacity: 3,
  trayCapacity: 3,
  lines: [
    { productId: 'milk_full', qty: 1 },
    { productId: 'eggs_10', qty: 1 },
    { productId: 'water_5l', qty: 1 },
  ],
};

describe('OrderSession', () => {
  it('requires opening a bag before placing', () => {
    const s = new OrderSession(small);
    s.pick('milk_full');
    expect(s.place(0, 0)).toMatchObject({ ok: false });
    s.openBag(0);
    expect(s.place(0, 0)).toEqual({ ok: true });
    expect(s.bags[0].items).toEqual(['milk_full']);
    expect(s.tray).toEqual([]);
  });

  it('rejects products that are not in the order with a time penalty', () => {
    const s = new OrderSession(small);
    s.openBag(0);
    s.pick('milk_half');
    const r = s.place(0, 0);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.penalty).toBeGreaterThan(0);
    expect(s.mistakes).toBe(1);
    expect(s.tray).toEqual(['milk_half']);
    expect(s.discard(0).ok).toBe(true);
    expect(s.tray).toEqual([]);
  });

  it('rejects extra quantity', () => {
    const s = new OrderSession(small);
    s.openBag(0);
    s.pick('milk_full');
    s.pick('milk_full');
    expect(s.place(0, 0).ok).toBe(true);
    expect(s.place(0, 0).ok).toBe(false);
  });

  it('enforces the tray capacity', () => {
    const s = new OrderSession(small);
    expect(s.pick('apple').ok).toBe(true);
    expect(s.pick('apple').ok).toBe(true);
    expect(s.pick('apple').ok).toBe(true);
    expect(s.pick('apple').ok).toBe(false);
  });

  it('enforces bag rules (eggs vs heavy, chemicals vs food) and capacity', () => {
    expect(bagConflict(getProduct('eggs_10'), [getProduct('water_5l')])).not.toBeNull();
    expect(bagConflict(getProduct('dish_soap'), [getProduct('bread_white')])).not.toBeNull();
    expect(bagConflict(getProduct('bread_white'), [getProduct('milk_full')])).toBeNull();

    const s = new OrderSession(small);
    s.openBag(0);
    s.pick('eggs_10');
    s.pick('water_5l');
    expect(s.place(0, 0).ok).toBe(true);
    const r = s.place(0, 0);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.penalty).toBeUndefined();
  });

  it('completes and closes only when everything is bagged', () => {
    const s = new OrderSession(small);
    s.openBag(0);
    s.openBag(1);
    s.pick('milk_full');
    s.pick('eggs_10');
    s.pick('water_5l');
    expect(s.canClose().ok).toBe(false);
    s.place(0, 0); // milk -> bag 0
    s.place(0, 0); // eggs -> bag 0
    s.place(0, 1); // water -> bag 1
    expect(s.isComplete()).toBe(true);
    expect(s.close().ok).toBe(true);
    expect(s.bags.every((b) => b.closed)).toBe(true);
    expect(s.pick('apple').ok).toBe(false);
  });

  it('can unbag items back to the tray', () => {
    const s = new OrderSession(small);
    s.openBag(0);
    s.pick('milk_full');
    s.place(0, 0);
    expect(s.unbag(0, 0).ok).toBe(true);
    expect(s.tray).toEqual(['milk_full']);
  });

  it('demo order is solvable with the configured bags', () => {
    const s = new OrderSession(DEMO_ORDER);
    const items = DEMO_ORDER.lines.flatMap((l) => Array(l.qty).fill(l.productId) as string[]);
    s.bags.forEach((_, i) => s.openBag(i));
    // greedy placement with the same rules the player faces
    for (const pid of items) {
      expect(s.pick(pid).ok).toBe(true);
      const idx = s.tray.length - 1;
      const bag = s.bags.findIndex((_, b) => s.canPlace(idx, b).ok);
      expect(bag).toBeGreaterThanOrEqual(0);
      s.place(idx, bag);
    }
    expect(s.close().ok).toBe(true);
  });
});

describe('layout', () => {
  const layout = buildLayout();

  it('stocks every order product somewhere and every display product exists', () => {
    for (const d of layout.displays) expect(PRODUCT_BY_ID[d.productId]).toBeDefined();
    for (const l of DEMO_ORDER.lines) {
      expect(layout.displays.some((d) => d.productId === l.productId)).toBe(true);
    }
  });

  it('order products are spread over at least 5 different sections', () => {
    const sections = new Set(DEMO_ORDER.lines.map((l) => getProduct(l.productId).section));
    expect(sections.size).toBeGreaterThanOrEqual(5);
  });

  it('every display has a reachable standing spot in front of it', () => {
    for (const d of layout.displays) {
      const blocked = layout.colliders.some((b) => circleIntersectsBox(d.stand.x, d.stand.z, PLAYER.bodyRadius, b));
      expect(blocked, `display ${d.id} ${d.productId}`).toBe(false);
      // the shelf is within arm's reach of the standing spot
      expect(Math.hypot(d.stand.x - d.x, d.stand.z - d.z)).toBeLessThan(2.2);
    }
  });

  it('a shopper with a cart fits in front of every display, facing it', () => {
    for (const d of layout.displays) {
      const fx = Math.sin(d.angle);
      const fz = Math.cos(d.angle);
      const p = createPlayer(d.x + fx * (d.depth / 2 + 1.42), d.z + fz * (d.depth / 2 + 1.42), d.angle + Math.PI);
      const x0 = p.x;
      const z0 = p.z;
      for (let i = 0; i < 10; i++) stepPlayer(p, { forward: 0, strafe: 0, turn: 0, sprint: false }, 1 / 60, layout.colliders);
      expect(Math.hypot(p.x - x0, p.z - z0), `display ${d.id} ${d.productId}`).toBeLessThan(0.35);
    }
  });

  it('nav graph is connected and its nodes are walkable', () => {
    for (const n of layout.nav) {
      expect(layout.colliders.some((b) => circleIntersectsBox(n.x, n.z, 0.3, b))).toBe(false);
    }
    for (let i = 1; i < layout.nav.length; i++) expect(navPath(layout.nav, 0, i).length).toBeGreaterThan(0);
  });

  it('start and delivery spots are free', () => {
    for (const p of [layout.start, layout.delivery]) {
      expect(layout.colliders.some((b) => circleIntersectsBox(p.x, p.z, PLAYER.cartRadius + 0.3, b))).toBe(false);
    }
  });
});

describe('collision + player', () => {
  it('pushes a circle out of a box', () => {
    const r = resolveCircle(0.9, 0, 0.5, [{ minX: -1, maxX: 0.5, minZ: -1, maxZ: 1 }]);
    expect(r.hit).toBe(true);
    expect(r.x).toBeCloseTo(1.0, 5);
  });

  it('pushes a centre that is inside a box out on the shortest axis', () => {
    const r = resolveCircle(0.4, 0, 0.5, [{ minX: -1, maxX: 0.5, minZ: -1, maxZ: 1 }]);
    expect(r.x).toBeCloseTo(1.0, 5);
  });

  const idle = { forward: 0, strafe: 0, turn: 0, sprint: false };

  it('walks forward along the look direction and stops when released', () => {
    const p = createPlayer(0, 0, 0);
    for (let i = 0; i < 120; i++) stepPlayer(p, { ...idle, forward: 1 }, 1 / 60, []);
    expect(speedOf(p)).toBeCloseTo(PLAYER.walk, 1);
    expect(p.z).toBeGreaterThan(4);
    expect(Math.abs(p.x)).toBeLessThan(1e-6);
    for (let i = 0; i < 120; i++) stepPlayer(p, idle, 1 / 60, []);
    expect(speedOf(p)).toBeLessThan(0.01);
  });

  it('sprints faster than it walks', () => {
    const p = createPlayer(0, 0, 0);
    for (let i = 0; i < 120; i++) stepPlayer(p, { ...idle, forward: 1, sprint: true }, 1 / 60, []);
    expect(speedOf(p)).toBeGreaterThan(PLAYER.walk + 1);
  });

  it('strafes to the right with positive strafe (facing +Z → -X)', () => {
    const p = createPlayer(0, 0, 0);
    for (let i = 0; i < 60; i++) stepPlayer(p, { ...idle, strafe: 1 }, 1 / 60, []);
    expect(p.x).toBeLessThan(-0.5);
  });

  it('mouse look clamps the pitch', () => {
    const p = createPlayer(0, 0, 0);
    look(p, 0.5, -10);
    expect(p.pitch).toBe(PLAYER.minPitch);
    expect(p.yaw).toBeCloseTo(0.5);
  });

  it('the cart in front stops at walls (cart cannot clip into a shelf)', () => {
    const p = createPlayer(0, 0, 0);
    const wall = [{ minX: -5, maxX: 5, minZ: 3, maxZ: 4 }];
    for (let i = 0; i < 300; i++) stepPlayer(p, { ...idle, forward: 1 }, 1 / 60, wall);
    const c = cartCenter(p);
    expect(c.z).toBeLessThanOrEqual(3 - PLAYER.cartRadius + 1e-6);
  });

  it('customers block the player', () => {
    const p = createPlayer(0, 0, 0);
    for (let i = 0; i < 200; i++) stepPlayer(p, { ...idle, forward: 1 }, 1 / 60, [], [{ x: 0, z: 2.5, r: 0.3 }]);
    expect(cartCenter(p).z).toBeLessThan(2.5 - 0.3 - PLAYER.cartRadius + 0.01);
  });
});

describe('GameFlow', () => {
  it('runs through the happy path', () => {
    const f = new GameFlow(10);
    expect(f.timerRunning).toBe(false);
    f.start();
    expect(f.phase).toBe('incoming');
    f.tick(2);
    expect(f.timeLeft).toBe(10); // the clock only starts once the order is accepted
    expect(f.canDrive).toBe(true);
    expect(f.accept()).toBe(true);
    f.tick(2);
    expect(f.timeLeft).toBe(8);
    expect(f.orderClosed()).toBe(true);
    expect(f.courierArrived()).toBe(true);
    expect(f.handover()).toBe(true);
    f.tick(5);
    expect(f.timeLeft).toBe(8); // timer stops at handover
    expect(f.handoverDone()).toBe(true);
    expect(f.phase).toBe('won');
    expect(f.stars(0)).toBe(3);
  });

  it('loses when time runs out, and penalties count', () => {
    const f = new GameFlow(10);
    f.start();
    f.accept();
    f.penalize(5);
    expect(f.timeLeft).toBe(5);
    expect(f.tick(6)).toBe(true);
    expect(f.phase).toBe('lost');
    expect(f.orderClosed()).toBe(false);
  });

  it('pause stops the clock', () => {
    const f = new GameFlow(10);
    f.start();
    f.accept();
    f.paused = true;
    f.tick(3);
    expect(f.timeLeft).toBe(10);
  });

  it('formats time', () => {
    expect(formatTime(125)).toBe('2:05');
    expect(formatTime(0.2)).toBe('0:01');
    expect(formatTime(-3)).toBe('0:00');
  });
});

import { missingKeys, PRODUCT_NAMES, SECTION_NAMES } from '../src/i18n';
import { applyResult, buyUpgrade, dayGoal, dayLength, finishDay, makeOrder, newCareer, packOrder, planDay, rankIndex, rankProgress, RANKS, scoreOrder, type Career } from '../src/logic/career';

describe('career', () => {
  const layout = buildLayout();
  const stocked = new Set(layout.displays.map((d) => d.productId));

  it('every generated order of the first 30 days is stocked and packable', () => {
    for (const bags of [0, 2]) {
      const c: Career = { ...newCareer(), upgrades: { bags } };
      for (let day = 1; day <= 30; day++) {
        const plan = planDay(day);
        expect(plan.goal).toBe(dayGoal(day));
        for (let i = 0; i < 8; i++) {
          const lv = makeOrder(day, i, c);
          const o = lv.order;
          expect(o.bagCount).toBeGreaterThanOrEqual(1);
          expect(o.bagCount).toBeLessThanOrEqual(3);
          for (const l of o.lines) expect(stocked.has(l.productId)).toBe(true);
          expect(packOrder(o)).not.toBeNull();
          // the packing is real: replay it through the session the player uses
          const s = new OrderSession(o);
          s.bags.forEach((_, i) => s.openBag(i));
          const plan2 = packOrder(o)!;
          o.lines.flatMap((l) => Array(l.qty).fill(l.productId) as string[]).forEach((pid, i) => {
            expect(s.pick(pid).ok).toBe(true);
            expect(s.place(0, plan2[i]).ok).toBe(true);
          });
          expect(s.close().ok).toBe(true);
        }
      }
    }
  });

  it('days get harder step by step: bigger orders, rules, tighter clocks, express orders', () => {
    const c = newCareer();
    const items = (d: number, i = 0) => makeOrder(d, i, c).order.lines.reduce((x, l) => x + l.qty, 0);
    const perItem = (d: number, i = 0) => makeOrder(d, i, c).order.timeLimit / items(d, i);
    expect(items(6)).toBeGreaterThan(items(1));
    expect(items(2, 5)).toBeGreaterThan(items(2, 0));
    expect(perItem(10)).toBeLessThan(perItem(2));
    expect(makeOrder(1, 0, c).order.rules).toEqual({ chemical: false, fragile: false });
    expect(makeOrder(3, 0, c).order.rules).toEqual({ chemical: true, fragile: true });
    const express = Array.from({ length: 40 }, (_, i) => makeOrder(5, i, c).express).filter(Boolean).length;
    expect(express).toBeGreaterThan(2);
    expect(express).toBeLessThan(20);
    expect(Array.from({ length: 20 }, (_, i) => makeOrder(2, i, c).express).some(Boolean)).toBe(false);
    expect(JSON.stringify(makeOrder(5, 3, c))).toBe(JSON.stringify(makeOrder(5, 3, c)));
    // longer days, higher (but bounded) goals
    expect(dayLength(1)).toBe(300);
    expect(dayLength(30)).toBe(480);
    expect(dayGoal(1)).toBe(2);
    expect(dayGoal(30)).toBe(5);
    for (let d = 1; d < 30; d++) expect(dayGoal(d + 1)).toBeGreaterThanOrEqual(dayGoal(d));
  });

  it('pays more for faster, cleaner deliveries and nothing for cancelled ones', () => {
    const c = newCareer();
    const lv = makeOrder(2, 0, c);
    const fast = scoreOrder(lv, c, true, lv.order.timeLimit * 0.6, 0);
    const slow = scoreOrder(lv, c, true, lv.order.timeLimit * 0.04, 0);
    const sloppy = scoreOrder(lv, c, true, lv.order.timeLimit * 0.6, 4);
    expect(fast.stars).toBe(5);
    expect(slow.stars).toBe(1);
    expect(sloppy.stars).toBe(3);
    expect(fast.total).toBeGreaterThan(slow.total);
    expect(scoreOrder(lv, c, false, 0, 0)).toMatchObject({ stars: 1, total: 0 });
    const smiley = scoreOrder(lv, { ...c, upgrades: { smile: 2 } }, true, lv.order.timeLimit * 0.6, 0);
    expect(smiley.tip).toBeGreaterThan(fast.tip);
  });

  it('upgrades cost cash, stack up to their max, and days advance only when the goal is met', () => {
    let c: Career = { ...newCareer(), cash: 30 };
    expect(buyUpgrade(c, 'bags')).toBeNull();
    c = buyUpgrade(c, 'wheels')!;
    expect(c.cash).toBe(5);
    expect(c.upgrades.wheels).toBe(1);
    c = { ...c, cash: 1000 };
    c = buyUpgrade(buyUpgrade(c, 'radar')!, 'courier')!;
    expect(buyUpgrade(c, 'radar')).toBeNull();
    const plan = planDay(1);
    const r = scoreOrder(makeOrder(1, 0, c), c, true, 100, 0);
    c = applyResult(c, r).career;
    expect(c.delivered).toBe(1);
    expect(finishDay(c, plan, plan.goal - 1)).toMatchObject({ passed: false, career: { day: 1 } });
    expect(finishDay(c, plan, plan.goal)).toMatchObject({ passed: true, career: { day: 2 } });
  });
});

describe('drift', () => {
  it('holding drift keeps the sideways momentum after a sharp turn (a slide)', () => {
    const mk = () => {
      const p = createPlayer(0, 0, 0);
      p.vz = 5;
      p.yaw = Math.PI / 2; // snapped 90° to the side with the mouse
      return p;
    };
    const grip = mk();
    const slide = mk();
    stepPlayer(grip, { forward: 1, strafe: 0, turn: 0, sprint: false }, 0.1, []);
    stepPlayer(slide, { forward: 1, strafe: 0, turn: 0, sprint: false, drift: true }, 0.1, []);
    expect(Math.abs(lateralSpeed(slide))).toBeGreaterThan(Math.abs(lateralSpeed(grip)) * 2);
    // too slow: no drift, normal grip
    const slow = createPlayer(0, 0, Math.PI / 2);
    slow.vz = 1;
    const slowGrip = createPlayer(0, 0, Math.PI / 2);
    slowGrip.vz = 1;
    stepPlayer(slow, { forward: 1, strafe: 0, turn: 0, sprint: false, drift: true }, 0.1, []);
    stepPlayer(slowGrip, { forward: 1, strafe: 0, turn: 0, sprint: false }, 0.1, []);
    expect(lateralSpeed(slow)).toBeCloseTo(lateralSpeed(slowGrip), 5);
  });
});

describe('ranks', () => {
  it('review stars climb the ladder and each promotion pays its bonus once', () => {
    const c = newCareer();
    const lv = makeOrder(1, 0, c);
    const five = scoreOrder(lv, c, true, lv.order.timeLimit, 0);
    expect(five.stars).toBe(5);
    let cur: Career = { ...c, stars: 10 };
    const { career, promoted } = applyResult(cur, five);
    expect(promoted?.id).toBe('picker');
    expect(career.cash).toBeCloseTo(five.total + RANKS[1].bonus, 2);
    expect(applyResult(career, five).promoted).toBeNull();
    // cancelled orders never count towards the rank
    cur = applyResult({ ...c, stars: 11 }, scoreOrder(lv, c, false, 0, 0)).career;
    expect(rankIndex(cur)).toBe(0);
    expect(rankProgress({ ...c, stars: 500 })).toMatchObject({ next: null, k: 1 });
    expect(rankIndex({ ...c, stars: 200 })).toBe(RANKS.length - 1);
  });
});

describe('i18n', () => {
  it('every language has every key', () => {
    expect(missingKeys()).toEqual([]);
  });

  it('every product and section is translated', () => {
    for (const id of Object.keys(PRODUCT_BY_ID)) expect(PRODUCT_NAMES[id]?.every(Boolean)).toBe(true);
    expect(Object.values(SECTION_NAMES).length).toBeGreaterThan(5);
  });
});
