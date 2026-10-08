/**
 * Automated end-to-end play-test (Playwright + Chromium).
 *
 *   npm run dev                 # in another terminal
 *   npm run playtest [-- url]   # default http://localhost:5173/?q=low
 *
 * Plays day 1 from the main menu: delivers order 1 (review pops up, the day
 * keeps going), lets order 2 time out, drifts for a boost, runs the clock to
 * closing time, buys upgrades, then checks a three-bag order on day 6.
 * Everything goes through the real input layer: keyboard walking,
 * mouse drag-look, left click to pick / bag, right click to put back, F to
 * close the order, E to hand it to the courier. The debug hook
 * (window.__game) is only used to walk up to shelves / aim at items and to
 * step the simulation deterministically, so it also runs on software GL.
 */
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';

const require = createRequire(import.meta.url);
let chromium;
try {
  ({ chromium } = require('playwright'));
} catch {
  ({ chromium } = require('/opt/node22/lib/node_modules/playwright'));
}

const url = process.argv[2] ?? 'http://localhost:5173/?q=low';
const out = 'playtest-output';
mkdirSync(out, { recursive: true });

const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

let step = 0;
const shot = (name) => page.screenshot({ path: `${out}/${String(++step).padStart(2, '0')}-${name}.png`, timeout: 120000 });
const g = (fn, arg) => page.evaluate(fn, arg);
const advance = (s) => page.evaluate((s) => window.__game.advance(s), s);
const assert = (cond, msg) => {
  if (!cond) {
    console.error('ASSERTION FAILED:', msg);
    throw new Error(msg);
  }
  console.log('  ✓', msg);
};
const click = async (button = 'left') => {
  await page.mouse.move(640, 360);
  await page.mouse.down({ button });
  await page.mouse.up({ button });
};

try {
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__game && window.__game.ready, null, { timeout: 240000 });
  await g(() => window.__game.freeze());
  await advance(0.05);
  await shot('title');

  console.log('Menus');
  await page.click('[data-act=go][data-to=settings]');
  await page.waitForTimeout(300);
  await shot('settings');
  await page.click('[data-act=back]:visible');
  await page.click('[data-act=go][data-to=shop]:visible');
  await page.waitForTimeout(300);
  await shot('shop-empty');
  await page.click('[data-act=back]:visible');

  console.log('Day 1, order 1');
  await page.click('[data-act=play]');
  await advance(0.4);
  const lv = await g(() => window.__game.level);
  const day1 = await g(() => window.__game.day);
  assert(lv.day === 1 && lv.index === 0 && day1.goal === 2 && day1.length === 300, `day 1 starts: first order, goal 2, 5 min (${JSON.stringify(day1)})`);
  assert((await g(() => window.__game.phase)) === 'incoming', 'phone rings with an incoming order');
  await shot('incoming-order');
  await page.keyboard.press('Enter');
  await advance(0.2);
  assert((await g(() => window.__game.phase)) === 'playing', 'Enter accepts the order and starts the clock');

  console.log('Movement');
  const p0 = await g(() => window.__game.player);
  await page.keyboard.down('w');
  await advance(1.0);
  await page.keyboard.up('w');
  const p1 = await g(() => window.__game.player);
  assert(p1.z < p0.z - 2, `W walks forward (z ${p0.z.toFixed(2)} → ${p1.z.toFixed(2)})`);
  // headless pointer lock reports bogus deltas, so feed the input handler real movement events
  await g(() => {
    for (let i = 0; i < 6; i++) window.dispatchEvent(new MouseEvent('mousemove', { movementX: 20, movementY: 0 }));
  });
  await advance(0.1);
  const p2 = await g(() => window.__game.player);
  assert(Math.abs(p2.yaw - p1.yaw) > 0.1, 'mouse drag turns the view');
  await g(() => window.__game.teleport(-8, -3, -Math.PI / 2, 0));
  await page.keyboard.down('w');
  await advance(2.0);
  await page.keyboard.up('w');
  const p3 = await g(() => window.__game.player);
  assert(p3.x > -10.5 + 0.5 + 0.9, `gondola blocks the cart (x=${p3.x.toFixed(2)})`);

  async function pick(pid) {
    assert(await g((p) => window.__game.goToProduct(p), pid), `walked to ${pid}`);
    await advance(0.15);
    const t = await g(() => window.__game.target);
    assert(t && t.kind === 'product' && t.productId === pid, `aiming at ${pid}`);
    await click('left');
    await advance(0.5);
    const s = await g(() => window.__game.session);
    assert(s.tray[0] === pid, `holding ${pid}`);
  }

  async function bag(i, expectOk = true) {
    await g((i) => window.__game.aimBag(i), i);
    await advance(0.1);
    const t = await g(() => window.__game.target);
    assert(t && t.kind === 'bag' && t.index === i, `aiming at bag ${i + 1}`);
    const before = (await g(() => window.__game.session)).bags[i].items.length;
    await click('left');
    await advance(0.6);
    const after = (await g(() => window.__game.session)).bags[i].items.length;
    if (expectOk) assert(after === before + 1, `placed into bag ${i + 1} (${after} items)`);
    else assert(after === before, `bag ${i + 1} rejected the item`);
  }

  /** Picks + bags the whole current order following the solver's packing plan. */
  async function packAll(limit = Infinity) {
    const order = await g(() => window.__game.order);
    const plan = await g(() => window.__game.packPlan);
    const items = order.lines.flatMap((l) => Array(l.qty).fill(l.productId));
    for (let i = 0; i < items.length && i < limit; i++) {
      await pick(items[i]);
      await bag(plan[i]);
    }
  }

  console.log('Wrong product');
  const order1 = await g(() => window.__game.order);
  const wrong = ['milk_half', 'cola', 'honey', 'tea'].find((id) => !order1.lines.some((l) => l.productId === id));
  await pick(wrong);
  const t0 = await g(() => window.__game.timeLeft);
  await bag(0, false);
  const t1 = await g(() => window.__game.timeLeft);
  assert(t0 - t1 >= 4.9, `wrong product costs time (${(t0 - t1).toFixed(1)}s)`);
  await shot('wrong-rejected');
  await click('right');
  await advance(0.4);
  assert((await g(() => window.__game.session)).tray.length === 0, 'right click puts the item back');

  console.log('Picking + bagging');
  await packAll();
  await page.keyboard.press('Tab');
  await advance(0.1);
  await shot('phone-list-complete');

  console.log('Close order + courier');
  await page.keyboard.press('f');
  await advance(0.2);
  assert((await g(() => window.__game.phase)) === 'courierArriving', 'F closes the order, courier is on the way');
  const del = await g(() => window.__game.layout.delivery);
  await g(() => window.__game.teleport(0, 7.5, 0, 0.05));
  await page.keyboard.down('w');
  for (let i = 0; i < 40; i++) {
    await advance(0.05);
    const p = await g(() => window.__game.player);
    if (p.z > del.z - 0.9) break;
  }
  await page.keyboard.up('w');
  await advance(0.6);
  for (let i = 0; i < 30 && (await g(() => window.__game.phase)) !== 'awaitingHandover'; i++) await advance(0.5);
  assert((await g(() => window.__game.phase)) === 'awaitingHandover', 'courier arrived and waits at the door');
  await shot('courier-waiting');
  await page.keyboard.press('e');
  await advance(0.1);
  assert((await g(() => window.__game.phase)) === 'handover', 'E hands the bags to the courier');
  for (let i = 0; i < 60 && (await g(() => window.__game.day)).results < 1; i++) await advance(0.2);
  assert((await g(() => window.__game.phase)) === 'waiting', 'delivered: play goes on (no blocking screen)');
  assert(await page.isVisible('.review-toast'), 'the customer review pops up as a notification');
  const c1 = await g(() => window.__game.career);
  assert(c1.cash > 0 && c1.delivered === 1, `order paid ($${c1.cash})`);
  await advance(0.3);
  await shot('review-toast');
  await advance(5);
  const lv2 = await g(() => window.__game.level);
  assert(lv2.index === 1 && (await g(() => window.__game.phase)) === 'incoming', 'a few seconds later the next order rings');

  console.log('Order 2 times out');
  await page.keyboard.press('Enter');
  await advance(0.2);
  const left = await g(() => window.__game.timeLeft);
  await advance(left - 7);
  await shot('low-time');
  await advance(8);
  assert((await g(() => window.__game.phase)) === 'waiting', 'time out: order cancelled, the day continues');
  assert(await page.isVisible('.review-toast.bad'), 'angry review notification');

  console.log('Drift');
  await g(() => window.__game.teleport(0, 12, Math.PI, -0.1));
  await page.keyboard.down('w');
  await page.keyboard.down('Shift');
  await advance(0.5);
  await page.keyboard.down('Space');
  let maxLevel = 0;
  // one sharp turn while sliding, then hold the slide
  for (let i = 0; i < 24; i++) {
    const mx = i < 8 ? 45 : 0;
    await g((mx) => window.dispatchEvent(new MouseEvent('mousemove', { movementX: mx, movementY: 0 })), mx);
    await advance(0.05);
    maxLevel = Math.max(maxLevel, (await g(() => window.__game.drift)).level);
    if (maxLevel >= 1) {
      await shot('drift');
      break;
    }
  }
  assert(maxLevel >= 1, `holding Space while turning charges a drift (level ${maxLevel})`);
  await page.keyboard.up('Space');
  await advance(0.05);
  assert((await g(() => window.__game.drift)).boost > 0, 'releasing the drift fires a boost');
  await page.keyboard.up('Shift');
  await page.keyboard.up('w');
  await advance(1);

  console.log('Closing time');
  const plan1 = await g(() => window.__game.day);
  await g((t) => window.__game.setDayTime(t), plan1.length - 40);
  await advance(1);
  await shot('sunset');
  await g((t) => window.__game.setDayTime(t), plan1.length + 1);
  await advance(0.3);
  // an order may still be ringing / in progress: let it run out
  for (let i = 0; i < 40 && (await g(() => window.__game.screen)) !== 'dayEnd'; i++) await advance(10);
  assert((await g(() => window.__game.screen)) === 'dayEnd', 'closing time ends the day');
  assert((await g(() => window.__game.career)).day === 1, 'goal missed (1/2): day 1 again');
  await page.waitForTimeout(500);
  await shot('day-end');

  console.log('Shop');
  await g(() => window.__game.giveCash(200));
  await page.click('[data-act=go][data-to=shop]:visible');
  await page.click('[data-act=buy][data-id=radar]');
  await page.click('[data-act=buy][data-id=bags]');
  const c2 = await g(() => window.__game.career);
  assert(c2.upgrades.radar === 1 && c2.upgrades.bags === 1, 'bought Shelf Radar + Bigger Bags');
  await page.waitForTimeout(300);
  await shot('shop');
  await page.click('[data-act=back]:visible');
  assert((await g(() => window.__game.screen)) === 'dayEnd', 'shop returns to the end-of-day screen');

  console.log('Day 6: three bags + radar');
  await g(() => window.__game.startDay(6));
  await advance(0.2);
  await page.keyboard.press('Enter');
  await advance(0.2);
  let found = false;
  for (let i = 0; i < 12 && !found; i++) {
    if ((await g(() => window.__game.session)).bags.length === 3) found = true;
    else {
      await g(() => window.__game.skipOrder());
      await advance(0.1);
      await page.keyboard.press('Enter');
      await advance(0.2);
    }
  }
  assert(found, 'day 6 has a three-bag order');
  assert((await g(() => window.__game.order)).bagCapacity === 5, 'Bigger Bags: 5 items per bag');
  await advance(0.1);
  assert(await page.isVisible('.radar'), 'Shelf Radar arrow is shown');
  await packAll(3);
  await shot('three-bags');

  console.log('Pause + restart');
  await g(() => window.__game.press('pause'));
  await advance(0.05);
  assert(await page.isVisible('[data-act=resume]'), 'pause menu opens');
  await shot('pause');
  await page.click('[data-act=restart]');
  await advance(0.2);
  const s = await g(() => ({ phase: window.__game.phase, tray: window.__game.session.tray.length, bagged: window.__game.session.bags.reduce((a, b) => a + b.items.length, 0) }));
  assert(s.phase === 'incoming' && s.tray === 0 && s.bagged === 0 && (await g(() => window.__game.day)).t < 1, 'restart starts the day over');

  assert(errors.length === 0, `no page errors${errors.length ? ': ' + errors.join(' | ') : ''}`);
  console.log('\nPLAYTEST PASSED');
} catch (e) {
  await shot('failure').catch(() => {});
  console.error(e);
  console.error('Page errors:', errors);
  process.exitCode = 1;
} finally {
  await browser.close();
}
