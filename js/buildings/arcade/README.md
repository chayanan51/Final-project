# Pixel Arcade module

All arcade-specific code and audio live here.

```
js/buildings/arcade/
  arcade.js   # Map icon, interior, Jackpot / Pixel Quest / Paws Sprint, audio manager
  audio/      # Location BGM + minigame SFX
  README.md
```

`game_demo.html` loads `arcade/arcade.js`. The module registers with `PawsBuildings`, owns collision solids, and exposes `window.PawsArcade` / `window.PawsArcadeAudio`.

## Audio

| File | Use |
|------|-----|
| `bgm_arcade_synthwave.mp3` | Looped room BGM (volume 0.4) |
| `sfx_reel_spin.wav` | Jackpot reel loop |
| `sfx_jackpot_fanfare.wav` + `sfx_coin_shower.wav` | $100 jackpot |
| `sfx_ding_success.wav` | $10 small win |
| `sfx_buzz_fail.wav` | Loss |
| `sfx_jump.wav` / `sfx_coin.wav` / `sfx_stomp.wav` / `sfx_stage_clear.wav` | Pixel Quest |
| `sfx_race_start.wav` / `sfx_footstep_fast.wav` / `sfx_victory_cheer.wav` | Paws Sprint |

Synth fallbacks play if a file fails to load. Click **Enable Arcade Sound** (or HUD **Enable Sound**) once so the browser allows playback.
