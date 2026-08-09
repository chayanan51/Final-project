# Building modules

Each building is a separate file so teammates can edit one place at a time.

## How it works

1. `registry.js` creates `window.PawsBuildings`
2. `shared.js` holds Animal Crossing drawing helpers (`acShadow`, `acDoor`, …)
3. Every `*.js` building file calls `PawsBuildings.register({ ... })`
4. `game_demo.html` loads these scripts, then uses the registry for map icons + interiors

## Edit a building

Open the matching file, e.g. `cafe/cafe.js` (or `arcade/arcade.js`), and change:

- `info` — room colors, label, activity blurb
- `drawIcon(ctx, api, cx, cy)` — how it looks on the town map
- `drawInterior(ctx, api, t, cx, cy)` — inside the building (optional)

Café extras (shop food sprites + cook-order icons) live under [`cafe/`](cafe/).
Arcade extras (BGM + minigame SFX) live under [`arcade/`](arcade/).
Stadium extras (Free Racer GP + lounge) live under [`stadium/`](stadium/).

`api` gives you shared helpers from the game (`roundRect`, `drawBuildingPatron`, `HOUSE`, …).

## Add a new building

1. Copy `cafe/cafe.js` → `mybuilding.js` (or a `mybuilding/` folder)
2. Change `id`, `info`, and draw functions
3. Add `<script src="js/buildings/mybuilding.js"></script>` in `game_demo.html`
4. Add a zone entry in `ZONE_DEFAULTS` inside `game_demo.html`
