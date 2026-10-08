/**
 * CrazyGames cover images: a clean in-game shot (HUD hidden) per format,
 * rendered at 2x for the small ones, with the Order Dash logo on top.
 *
 *   npm run dev
 *   node scripts/make-covers.mjs [url]
 *
 * Output: covers/cover-landscape-1920x1080.jpg, covers/cover-portrait-800x1200.jpg,
 *         covers/cover-square-800x800.jpg
 */
import { createRequire } from "node:module";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const require = createRequire(import.meta.url);
let chromium;
try {
  ({ chromium } = require("playwright"));
} catch {
  ({ chromium } = require("/opt/node22/lib/node_modules/playwright"));
}

const url = process.argv[2] ?? "http://localhost:5173/?q=high";
const COVERS = [
  // shot: where the camera stands / looks; logo: placement on the final image
  {
    name: "landscape-1920x1080",
    w: 1920,
    h: 1080,
    render: [1920, 1080],
    shot: { x: 1.4, z: 9.6, yaw: Math.PI + 0.32, pitch: -0.1 },
    logo: "left",
  },
  {
    name: "portrait-800x1200",
    w: 800,
    h: 1200,
    render: [1200, 1800],
    shot: { x: 0.2, z: 9.8, yaw: Math.PI + 0.05, pitch: -0.16 },
    logo: "top",
  },
  {
    name: "square-800x800",
    w: 800,
    h: 800,
    render: [1600, 1600],
    shot: { x: 0.8, z: 9.6, yaw: Math.PI + 0.2, pitch: -0.13 },
    logo: "top",
  },
];

mkdirSync("covers", { recursive: true });
const browser = await chromium.launch({
  args: [
    "--use-gl=angle",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
    "--ignore-gpu-blocklist",
    "--in-process-gpu",
  ],
});
const logo = `data:image/webp;base64,${readFileSync("public/ui/logo.webp").toString("base64")}`;

for (const c of COVERS) {
  // 1) the scene, HUD hidden
  const page = await browser.newPage({
    viewport: { width: c.render[0], height: c.render[1] },
  });
  await page.addInitScript(() => {
    localStorage.setItem(
      "orderdash.settings.v1",
      JSON.stringify({
        lang: "en",
        rev: 2,
        quality: "high",
        announcements: false,
      }),
    );
    localStorage.setItem(
      "orderdash.career.v1",
      JSON.stringify({
        day: 4,
        cash: 0,
        earned: 0,
        delivered: 0,
        ratingSum: 0,
        ratingCount: 0,
        bestDay: 0,
        stars: 0,
        upgrades: {},
      }),
    );
  });
  await page.goto(url, { waitUntil: "load" });
  await page.waitForFunction(() => window.__game && window.__game.ready, null, {
    timeout: 1_800_000,
  });
  await page.addStyleTag({ content: ".hud { display: none !important; }" });
  await page.evaluate((s) => {
    const g = window.__game;
    g.freeze();
    g.startDay(4);
    g.setDayTime(g.day.length * 0.32);
    g.teleport(s.x, s.z, s.yaw, s.pitch);
    g.advance(1.2); // shoppers move a bit, lighting settles
    g.teleport(s.x, s.z, s.yaw, s.pitch);
    g.advance(1 / 30);
  }, c.shot);
  const shot = join("covers", `scene-${c.name}.jpg`);
  await page.screenshot({ path: shot, type: "jpeg", quality: 95, timeout: 0 });
  await page.close();

  // 2) composite: scene + soft gradient + logo
  const comp = await browser.newPage({ viewport: { width: c.w, height: c.h } });
  const bg = `data:image/jpeg;base64,${readFileSync(shot).toString("base64")}`;
  const logoCss =
    c.logo === "left"
      ? "left: 4%; top: 50%; width: 46%; transform: translateY(-52%) rotate(-3deg);"
      : "left: 50%; top: 3%; width: 84%; transform: translateX(-50%) rotate(-3deg);";
  const shade =
    c.logo === "left"
      ? "linear-gradient(90deg, rgba(27,23,48,.62) 0%, rgba(27,23,48,.25) 45%, rgba(27,23,48,0) 70%)"
      : "linear-gradient(180deg, rgba(27,23,48,.6) 0%, rgba(27,23,48,.2) 40%, rgba(27,23,48,0) 62%)";
  await comp.setContent(`<!doctype html><html><body style="margin:0;width:${c.w}px;height:${c.h}px;overflow:hidden;position:relative;background:#4b48af">
    <img src="${bg}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover">
    <div style="position:absolute;inset:0;background:${shade}"></div>
    <div style="position:absolute;inset:0;box-shadow:inset 0 0 ${Math.round(c.w * 0.12)}px rgba(27,23,48,.45)"></div>
    <img src="${logo}" style="position:absolute;${logoCss};filter:drop-shadow(0 ${Math.round(c.w * 0.008)}px 0 rgba(27,23,48,.55)) drop-shadow(0 ${Math.round(c.w * 0.02)}px ${Math.round(c.w * 0.03)}px rgba(0,0,0,.35))">
  </body></html>`);
  await comp.waitForLoadState("load");
  const out = join("covers", `cover-${c.name}.jpg`);
  await comp.screenshot({ path: out, type: "jpeg", quality: 92 });
  await comp.close();
  console.log(resolve(out));
}
await browser.close();
writeFileSync(join("covers", ".gitkeep"), "");
