/**
 * Automated end-to-end play-test (Playwright + Chromium).
 *
 *   npm run dev                 # in another terminal
 *   npm run playtest [-- url]   # default http://localhost:5173/?q=low
 *
 * Plays the whole order through the real input layer: keyboard walking,
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

  console.log('Shift start');
  await page.click('text=Vardiyaya Başla');
  await advance(0.4);
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
  await page.mouse.move(640, 360);
  await page.mouse.down();
  await page.mouse.move(760, 360, { steps: 6 });
  await page.mouse.up();
  await advance(0.1);
  const p2 = await g(() => window.__game.player);
  assert(Math.abs(p2.yaw - p1.yaw) > 0.1, 'mouse drag turns the view');
  // run into a gondola: the cart must stop at it
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

  console.log('Wrong product');
  await pick('milk_half');
  await shot('holding-wrong-milk');
  const t0 = await g(() => window.__game.timeLeft);
  await bag(0, false);
  const t1 = await g(() => window.__game.timeLeft);
  assert(t0 - t1 >= 4.9, `wrong product costs time (${(t0 - t1).toFixed(1)}s)`);
  assert((await g(() => window.__game.session)).mistakes === 1, 'mistake counted');
  await shot('wrong-rejected');
  await click('right');
  await advance(0.4);
  assert((await g(() => window.__game.session)).tray.length === 0, 'right click puts the item back');

  console.log('Picking + bagging');
  const plan = [
    ['milk_full', 0],
    ['eggs_10', 0],
    ['cheese_white', 0],
    ['bread_white', 0],
    ['tomato', 1],
    ['banana', 1],
    ['water_5l', 1],
    ['chips_potato', 1],
    ['chips_potato', 1],
    ['dish_soap', 2],
  ];
  for (const [pid, bi] of plan) {
    await pick(pid);
    if (pid === 'water_5l') {
      // bag 1 holds eggs: the rule must refuse 5L water there (no penalty)
      const tw = await g(() => window.__game.timeLeft);
      await page.keyboard.press('1');
      await advance(0.3);
      assert((await g(() => window.__game.session)).tray[0] === 'water_5l', 'eggs + 5L water rule refuses bag 1');
      assert(tw - (await g(() => window.__game.timeLeft)) < 1, 'rule refusal has no time penalty');
    }
    if (pid === 'banana') await shot('holding-banana');
    await bag(bi);
    if (pid === 'bread_white') await shot('bag1-filled');
  }
  await page.keyboard.press('Tab');
  await advance(0.1);
  await shot('phone-list-complete');

  console.log('Close order + courier');
  await page.keyboard.press('f');
  await advance(0.2);
  assert((await g(() => window.__game.phase)) === 'courierArriving', 'F closes the order, courier is on the way');
  await advance(1.5);
  await shot('courier-on-the-way');
  // walk to the delivery spot with the keyboard
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
  await advance(1.2);
  await shot('handover');
  for (let i = 0; i < 30 && (await g(() => window.__game.phase)) !== 'won'; i++) await advance(0.5);
  assert((await g(() => window.__game.phase)) === 'won', 'order delivered: game won');
  await page.waitForTimeout(400);
  await shot('won');
  assert((await g(() => window.__game.score)) > 0, 'score awarded');

  console.log('Restart + time-out');
  await page.click('text=Bir Vardiya Daha');
  await advance(0.2);
  const s = await g(() => ({ phase: window.__game.phase, t: window.__game.timeLeft, tray: window.__game.session.tray.length }));
  assert(s.phase === 'incoming' && s.tray === 0 && s.t === 300, 'restart resets the shift');
  await page.keyboard.press('Enter');
  await advance(301);
  assert((await g(() => window.__game.phase)) === 'lost', 'running out of time loses');
  await page.waitForTimeout(400);
  await shot('lost');

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
