# Willow Café module

All café-specific code and food sprites live here.

```
js/buildings/cafe/
  cafe.js     # Map icon, interior shelves/coolers, leash-slip chase
  cook.js     # Cook-order station icons (used by game_demo.html)
  food/       # Ghostpixxells 32×32 pixel food PNGs
```

`game_demo.html` loads `cafe.js` + `cook.js`. Cook-order UI still runs in the main game file, but icons/sprites come from this folder via `window.PawsCafeCook`.
