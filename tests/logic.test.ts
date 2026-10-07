import { describe, expect, it } from 'vitest';
import { OrderSession, bagConflict } from '../src/logic/order';
import { DEMO_ORDER, type OrderDef } from '../src/data/order';
import { getProduct, PRODUCT_BY_ID } from '../src/data/products';
import { buildLayout, findDisplayAt, interactionZone } from '../src/data/layout';
import { resolveCircle, circleIntersectsBox } from '../src/logic/collision';
import { createCart, stepCart, CART } from '../src/logic/cartPhysics';
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

  it('every display can be reached by the cart (zone centre not inside a collider)', () => {
    for (const d of layout.displays) {
      const z = interactionZone(d);
      const blocked = layout.colliders.some((b) => circleIntersectsBox(z.cx, z.cz, CART.radius, b));
      expect(blocked, `display ${d.id} ${d.productId}`).toBe(false);
      expect(findDisplayAt(layout.displays, z.cx, z.cz)?.id).toBe(d.id);
    }
  });

  it('start and delivery spots are free', () => {
    for (const p of [layout.start, layout.delivery]) {
      expect(layout.colliders.some((b) => circleIntersectsBox(p.x, p.z, CART.radius, b))).toBe(false);
    }
  });

  it('finds nothing in the middle of an empty corridor', () => {
    expect(findDisplayAt(layout.displays, 0, 6)).toBeNull();
  });
});

describe('collision + cart physics', () => {
  it('pushes a circle out of a box', () => {
    const r = resolveCircle(0.9, 0, 0.5, [{ minX: -1, maxX: 0.5, minZ: -1, maxZ: 1 }]);
    expect(r.hit).toBe(true);
    expect(r.x).toBeCloseTo(1.0, 5);
  });

  it('pushes a centre that is inside a box out on the shortest axis', () => {
    const r = resolveCircle(0.4, 0, 0.5, [{ minX: -1, maxX: 0.5, minZ: -1, maxZ: 1 }]);
    expect(r.x).toBeCloseTo(1.0, 5);
  });

  it('accelerates forward along heading and stops with brake', () => {
    const c = createCart(0, 0, 0);
    for (let i = 0; i < 120; i++) stepCart(c, { throttle: 1, steer: 0, brake: false }, 1 / 60, []);
    expect(c.speed).toBeCloseTo(CART.maxForward, 3);
    expect(c.z).toBeGreaterThan(3);
    expect(Math.abs(c.x)).toBeLessThan(1e-6);
    for (let i = 0; i < 60; i++) stepCart(c, { throttle: 0, steer: 0, brake: true }, 1 / 60, []);
    expect(c.speed).toBe(0);
  });

  it('turns left (towards +X when facing +Z) with positive steer, even standing still', () => {
    const c = createCart(0, 0, 0);
    for (let i = 0; i < 30; i++) stepCart(c, { throttle: 0, steer: 1, brake: false }, 1 / 60, []);
    expect(c.heading).toBeGreaterThan(0.3);
  });

  it('cannot drive through a wall', () => {
    const c = createCart(0, 0, 0);
    const wall = [{ minX: -5, maxX: 5, minZ: 2, maxZ: 3 }];
    for (let i = 0; i < 300; i++) stepCart(c, { throttle: 1, steer: 0, brake: false }, 1 / 60, wall);
    expect(c.z).toBeLessThanOrEqual(2 - CART.radius + 1e-6);
  });
});

describe('GameFlow', () => {
  it('runs through the happy path', () => {
    const f = new GameFlow(10);
    expect(f.timerRunning).toBe(false);
    f.start();
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
    f.penalize(5);
    expect(f.timeLeft).toBe(5);
    expect(f.tick(6)).toBe(true);
    expect(f.phase).toBe('lost');
    expect(f.orderClosed()).toBe(false);
  });

  it('pause stops the clock', () => {
    const f = new GameFlow(10);
    f.start();
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
