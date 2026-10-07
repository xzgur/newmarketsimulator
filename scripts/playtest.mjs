/**
 * Automated end-to-end play-test (Playwright + Chromium).
 *
 *   npm run dev            # in another terminal
 *   node scripts/playtest.mjs [url]
 *
 * Plays the whole demo order through the real UI: drives with the keyboard,
 * picks products (including one wrong product), bags them by clicking the
 * cart panel, closes the order, waits for the courier and hands it over.
 * Uses window.__game (debug hook) to teleport between shelves and to step the
 * simulation deterministically, so it also works with software rendering.
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
const page = await browser.newPage({ viewport: { width: 1280, height: 760 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

let step = 0;
const shot = (name) => page.screenshot({ path: `${out}/${String(++step).padStart(2, '0')}-${name}.png` });
const g = (expr) => page.evaluate(expr);
const advance = (s) => page.evaluate((s) => window.__game.advance(s), s);
const assert = (cond, msg) => {
  if (!cond) {
    console.error('ASSERTION FAILED:', msg);
    throw new Error(msg);
  }
  console.log('  ✓', msg);
};

try {
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction(() => !!window.__game, null, { timeout: 30000 });
  await shot('intro');
  await page.click('text=Vardiyayı Başlat');
  assert((await g(() => window.__game.phase)) === 'playing', 'game starts');

  // --- real driving: forward, turn in place, collision
  console.log('Driving');
  const c0 = await g(() => window.__game.cart);
  await page.keyboard.down('w');
  await advance(1.0);
  await page.keyboard.up('w');
  const c1 = await g(() => window.__game.cart);
  assert(c1.z < c0.z - 2, `W drives forward (z ${c0.z.toFixed(2)} → ${c1.z.toFixed(2)})`);
  await page.keyboard.down('a');
  await advance(0.6);
  await page.keyboard.up('a');
  const c2 = await g(() => window.__game.cart);
  assert(Math.abs(c2.heading - c1.heading) > 0.5, 'A turns the cart');
  await page.keyboard.down('Space');
  await advance(0.5);
  await page.keyboard.up('Space');
  // drive into the snacks gondola and make sure we cannot pass through it
  await g(() => window.__game.teleport(-6.5, 0, -Math.PI / 2));
  await page.keyboard.down('w');
  await advance(2.5);
  await page.keyboard.up('w');
  const c3 = await g(() => window.__game.cart);
  assert(c3.x > -8.5 + 0.5, `gondola blocks the cart (x=${c3.x.toFixed(2)})`);
  await shot('driving');

  const order = ['milk_full', 'eggs_10', 'cheese_white', 'bread_white', 'tomato', 'banana', 'water_5l', 'chips_potato', 'chips_potato', 'dish_soap'];

  async function goTo(productId) {
    const ok = await page.evaluate((pid) => {
      const G = window.__game;
      const d = G.displays.find((x) => x.productId === pid);
      if (!d) return false;
      const reach = d.depth / 2 + 0.95;
      G.teleport(d.x + Math.sin(d.angle) * reach, d.z + Math.cos(d.angle) * reach, d.angle + Math.PI);
      return true;
    }, productId);
    await advance(0.1);
    return ok;
  }

  async function pick(productId) {
    assert(await goTo(productId), `found a display for ${productId}`);
    const target = await g(() => window.__game.target);
    assert(target && target.productId === productId, `targeting ${productId}`);
    const before = (await g(() => window.__game.session)).tray.length;
    await page.keyboard.press('e');
    await advance(0.6);
    const after = (await g(() => window.__game.session)).tray.length;
    assert(after === before + 1, `picked ${productId} (tray ${after})`);
  }

  async function openPanel() {
    if (await page.isHidden('.panel')) await page.keyboard.press('Tab');
    await advance(0.05);
    assert(await page.isVisible('.panel'), 'cart panel open');
  }

  async function closePanel() {
    if (await page.isVisible('.panel')) await page.keyboard.press('Tab');
    await advance(0.05);
  }

  /** Bag everything in the tray into the first bag that accepts it (via UI clicks). */
  async function bagAll() {
    await openPanel();
    for (const i of [0, 1, 2]) {
      const folded = await page.$(`.bags .bag:nth-child(${i + 1}) .btn`);
      if (folded) await folded.click();
    }
    let guard = 0;
    while ((await g(() => window.__game.session)).tray.length && guard++ < 20) {
      const before = await g(() => window.__game.session);
      const pid = before.tray[0];
      let placed = false;
      for (const bi of [0, 1, 2]) {
        await page.click('.tray .slot.filled >> nth=0');
        await page.click(`.bags .bag:nth-child(${bi + 1})`);
        await advance(0.05);
        const s = await g(() => window.__game.session);
        if (s.bags[bi].items.length > before.bags[bi].items.length) {
          console.log(`    bagged ${pid} → bag ${bi + 1}`);
          placed = true;
          break;
        }
      }
      assert(placed, `${pid} placed in some bag`);
    }
  }

  // --- wrong product first: should be rejected with a penalty, then returned
  console.log('Wrong product');
  await pick('milk_half');
  await shot('picked-wrong');
  await openPanel();
  const t0 = await g(() => window.__game.timeLeft);
  await page.click('.bags .bag:nth-child(1) .btn'); // open bag 1
  await page.click('.tray .slot.filled >> nth=0');
  await page.click('.bags .bag:nth-child(1)');
  await advance(0.05);
  const t1 = await g(() => window.__game.timeLeft);
  assert(t0 - t1 >= 4.9, `wrong product costs time (${(t0 - t1).toFixed(1)}s)`);
  assert((await g(() => window.__game.session)).mistakes === 1, 'mistake counted');
  await shot('wrong-rejected');
  await page.click('.tray .slot.filled .slot-del');
  await advance(0.05);
  assert((await g(() => window.__game.session)).tray.length === 0, 'wrong product returned');
  await closePanel();

  // --- pick the order in two rounds (tray holds 6)
  console.log('Picking round 1');
  for (const pid of order.slice(0, 6)) await pick(pid);
  await shot('tray-full');
  await bagAll();
  await shot('bagged-round1');
  await closePanel();

  console.log('Picking round 2');
  for (const pid of order.slice(6)) await pick(pid);
  await bagAll();
  await shot('all-bagged');

  // --- close the order
  const btn = await page.$('.close-order');
  assert(!(await btn.isDisabled()), 'close order button enabled');
  await btn.click();
  await advance(0.1);
  assert((await g(() => window.__game.phase)) === 'courierArriving', 'courier called');

  // --- drive (keyboard) into the delivery zone from just inside the store
  console.log('Delivery');
  const deliveryZ = await g(() => window.__game.delivery.z);
  await g(() => window.__game.teleport(0, 5, 0));
  await page.keyboard.down('w');
  for (let i = 0; i < 40; i++) {
    await advance(0.05);
    const c = await g(() => window.__game.cart);
    if (c.z > deliveryZ - 0.9) break;
  }
  await page.keyboard.up('w');
  await page.keyboard.down('Space');
  await advance(0.6);
  await page.keyboard.up('Space');
  await advance(3.5);
  await shot('courier-arriving');
  for (let i = 0; i < 20 && (await g(() => window.__game.phase)) !== 'awaitingHandover'; i++) await advance(0.5);
  assert((await g(() => window.__game.phase)) === 'awaitingHandover', 'courier arrived and waits');
  const c = await g(() => window.__game.cart);
  const del = await g(() => window.__game.delivery);
  assert(Math.hypot(c.x - del.x, c.z - del.z) <= del.radius, `cart in delivery zone (${c.x.toFixed(2)}, ${c.z.toFixed(2)})`);
  await shot('courier-waiting');
  await page.keyboard.press('e');
  await advance(0.1);
  assert((await g(() => window.__game.phase)) === 'handover', 'handover started');
  await advance(1.0);
  await shot('handover');
  for (let i = 0; i < 30 && (await g(() => window.__game.phase)) !== 'won'; i++) await advance(0.5);
  assert((await g(() => window.__game.phase)) === 'won', 'game won');
  await page.waitForTimeout(300);
  await shot('won');

  // --- restart works
  await page.click('text=Tekrar Oyna');
  await advance(0.1);
  const s = await g(() => ({ phase: window.__game.phase, t: window.__game.timeLeft, tray: window.__game.session.tray.length }));
  assert(s.phase === 'playing' && s.tray === 0 && s.t > 299, 'restart resets the game');

  // --- time-out path
  await advance(301);
  assert((await g(() => window.__game.phase)) === 'lost', 'running out of time loses');
  await page.waitForTimeout(300);
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
