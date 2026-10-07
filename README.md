# Order Dash

A first-person grocery-picking career game built with Three.js, Vite and TypeScript, in a cel-shaded, ink-outlined style.

You're the newest picker at the Corner Market. Orders arrive on the **Order Dash** app clipped to your cart. Accept one and the clock starts. Push a real shopping cart through a busy store, grab products off the shelves, pack them into the open bags (keep chemicals away from food and eggs away from heavy bottles), then close the order and hand the bags to the courier at the door.

## Career

The game is an endless series of **work days**:

- **Orders:** each day brings 3–6 generated orders. Every day is seeded, so retrying it brings the same orders.
- **Daily goal:** deliver all but one of the day's orders. Hit it and the next, busier day unlocks. Miss it and you replay the day, but you keep your earnings.
- **Review and pay:** after every order the customer leaves a 1–5 ★ review. You earn the order pay, plus a speed bonus and a tip that depend on how fast and clean you were. A timed-out order is cancelled, earns a 1 ★ review and pays nothing.
- **Difficulty:**
  - Orders grow from 3 to 10 items.
  - Day 2 introduces the chemicals rule, and day 3 the eggs/heavy rule.
  - From day 3, one order per day is ⚡ **Express**: less time, 1.5× pay, double tip.
  - The time of day moves from day to sunset to night as the day goes on.
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

**Store PA:** opens the day, announces closing time on the last order, and plays regular in-store announcements.

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
- Sound effects are synthesized at runtime with WebAudio. Announcements use the browser's speech synthesis.
