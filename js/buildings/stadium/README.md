# Grand Prix Stadium module

All stadium-specific code, race assets, and optional audio live here.

```
js/buildings/stadium/
  stadium.js   # Map icon, pit lounge interior, Free Racer GP minigame, audio
  runtime/     # Track + car sprites used by the race (required)
  audio/       # Optional hub/race WAV/MP3 (synth fallback if missing)
  README.md
```

`game_demo.html` loads `stadium/stadium.js`. The module registers with `PawsBuildings`, owns collision solids, and exposes `window.PawsStadium` / `window.PawsStadiumAudio`.

## Runtime race assets

| File | Use |
|------|-----|
| `track_play.png` | Visible track art |
| `track_mask.png` | Asphalt mask |
| `track_meta.json` | Centerline path + world size |
| `Hero_Car.png` / `NPC_Car_*.png` | Kart sprites |

Sourced from Free Racer Asset Pack (runtime-sized only).

## Controls (race)

- **W/S** — speed  
- **A/D** — lane  
- **Hold Shift → release** — mini-turbo  
- **Space** — DRS on the main straight  
- **E ×2** — pit stop on lap 2  
