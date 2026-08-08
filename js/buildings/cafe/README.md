# Willow Café module

All café-specific code and food sprites live here.

```
js/buildings/cafe/
  cafe.js     # Map icon, interior shelves/coolers, leash-slip chase
  cook.js     # Full cook-order minigame + station icons
  food/       # Ghostpixxells 32×32 pixel food PNGs
  README.md
```

`game_demo.html` loads `cafe.js` + `cook.js`, then calls `PawsCafeCook.openJob(api)` for Cook orders.
