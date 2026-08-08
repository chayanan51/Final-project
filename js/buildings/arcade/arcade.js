/**
 * arcade building module
 * Jackpot (left) · Pixel Quest (floor cabinets) · Paws Sprint 200m (right).
 * Edit icon / colors / interior / minigames here without touching other buildings.
 *
 * Hooks into the host via capture-phase E / prompt clicks (same pattern as café),
 * modal DOM (#modal-backdrop / #modal-body), and shared api.state + localStorage save.
 */
(function (global) {
  const B = window.PawsBuildings;
  const SAVE_KEY = "pawPrintsDemoSave_v3";

  /* ---------- Shared runtime ---------- */
  const keys = { up: false, down: false, left: false, right: false, run: false };
  const KEY_MAP = {
    ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right",
    w: "up", s: "down", a: "left", d: "right",
    W: "up", S: "down", A: "left", D: "right",
  };

  let arcadeActive = false;
  let lastApi = null;
  let lastDrawT = 0;
  let lastLogicT = 0;
  let mirror = { x: 0, y: 0, r: 14, speed: 170 };
  let activeZone = null; // "jackpot" | "pixelquest" | "pawssprint" | "cashier" | null
  let modalOpen = false;
  let platformerActive = false;
  let raceActive = false;
  let jackpotSpinning = false;
  let pqCleanup = null;
  let raceTapFn = null;
  let bannerHidden = false;

  const JACKPOT_COST = 20;
  const JACKPOT_PAYOUT = 100;
  const SMALL_WIN = 10;
  const PQ_ENERGY = 10;
  const RACE_ENERGY = 10;
  const RACE_DIST = 200;
  const COIN_VALUE = 2;
  const STOMP_VALUE = 5;
  const FLAG_BONUS = 25;

  const SLOT_SYMBOLS = ["🍒", "7️⃣", "💎", "🐾"];
  const ARC_CSS = `
.pq-wrap{ display:flex; flex-direction:column; gap:0.55rem; }
.pq-canvas-wrap{ border-radius:12px; overflow:hidden; border:2px solid rgba(58,44,34,0.18); background:#BFE3EE; }
#pq-canvas{ display:block; width:100%; height:auto; image-rendering:pixelated; }
.slot-machine{ display:flex; flex-direction:column; gap:0.7rem; align-items:center; }
.slot-reels{ display:flex; gap:0.55rem; padding:0.85rem 1rem; border-radius:16px;
  background:linear-gradient(180deg,#2A1840,#4A2C6E); border:3px solid #E8A33D;
  box-shadow:inset 0 0 24px rgba(0,0,0,0.35); }
.slot-reel{ width:72px; height:84px; border-radius:12px; background:#FBF0DE;
  display:flex; align-items:center; justify-content:center; font-size:2.4rem;
  border:2px solid rgba(58,44,34,0.2); overflow:hidden; position:relative; }
.slot-reel.spinning{ animation: slotBlur 0.12s linear infinite; }
@keyframes slotBlur{ 0%{ filter:blur(0); transform:translateY(0); }
  50%{ filter:blur(1.5px); transform:translateY(3px); }
  100%{ filter:blur(0); transform:translateY(0); } }
.slot-paytable{ width:100%; font-size:0.78rem; color:var(--ink-soft,#6E5C49);
  background:rgba(255,255,255,0.45); border:1px solid var(--line,rgba(58,44,34,0.12));
  border-radius:12px; padding:0.65rem 0.8rem; line-height:1.55; }
.slot-paytable b{ color:var(--ink,#3A2C22); }
.slot-result{ min-height:1.4em; font-weight:700; text-align:center; }
.slot-result.win{ color:#3E7C74; }
.slot-result.lose{ color:#8C5A3B; }
.slot-result.jackpot{ color:#D98F2B; font-size:1.05rem; }
.ps-wrap{ display:flex; flex-direction:column; gap:0.55rem; }
.ps-canvas-wrap{ border-radius:12px; overflow:hidden; border:2px solid rgba(58,44,34,0.18); background:#CFE1D2; }
#ps-canvas{ display:block; width:100%; height:auto; image-rendering:pixelated; }
.ps-hud{ display:flex; flex-wrap:wrap; gap:0.6rem 1rem; align-items:center; justify-content:space-between; }
.ps-gauge{ flex:1; min-width:140px; height:14px; border-radius:8px; background:rgba(58,44,34,0.12); overflow:hidden; border:1px solid rgba(58,44,34,0.18); }
.ps-gauge > i{ display:block; height:100%; width:0%; background:linear-gradient(90deg,#D98F2B,#E8A33D); border-radius:8px; transition:width 0.05s linear; }
.ps-tap{ min-width:120px; font-size:1.05rem; letter-spacing:0.04em; animation: psPulse 0.7s ease-in-out infinite; }
@keyframes psPulse{ 0%,100%{ transform:scale(1); } 50%{ transform:scale(1.06); } }
.ps-tap:active{ transform:scale(0.94); animation:none; }
`.trim();

  function ensureStyles() {
    if (document.getElementById("paws-arcade-css")) return;
    const style = document.createElement("style");
    style.id = "paws-arcade-css";
    style.textContent = ARC_CSS;
    document.head.appendChild(style);
  }

  function toast(msg) {
    const host = document.getElementById("toasts");
    if (!host) return;
    const el = document.createElement("div");
    el.className = "toast";
    el.textContent = msg;
    host.appendChild(el);
    requestAnimationFrame(() => el.classList.add("show"));
    setTimeout(() => {
      el.classList.remove("show");
      setTimeout(() => el.remove(), 300);
    }, 2400);
  }

  function playerHasDog(state) {
    return !!(state && ((state.dogs && state.dogs.length) || state.adopted));
  }

  function activeDog(state) {
    if (!state || !state.dogs || !state.dogs.length) return null;
    return state.dogs.find((d) => d.id === state.activeDogId) || state.dogs[0];
  }

  function refreshHud(state) {
    if (!state) return;
    const energyNum = document.getElementById("hud-energy-num");
    const energyBar = document.getElementById("hud-energy-bar");
    const money = document.getElementById("hud-money");
    if (energyNum) energyNum.textContent = Math.round(state.energy);
    if (energyBar && state.maxEnergy) {
      energyBar.style.width = (state.energy / state.maxEnergy * 100) + "%";
    }
    if (money) money.textContent = "$" + state.money;
    const dog = activeDog(state);
    const happyBar = document.getElementById("hud-happy-bar");
    const bondBar = document.getElementById("hud-bond-bar");
    if (dog) {
      if (happyBar) happyBar.style.width = Math.min(100, dog.happiness || 0) + "%";
      if (bondBar) bondBar.style.width = Math.min(100, dog.bond || 0) + "%";
      state.happiness = dog.happiness;
      state.bond = dog.bond;
    }
  }

  function persist(state) {
    if (!state) return;
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(state));
    } catch (e) { /* ignore quota */ }
    refreshHud(state);
  }

  /* ---------- Arcade Audio Manager ----------
   * Location BGM + minigame SFX. File-first from js/buildings/arcade/audio/,
   * HTMLAudio synth fallbacks if a file is missing. Never throws into gameplay.
   */
  const AUDIO_DIR = "js/buildings/arcade/audio/";
  const AUDIO_FILES = {
    bgm: "bgm_arcade_synthwave.mp3",
    reelSpin: "sfx_reel_spin.wav",
    jackpotFanfare: "sfx_jackpot_fanfare.wav",
    coinShower: "sfx_coin_shower.wav",
    dingSuccess: "sfx_ding_success.wav",
    buzzFail: "sfx_buzz_fail.wav",
    jump: "sfx_jump.wav",
    coin: "sfx_coin.wav",
    stomp: "sfx_stomp.wav",
    stageClear: "sfx_stage_clear.wav",
    raceStart: "sfx_race_start.wav",
    footstepFast: "sfx_footstep_fast.wav",
    victoryCheer: "sfx_victory_cheer.wav",
  };
  const BGM_VOLUME = 0.4;

  const ArcadeAudio = (function () {
    const cache = Object.create(null);
    const missing = Object.create(null);
    const toneCache = Object.create(null);
    let bgmEl = null;
    let spinEl = null;
    let bgmSynthTimer = null;
    let bgmFadeTimer = null;
    let spinSynthTimer = null;
    let townPaused = false;
    let wantsBgm = false;
    let soundArmed = false;
    let preloadStarted = false;

    function safe(fn) {
      try { return fn(); } catch (e) { return undefined; }
    }

    function isCtxRunning() { return soundArmed; }

    function isBgmPlaying() {
      return !!(bgmEl && !bgmEl.paused) || !!bgmSynthTimer;
    }

    /* ---- Synth fallback (generated WAV blobs) ---- */
    function writeStr(view, offset, str) {
      for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
    }

    function pcmToWavUrl(samples, sampleRate) {
      const n = samples.length;
      const buf = new ArrayBuffer(44 + n * 2);
      const view = new DataView(buf);
      writeStr(view, 0, "RIFF");
      view.setUint32(4, 36 + n * 2, true);
      writeStr(view, 8, "WAVE");
      writeStr(view, 12, "fmt ");
      view.setUint32(16, 16, true);
      view.setUint16(20, 1, true);
      view.setUint16(22, 1, true);
      view.setUint32(24, sampleRate, true);
      view.setUint32(28, sampleRate * 2, true);
      view.setUint16(32, 2, true);
      view.setUint16(34, 16, true);
      writeStr(view, 36, "data");
      view.setUint32(40, n * 2, true);
      let o = 44;
      for (let i = 0; i < n; i++, o += 2) {
        const s = Math.max(-1, Math.min(1, samples[i]));
        view.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      }
      return URL.createObjectURL(new Blob([buf], { type: "audio/wav" }));
    }

    function sampleWave(type, phase) {
      const p = phase % 1;
      if (type === "square") return p < 0.5 ? 1 : -1;
      if (type === "sawtooth") return 2 * p - 1;
      if (type === "triangle") return 1 - 4 * Math.abs(p - 0.5);
      return Math.sin(phase * Math.PI * 2);
    }

    function toneUrl(freq, dur, type, vol) {
      const key = [freq, dur, type || "square", vol || 0.2].join("|");
      if (toneCache[key]) return toneCache[key];
      const sr = 22050;
      const n = Math.max(1, Math.floor(sr * dur));
      const samples = new Float32Array(n);
      const attack = Math.min(n * 0.15, sr * 0.012);
      const release = Math.min(n * 0.4, sr * 0.05);
      for (let i = 0; i < n; i++) {
        let env = 1;
        if (i < attack) env = i / attack;
        else if (i > n - release) env = Math.max(0, (n - i) / release);
        samples[i] = sampleWave(type || "square", (freq * i) / sr) * (vol != null ? vol : 0.22) * env;
      }
      toneCache[key] = pcmToWavUrl(samples, sr);
      return toneCache[key];
    }

    function noiseUrl(dur, vol) {
      const key = "n|" + dur + "|" + (vol || 0.12);
      if (toneCache[key]) return toneCache[key];
      const sr = 22050;
      const n = Math.max(1, Math.floor(sr * dur));
      const samples = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        samples[i] = (Math.random() * 2 - 1) * (1 - i / n) * (vol != null ? vol : 0.12);
      }
      toneCache[key] = pcmToWavUrl(samples, sr);
      return toneCache[key];
    }

    function playUrl(url, delay) {
      const run = () => {
        safe(() => {
          const a = new Audio(url);
          a.volume = 1;
          const p = a.play();
          if (p && typeof p.catch === "function") {
            p.catch(() => { soundArmed = false; syncSoundPrompt(); });
          }
        });
      };
      if (delay && delay > 0) setTimeout(run, delay * 1000);
      else run();
    }

    function beep(freq, dur, type, vol, delay) {
      if (!soundArmed) return;
      playUrl(toneUrl(freq, dur, type, vol), delay);
    }

    function noise(dur, vol) {
      if (!soundArmed) return;
      playUrl(noiseUrl(dur, vol), 0);
    }

    function showSoundPrompt(show) {
      let btn = document.getElementById("arcade-enable-sound");
      if (!show) {
        if (btn) btn.style.display = "none";
        return;
      }
      if (!btn) {
        btn = document.createElement("button");
        btn.id = "arcade-enable-sound";
        btn.type = "button";
        btn.textContent = "Enable Arcade Sound";
        btn.style.cssText = [
          "position:fixed", "left:50%", "top:72px", "transform:translateX(-50%)",
          "z-index:2147483646", "padding:0.55rem 1.1rem", "border:2px solid #1A1524",
          "border-radius:999px", "background:#E8A33D", "color:#1A1524",
          "font:800 0.9rem ui-rounded, system-ui, sans-serif", "cursor:pointer",
          "box-shadow:0 6px 22px rgba(0,0,0,0.35)", "letter-spacing:0.02em",
        ].join(";");
        btn.addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation();
          unlock(true);
        });
        document.body.appendChild(btn);
      }
      btn.style.display = "block";
    }

    function syncSoundPrompt() {
      showSoundPrompt(!!wantsBgm && !soundArmed);
    }

    function unlock(fromButton) {
      safe(() => {
        if (typeof window.PawsEnsureAudio === "function") window.PawsEnsureAudio();
      });
      soundArmed = true;
      showSoundPrompt(false);
      preloadAll();
      playUrl(toneUrl(660, 0.1, "square", 0.28), 0);
      playUrl(toneUrl(880, 0.12, "square", 0.26), 0.08);
      if (wantsBgm && !isBgmPlaying()) startBgmNow();
      if (fromButton && wantsBgm) toast("Arcade sound on");
    }

    function loadFile(key, cb) {
      const file = AUDIO_FILES[key];
      if (!file || missing[file]) { if (cb) cb(null); return; }
      if (cache[file]) { if (cb) cb(cache[file]); return; }
      safe(() => {
        const a = new Audio(AUDIO_DIR + file);
        a.preload = "auto";
        let done = false;
        const fail = () => {
          if (done) return;
          done = true;
          missing[file] = true;
          if (cb) cb(null);
        };
        const ok = () => {
          if (done) return;
          done = true;
          cache[file] = a;
          if (cb) cb(a);
        };
        a.addEventListener("error", fail, { once: true });
        a.addEventListener("canplaythrough", ok, { once: true });
        a.addEventListener("loadeddata", ok, { once: true });
        setTimeout(() => {
          if (!done) {
            if (a.readyState >= 2) ok();
            else fail();
          }
        }, 2500);
        a.load();
      });
    }

    function preloadAll() {
      if (preloadStarted) return;
      preloadStarted = true;
      Object.keys(AUDIO_FILES).forEach((key) => loadFile(key));
    }

    function playFile(key, opts) {
      opts = opts || {};
      const file = AUDIO_FILES[key];
      if (!file || missing[file]) return false;
      const template = cache[file];
      if (!template) {
        loadFile(key);
        return false;
      }
      return !!safe(() => {
        if (opts.loop) {
          const el = template;
          el.loop = true;
          el.volume = opts.volume != null ? opts.volume : 0.55;
          try { el.currentTime = 0; } catch (e) { /* ignore */ }
          const p = el.play();
          if (p && typeof p.catch === "function") {
            p.catch(() => { missing[file] = true; });
          }
          if (opts.onLoopEl) opts.onLoopEl(el);
          return true;
        }
        const el = template.cloneNode();
        el.loop = false;
        el.volume = opts.volume != null ? opts.volume : 0.65;
        const p = el.play();
        if (p && typeof p.catch === "function") {
          p.catch(() => { /* non-fatal */ });
        }
        return true;
      });
    }

    const synth = {
      reelSpinClick() { beep(220 + Math.random() * 50, 0.05, "square", 0.16); noise(0.03, 0.08); },
      jackpotFanfare() { [523, 659, 784, 1047, 1319].forEach((f, i) => beep(f, 0.16, "square", 0.26, i * 0.09)); },
      coinShower() { for (let i = 0; i < 8; i++) beep(880 + i * 40, 0.07, "triangle", 0.22, 0.05 + i * 0.05); },
      dingSuccess() { beep(880, 0.09, "triangle", 0.26); beep(1175, 0.14, "triangle", 0.24, 0.07); },
      buzzFail() { beep(140, 0.2, "sawtooth", 0.24); beep(100, 0.16, "sawtooth", 0.2, 0.08); },
      jump() { beep(320, 0.1, "square", 0.24); beep(560, 0.12, "square", 0.22, 0.04); },
      coin() { beep(988, 0.07, "square", 0.24); beep(1319, 0.1, "square", 0.22, 0.04); },
      stomp() { beep(180, 0.08, "square", 0.26); noise(0.06, 0.12); },
      stageClear() { [523, 659, 784, 1047].forEach((f, i) => beep(f, 0.16, "square", 0.26, i * 0.1)); },
      raceStart() { beep(440, 0.12, "square", 0.26); beep(440, 0.12, "square", 0.26, 0.35); beep(700, 0.22, "square", 0.28, 0.7); },
      footstepFast() { noise(0.04, 0.12); beep(240 + Math.random() * 40, 0.04, "square", 0.14); },
      victoryCheer() { [523, 659, 784, 988, 1175].forEach((f, i) => beep(f, 0.14, "triangle", 0.26, i * 0.08)); },
      power() { [440, 554, 659, 880].forEach((f, i) => beep(f, 0.09, "triangle", 0.22, i * 0.06)); },
      block() { beep(300, 0.06, "square", 0.18); beep(500, 0.07, "triangle", 0.16, 0.04); },
      bark() { beep(190, 0.08, "sawtooth", 0.24); beep(150, 0.1, "sawtooth", 0.2, 0.07); },
      place() { [392, 523, 659].forEach((f, i) => beep(f, 0.11, "triangle", 0.22, i * 0.07)); },
    };

    function playSfx(key, fallbackName, volume) {
      if (!soundArmed) {
        syncSoundPrompt();
        return;
      }
      if (playFile(key, { loop: false, volume: volume != null ? volume : 0.65 })) return;
      const fb = synth[fallbackName || key];
      if (typeof fb === "function") safe(fb);
    }

    function stopSynthBgm() {
      if (bgmSynthTimer) { clearInterval(bgmSynthTimer); bgmSynthTimer = null; }
    }

    function startSynthBgm() {
      if (!soundArmed) { syncSoundPrompt(); return; }
      stopSynthBgm();
      const pattern = [196, 247, 294, 370, 294, 247, 220, 165];
      let step = 0;
      const tick = () => {
        if (!wantsBgm || !soundArmed) return;
        const f = pattern[step % pattern.length];
        beep(f, 0.28, "sawtooth", 0.14);
        beep(f * 2, 0.18, "square", 0.09, 0.02);
        if (step % 4 === 0) beep(98, 0.35, "triangle", 0.14);
        step++;
      };
      tick();
      bgmSynthTimer = setInterval(tick, 220);
    }

    function startBgmNow() {
      if (!soundArmed) { syncSoundPrompt(); return; }
      pauseTownBgm();
      stopSynthBgm();
      if (bgmFadeTimer) { clearInterval(bgmFadeTimer); bgmFadeTimer = null; }

      const startEl = (el) => {
        if (!el || !wantsBgm) return;
        bgmEl = el;
        bgmEl.loop = true;
        bgmEl.volume = BGM_VOLUME;
        safe(() => {
          try { bgmEl.currentTime = 0; } catch (e) { /* ignore */ }
          const p = bgmEl.play();
          if (p && typeof p.catch === "function") p.catch(() => startSynthBgm());
        });
      };

      const cached = cache[AUDIO_FILES.bgm];
      if (cached && !missing[AUDIO_FILES.bgm]) {
        startEl(cached);
        return;
      }
      startSynthBgm();
      loadFile("bgm", (loaded) => {
        if (!loaded || !wantsBgm || !soundArmed) return;
        stopSynthBgm();
        startEl(loaded);
      });
    }

    function pauseTownBgm() {
      safe(() => {
        if (window.PawsAudio && typeof window.PawsAudio.pauseTownBgm === "function") {
          window.PawsAudio.pauseTownBgm();
        }
        townPaused = true;
      });
    }

    function resumeTownBgm() {
      safe(() => {
        if (!townPaused) return;
        townPaused = false;
        if (window.PawsAudio && typeof window.PawsAudio.resumeTownBgm === "function") {
          window.PawsAudio.resumeTownBgm();
        }
      });
    }

    function playBgm() {
      wantsBgm = true;
      pauseTownBgm();
      preloadAll();
      if (soundArmed) startBgmNow();
      else syncSoundPrompt();
    }

    function stopBgm(immediate) {
      wantsBgm = false;
      stopSynthBgm();
      stopReelSpin();
      showSoundPrompt(false);
      if (bgmFadeTimer) { clearInterval(bgmFadeTimer); bgmFadeTimer = null; }
      if (!bgmEl) {
        if (!immediate) resumeTownBgm();
        return;
      }
      const el = bgmEl;
      bgmEl = null;
      if (immediate) {
        safe(() => { el.pause(); el.currentTime = 0; el.volume = BGM_VOLUME; el.loop = false; });
        resumeTownBgm();
        return;
      }
      let v = el.volume;
      bgmFadeTimer = setInterval(() => {
        v = Math.max(0, v - 0.05);
        safe(() => { el.volume = v; });
        if (v <= 0.01) {
          clearInterval(bgmFadeTimer);
          bgmFadeTimer = null;
          safe(() => { el.pause(); el.currentTime = 0; el.volume = BGM_VOLUME; el.loop = false; });
          resumeTownBgm();
        }
      }, 40);
    }

    function startReelSpin() {
      stopReelSpin();
      if (!soundArmed) { syncSoundPrompt(); return; }
      const started = playFile("reelSpin", {
        loop: true,
        volume: 0.55,
        onLoopEl(el) { spinEl = el; },
      });
      if (!started) {
        spinSynthTimer = setInterval(() => synth.reelSpinClick(), 70);
        loadFile("reelSpin", (el) => {
          if (!el || !soundArmed || !spinSynthTimer) return;
          clearInterval(spinSynthTimer);
          spinSynthTimer = null;
          playFile("reelSpin", {
            loop: true,
            volume: 0.55,
            onLoopEl(loopEl) { spinEl = loopEl; },
          });
        });
      }
    }

    function stopReelSpin() {
      if (spinSynthTimer) { clearInterval(spinSynthTimer); spinSynthTimer = null; }
      if (spinEl) {
        safe(() => { spinEl.pause(); spinEl.currentTime = 0; spinEl.loop = false; });
        spinEl = null;
      }
      const file = AUDIO_FILES.reelSpin;
      const tpl = file && cache[file];
      if (tpl) safe(() => { tpl.pause(); tpl.loop = false; });
    }

    return {
      unlock,
      playBgm,
      stopBgm,
      isBgmPlaying,
      isCtxRunning,
      syncSoundPrompt,
      startReelSpin,
      stopReelSpin,
      jackpotWin() {
        stopReelSpin();
        if (!soundArmed) { syncSoundPrompt(); return; }
        if (!playFile("jackpotFanfare", { volume: 0.7 })) synth.jackpotFanfare();
        setTimeout(() => {
          if (!playFile("coinShower", { volume: 0.6 })) synth.coinShower();
        }, 280);
      },
      smallWin() { stopReelSpin(); playSfx("dingSuccess", "dingSuccess", 0.7); },
      lose() { stopReelSpin(); playSfx("buzzFail", "buzzFail", 0.65); },
      jump() { playSfx("jump", "jump", 0.65); },
      coin() { playSfx("coin", "coin", 0.7); },
      stomp() { playSfx("stomp", "stomp", 0.7); },
      stageClear() { playSfx("stageClear", "stageClear", 0.75); },
      raceStart() { playSfx("raceStart", "raceStart", 0.7); },
      tap() { playSfx("footstepFast", "footstepFast", 0.55); },
      victoryCheer() { playSfx("victoryCheer", "victoryCheer", 0.75); },
      power() { if (!soundArmed) { syncSoundPrompt(); return; } synth.power(); },
      block() { if (soundArmed) synth.block(); },
      bark() { if (soundArmed) synth.bark(); },
      place() { if (soundArmed) synth.place(); },
      win() { playSfx("stageClear", "stageClear", 0.75); },
      hit() { if (soundArmed) beep(880, 0.06, "triangle", 0.2); },
      spin() { if (soundArmed) synth.reelSpinClick(); },
    };
  })();

  const SFX = ArcadeAudio;
  global.PawsArcadeAudio = ArcadeAudio;

  /* ---------- Layout (bigger cabinets + counter; solids match visuals) ---------- */
  const PQ_CAB_XS = [68, 178, 542, 652];
  const PQ_CAB = { w: 72, h: 102, y: 258 };
  const WALL_CAB = { w: 78, h: 96, y: 86 };

  function counterRect(HOUSE) {
    return {
      x: HOUSE.x + HOUSE.w / 2 - 125,
      y: HOUSE.y + 98,
      w: 250,
      h: 72,
    };
  }

  function jackpotRect(HOUSE) {
    return { x: HOUSE.x + 42, y: HOUSE.y + WALL_CAB.y, w: WALL_CAB.w, h: WALL_CAB.h };
  }

  function sprintRect(HOUSE) {
    return {
      x: HOUSE.x + HOUSE.w - 42 - WALL_CAB.w,
      y: HOUSE.y + WALL_CAB.y,
      w: WALL_CAB.w,
      h: WALL_CAB.h,
    };
  }

  function pqCabRect(HOUSE, ox) {
    return { x: HOUSE.x + ox, y: HOUSE.y + PQ_CAB.y, w: PQ_CAB.w, h: PQ_CAB.h };
  }

  function arcadeSolids(HOUSE) {
    const solids = PQ_CAB_XS.map((ox) => pqCabRect(HOUSE, ox));
    solids.push(jackpotRect(HOUSE), sprintRect(HOUSE), counterRect(HOUSE));
    return solids;
  }

  function solidAt(HOUSE, px, py, pr) {
    if (px - pr < HOUSE.x + HOUSE.wall) return true;
    if (px + pr > HOUSE.x + HOUSE.w - HOUSE.wall) return true;
    if (py - pr < HOUSE.y + HOUSE.wall + 36) return true;
    if (py + pr > HOUSE.y + HOUSE.h - HOUSE.wall) {
      if (px < HOUSE.door.x + 8 || px > HOUSE.door.x + HOUSE.door.w - 8) return true;
    }
    const solids = arcadeSolids(HOUSE);
    for (let i = 0; i < solids.length; i++) {
      const s = solids[i];
      const pad = 6;
      if (px > s.x + pad && px < s.x + s.w - pad && py > s.y + pad && py < s.y + s.h - pad) return true;
    }
    return false;
  }

  function nearRect(px, py, r, pad) {
    const p = pad != null ? pad : 36;
    return (
      px > r.x - p &&
      px < r.x + r.w + p &&
      py > r.y - p &&
      py < r.y + r.h + p + 10
    );
  }

  function findZone(HOUSE, px, py) {
    if (nearRect(px, py, jackpotRect(HOUSE), 42)) return "jackpot";
    if (nearRect(px, py, sprintRect(HOUSE), 42)) return "pawssprint";
    const c = counterRect(HOUSE);
    // Counter = talk to cashier (not auto-launch a cabinet game)
    if (nearRect(px, py, c, 30)) return "cashier";
    for (let i = 0; i < PQ_CAB_XS.length; i++) {
      if (nearRect(px, py, pqCabRect(HOUSE, PQ_CAB_XS[i]), 30)) return "pixelquest";
    }
    return null;
  }

  function hideHostBanner() {
    const banner = document.getElementById("house-banner");
    const act = document.getElementById("btn-building-act");
    if (banner) {
      banner.dataset.arcadeHide = "1";
      banner.classList.remove("open");
      bannerHidden = true;
    }
    if (act) act.style.display = "none";
  }

  function restoreHostBanner() {
    const banner = document.getElementById("house-banner");
    if (banner && banner.dataset.arcadeHide) {
      delete banner.dataset.arcadeHide;
      bannerHidden = false;
      // Host exitBuilding already closes it; do not force back open
    }
    const act = document.getElementById("btn-building-act");
    if (act) act.style.display = "none";
  }

  function updateMirror(dt, HOUSE) {
    let dx = 0, dy = 0;
    if (keys.up) dy -= 1;
    if (keys.down) dy += 1;
    if (keys.left) dx -= 1;
    if (keys.right) dx += 1;
    if (!dx && !dy) return;
    const len = Math.hypot(dx, dy) || 1;
    const speed = mirror.speed * (keys.run ? 1.45 : 0.95);
    const nx = mirror.x + (dx / len) * speed * dt;
    const ny = mirror.y + (dy / len) * speed * dt;
    if (!solidAt(HOUSE, nx, mirror.y, mirror.r)) mirror.x = nx;
    if (!solidAt(HOUSE, mirror.x, ny, mirror.r)) mirror.y = ny;
  }

  function onArcadeEnter(api) {
    const HOUSE = api.HOUSE;
    mirror.x = HOUSE.door.x + HOUSE.door.w / 2;
    mirror.y = HOUSE.y + HOUSE.h - HOUSE.wall - 40;
    activeZone = null;
    lastLogicT = performance.now();
    hideHostBanner();
    // Request BGM — shows fixed "Enable Arcade Sound" until the player clicks it
    // (browsers block autoplay; walking keys alone are not enough in external Chrome/Safari).
    ArcadeAudio.playBgm();
    ArcadeAudio.syncSoundPrompt();
  }

  function onArcadeExit(hard) {
    arcadeActive = false;
    activeZone = null;
    restoreHostBanner();
    // Soft draw pauses must NOT kill BGM (rAF hiccups / tab throttle).
    // Only stop audio when we've truly left the building for a while.
    if (hard) {
      ArcadeAudio.stopReelSpin();
      ArcadeAudio.stopBgm(false);
    }
  }

  function openCashierTalk() {
    const state = lastApi && lastApi.state;
    if (!state) return;
    openHostModal(`
      <h3>Pixel</h3>
      <p class="modal-sub">Arcade cashier</p>
      <div class="flavor-box">Welcome in! Jackpot’s on the left, Paws Sprint on the right, and Pixel Quest cabinets on the floor. Yell if you need tokens.</div>
      <div class="action-row" style="margin-top:0.9rem; flex-wrap:wrap;">
        <button class="action-btn ghost" id="cs-jp">Jackpot</button>
        <button class="action-btn ghost" id="cs-pq">Pixel Quest</button>
        <button class="action-btn ghost" id="cs-ps">Paws Sprint</button>
        <button class="action-btn" id="cs-bye">Thanks!</button>
      </div>`);
    const bye = document.getElementById("cs-bye");
    const jp = document.getElementById("cs-jp");
    const pq = document.getElementById("cs-pq");
    const ps = document.getElementById("cs-ps");
    if (bye) bye.addEventListener("click", closeHostModal);
    if (jp) jp.addEventListener("click", () => { closeHostModal(); openJackpot(); });
    if (pq) pq.addEventListener("click", () => { closeHostModal(); openPixelQuest(); });
    if (ps) ps.addEventListener("click", () => { closeHostModal(); openPawsSprint(); });
  }

  /* ---------- Modal helpers ---------- */
  function openHostModal(html) {
    ensureStyles();
    const backdrop = document.getElementById("modal-backdrop");
    const body = document.getElementById("modal-body");
    if (!backdrop || !body) return null;
    if (pqCleanup) {
      try { pqCleanup(); } catch (e) { /* ignore */ }
      pqCleanup = null;
    }
    platformerActive = false;
    raceActive = false;
    jackpotSpinning = false;
    raceTapFn = null;
    body.innerHTML = html;
    backdrop.classList.add("open");
    modalOpen = true;
    return body;
  }

  function closeHostModal() {
    if (pqCleanup) {
      try { pqCleanup(); } catch (e) { /* ignore */ }
      pqCleanup = null;
    }
    platformerActive = false;
    raceActive = false;
    jackpotSpinning = false;
    raceTapFn = null;
    modalOpen = false;
    const backdrop = document.getElementById("modal-backdrop");
    const body = document.getElementById("modal-body");
    if (body) body.innerHTML = "";
    if (backdrop) backdrop.classList.remove("open");
  }

  /* ================================================================
   * 1) JACKPOT SLOT MACHINE
   * ================================================================ */
  function rollJackpotOutcome() {
    const r = Math.random();
    // Balanced casino odds: 5% jackpot / 25% small / 70% loss
    if (r < 0.05) {
      return { kind: "jackpot", payout: JACKPOT_PAYOUT, reels: ["🐾", "🐾", "🐾"] };
    }
    if (r < 0.30) {
      const sym = SLOT_SYMBOLS[Math.floor(Math.random() * SLOT_SYMBOLS.length)];
      const other = SLOT_SYMBOLS.filter((s) => s !== sym);
      const filler = other[Math.floor(Math.random() * other.length)];
      // Two matching — place match on a random pair of reels
      const reels = [sym, sym, filler];
      // shuffle
      for (let i = reels.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const t = reels[i]; reels[i] = reels[j]; reels[j] = t;
      }
      return { kind: "small", payout: SMALL_WIN, reels: reels };
    }
    // Loss: all different, or no pair
    let a = SLOT_SYMBOLS[Math.floor(Math.random() * 4)];
    let b = SLOT_SYMBOLS[Math.floor(Math.random() * 4)];
    let c = SLOT_SYMBOLS[Math.floor(Math.random() * 4)];
    // Force no 2-of-a-kind and no triple paws
    const uniq = () => {
      const pool = SLOT_SYMBOLS.slice();
      a = pool.splice(Math.floor(Math.random() * pool.length), 1)[0];
      b = pool.splice(Math.floor(Math.random() * pool.length), 1)[0];
      c = pool.splice(Math.floor(Math.random() * pool.length), 1)[0];
    };
    uniq();
    return { kind: "loss", payout: 0, reels: [a, b, c] };
  }

  function openJackpot() {
    const state = lastApi && lastApi.state;
    if (!state) return;
    if (state.money < JACKPOT_COST) {
      openHostModal(`
        <h3>Jackpot Machine</h3>
        <div class="flavor-box">You need $${JACKPOT_COST} to play. You have $${state.money}.</div>
        <div class="action-row" style="margin-top:0.9rem">
          <button class="action-btn" id="jp-close">Okay</button>
        </div>`);
      const c = document.getElementById("jp-close");
      if (c) c.addEventListener("click", closeHostModal);
      return;
    }

    openHostModal(`
      <h3>Jackpot Machine</h3>
      <p class="modal-sub">$20 a spin · You have <b id="jp-money">$${state.money}</b></p>
      <div class="slot-machine">
        <div class="slot-reels" id="jp-reels">
          <div class="slot-reel" id="jp-r0">❓</div>
          <div class="slot-reel" id="jp-r1">❓</div>
          <div class="slot-reel" id="jp-r2">❓</div>
        </div>
        <div class="slot-result" id="jp-result">Good luck!</div>
        <div class="slot-paytable">
          <div><b>🐾 🐾 🐾</b> Jackpot — $${JACKPOT_PAYOUT} <span style="opacity:0.7">(5%)</span></div>
          <div><b>Any 2 match</b> — $${SMALL_WIN} partial refund <span style="opacity:0.7">(25%)</span></div>
          <div><b>No match</b> — $0 <span style="opacity:0.7">(70%)</span></div>
        </div>
      </div>
      <div class="action-row" style="margin-top:0.85rem">
        <button class="action-btn ghost" id="jp-close">Close</button>
        <button class="action-btn" id="jp-spin">Spin ($20)</button>
      </div>`);

    const spinBtn = document.getElementById("jp-spin");
    const closeBtn = document.getElementById("jp-close");
    if (closeBtn) closeBtn.addEventListener("click", closeHostModal);
    if (spinBtn) spinBtn.addEventListener("click", () => runJackpotSpin(state));
  }

  function runJackpotSpin(state) {
    if (jackpotSpinning) return;
    if (state.money < JACKPOT_COST) {
      toast("Not enough money");
      const result = document.getElementById("jp-result");
      if (result) {
        result.className = "slot-result lose";
        result.textContent = "Need $" + JACKPOT_COST + " to spin.";
      }
      return;
    }

    state.money = Math.max(0, state.money - JACKPOT_COST);
    persist(state);
    const moneyEl = document.getElementById("jp-money");
    if (moneyEl) moneyEl.textContent = "$" + state.money;

    const outcome = rollJackpotOutcome();
    jackpotSpinning = true;
    const spinBtn = document.getElementById("jp-spin");
    if (spinBtn) spinBtn.disabled = true;

    const reelEls = [0, 1, 2].map((i) => document.getElementById("jp-r" + i));
    const spinning = [true, true, true];
    reelEls.forEach((el) => { if (el) el.classList.add("spinning"); });

    ArcadeAudio.startReelSpin();

    const spinTimer = setInterval(() => {
      // Only scramble reels that have not locked yet (fixes fake 2-match visuals)
      reelEls.forEach((el, i) => {
        if (el && spinning[i]) {
          el.textContent = SLOT_SYMBOLS[Math.floor(Math.random() * SLOT_SYMBOLS.length)];
        }
      });
    }, 70);

    // Stop reels left → right
    const stopAt = [700, 1100, 1500];
    stopAt.forEach((ms, i) => {
      setTimeout(() => {
        spinning[i] = false;
        const el = reelEls[i];
        if (el) {
          el.classList.remove("spinning");
          el.textContent = outcome.reels[i];
        }
        if (i === 2) {
          clearInterval(spinTimer);
          // Ensure all reels show the paid outcome before settling
          reelEls.forEach((r, ri) => {
            if (r) r.textContent = outcome.reels[ri];
          });
          finishJackpotSpin(state, outcome);
        }
      }, ms);
    });
  }

  function finishJackpotSpin(state, outcome) {
    jackpotSpinning = false;
    const spinBtn = document.getElementById("jp-spin");
    if (spinBtn) spinBtn.disabled = false;
    const result = document.getElementById("jp-result");

    if (outcome.payout > 0) {
      state.money += outcome.payout;
      persist(state);
      const moneyEl = document.getElementById("jp-money");
      if (moneyEl) moneyEl.textContent = "$" + state.money;
    } else {
      persist(state);
    }

    if (!result) return;
    if (outcome.kind === "jackpot") {
      result.className = "slot-result jackpot";
      result.textContent = "🐾 JACKPOT! +" + outcome.payout + "!";
      ArcadeAudio.jackpotWin();
    } else if (outcome.kind === "small") {
      result.className = "slot-result win";
      result.textContent = "Nice! Two match — +$" + outcome.payout;
      ArcadeAudio.smallWin();
    } else {
      result.className = "slot-result lose";
      result.textContent = "No match — try again!";
      ArcadeAudio.lose();
    }
  }

  /* ================================================================
   * 2) PIXEL QUEST — Mario-style platformer
   * ================================================================ */
  const ARC_W = 700, ARC_H = 380;
  const LEVEL_W = 2400;
  const GROUND_Y = 300;
  // Gaps between spans — classic hop-over pits
  const GROUND_SPANS = [
    [0, 460],
    [540, 980],
    [1080, 1480],
    [1580, 2000],
    [2100, 2400],
  ];
  const STATIC_PLATS = [
    { x: 380, y: 230, w: 90, h: 14 },
    { x: 900, y: 210, w: 100, h: 14 },
    { x: 1320, y: 200, w: 90, h: 14 },
    { x: 1750, y: 220, w: 110, h: 14 },
  ];
  const MOVING_PLATS = [
    { x: 700, y: 240, w: 80, h: 14, minX: 640, maxX: 820, speed: 55, dir: 1 },
    { x: 1520, y: 210, w: 80, h: 14, minX: 1480, maxX: 1680, speed: 65, dir: -1 },
  ];
  const Q_BLOCKS = [
    { x: 300, y: 210, w: 28, h: 28, content: "coin", used: false },
    { x: 620, y: 200, w: 28, h: 28, content: "power", used: false },
    { x: 1180, y: 190, w: 28, h: 28, content: "coin", used: false },
    { x: 1680, y: 200, w: 28, h: 28, content: "power", used: false },
  ];
  const GOAL_X = 2280;

  function openPixelQuest() {
    const state = lastApi && lastApi.state;
    if (!state) return;
    if (state.energy < PQ_ENERGY) {
      openHostModal(`
        <h3>Arcade - Pixel Quest</h3>
        <div class="flavor-box">You're too tired for the arcade right now. Head home and sleep to restore energy.</div>
        <div class="action-row" style="margin-top:0.9rem">
          <button class="action-btn" id="pq-tired-ok">Okay</button>
        </div>`);
      const b = document.getElementById("pq-tired-ok");
      if (b) b.addEventListener("click", closeHostModal);
      return;
    }

    // Entry fee $0 — energy spent when the run begins
    state.energy = Math.max(0, state.energy - PQ_ENERGY);
    persist(state);

    openHostModal(`
      <div class="pq-wrap">
        <h3>Arcade - Pixel Quest</h3>
        <p class="modal-sub">Hop, stomp, hit ? blocks, and reach the flag. Free to play · −${PQ_ENERGY} Energy</p>
        <div class="mg-scoreline">
          <span>Coins: <b id="pq-coins">0</b></span>
          <span>Stomps: <b id="pq-stomps">0</b></span>
          <span>Earned: $<b id="pq-earn">0</b></span>
          <span id="pq-msg"></span>
        </div>
        <div class="pq-canvas-wrap race-wrap">
          <canvas id="pq-canvas" width="${ARC_W}" height="${ARC_H}"></canvas>
        </div>
        <div class="hint" style="margin-top:0.35rem;">Left/Right or A/D · Up/Space: Jump · Stomp critters · Hit ? from below</div>
      </div>`);
    startPlatformer(state);
  }

  function roundRectPath(c, x, y, w, h, r) {
    const rr = Math.min(r, w / 2, h / 2);
    c.beginPath();
    c.moveTo(x + rr, y);
    c.arcTo(x + w, y, x + w, y + h, rr);
    c.arcTo(x + w, y + h, x, y + h, rr);
    c.arcTo(x, y + h, x, y, rr);
    c.arcTo(x, y, x + w, y, rr);
    c.closePath();
  }

  function startPlatformer(state) {
    const canvas = document.getElementById("pq-canvas");
    if (!canvas) return;
    const c3 = canvas.getContext("2d");
    const coinsEl = document.getElementById("pq-coins");
    const stompsEl = document.getElementById("pq-stomps");
    const earnEl = document.getElementById("pq-earn");
    const msgEl = document.getElementById("pq-msg");

    platformerActive = true;

    const baseJump = -560;
    const p3 = {
      x: 48, y: 250, vx: 0, vy: 0, onGround: false,
      w: 22, h: 26, facing: 1,
      invincibleUntil: 0,
      powered: false,
      shield: 0,
      jumpMul: 1,
    };
    let lastSafeX = 48;
    let coinsCollected = 0;
    let stomps = 0;
    let finished = false;
    let ended = false;
    let camX = 0;
    let raf3 = null;
    let last3 = null;

    // ~6 world coins + up to 2 from ? blocks → ~8 coins ($16); 3 stomps ($15); flag $25 → ~$40–$56
    const coins = [];
    const coinXs = [140, 260, 420, 780, 1240, 1900];
    coinXs.forEach((x, i) => {
      const plat = STATIC_PLATS.find((pl) => x > pl.x - 10 && x < pl.x + pl.w + 10);
      const y = plat ? plat.y - 22 : GROUND_Y - 26;
      coins.push({ x, y, got: false, bob: i });
    });

    const enemies = [
      { x: 320, minX: 200, maxX: 430, y: GROUND_Y, dir: 1, alive: true, kind: "slime" },
      { x: 780, minX: 560, maxX: 950, y: GROUND_Y, dir: -1, alive: true, kind: "goomba" },
      { x: 1280, minX: 1100, maxX: 1450, y: GROUND_Y, dir: 1, alive: true, kind: "slime" },
    ];

    const qBlocks = Q_BLOCKS.map((b) => Object.assign({}, b, { used: false, bounce: 0 }));
    const movers = MOVING_PLATS.map((m) => Object.assign({}, m));
    const powerups = []; // {x,y,vy,kind,got}

    function liveMoney() {
      return coinsCollected * COIN_VALUE + stomps * STOMP_VALUE;
    }
    function syncHud(extraMsg) {
      if (coinsEl) coinsEl.textContent = coinsCollected;
      if (stompsEl) stompsEl.textContent = stomps;
      if (earnEl) earnEl.textContent = liveMoney();
      if (msgEl && extraMsg != null) msgEl.textContent = extraMsg;
    }

    function onSolidGroundAt(x) {
      return GROUND_SPANS.some(([a, b]) => x > a + 10 && x < b - 10);
    }

    function allPlatforms() {
      return STATIC_PLATS.concat(movers);
    }

    function respawn() {
      p3.x = lastSafeX;
      p3.y = GROUND_Y - 40;
      p3.vx = 0;
      p3.vy = 0;
      p3.invincibleUntil = performance.now() + 1000;
      syncHud("Ouch! Restart");
      SFX.bark();
    }

    function hitPlayer(nowTs) {
      if (nowTs < p3.invincibleUntil) return;
      if (p3.shield > 0) {
        p3.shield -= 1;
        p3.powered = p3.shield > 0;
        if (!p3.powered) p3.jumpMul = 1;
        p3.invincibleUntil = nowTs + 1200;
        p3.vy = -280;
        syncHud("Shield broke!");
        SFX.bark();
        return;
      }
      respawn();
    }

    function spawnPowerup(x, y) {
      powerups.push({ x: x + 14, y: y - 8, vy: -120, kind: Math.random() < 0.5 ? "mushroom" : "coffee", got: false });
    }

    function bumpBlock(block) {
      if (block.used) return;
      block.used = true;
      block.bounce = 1;
      SFX.block();
      if (block.content === "coin") {
        coinsCollected++;
        syncHud("+$" + COIN_VALUE);
        SFX.coin();
      } else {
        spawnPowerup(block.x, block.y);
        syncHud("Power-up!");
      }
    }

    function frame(ts) {
      if (last3 === null) last3 = ts;
      const dt = Math.min(0.033, (ts - last3) / 1000);
      last3 = ts;
      const nowTs = performance.now();

      if (!finished && !ended) {
        // Moving platforms
        movers.forEach((m) => {
          m.x += m.dir * m.speed * dt;
          if (m.x < m.minX) { m.x = m.minX; m.dir = 1; }
          if (m.x > m.maxX) { m.x = m.maxX; m.dir = -1; }
        });

        let vx = 0;
        if (keys.left) vx = -210;
        if (keys.right) vx = 210;
        p3.vx = vx;
        if (vx !== 0) p3.facing = vx > 0 ? 1 : -1;
        if (keys.up && p3.onGround) {
          p3.vy = baseJump * p3.jumpMul;
          p3.onGround = false;
          SFX.jump();
        }

        p3.vy += 1500 * dt;
        p3.x += p3.vx * dt;
        p3.y += p3.vy * dt;
        p3.x = Math.max(14, Math.min(LEVEL_W - 14, p3.x));

        p3.onGround = false;
        if (p3.vy >= 0) {
          if (onSolidGroundAt(p3.x) && p3.y + p3.h / 2 >= GROUND_Y) {
            p3.y = GROUND_Y - p3.h / 2;
            p3.vy = 0;
            p3.onGround = true;
            lastSafeX = p3.x;
          }
          allPlatforms().forEach((pl) => {
            if (
              p3.x > pl.x - 4 && p3.x < pl.x + pl.w + 4 &&
              p3.y + p3.h / 2 >= pl.y && p3.y + p3.h / 2 <= pl.y + 16
            ) {
              p3.y = pl.y - p3.h / 2;
              p3.vy = 0;
              p3.onGround = true;
              lastSafeX = p3.x;
              // Ride moving platform
              if (pl.speed) p3.x += pl.dir * pl.speed * dt;
            }
          });
        }

        // Hit ? blocks from below
        if (p3.vy < 0) {
          qBlocks.forEach((b) => {
            if (b.used) return;
            const headY = p3.y - p3.h / 2;
            if (
              p3.x > b.x - 4 && p3.x < b.x + b.w + 4 &&
              headY <= b.y + b.h && headY >= b.y + b.h - 18
            ) {
              p3.vy = 80;
              bumpBlock(b);
            }
          });
        }
        qBlocks.forEach((b) => {
          if (b.bounce > 0) b.bounce = Math.max(0, b.bounce - dt * 4);
        });

        if (p3.y > ARC_H + 120) respawn();

        // Coins
        coins.forEach((coin) => {
          if (coin.got) return;
          if (Math.hypot(p3.x - coin.x, p3.y - coin.y) < 22) {
            coin.got = true;
            coinsCollected++;
            syncHud();
            SFX.coin();
          }
        });

        // Power-ups
        powerups.forEach((pu) => {
          if (pu.got) return;
          pu.vy += 900 * dt;
          pu.y += pu.vy * dt;
          if (pu.y > GROUND_Y - 12 && onSolidGroundAt(pu.x)) {
            pu.y = GROUND_Y - 12;
            pu.vy = 0;
          }
          if (Math.hypot(p3.x - pu.x, p3.y - pu.y) < 24) {
            pu.got = true;
            p3.powered = true;
            p3.shield = Math.max(1, p3.shield + 1);
            p3.jumpMul = 2;
            syncHud(pu.kind === "coffee" ? "Coffee boost!" : "Mushroom!");
            SFX.power();
          }
        });

        // Enemies
        enemies.forEach((en) => {
          if (!en.alive) return;
          en.x += en.dir * 55 * dt;
          if (en.x < en.minX || en.x > en.maxX) en.dir *= -1;

          const dx = Math.abs(p3.x - en.x);
          const dy = p3.y - (en.y - 10);
          if (dx < 20 && Math.abs(dy) < 22) {
            // Stomp from above
            if (p3.vy > 40 && p3.y < en.y - 6) {
              en.alive = false;
              p3.vy = -360;
              stomps++;
              syncHud("Stomped! +$" + STOMP_VALUE);
              SFX.stomp();
            } else {
              // Side / bad hit → shield or restart
              hitPlayer(nowTs);
            }
          }
        });

        if (p3.x > GOAL_X - 10) {
          finished = true;
          finishPlatformer();
        }
      }

      camX = Math.max(0, Math.min(LEVEL_W - ARC_W, p3.x - ARC_W / 2));
      drawPlatformerScene(c3, camX, p3, coins, enemies, qBlocks, movers, powerups, nowTs);

      if (!ended) raf3 = requestAnimationFrame(frame);
    }

    function cleanup() {
      ended = true;
      platformerActive = false;
      if (raf3) cancelAnimationFrame(raf3);
      raf3 = null;
    }
    pqCleanup = cleanup;

    function finishPlatformer() {
      cleanup();
      const earned = liveMoney() + FLAG_BONUS;
      state.money += earned;
      persist(state);
      ArcadeAudio.stageClear();

      const root = document.getElementById("modal-body");
      if (!root) return;
      root.innerHTML = `
        <h3>Arcade - Pixel Quest</h3>
        <div class="result-text">Flagpole cleared!</div>
        <div class="flavor-box">
          ${coinsCollected} coins ($${coinsCollected * COIN_VALUE}) ·
          ${stomps} stomps ($${stomps * STOMP_VALUE}) ·
          Flag +$${FLAG_BONUS}<br>
          <b>You earned $${earned}.</b>
        </div>
        <div class="action-row">
          <button class="action-btn ghost" id="pq-again">Play Again</button>
          <button class="action-btn" id="pq-done">Done</button>
        </div>`;
      const done = document.getElementById("pq-done");
      const again = document.getElementById("pq-again");
      if (done) done.addEventListener("click", closeHostModal);
      if (again) again.addEventListener("click", () => openPixelQuest());
    }

    raf3 = requestAnimationFrame(frame);
  }

  function drawPlatformerScene(c3, camX, p3, coins, enemies, qBlocks, movers, powerups, nowTs) {
    c3.clearRect(0, 0, ARC_W, ARC_H);
    const grad = c3.createLinearGradient(0, 0, 0, ARC_H);
    grad.addColorStop(0, "#BFE3EE");
    grad.addColorStop(1, "#E8F3D9");
    c3.fillStyle = grad;
    c3.fillRect(0, 0, ARC_W, ARC_H);

    // Soft hills
    c3.fillStyle = "rgba(107,142,107,0.25)";
    c3.beginPath();
    c3.ellipse(180 - camX * 0.3, 280, 120, 40, 0, 0, Math.PI * 2);
    c3.fill();
    c3.beginPath();
    c3.ellipse(520 - camX * 0.25, 270, 150, 50, 0, 0, Math.PI * 2);
    c3.fill();

    c3.save();
    c3.translate(-camX, 0);

    GROUND_SPANS.forEach(([a, b]) => {
      c3.fillStyle = "#6B8E6B";
      c3.fillRect(a, GROUND_Y, b - a, 14);
      c3.fillStyle = "#B5654A";
      c3.fillRect(a, GROUND_Y + 14, b - a, ARC_H - GROUND_Y - 14);
    });

    STATIC_PLATS.concat(movers).forEach((pl) => {
      c3.fillStyle = pl.speed ? "#D98F2B" : "#C9A574";
      roundRectPath(c3, pl.x, pl.y, pl.w, pl.h, 5);
      c3.fill();
      if (pl.speed) {
        c3.fillStyle = "rgba(255,255,255,0.35)";
        c3.fillRect(pl.x + 6, pl.y + 3, pl.w - 12, 4);
      }
    });

    // ? blocks
    qBlocks.forEach((b) => {
      const by = b.y - (b.bounce > 0 ? Math.sin(b.bounce * Math.PI) * 8 : 0);
      c3.fillStyle = b.used ? "#A9784F" : "#E8A33D";
      roundRectPath(c3, b.x, by, b.w, b.h, 4);
      c3.fill();
      c3.strokeStyle = "#8C5A3B";
      c3.lineWidth = 2;
      roundRectPath(c3, b.x, by, b.w, b.h, 4);
      c3.stroke();
      if (!b.used) {
        c3.fillStyle = "#3A2C22";
        c3.font = "700 16px ui-rounded, sans-serif";
        c3.textAlign = "center";
        c3.textBaseline = "middle";
        c3.fillText("?", b.x + b.w / 2, by + b.h / 2 + 1);
      }
    });

    coins.forEach((coin) => {
      if (coin.got) return;
      const bob = Math.sin(nowTs / 220 + coin.bob) * 3;
      c3.fillStyle = "#E8A33D";
      c3.beginPath();
      c3.arc(coin.x, coin.y + bob, 8, 0, Math.PI * 2);
      c3.fill();
      c3.strokeStyle = "#B5651D";
      c3.lineWidth = 1.5;
      c3.beginPath();
      c3.arc(coin.x, coin.y + bob, 8, 0, Math.PI * 2);
      c3.stroke();
    });

    powerups.forEach((pu) => {
      if (pu.got) return;
      if (pu.kind === "coffee") {
        c3.fillStyle = "#6B4423";
        roundRectPath(c3, pu.x - 8, pu.y - 10, 16, 14, 3);
        c3.fill();
        c3.fillStyle = "#F5E9D3";
        c3.fillRect(pu.x - 5, pu.y - 8, 10, 4);
      } else {
        c3.fillStyle = "#D9705C";
        c3.beginPath();
        c3.ellipse(pu.x, pu.y - 4, 11, 9, 0, 0, Math.PI * 2);
        c3.fill();
        c3.fillStyle = "#FBF0DE";
        c3.beginPath();
        c3.arc(pu.x - 3, pu.y - 6, 2, 0, Math.PI * 2);
        c3.fill();
      }
    });

    enemies.forEach((en) => {
      if (!en.alive) return;
      if (en.kind === "goomba") {
        c3.fillStyle = "#8C5A3B";
        c3.beginPath();
        c3.ellipse(en.x, en.y - 10, 14, 11, 0, 0, Math.PI * 2);
        c3.fill();
        c3.fillStyle = "#5A4030";
        c3.fillRect(en.x - 12, en.y - 6, 8, 6);
        c3.fillRect(en.x + 4, en.y - 6, 8, 6);
      } else {
        c3.fillStyle = "#8A5A8C";
        c3.beginPath();
        c3.ellipse(en.x, en.y - 8, 13, 11, 0, 0, Math.PI * 2);
        c3.fill();
      }
      c3.fillStyle = "#fff";
      c3.beginPath(); c3.arc(en.x - 4, en.y - 11, 2.4, 0, Math.PI * 2); c3.fill();
      c3.beginPath(); c3.arc(en.x + 4, en.y - 11, 2.4, 0, Math.PI * 2); c3.fill();
      c3.fillStyle = "#3A2C22";
      c3.beginPath(); c3.arc(en.x - 4, en.y - 11, 1.1, 0, Math.PI * 2); c3.fill();
      c3.beginPath(); c3.arc(en.x + 4, en.y - 11, 1.1, 0, Math.PI * 2); c3.fill();
    });

    // Flagpole
    c3.strokeStyle = "#8C5A3B";
    c3.lineWidth = 4;
    c3.beginPath();
    c3.moveTo(GOAL_X, GROUND_Y);
    c3.lineTo(GOAL_X, GROUND_Y - 100);
    c3.stroke();
    c3.fillStyle = "#D9705C";
    c3.beginPath();
    c3.moveTo(GOAL_X, GROUND_Y - 100);
    c3.lineTo(GOAL_X + 36, GROUND_Y - 84);
    c3.lineTo(GOAL_X, GROUND_Y - 68);
    c3.closePath();
    c3.fill();
    c3.fillStyle = "#E8A33D";
    c3.beginPath();
    c3.arc(GOAL_X, GROUND_Y - 100, 5, 0, Math.PI * 2);
    c3.fill();

    // Player
    const state = lastApi && lastApi.state;
    const blink = nowTs < p3.invincibleUntil && Math.floor(nowTs / 100) % 2 === 0;
    if (!blink) {
      c3.save();
      c3.translate(p3.x, p3.y);
      c3.fillStyle = "rgba(58,44,34,0.2)";
      c3.beginPath();
      c3.ellipse(0, p3.h / 2 + 3, 11, 4, 0, 0, Math.PI * 2);
      c3.fill();
      const outfit = (state && state.child && state.child.outfit) || "#7B5EA7";
      const skin = (state && state.child && state.child.skin) || "#F7D9B6";
      c3.fillStyle = outfit;
      roundRectPath(c3, -p3.w / 2, -4, p3.w, p3.h - 6, 7);
      c3.fill();
      if (p3.powered) {
        c3.strokeStyle = "#E8A33D";
        c3.lineWidth = 2;
        roundRectPath(c3, -p3.w / 2 - 2, -6, p3.w + 4, p3.h - 2, 8);
        c3.stroke();
      }
      c3.beginPath();
      c3.arc(0, -p3.h / 2 - 2, 10, 0, Math.PI * 2);
      c3.fillStyle = skin;
      c3.fill();
      c3.fillStyle = "#3A2C22";
      c3.beginPath();
      c3.arc(p3.facing * 3, -p3.h / 2 - 3, 1.4, 0, Math.PI * 2);
      c3.fill();
      c3.restore();
    }

    c3.restore();
  }

  /* ================================================================
   * 3) PAWS SPRINT — 200m dog race
   * ================================================================ */
  const PS_W = 700, PS_H = 280;

  function openPawsSprint() {
    const state = lastApi && lastApi.state;
    if (!state) return;

    if (!playerHasDog(state)) {
      openHostModal(`
        <h3>Paws Sprint 200m</h3>
        <div class="flavor-box">You need a dog to enter the race!</div>
        <div class="action-row" style="margin-top:0.9rem">
          <button class="action-btn" id="ps-need-ok">Okay</button>
        </div>`);
      const b = document.getElementById("ps-need-ok");
      if (b) b.addEventListener("click", closeHostModal);
      return;
    }

    if (state.energy < RACE_ENERGY) {
      openHostModal(`
        <h3>Paws Sprint 200m</h3>
        <div class="flavor-box">You're too tired to race right now. Head home and sleep to restore energy.</div>
        <div class="action-row" style="margin-top:0.9rem">
          <button class="action-btn" id="ps-tired-ok">Okay</button>
        </div>`);
      const b = document.getElementById("ps-tired-ok");
      if (b) b.addEventListener("click", closeHostModal);
      return;
    }

    state.energy = Math.max(0, state.energy - RACE_ENERGY);
    persist(state);

    const dog = activeDog(state);
    const dogName = (dog && dog.name) || "Your pup";

    openHostModal(`
      <div class="ps-wrap">
        <h3>🐾 Paws Sprint 200m</h3>
        <p class="modal-sub">Mash <b>SPACE</b> / <b>E</b> or tap the button — free entry · −${RACE_ENERGY} Energy</p>
        <div class="ps-hud">
          <span>Distance: <b id="ps-dist">0</b> / ${RACE_DIST}m</span>
          <span>Speed</span>
          <div class="ps-gauge" title="Speed"><i id="ps-gauge"></i></div>
          <span id="ps-place">Ready…</span>
        </div>
        <div class="ps-canvas-wrap">
          <canvas id="ps-canvas" width="${PS_W}" height="${PS_H}"></canvas>
        </div>
        <div class="action-row">
          <button class="action-btn ps-tap" id="ps-tap" type="button">TAP!</button>
        </div>
      </div>`);
    startPawsSprint(state, dogName);
  }

  function startPawsSprint(state, dogName) {
    const canvas = document.getElementById("ps-canvas");
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const distEl = document.getElementById("ps-dist");
    const gaugeEl = document.getElementById("ps-gauge");
    const placeEl = document.getElementById("ps-place");
    const tapBtn = document.getElementById("ps-tap");

    raceActive = true;
    let ended = false;
    let raf = null;
    let last = null;
    let countdown = 1.2;
    let started = false;
    ArcadeAudio.raceStart(); // 3-beep countdown as the race loads

    const runners = [
      {
        id: "player",
        name: dogName,
        color: "#7B5EA7",
        accent: "#E8A33D",
        lane: 1,
        dist: 0,
        speed: 0,
        finished: false,
        finishTime: 0,
        isPlayer: true,
      },
      {
        id: "npc1",
        name: "Pip",
        color: "#D9705C",
        accent: "#FBF0DE",
        lane: 0,
        dist: 0,
        speed: 52 + Math.random() * 8,
        finished: false,
        finishTime: 0,
        isPlayer: false,
      },
      {
        id: "npc2",
        name: "Theo",
        color: "#5A7FB0",
        accent: "#CFE7F2",
        lane: 2,
        dist: 0,
        speed: 50 + Math.random() * 10,
        finished: false,
        finishTime: 0,
        isPlayer: false,
      },
    ];

    let raceTime = 0;
    let camX = 0;

    function doTap() {
      if (!raceActive || ended || !started) return;
      const p = runners[0];
      p.speed = Math.min(95, p.speed + 14);
      SFX.tap();
      if (gaugeEl) gaugeEl.style.width = Math.min(100, (p.speed / 95) * 100) + "%";
    }
    raceTapFn = doTap;
    if (tapBtn) {
      tapBtn.addEventListener("click", (e) => {
        e.preventDefault();
        doTap();
      });
    }

    function laneY(lane) {
      return 70 + lane * 62;
    }

    function drawTrack(t) {
      ctx.clearRect(0, 0, PS_W, PS_H);
      // sky / field
      const g = ctx.createLinearGradient(0, 0, 0, PS_H);
      g.addColorStop(0, "#BFE3EE");
      g.addColorStop(1, "#CFE1D2");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, PS_W, PS_H);

      ctx.save();
      ctx.translate(-camX, 0);

      // track bed
      const trackTop = 48;
      const trackH = 200;
      ctx.fillStyle = "#C9A574";
      ctx.fillRect(0, trackTop, RACE_DIST * 3.2 + 200, trackH);

      // lanes
      for (let i = 0; i < 3; i++) {
        const y = laneY(i) - 22;
        ctx.fillStyle = i % 2 === 0 ? "#D4B896" : "#C9A574";
        ctx.fillRect(0, y, RACE_DIST * 3.2 + 200, 52);
        ctx.strokeStyle = "rgba(255,255,255,0.55)";
        ctx.lineWidth = 2;
        ctx.setLineDash([10, 10]);
        ctx.beginPath();
        ctx.moveTo(0, y + 52);
        ctx.lineTo(RACE_DIST * 3.2 + 200, y + 52);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // meter marks
      ctx.fillStyle = "rgba(58,44,34,0.45)";
      ctx.font = "700 10px ui-rounded, sans-serif";
      ctx.textAlign = "center";
      for (let m = 0; m <= RACE_DIST; m += 25) {
        const x = 40 + m * 3.2;
        ctx.fillRect(x, trackTop, 2, trackH);
        ctx.fillText(m + "m", x, trackTop - 6);
      }

      // finish chequered
      const fx = 40 + RACE_DIST * 3.2;
      for (let row = 0; row < 10; row++) {
        for (let col = 0; col < 4; col++) {
          ctx.fillStyle = (row + col) % 2 === 0 ? "#1A1524" : "#FBF0DE";
          ctx.fillRect(fx + col * 8, trackTop + row * 20, 8, 20);
        }
      }

      // runners
      runners.forEach((r) => {
        const x = 40 + r.dist * 3.2;
        const y = laneY(r.lane);
        const bob = started && !r.finished ? Math.sin(t / 70 + r.lane) * 2 : 0;
        // shadow
        ctx.fillStyle = "rgba(58,44,34,0.2)";
        ctx.beginPath();
        ctx.ellipse(x, y + 14, 16, 5, 0, 0, Math.PI * 2);
        ctx.fill();
        // body
        ctx.fillStyle = r.color;
        roundRectPath(ctx, x - 16, y - 14 + bob, 30, 20, 8);
        ctx.fill();
        // head
        ctx.beginPath();
        ctx.arc(x + 12, y - 10 + bob, 9, 0, Math.PI * 2);
        ctx.fillStyle = r.accent;
        ctx.fill();
        // ear
        ctx.fillStyle = r.color;
        ctx.beginPath();
        ctx.ellipse(x + 8, y - 18 + bob, 4, 6, -0.3, 0, Math.PI * 2);
        ctx.fill();
        // eye
        ctx.fillStyle = "#3A2C22";
        ctx.beginPath();
        ctx.arc(x + 15, y - 11 + bob, 1.4, 0, Math.PI * 2);
        ctx.fill();
        // label
        ctx.fillStyle = "#3A2C22";
        ctx.font = "700 11px ui-rounded, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(r.name, x, y + 28);
        if (r.isPlayer) {
          ctx.fillStyle = "#E8A33D";
          ctx.fillText("YOU", x, y - 24 + bob);
        }
      });

      ctx.restore();
    }

    function finishRace() {
      if (ended) return;
      ended = true;
      raceActive = false;
      raceTapFn = null;
      if (raf) cancelAnimationFrame(raf);

      // Rank by finish time, then by distance
      const ranked = runners.slice().sort((a, b) => {
        if (a.finished && b.finished) return a.finishTime - b.finishTime;
        if (a.finished) return -1;
        if (b.finished) return 1;
        return b.dist - a.dist;
      });
      const place = ranked.findIndex((r) => r.isPlayer) + 1;
      let money = 5;
      let bond = 0;
      let happy = 0;
      if (place === 1) { money = 40; bond = 10; happy = 10; }
      else if (place === 2) { money = 15; bond = 5; happy = 0; }

      state.money += money;
      const dog = activeDog(state);
      if (dog) {
        dog.bond = Math.min(100, (dog.bond || 0) + bond);
        dog.happiness = Math.min(100, (dog.happiness || 0) + happy);
      }
      persist(state);
      ArcadeAudio.victoryCheer();

      const medal = place === 1 ? "🥇" : place === 2 ? "🥈" : "🥉";
      const bondLine = bond || happy
        ? ` · Bond +${bond}${happy ? ` · Happiness +${happy}` : ""}`
        : "";
      const root = document.getElementById("modal-body");
      if (!root) return;
      root.innerHTML = `
        <h3>🐾 Paws Sprint 200m</h3>
        <div class="result-text">${medal} ${place === 1 ? "First place!" : place === 2 ? "Second place!" : "Third place"}</div>
        <div class="flavor-box">
          ${dogName} finished <b>#${place}</b>.<br>
          You earned <b>$${money}</b>${bondLine}.
        </div>
        <div class="action-row">
          <button class="action-btn ghost" id="ps-again">Race Again</button>
          <button class="action-btn" id="ps-done">Done</button>
        </div>`;
      const done = document.getElementById("ps-done");
      const again = document.getElementById("ps-again");
      if (done) done.addEventListener("click", closeHostModal);
      if (again) again.addEventListener("click", () => openPawsSprint());
    }

    function frame(ts) {
      if (last == null) last = ts;
      const dt = Math.min(0.033, (ts - last) / 1000);
      last = ts;

      if (!ended) {
        if (!started) {
          countdown -= dt;
          if (placeEl) placeEl.textContent = countdown > 0.4 ? "Ready…" : "GO!";
          if (countdown <= 0) {
            started = true;
            if (placeEl) placeEl.textContent = "Run!";
          }
        } else {
          raceTime += dt;
          const player = runners[0];
          // Decay player speed — mash to keep it up
          player.speed = Math.max(18, player.speed - 28 * dt);
          if (gaugeEl) gaugeEl.style.width = Math.min(100, (player.speed / 95) * 100) + "%";

          runners.forEach((r) => {
            if (r.finished) return;
            let spd = r.speed;
            if (!r.isPlayer) {
              // slight wobble so races feel alive
              spd = r.speed + Math.sin(raceTime * 2.2 + r.lane) * 3;
            }
            r.dist = Math.min(RACE_DIST, r.dist + spd * dt);
            if (r.dist >= RACE_DIST) {
              r.dist = RACE_DIST;
              r.finished = true;
              r.finishTime = raceTime;
            }
          });

          if (distEl) distEl.textContent = Math.floor(player.dist);
          // Live place preview
          const live = runners.slice().sort((a, b) => b.dist - a.dist);
          const p = live.findIndex((r) => r.isPlayer) + 1;
          if (placeEl) placeEl.textContent = "Place: #" + p;

          if (runners.every((r) => r.finished) || player.finished) {
            // Let remaining NPCs finish quickly for ranking, or finalize now
            runners.forEach((r) => {
              if (!r.finished) {
                // estimate finish from current speed
                const remain = RACE_DIST - r.dist;
                r.finishTime = raceTime + remain / Math.max(20, r.speed);
                r.dist = RACE_DIST;
                r.finished = true;
              }
            });
            finishRace();
          }
        }

        camX = Math.max(0, (runners[0].dist * 3.2) - PS_W * 0.35);
      }

      drawTrack(performance.now());
      if (!ended) raf = requestAnimationFrame(frame);
    }

    function cleanup() {
      ended = true;
      raceActive = false;
      raceTapFn = null;
      if (raf) cancelAnimationFrame(raf);
    }
    pqCleanup = cleanup;
    raf = requestAnimationFrame(frame);
  }

  /* ---------- Interaction / tick ---------- */
  function tryInteract() {
    if (!arcadeActive || !lastApi || modalOpen) return false;
    if (activeZone === "jackpot") {
      openJackpot();
      return true;
    }
    if (activeZone === "pawssprint") {
      openPawsSprint();
      return true;
    }
    if (activeZone === "cashier") {
      openCashierTalk();
      return true;
    }
    if (activeZone === "pixelquest") {
      openPixelQuest();
      return true;
    }
    // Fallback if mirror drifted but host prompt still says Play games
    const promptText = document.getElementById("prompt-text");
    const label = promptText ? (promptText.textContent || "") : "";
    if (/jackpot/i.test(label)) {
      openJackpot();
      return true;
    }
    if (/paws sprint|sprint/i.test(label)) {
      openPawsSprint();
      return true;
    }
    if (/cashier|talk to/i.test(label)) {
      openCashierTalk();
      return true;
    }
    if (/pixel quest|play games/i.test(label)) {
      openPixelQuest();
      return true;
    }
    return false;
  }

  window.addEventListener("keydown", (e) => {
    if (KEY_MAP[e.key]) keys[KEY_MAP[e.key]] = true;
    if (e.key === "Shift") keys.run = true;

    // Paws Sprint mash keys
    if (raceActive) {
      if (e.key === " " || e.key === "Spacebar" || e.key === "e" || e.key === "E") {
        e.preventDefault();
        e.stopImmediatePropagation();
        if (raceTapFn) raceTapFn();
      }
      return;
    }

    // While platformer runs, own the movement / jump keys
    if (platformerActive) {
      if (KEY_MAP[e.key] || e.key === " " || e.key === "Spacebar") {
        if (e.key === " " || e.key === "Spacebar") keys.up = true;
        e.preventDefault();
        e.stopImmediatePropagation();
      }
      return;
    }

    if (!arcadeActive || modalOpen) return;
    if (e.key === "e" || e.key === "E") {
      if (tryInteract()) {
        e.preventDefault();
        e.stopImmediatePropagation();
      }
    }
  }, true);

  window.addEventListener("keyup", (e) => {
    if (KEY_MAP[e.key]) keys[KEY_MAP[e.key]] = false;
    if (e.key === "Shift") keys.run = false;
    if (platformerActive && (e.key === " " || e.key === "Spacebar")) keys.up = false;
  }, true);

  document.addEventListener("click", (e) => {
    // Close via host X / backdrop while our modal is up
    if (modalOpen) {
      if (e.target && e.target.id === "modal-close") {
        closeHostModal();
        e.preventDefault();
        e.stopImmediatePropagation();
        return;
      }
      if (e.target && e.target.id === "modal-backdrop") {
        closeHostModal();
        e.preventDefault();
        e.stopImmediatePropagation();
        return;
      }
    }

    if (!arcadeActive || modalOpen) return;
    const btn = e.target && e.target.closest && e.target.closest("#prompt-btn");
    const act = e.target && e.target.closest && e.target.closest("#btn-building-act");
    if (btn && activeZone) {
      if (tryInteract()) {
        e.preventDefault();
        e.stopImmediatePropagation();
      }
    } else if (act) {
      // Banner "Play games" → upgraded Pixel Quest (don't exit building / old game)
      openPixelQuest();
      e.preventDefault();
      e.stopImmediatePropagation();
    }
  }, true);

  setInterval(() => {
    if (!arcadeActive && !lastDrawT) return;
    const idle = performance.now() - lastDrawT;
    if (arcadeActive && idle > 400) {
      onArcadeExit(false); // soft — keep BGM
    }
    // Truly left the arcade (no draws for 1.5s) — fade BGM out
    if (idle > 1500 && ArcadeAudio.isBgmPlaying()) {
      onArcadeExit(true);
    }
  }, 200);

  function tickArcade(ctx, api, t, cx, cy) {
    const HOUSE = api.HOUSE;
    const now = performance.now();
    const dt = Math.min(0.05, (now - lastLogicT) / 1000) || 0.016;
    lastLogicT = now;
    lastDrawT = now;
    lastApi = api;

    if (!arcadeActive) {
      arcadeActive = true;
      onArcadeEnter(api);
    }

    if (!modalOpen) updateMirror(dt, HOUSE);
    activeZone = findZone(HOUSE, mirror.x, mirror.y);

    const atDoor =
      mirror.y > HOUSE.y + HOUSE.h - HOUSE.wall - 48 &&
      mirror.x > HOUSE.door.x - 24 &&
      mirror.x < HOUSE.door.x + HOUSE.door.w + 24;
    const promptBtn = document.getElementById("prompt-btn");
    const promptText = document.getElementById("prompt-text");
    if (!atDoor && !modalOpen && promptBtn && promptText) {
      if (activeZone === "jackpot") {
        promptText.textContent = "Play Jackpot ($20)";
        promptBtn.style.display = "flex";
      } else if (activeZone === "pawssprint") {
        promptText.textContent = "Play Paws Sprint";
        promptBtn.style.display = "flex";
      } else if (activeZone === "cashier") {
        promptText.textContent = "Talk to Cashier";
        promptBtn.style.display = "flex";
      } else if (activeZone === "pixelquest") {
        promptText.textContent = "Play Pixel Quest";
        promptBtn.style.display = "flex";
      }
    }

    if (bannerHidden) hideHostBanner();
  }

  /** Full back-wall sign band — covers host window slots + fills the top-right corner. */
  function drawArcadeWallSigns(ctx, roundRect, HOUSE, cx, t, neonA) {
    const wallY = HOUSE.y + HOUSE.wall + 4;
    const bandH = 54;
    // Repaint the whole window strip so no host purple “holes” remain
    ctx.fillStyle = "#B8A8C8";
    ctx.fillRect(HOUSE.x + HOUSE.wall, HOUSE.y + HOUSE.wall, HOUSE.w - HOUSE.wall * 2, bandH + 4);

    // Left — neon joystick + paw (over host left window)
    {
      const x = HOUSE.x + 120, y = wallY, w = 96, h = 50;
      ctx.fillStyle = `rgba(232,163,61,${0.18 + neonA * 0.22})`;
      roundRect(x - 3, y - 2, w + 6, h + 4, 10); ctx.fill();
      ctx.fillStyle = "#2A1840";
      roundRect(x, y, w, h, 8); ctx.fill();
      ctx.strokeStyle = `rgba(232,163,61,${0.55 + neonA * 0.4})`;
      ctx.lineWidth = 2.5;
      roundRect(x + 2, y + 2, w - 4, h - 4, 7); ctx.stroke();
      ctx.fillStyle = "#1A1028";
      roundRect(x + 14, y + 30, 30, 12, 4); ctx.fill();
      ctx.strokeStyle = `rgba(232,163,61,${0.75 + neonA * 0.2})`;
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(x + 29, y + 30); ctx.lineTo(x + 29, y + 14); ctx.stroke();
      ctx.fillStyle = `rgba(255,210,90,${0.7 + neonA * 0.25})`;
      ctx.beginPath(); ctx.arc(x + 29, y + 12, 6.5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = `rgba(217,112,92,${0.6 + neonA * 0.3})`;
      ctx.beginPath(); ctx.ellipse(x + 68, y + 26, 13, 11, 0, 0, Math.PI * 2); ctx.fill();
      [ -10, 0, 10 ].forEach((dx) => {
        ctx.beginPath(); ctx.arc(x + 68 + dx, y + 16, 3.8, 0, Math.PI * 2); ctx.fill();
      });
    }

    // Center — PIXEL ARCADE marquee
    {
      const w = 180, h = 46;
      const x = cx - w / 2, y = wallY + 2;
      ctx.fillStyle = `rgba(123,94,167,${0.22 + neonA * 0.2})`;
      roundRect(x - 4, y - 3, w + 8, h + 6, 10); ctx.fill();
      ctx.fillStyle = "#1E1233";
      roundRect(x, y, w, h, 8); ctx.fill();
      ctx.strokeStyle = `rgba(232,163,61,${0.55 + neonA * 0.35})`;
      ctx.lineWidth = 2.5;
      roundRect(x + 3, y + 3, w - 6, h - 6, 6); ctx.stroke();
      ctx.fillStyle = `rgba(255,220,140,${0.75 + neonA * 0.25})`;
      ctx.font = "800 16px ui-rounded, Courier New, monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("PIXEL ARCADE", cx, y + h / 2 + 1);
      ctx.textBaseline = "alphabetic";
    }

    // Right — full Pixel Quest poster + clock (fills top-right corner)
    {
      const rightEdge = HOUSE.x + HOUSE.w - HOUSE.wall - 8;
      const w = 118, h = 50;
      const x = rightEdge - w;
      const y = wallY;
      // Frame
      ctx.fillStyle = "#243652";
      roundRect(x, y, w, h, 8); ctx.fill();
      ctx.strokeStyle = `rgba(232,163,61,${0.45 + neonA * 0.35})`;
      ctx.lineWidth = 2.5;
      roundRect(x + 2, y + 2, w - 4, h - 4, 6); ctx.stroke();
      // Poster screen
      ctx.fillStyle = "#BFE3EE";
      roundRect(x + 8, y + 8, 58, 34, 4); ctx.fill();
      ctx.fillStyle = "#6B8E6B";
      ctx.fillRect(x + 10, y + 32, 54, 8);
      ctx.fillStyle = "#C9A574";
      ctx.fillRect(x + 20, y + 22, 18, 5);
      ctx.fillStyle = "#3A6EA5";
      roundRect(x + 14, y + 14, 10, 12, 3); ctx.fill();
      ctx.fillStyle = "#E8A33D";
      ctx.beginPath(); ctx.arc(x + 48, y + 16, 4, 0, Math.PI * 2); ctx.fill();
      // Retro wall clock
      ctx.fillStyle = "#FBF0DE";
      ctx.beginPath(); ctx.arc(x + 90, y + 25, 16, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = "#3A2C22";
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(x + 90, y + 25, 16, 0, Math.PI * 2); ctx.stroke();
      // Tick marks
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2 - Math.PI / 2;
        ctx.beginPath();
        ctx.moveTo(x + 90 + Math.cos(a) * 12, y + 25 + Math.sin(a) * 12);
        ctx.lineTo(x + 90 + Math.cos(a) * 14.5, y + 25 + Math.sin(a) * 14.5);
        ctx.stroke();
      }
      const ang = (t / 800) % (Math.PI * 2);
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x + 90, y + 25);
      ctx.lineTo(x + 90 + Math.cos(ang - Math.PI / 2) * 10, y + 25 + Math.sin(ang - Math.PI / 2) * 10);
      ctx.stroke();
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(x + 90, y + 25);
      ctx.lineTo(x + 90 + Math.cos(ang * 12 - Math.PI / 2) * 7, y + 25 + Math.sin(ang * 12 - Math.PI / 2) * 7);
      ctx.stroke();
      ctx.fillStyle = "#D9705C";
      ctx.beginPath(); ctx.arc(x + 90, y + 25, 2.2, 0, Math.PI * 2); ctx.fill();
    }
  }

  /* ---------- Register building ---------- */
  B.register({
    id: "arcade",
    info: {
      label: "Pixel Arcade",
      wall: "#B8A8C8",
      floor: "#3A2C4A",
      accent: "#7B5EA7",
      activity: "Play games",
      blurb: "",
    },
    getSolids(HOUSE) {
      return arcadeSolids(HOUSE);
    },
    drawIcon(ctx, api, cx, cy) {
      const S = B.shared; S.bind(api);
      const roundRect = api.roundRect;
      const acShadow = S.acShadow, acWoodWall = S.acWoodWall,
        acBlueMetalRoof = S.acBlueMetalRoof,
        acDoor = S.acDoor, acWindow = S.acWindow;
      ctx.save();
      ctx.translate(cx, cy);
      acShadow(68, 60);
      acWoodWall(-52, 0, 104, 54, "#D4C4E8", false);
      acBlueMetalRoof(56, -34, 2);
      ctx.fillStyle = "#4A2C6E";
      roundRect(-48, -28, 96, 16, 4); ctx.fill();
      ["#E8A33D", "#D9705C", "#6FA79B"].forEach((c, i) => {
        ctx.fillStyle = c;
        ctx.beginPath(); ctx.arc(-28 + i * 28, -20, 5, 0, Math.PI * 2); ctx.fill();
      });
      acDoor(-12, 22, 24, 30, "#2A1840", "#E8A33D");
      acWindow(-42, 8, 18, 16);
      acWindow(24, 8, 18, 16);
      ctx.restore();
    },

    drawInterior(ctx, api, t, cx, cy) {
      const roundRect = api.roundRect;
      const HOUSE = api.HOUSE;
      const drawBuildingPatron = api.drawBuildingPatron;
      const drawNpcNameTag = api.drawNpcNameTag;
      const floorX = HOUSE.x + HOUSE.wall;
      const floorY = HOUSE.y + HOUSE.wall + 36;
      const floorW = HOUSE.w - HOUSE.wall * 2;
      const floorH = HOUSE.h - HOUSE.wall * 2 - 36;

      /* ---- Arcade carpet (classic zigzag / neon lanes) ---- */
      ctx.fillStyle = "#342446";
      ctx.fillRect(floorX, floorY, floorW, floorH);
      for (let row = 0; row < 14; row++) {
        for (let col = 0; col < 22; col++) {
          const px = floorX + 8 + col * 36;
          const py = floorY + 8 + row * 28;
          const cool = (row + col) % 2 === 0;
          ctx.fillStyle = cool ? "rgba(123,94,167,0.28)" : "rgba(217,112,92,0.18)";
          ctx.beginPath();
          ctx.moveTo(px, py + 10);
          ctx.lineTo(px + 16, py);
          ctx.lineTo(px + 32, py + 10);
          ctx.lineTo(px + 16, py + 20);
          ctx.closePath();
          ctx.fill();
        }
      }
      // Neon floor lane stripes toward the machines
      ["#E8A33D", "#6FA79B", "#D9705C"].forEach((col, i) => {
        ctx.strokeStyle = col;
        ctx.globalAlpha = 0.22 + Math.sin(t / 400 + i) * 0.06;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(HOUSE.x + 160 + i * 180, HOUSE.y + HOUSE.h - HOUSE.wall - 10);
        ctx.lineTo(HOUSE.x + 120 + i * 200, HOUSE.y + 230);
        ctx.stroke();
      });
      ctx.globalAlpha = 1;

      /* ---- Top wall décor: clear host windows, then full L/C/R signs ---- */
      const neonA = 0.45 + Math.sin(t / 320) * 0.25;
      drawArcadeWallSigns(ctx, roundRect, HOUSE, cx, t, neonA);
      // Host paints title after drawInterior — redraw signs so nothing looks clipped/missing
      queueMicrotask(() => {
        if (!arcadeActive || !api.ctx) return;
        drawArcadeWallSigns(api.ctx, roundRect, HOUSE, cx, performance.now(), neonA);
      });

      /* ---- Clean counter (no overlapping badge) ---- */
      const ctr = counterRect(HOUSE);
      ctx.fillStyle = "rgba(26,21,36,0.3)";
      roundRect(ctr.x + 6, ctr.y + ctr.h - 4, ctr.w - 12, 10, 4); ctx.fill();
      ctx.fillStyle = "#6E3B24";
      roundRect(ctr.x, ctr.y, ctr.w, ctr.h, 12); ctx.fill();
      ctx.fillStyle = "#A9784F";
      roundRect(ctr.x + 10, ctr.y + 10, ctr.w - 20, 20, 8); ctx.fill();
      ctx.strokeStyle = `rgba(232,163,61,${0.35 + neonA * 0.3})`;
      ctx.lineWidth = 2;
      roundRect(ctr.x + 5, ctr.y + 5, ctr.w - 10, ctr.h - 10, 10); ctx.stroke();
      // Small token bowls only — no text badge over the cashier
      [[-78, "#E8A33D"], [78, "#6FA79B"]].forEach(([dx, col]) => {
        ctx.fillStyle = col;
        roundRect(cx + dx - 11, ctr.y + 38, 22, 14, 5); ctx.fill();
        ctx.fillStyle = "#FBF0DE";
        ctx.beginPath(); ctx.arc(cx + dx, ctr.y + 43, 3, 0, Math.PI * 2); ctx.fill();
      });

      /* ---- Main floor cabinets: Pixel Quest (bigger) ---- */
      PQ_CAB_XS.forEach((ox, i) => {
        const r = pqCabRect(HOUSE, ox);
        const x = r.x, y = r.y, w = r.w, h = r.h;
        const glow = 0.45 + Math.sin(t / 250 + i) * 0.3;
        ctx.fillStyle = "rgba(26,21,36,0.28)";
        roundRect(x + 4, y + h - 8, w - 8, 12, 4); ctx.fill();
        ctx.fillStyle = "#3A6EA5";
        roundRect(x, y, w, h, 8); ctx.fill();
        ctx.strokeStyle = "#1E3A5F";
        ctx.lineWidth = 2.5;
        roundRect(x + 2, y + 2, w - 4, h - 4, 7); ctx.stroke();
        // Marquee
        ctx.fillStyle = "#1E3A5F";
        roundRect(x + 5, y + 5, w - 10, 16, 4); ctx.fill();
        ctx.fillStyle = `rgba(180,230,255,${0.55 + glow * 0.35})`;
        ctx.font = "800 7px ui-rounded, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("PIXEL QUEST", x + w / 2, y + 16);
        // Screen
        ctx.fillStyle = "#BFE3EE";
        roundRect(x + 9, y + 26, w - 18, 38, 4); ctx.fill();
        ctx.fillStyle = "#6B8E6B";
        ctx.fillRect(x + 11, y + 52, w - 22, 8);
        ctx.fillStyle = "#C9A574";
        ctx.fillRect(x + 22, y + 40, 18, 5);
        ctx.fillStyle = "#E8A33D";
        ctx.beginPath(); ctx.arc(x + w / 2, y + 36, 4, 0, Math.PI * 2); ctx.fill();
        // Controls
        ctx.fillStyle = "#2A4060";
        roundRect(x + 9, y + 70, w - 18, 24, 4); ctx.fill();
        ctx.fillStyle = "#1A1524";
        ctx.beginPath(); ctx.arc(x + 24, y + 82, 7, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "#E8A33D";
        ctx.beginPath(); ctx.arc(x + 24, y + 79, 3.5, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "#D9705C";
        ctx.beginPath(); ctx.arc(x + w - 28, y + 78, 5, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "#6FA79B";
        ctx.beginPath(); ctx.arc(x + w - 16, y + 84, 3.5, 0, Math.PI * 2); ctx.fill();
      });

      /* ---- Left wall: bigger Jackpot ---- */
      const jr = jackpotRect(HOUSE);
      const jx = jr.x, jy = jr.y, jw = jr.w, jh = jr.h;
      ctx.fillStyle = "rgba(26,21,36,0.28)";
      roundRect(jx + 4, jy + jh - 6, jw - 8, 10, 3); ctx.fill();
      ctx.fillStyle = "#4A2C6E";
      roundRect(jx, jy, jw, jh, 8); ctx.fill();
      ctx.strokeStyle = "#E8A33D";
      ctx.lineWidth = 3;
      roundRect(jx + 2, jy + 2, jw - 4, jh - 4, 7); ctx.stroke();
      const jGlow = 0.45 + Math.sin(t / 220) * 0.4;
      ctx.fillStyle = "#2A1840";
      roundRect(jx + 6, jy + 6, jw - 12, 16, 4); ctx.fill();
      ctx.fillStyle = `rgba(255,210,90,${0.55 + jGlow * 0.45})`;
      ctx.font = "800 9px ui-rounded, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("JACKPOT", jx + jw / 2, jy + 17);
      ctx.fillStyle = "#1A1028";
      roundRect(jx + 10, jy + 28, jw - 20, 36, 5); ctx.fill();
      ["🍒", "7️⃣", "🐾"].forEach((sym, i) => {
        ctx.fillStyle = "#FBF0DE";
        roundRect(jx + 14 + i * 18, jy + 32, 15, 28, 3); ctx.fill();
        ctx.font = "12px ui-rounded, sans-serif";
        ctx.fillText(sym, jx + 21 + i * 18, jy + 51);
      });
      ctx.fillStyle = `rgba(232,163,61,${0.4 + jGlow * 0.4})`;
      roundRect(jx + 14, jy + 70, jw - 28, 12, 3); ctx.fill();
      ctx.fillStyle = "#FBF0DE";
      ctx.font = "800 9px ui-rounded, sans-serif";
      ctx.fillText("$20 SPIN", jx + jw / 2, jy + 80);

      /* ---- Right wall: bigger Paws Sprint ---- */
      const sr = sprintRect(HOUSE);
      const sx = sr.x, sy = sr.y, sw = sr.w, sh = sr.h;
      ctx.fillStyle = "rgba(26,21,36,0.28)";
      roundRect(sx + 4, sy + sh - 6, sw - 8, 10, 3); ctx.fill();
      ctx.fillStyle = "#E07A2F";
      roundRect(sx, sy, sw, sh, 8); ctx.fill();
      for (let row = 0; row < 12; row++) {
        ctx.fillStyle = row % 2 === 0 ? "#1A1524" : "#FBF0DE";
        ctx.fillRect(sx + 3, sy + 5 + row * 7, 6, 7);
        ctx.fillStyle = row % 2 === 0 ? "#FBF0DE" : "#1A1524";
        ctx.fillRect(sx + sw - 9, sy + 5 + row * 7, 6, 7);
      }
      const sGlow = 0.4 + Math.sin(t / 240) * 0.35;
      ctx.fillStyle = "#8C3A12";
      roundRect(sx + 10, sy + 6, sw - 20, 18, 4); ctx.fill();
      ctx.fillStyle = `rgba(255,240,200,${0.6 + sGlow * 0.4})`;
      ctx.font = "800 7px ui-rounded, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("PAWS SPRINT", sx + sw / 2, sy + 14);
      ctx.font = "800 8px ui-rounded, sans-serif";
      ctx.fillText("🐾 200M", sx + sw / 2, sy + 23);
      ctx.fillStyle = "#C9A574";
      roundRect(sx + 12, sy + 30, sw - 24, 36, 4); ctx.fill();
      for (let lane = 0; lane < 3; lane++) {
        const ly = sy + 34 + lane * 10;
        ctx.strokeStyle = "rgba(255,255,255,0.55)";
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(sx + 14, ly + 8); ctx.lineTo(sx + sw - 14, ly + 8); ctx.stroke();
        const colors = ["#7B5EA7", "#D9705C", "#5A7FB0"];
        const bob = Math.sin(t / 180 + lane) * 1.5;
        ctx.fillStyle = colors[lane];
        ctx.beginPath();
        ctx.ellipse(sx + 20 + ((t / 40 + lane * 14) % 30), ly + 3 + bob, 5, 3.5, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = "#FBF0DE";
      ctx.font = "800 9px ui-rounded, sans-serif";
      ctx.fillText("RACE!", sx + sw / 2, sy + sh - 10);

      /* ---- Side décor: speaker stacks + plant stools ---- */
      [[HOUSE.x + 30, HOUSE.y + 210, "#2A1840"], [HOUSE.x + HOUSE.w - 52, HOUSE.y + 210, "#2A1840"]].forEach(([bx, by, col], i) => {
        ctx.fillStyle = col;
        roundRect(bx, by, 28, 40, 4); ctx.fill();
        ctx.fillStyle = `rgba(232,163,61,${0.3 + Math.sin(t / 180 + i) * 0.2})`;
        ctx.beginPath(); ctx.arc(bx + 14, by + 14, 7, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(bx + 14, by + 30, 5, 0, Math.PI * 2); ctx.fill();
      });
      // Coin sparkles near cabinets
      for (let i = 0; i < 5; i++) {
        const ax = HOUSE.x + 140 + i * 130;
        const ay = HOUSE.y + 250 + Math.sin(t / 200 + i) * 4;
        ctx.fillStyle = `rgba(232,163,61,${0.25 + (Math.sin(t / 160 + i) + 1) * 0.2})`;
        ctx.beginPath(); ctx.arc(ax, ay, 2.2, 0, Math.PI * 2); ctx.fill();
      }

      // Cashier stands behind the counter (clear of overlays)
      drawBuildingPatron(cx + 8, ctr.y + 6, "#8C5A34", "#4A2C6E", "#111111", Math.sin(t / 500) * 1);
      drawNpcNameTag(cx + 8, ctr.y - 14, "Pixel");
      drawBuildingPatron(HOUSE.x + 120, HOUSE.y + 378, "#F7D9B6", "#7B5EA7", "#111111", Math.sin(t / 350) * 2);
      drawNpcNameTag(HOUSE.x + 120, HOUSE.y + 354, "Pip");
      drawBuildingPatron(HOUSE.x + 250, HOUSE.y + 372, "#D9A066", "#D9705C", "#6B4423", Math.sin(t / 380) * 2);
      drawNpcNameTag(HOUSE.x + 250, HOUSE.y + 348, "Theo");
      drawBuildingPatron(HOUSE.x + 590, HOUSE.y + 376, "#F0C08A", "#D98F2B", "#3A2417", Math.sin(t / 410) * 1.8);
      drawNpcNameTag(HOUSE.x + 590, HOUSE.y + 352, "Sam");

      tickArcade(ctx, api, t, cx, cy);
    },
  });

  // Public API (optional host hook, mirrors PawsCafeCook)
  global.PawsArcade = {
    openPixelQuest: openPixelQuest,
    openJackpot: openJackpot,
    openPawsSprint: openPawsSprint,
    close: closeHostModal,
  };
})(typeof window !== "undefined" ? window : globalThis);
