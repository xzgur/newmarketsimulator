# Order Dash

A first-person grocery-picking career game built with Three.js, Vite and TypeScript, in a cel-shaded, ink-outlined style.

You're the newest picker at the Corner Market. Orders arrive on the **Order Dash** app clipped to your cart. Accept one and the clock starts. Push a real shopping cart through a busy store, grab products off the shelves, pack them into the open bags (keep chemicals away from food and eggs away from heavy bottles), then close the order and hand the bags to the courier at the door.

## Career

The game is an endless series of **work days**, and a day never stops for menus:

- **The day clock:** the store opens at 08:00 and closes at 20:00 on the in-game clock. Day 1 lasts 5 real minutes, and each day adds 30 s, up to 8 minutes.
- **Orders keep coming:** a few seconds after an order is delivered or cancelled, the phone rings with the next one. The world is never rebuilt between orders: shelves are restocked and you get a fresh cart for the new bags. Each order is seeded by (day, order number), so a retried day brings the same orders.
- **Daily goal:** deliver 2 orders on day 1, rising slowly to 5 by day 13. At 20:00 the store closes: you finish the order in progress, then the day ends. Hit the goal and the next day unlocks. Miss it and you replay the day, but you keep your earnings.
- **Review and pay:** every order ends with a 1–5 ★ customer review that pops up as a notification while you keep playing. You earn the order pay, plus a speed bonus and a tip that depend on how fast and clean you were. A timed-out order is cancelled, earns a 1 ★ review and pays nothing.
- **Difficulty ramps gradually:**
  - Orders grow from 3 to 10 items over the days, and orders later in a day are a little bigger.
  - The time allowed per item shrinks from 20 s to 14 s.
  - Day 2 introduces the chemicals rule, and day 3 the eggs/heavy rule.
  - From day 3, about one order in five is ⚡ **Express**: less time, 1.5× pay, double tip.
  - More shoppers fill the aisles each day.
- **Time of day:** the light blends smoothly from day through a golden-hour sunset to night as the clock runs. Skies swap while dimmed, so there's no visible jump.
- **Long-term goal, the rank ladder:** every review star from a delivered order counts toward your rank: Trainee → Picker (12 ★) → Pro Picker (35 ★) → Shift Lead (70 ★) → Store Manager (120 ★) → Legend (200 ★). Each promotion pays a cash bonus and repaints your cart. Reaching Legend unlocks the **Golden Cart**.
- **Upgrades** (bought with your cash):

  | Upgrade | Effect |
  |---|---|
  | Turbo Wheels | Faster cart |
  | Overtime | More time per order |
  | Shelf Radar | An arrow points to the next item |
  | Bigger Bags | Each bag holds more items |
  | Express Courier | The courier arrives faster |
  | Smile Training | Bigger tips |

- **Saved progress:** day, cash, store rating and upgrades are saved in `localStorage`.
- **Tests:** the unit tests generate 30 days of orders, with and without upgrades, and prove that every one can be packed under its rules.

**When time runs low:** under 30 s the screen edges pulse red, the timer shakes and the music speeds up. In the last 10 s there's also a heartbeat.

**Drift:** hold `Space` while moving and turn with the mouse. The cart keeps its momentum and slides, with a skid sound and sparks. Holding the slide charges a boost (blue, then orange). Let go to fire it. Bumping into something loses the charge.

**Store PA:** a chime and announcements from the ceiling speakers. The store opens and closes with one, and there are regular in-store lines in between; the music dips while the PA talks. English, German and Spanish lines are pre-rendered with [Piper](https://github.com/rhasspy/piper) neural TTS and a baked-in megaphone effect (`scripts/build-announcements.py`). The voices are CC0 / public domain: Kathleen, Thorsten and carlfm. Turkish uses the browser's own Turkish voice when one is installed.

## Run

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # typecheck + production build → dist/
npm test           # unit tests (vitest)
npm run typecheck
npm run playtest   # with the dev server running: end-to-end browser playtest
```

To use the shipped 3D assets, run `scripts/fetch-assets.sh` and then `node scripts/build-assets.mjs`. This rebuilds `public/models/*.glb` from the KayKit packs.

URL overrides: `?q=low|medium|high`, `?mood=day|sunset|night`.

## Controls

| Input | Action |
| --- | --- |
| `W` `A` `S` `D` | Push the cart / strafe |
| Mouse | Look |
| `Shift` | Hurry |
| `Space` (hold) | Drift; release for a boost |
| Left click | Pick a product / put it in the aimed bag / open a bag |
| Right click | Put the item back |
| `1` `2` `3` | Drop the held item into bag 1/2/3 |
| `Tab` | Expand / shrink the Order Dash app |
| `F` | Close the order (call the courier) |
| `E` | Hand the bags to the courier |
| `Esc` / `P` | Pause |
| `M` | Mute |

## Settings

Settings are on the main menu and in the pause menu:

- **Language:** English (always used on first launch), Türkçe, Español, Deutsch.
- **Mouse:** sensitivity, invert Y, field of view.
- **Audio:** music volume, "store speaker" muffle amount, SFX volume, PA announcements on/off.
- **Graphics:** quality (high / medium / low), pixel size (1 = crisp toon, 2–4 = "3D pixel" look), time of day.

## Architecture

```
src/
  main.ts            entry: WebGL2 check
  game.ts            orchestrator: menus, days, loop, interaction, debug hooks
  i18n.ts            EN/TR/ES/DE dictionaries, product + section names
  settings.ts        persisted settings + career save
  audio.ts           WebAudio SFX, store-speaker music chain, PA announcements
  input.ts           keyboard / mouse / pointer lock
  data/              products, order types, store layout + nav graph
  logic/             pure game logic (career + order generation, bag rules, player physics, collision, flow)
  render/
    toon.ts          MeshToonMaterial conversion (4-step ramp)
    post.ts          ToonScenePass (depth-based ink outlines, pixel mode) → bloom → grade → SMAA
    store.ts         store interior, signs, festive decor, product instancing
    cartModel.ts     shopping cart with numbered bags
    people.ts        animated shoppers + cashier
    courier.ts       scooter courier
    hands.ts         first-person cartoon hands
    mood.ts          day / sunset / night lighting presets
  ui/hud.ts          menus, shop, reviews, HUD, Order Dash phone app
tests/               vitest unit tests
scripts/playtest.mjs Playwright end-to-end playtest
```

## Credits

- Characters, furniture and food models: [KayKit](https://kaylousberg.itch.io/) by Kay Lousberg (CC0).
- HDR skies: [Poly Haven](https://polyhaven.com/) (CC0).
- Fonts: Baloo 2 and Nunito (SIL Open Font License, see `public/fonts/`).
- Store music and the Order Dash logo were supplied by the project owner.
- Sound effects are synthesized at runtime with WebAudio.
- PA announcements: generated with Piper TTS using CC0 / public-domain voices (en-us-kathleen-low, de-thorsten-low, es-carlfm-x-low). Turkish falls back to the browser's speech synthesis.
