# Willow Café module

All café-specific code and food sprites live here.

```
js/buildings/cafe/
  cafe.js     # Map icon, interior, shelves/coolers, chase, collision solids
  cook.js     # Full cook-order minigame + station icons
  food/       # Ghostpixxells 32×32 pixel food PNGs
  README.md
```

`game_demo.html` loads `cafe.js` + `cook.js`, uses `getSolids("cafe")` for café furniture collision, and calls `PawsCafeCook.openJob(api)` for Cook orders.
