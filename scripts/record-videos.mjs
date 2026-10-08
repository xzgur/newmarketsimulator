/**
 * Renders the CrazyGames preview videos frame by frame (deterministic, so it
 * works on software GL): the game is frozen and stepped exactly 1/30 s per
 * frame, page timers run on a fake clock and CSS animations are stepped by
 * hand. Then ffmpeg encodes silent H.264 MP4s.
 *
 *   npm run dev
 *   node scripts/record-videos.mjs [landscape|portrait|all] [url]
 *   PREVIEW=1 node scripts/record-videos.mjs …   # quick 1/3-size dry run to check the shots
 *
 * Output: videos/order-dash-landscape.mp4 (1920x1080, 16:9)
 *         videos/order-dash-portrait.mp4  (1080x1620, 2:3)
 */
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
let chromium;
try {
  ({ chromium } = require('playwright'));
} catch {
  ({ chromium } = require('/opt/node22/lib/node_modules/playwright'));
}

const which = process.argv[2] ?? 'all';
const url = process.argv[3] ?? 'http://localhost:5173/?q=high';
const FPS = 30;
const PREVIEW = !!process.env.PREVIEW;
const scale = PREVIEW ? 1 / 3 : 1;
const FORMATS = {
  landscape: { width: Math.round(1920 * scale), height: Math.round(1080 * scale) },
  portrait: { width: Math.round(1080 * scale), height: Math.round(1620 * scale) },
};

async function record(name, size) {
  const tag = PREVIEW ? `${name}-preview` : name;
  const frames = join('videos', `frames-${tag}`);
  rmSync(frames, { recursive: true, force: true });
  mkdirSync(frames, { recursive: true });
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--in-process-gpu'] });
  const page = await browser.newPage({ viewport: size });
  page.on('pageerror', (e) => console.error('page error:', e.message));
  // a mid-career save: day 4, close to a promotion, English, no tutorial hints
  await page.addInitScript(() => {
    localStorage.setItem('orderdash.settings.v1', JSON.stringify({ lang: 'en', rev: 2, quality: 'high', announcements: false }));
    localStorage.setItem('orderdash.career.v1', JSON.stringify({ day: 4, cash: 86.4, earned: 210, delivered: 9, ratingSum: 41, ratingCount: 10, bestDay: 3, stars: 33, upgrades: { wheels: 1 } }));
  });
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__game && window.__game.ready, null, { timeout: 1_800_000 });
  await page.addStyleTag({ content: '.controls-hint, .credits { display: none !important; }' });
  const g = (fn, arg) => page.evaluate(fn, arg);
  await g(() => window.__game.freeze());
  await page.clock.install();
  // the fake clock keeps running in real time until paused; frames take seconds to render
  await page.clock.pauseAt(Date.now() + 1000);

  let n = 0;
  /** Steps the game, the page timers and every CSS animation by one frame, then captures it. */
  const frame = async () => {
    await g((dt) => {
      window.__game.advance(dt);
      for (const a of document.getAnimations()) {
        const tt = (a.__t ?? Number(a.currentTime ?? 0)) + dt * 1000;
        a.__t = tt;
        if (a.playState !== 'paused') a.pause();
        a.currentTime = tt;
      }
    }, 1 / FPS);
    await page.clock.runFor(Math.round(1000 / FPS));
    await page.screenshot({ path: join(frames, `${String(n++).padStart(4, '0')}.jpg`), type: 'jpeg', quality: 93 });
  };
  const frames$ = async (count, each) => {
    for (let i = 0; i < count; i++) {
      if (each) await each(i);
      await frame();
    }
  };
  /** Fast-forward without capturing: game, timers and CSS animations stay in sync. */
  const skip = async (sec) => {
    await g((dt) => {
      window.__game.advance(dt);
      for (const a of document.getAnimations()) {
        const tt = (a.__t ?? Number(a.currentTime ?? 0)) + dt * 1000;
        a.__t = tt;
        if (a.playState !== 'paused') a.pause();
        a.currentTime = tt;
      }
    }, sec);
    await page.clock.runFor(Math.round(sec * 1000));
  };
  const mouse = (dx) => g((dx) => window.dispatchEvent(new MouseEvent('mousemove', { movementX: dx, movementY: 0 })), dx);
  const click = async () => {
    const vp = page.viewportSize();
    await page.mouse.move(vp.width / 2, vp.height / 2);
    await page.mouse.down();
    await page.mouse.up();
  };
  const setDay = (k) => g((k) => window.__game.setDayTime(window.__game.day.length * k), k);

  // ---- shot 1: the day opens, the phone rings, push into the store (3 s)
  await g(() => window.__game.startDay(4));
  await setDay(0.05);
  await page.keyboard.down('w');
  await frames$(90, async (i) => {
    if (i === 55) await page.keyboard.press('Enter');
    if (i > 20 && i < 50) await mouse(-2);
  });
  await page.keyboard.up('w');

  // ---- shot 2: sprint + drift + boost down the main aisle (3.5 s)
  await setDay(0.3);
  await g(() => window.__game.hud.setPhoneOpen(false));
  await g(() => window.__game.teleport(0, 11.5, Math.PI, -0.08));
  await page.keyboard.down('w');
  await page.keyboard.down('Shift');
  await frames$(105, async (i) => {
    if (i === 12) await page.keyboard.down('Space');
    if (i >= 12 && i < 20) await mouse(42);
    if (i === 40) await page.keyboard.up('Space');
    if (i > 55 && i < 75) await mouse(-14);
  });
  await page.keyboard.up('Shift');
  await page.keyboard.up('w');

  // ---- shot 3: grab two items and bag them, combo (5 s)
  await setDay(0.4);
  const order = await g(() => window.__game.order);
  const plan = await g(() => window.__game.packPlan);
  const items = order.lines.flatMap((l) => Array(l.qty).fill(l.productId));
  for (const k of [0, 1]) {
    await g((pid) => window.__game.goToProduct(pid), items[k]);
    await frames$(14);
    await click();
    await frames$(26);
    await g((b) => window.__game.aimBag(b), plan[k]);
    await frames$(10);
    await click();
    await frames$(25);
  }

  // ---- shot 4: golden hour, hand the bags to the courier, review + promotion (6.7 s)
  for (let k = 2; k < items.length; k++) {
    await g((pid) => window.__game.goToProduct(pid), items[k]);
    await skip(0.2);
    await click();
    await skip(0.6);
    await g((b) => window.__game.aimBag(b), plan[k]);
    await skip(0.15);
    await click();
    await skip(0.6);
  }
  await page.keyboard.press('f');
  await skip(0.2);
  await g(() => window.__game.skipCourier());
  // let the order-ready notifications run their course before the last shot
  await skip(7);
  await g(() => window.__game.hud.setPhoneOpen(false));
  await setDay(0.55);
  const del = await g(() => window.__game.layout.delivery);
  // a step back from the door so the courier and the street are in view, then roll up and hand over
  await g((d) => window.__game.teleport(d.x, d.z - 2.4, 0, 0.02), del);
  await page.keyboard.down('w');
  await frames$(200, async (i) => {
    if (i === 16) await page.keyboard.up('w');
    if (i === 30) await page.keyboard.press('e');
  });

  await browser.close();
  mkdirSync('videos', { recursive: true });
  const out = join('videos', `order-dash-${tag}.mp4`);
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', join(frames, '%04d.jpg'), '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an', out]);
  console.log(`${out}: ${n} frames, ${(n / FPS).toFixed(1)} s`);
}

for (const [name, size] of Object.entries(FORMATS)) {
  if (which === 'all' || which === name) await record(name, size);
}
