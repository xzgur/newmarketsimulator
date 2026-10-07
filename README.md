# Order Dash

A first-person grocery-picking game built with Three.js, Vite and TypeScript, in a cel-shaded, ink-outlined style.

You're the newest picker at the Corner Market. Orders arrive on the **Order Dash** app clipped to your cart. Accept one and the clock starts. Push a real shopping cart through a busy store, grab products off the shelves, pack them into the open bags (keep chemicals away from food and eggs away from heavy bottles), then close the order and hand the bags to the courier at the door.

## Campaign

| # | Shift | Bags | Rules | Time |
|---|---|---|---|---|
| 1 | First Shift | 1 × 5 | — | 3:00 |
| 2 | Breakfast Club | 2 × 4 | — | 3:30 |
| 3 | Spring Cleaning | 2 × 4 | chemicals ≠ food | 4:00 |
| 4 | Picnic Day (sunset) | 2 × 5 | + fragile ≠ heavy | 4:00 |
| 5 | Rush Hour (sunset, crowded) | 3 × 4 | both | 5:00 |
| 6 | Night Shift | 3 × 5 | both | 5:00 |

- Each shift awards 1–3 stars based on time left and mistakes.
- Clearing a shift unlocks the next one.
- Progress and settings are saved in `localStorage`.
- The unit tests prove that every shift can be packed under its own rules.

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

- **Language:** English, Türkçe, Español, Deutsch.
- **Mouse:** sensitivity, invert Y, field of view.
- **Audio:** music volume, "store speaker" muffle amount, SFX volume, PA announcements on/off.
- **Graphics:** quality (high / medium / low), pixel size (1 = crisp toon, 2–4 = "3D pixel" look), time of day.

## Architecture

```
src/
  main.ts            entry: WebGL2 check
  game.ts            orchestrator: menus, levels, loop, interaction, debug hooks
  i18n.ts            EN/TR/ES/DE dictionaries, product + section names
  settings.ts        persisted settings + campaign progress
  audio.ts           WebAudio SFX, store-speaker music chain, PA announcements
  input.ts           keyboard / mouse / pointer lock
  data/              products, level definitions, store layout + nav graph
  logic/             pure game logic (order/bag rules, player physics, collision, flow)
  render/
    toon.ts          MeshToonMaterial conversion (4-step ramp)
    post.ts          ToonScenePass (depth-based ink outlines, pixel mode) → bloom → grade → SMAA
    store.ts         store interior, signs, festive decor, product instancing
    cartModel.ts     shopping cart with numbered bags
    people.ts        animated shoppers + cashier
    courier.ts       scooter courier
    hands.ts         first-person cartoon hands
    mood.ts          day / sunset / night lighting presets
  ui/hud.ts          menus, HUD, Order Dash phone app
tests/               vitest unit tests
scripts/playtest.mjs Playwright end-to-end playtest
```

## Credits

- Characters, furniture and food models: [KayKit](https://kaylousberg.itch.io/) by Kay Lousberg (CC0).
- HDR skies: [Poly Haven](https://polyhaven.com/) (CC0).
- Fonts: Baloo 2 and Nunito (SIL Open Font License, see `public/fonts/`).
- Store music and the Order Dash logo were supplied by the project owner.
- Sound effects are synthesized at runtime with WebAudio. Announcements use the browser's speech synthesis.
