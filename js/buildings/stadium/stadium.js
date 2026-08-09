/**
 * stadium building module — F1 Grand Prix Pit Lounge + winding circuit race.
 * Edit icon / colors / interior / race here without touching other buildings.
 *
 * Hooks into the host via capture-phase E / prompt / banner clicks (same pattern
 * as arcade), modal DOM (#modal-backdrop / #modal-body), shared api.state +
 * localStorage save. Location BGM pauses town/building ambience via PawsAudio.
 */
(function (global) {
  const B = window.PawsBuildings;
  const SAVE_KEY = "pawPrintsDemoSave_v3";

  const RACE_ENERGY = 15;
  const LAPS_TOTAL = 3;
  const RACE_W = 780;
  const RACE_H = 440;
  const GRASS_SPEED_MUL = 0.7; // AI only — player is rail-locked
  const MAX_LATERAL = 28; // stay on asphalt (px from centerline)
  const LATERAL_STEER = 110;
  const FR_BASE = "js/buildings/stadium/runtime/";
  const REWARDS = {
    1: { money: 50, happy: 10 },
    2: { money: 25, happy: 5 },
    3: { money: 10, happy: 0 },
  };

  const keys = { up: false, down: false, left: false, right: false, run: false, drift: false, space: false };
  const KEY_MAP = {
    ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right",
    w: "up", s: "down", a: "left", d: "right",
    W: "up", S: "down", A: "left", D: "right",
  };

  let stadiumActive = false;
  let lastApi = null;
  let lastDrawT = 0;
  let modalOpen = false;
  let raceActive = false;
  let raceCleanup = null;
  let spaceEdge = false;
  let eEdge = false;

  const STAD_CSS = `
.f1-wrap{ display:flex; flex-direction:column; gap:0.55rem; }
.f1-canvas-wrap{ border-radius:12px; overflow:hidden; border:2px solid rgba(58,44,34,0.2); background:#1A1A1E; }
#f1-canvas{ display:block; width:100%; height:auto; image-rendering:pixelated; }
.f1-hudline{ display:flex; flex-wrap:wrap; gap:0.5rem 1rem; font-size:0.82rem; color:var(--ink-soft,#6E5C49); }
.f1-hudline b{ color:var(--ink,#3A2C22); }
.f1-drs{ color:#C0483E; font-weight:800; letter-spacing:0.04em; }
.f1-pit{ color:#D98F2B; font-weight:800; }
`.trim();

  function ensureStyles() {
    if (document.getElementById("paws-stadium-css")) return;
    const style = document.createElement("style");
    style.id = "paws-stadium-css";
    style.textContent = STAD_CSS;
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

  /* ---------- Stadium Audio Manager ----------
   * WebAudio-first via host PawsEnsureAudio (same unlock as footsteps / Enable Sound).
   * Hub funk bed on enter; eurobeat race loop @ ~150 BPM + live engine RPM.
   */
  const HUB_BGM_VOLUME = 0.22;
  const RACE_BGM_VOLUME = 0.18; // soft ambient bed — stays under gameplay

  const StadiumAudio = (function () {
    let wantsHub = false;
    let wantsRace = false;
    let raceMusicAllowed = false; // true only after Mario Kart–style GO!
    let townPaused = false;
    let hubTimer = null;
    let raceTimer = null;
    let engine = null; // { osc, osc2, gain, ac }
    let hostBtnBound = false;

    function safe(fn) {
      try { return fn(); } catch (e) { return undefined; }
    }

    function getAc() {
      return safe(() => (typeof window.PawsEnsureAudio === "function" ? window.PawsEnsureAudio() : null)) || null;
    }

    function withAc(fn) {
      const ac = getAc();
      if (!ac) return false;
      const go = () => {
        if (ac.state !== "running") return false;
        safe(() => fn(ac));
        return true;
      };
      if (go()) return true;
      safe(() => {
        const p = ac.resume();
        if (p && typeof p.then === "function") {
          p.then(() => {
            if (ac.state === "running") {
              // Keep context alive after gesture unlock
              safe(() => {
                const o = ac.createOscillator();
                const g = ac.createGain();
                g.gain.value = 0.00001;
                o.connect(g);
                g.connect(ac.destination);
                o.start();
                o.stop(ac.currentTime + 0.03);
              });
              safe(() => fn(ac));
            }
          }).catch(() => {});
        }
      });
      return ac.state === "running";
    }

    function beep(freq, dur, type, vol, delay) {
      return withAc((ac) => {
        const t0 = ac.currentTime + (delay || 0);
        const osc = ac.createOscillator();
        const gain = ac.createGain();
        osc.type = type || "square";
        osc.frequency.setValueAtTime(freq, t0);
        const v = vol != null ? vol : 0.2;
        gain.gain.setValueAtTime(0, t0);
        gain.gain.linearRampToValueAtTime(v, t0 + 0.008);
        gain.gain.exponentialRampToValueAtTime(0.0001, t0 + Math.max(dur, 0.03));
        osc.connect(gain);
        gain.connect(ac.destination);
        osc.start(t0);
        osc.stop(t0 + dur + 0.03);
      });
    }

    function noise(dur, vol) {
      return withAc((ac) => {
        const n = Math.max(1, Math.floor(ac.sampleRate * dur));
        const buf = ac.createBuffer(1, n, ac.sampleRate);
        const data = buf.getChannelData(0);
        const v = vol != null ? vol : 0.1;
        for (let i = 0; i < n; i++) data[i] = (Math.random() * 2 - 1) * v * (1 - i / n);
        const src = ac.createBufferSource();
        src.buffer = buf;
        src.connect(ac.destination);
        src.start();
      });
    }

    function isBgmPlaying() {
      return !!(hubTimer || raceTimer || (engine && engine.gain));
    }

    function isArmed() {
      const ac = getAc();
      return !!(ac && ac.state === "running");
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
        if (window.PawsArcadeAudio && window.PawsArcadeAudio.isBgmPlaying && window.PawsArcadeAudio.isBgmPlaying()) return;
        if (window.PawsAudio && typeof window.PawsAudio.resumeTownBgm === "function") {
          window.PawsAudio.resumeTownBgm();
        }
      });
    }

    function bindHostSoundButton() {
      if (hostBtnBound) return;
      const btn = document.getElementById("btn-sound");
      if (!btn) return;
      hostBtnBound = true;
      btn.addEventListener("click", () => unlock());
    }

    function stopHub() {
      if (hubTimer) { clearInterval(hubTimer); hubTimer = null; }
    }

    function stopRace() {
      if (raceTimer) { clearInterval(raceTimer); raceTimer = null; }
    }

    function stopEngine() {
      if (!engine) return;
      safe(() => {
        try { engine.osc.stop(0); } catch (e) { /* ignore */ }
        try { engine.osc2.stop(0); } catch (e) { /* ignore */ }
        try { if (engine.osc3) engine.osc3.stop(0); } catch (e) { /* ignore */ }
        try { engine.gain.disconnect(); } catch (e) { /* ignore */ }
      });
      engine = null;
    }

    /** Pit-lounge bed: soft chill pulse (quieter, less busy) */
    function startHubNow() {
      stopHub();
      stopRace();
      stopEngine();
      const bass = [110, 110, 130.81, 98];
      const pad = [220, 246.94, 196, 174.61];
      let step = 0;
      const tick = () => {
        if (!wantsHub || wantsRace) return;
        if (!withAc(() => {})) return;
        const mul = HUB_BGM_VOLUME / 0.22;
        if (step % 2 === 0) beep(bass[(step / 2) % bass.length], 0.28, "triangle", 0.045 * mul);
        if (step % 4 === 0) beep(pad[(step / 4) % pad.length], 0.4, "sine", 0.03 * mul, 0.02);
        if (step % 8 === 0) noise(0.04, 0.012 * mul);
        step++;
      };
      const ok = withAc(() => {});
      if (!ok) return false;
      pauseTownBgm();
      tick();
      hubTimer = setInterval(tick, 280);
      return true;
    }

    /** Soft ambient race bed — gentle pulse under gameplay (not eurobeat) */
    function startRaceNow() {
      if (raceTimer) return true;
      if (!raceMusicAllowed) return false;
      const pad = [196, 220, 246.94, 220];
      const bass = [98, 98, 110, 98];
      let step = 0;
      const tick = () => {
        if (!wantsRace || !raceMusicAllowed) return;
        const ac = getAc();
        if (!ac || ac.state !== "running") {
          safe(() => { if (ac) ac.resume().catch(() => {}); });
          return;
        }
        const mul = RACE_BGM_VOLUME / 0.18;
        // Soft kick every other step
        if (step % 2 === 0) beep(bass[(step / 2) % bass.length], 0.14, "sine", 0.055 * mul);
        // Airy pad, sparse
        if (step % 4 === 0) {
          const p = pad[(step / 4) % pad.length];
          beep(p, 0.45, "sine", 0.028 * mul);
          beep(p * 1.5, 0.4, "triangle", 0.016 * mul, 0.03);
        }
        // Very light hat once per bar
        if (step % 8 === 4) noise(0.03, 0.018 * mul);
        step++;
      };
      const ok = withAc(() => {});
      if (!ok) return false;
      stopHub();
      pauseTownBgm();
      tick();
      raceTimer = setInterval(tick, 220);
      return true;
    }

    /** Continuous engine removed — too distracting. Boost uses short whoosh only. */
    function startEngine() { /* no continuous engine */ return false; }

    function setEngineSpeed(_speed, _maxSpeed) { /* no continuous engine */ }

    /**
     * Short boost whoosh (air rush + rising tone). Used for DRS / mini-turbo only.
     * kind: "drs" | "turbo"
     */
    function boostWhoosh(kind) {
      return withAc((ac) => {
        const t0 = ac.currentTime;
        const dur = kind === "drs" ? 0.55 : 0.32;
        const n = Math.max(1, Math.floor(ac.sampleRate * dur));
        const buf = ac.createBuffer(1, n, ac.sampleRate);
        const data = buf.getChannelData(0);
        for (let i = 0; i < n; i++) {
          const env = Math.sin((i / n) * Math.PI); // fade in/out
          data[i] = (Math.random() * 2 - 1) * env;
        }
        const src = ac.createBufferSource();
        src.buffer = buf;
        const filter = ac.createBiquadFilter();
        filter.type = "bandpass";
        filter.Q.value = 0.9;
        filter.frequency.setValueAtTime(400, t0);
        filter.frequency.exponentialRampToValueAtTime(kind === "drs" ? 2400 : 1800, t0 + dur * 0.7);
        const gain = ac.createGain();
        const peak = kind === "drs" ? 0.16 : 0.13;
        gain.gain.setValueAtTime(0.0001, t0);
        gain.gain.linearRampToValueAtTime(peak, t0 + 0.04);
        gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
        src.connect(filter);
        filter.connect(gain);
        gain.connect(ac.destination);
        src.start(t0);
        src.stop(t0 + dur + 0.02);

        // Soft rising "rev blip" on top (not a loop)
        const osc = ac.createOscillator();
        const og = ac.createGain();
        osc.type = "sawtooth";
        osc.frequency.setValueAtTime(kind === "drs" ? 180 : 220, t0);
        osc.frequency.exponentialRampToValueAtTime(kind === "drs" ? 520 : 480, t0 + dur * 0.65);
        og.gain.setValueAtTime(0.0001, t0);
        og.gain.linearRampToValueAtTime(kind === "drs" ? 0.08 : 0.07, t0 + 0.03);
        og.gain.exponentialRampToValueAtTime(0.0001, t0 + dur * 0.85);
        osc.connect(og);
        og.connect(ac.destination);
        osc.start(t0);
        osc.stop(t0 + dur);
      });
    }

    function playHubBgm() {
      wantsHub = true;
      wantsRace = false;
      bindHostSoundButton();
      safe(() => { if (typeof window.PawsEnsureAudio === "function") window.PawsEnsureAudio(); });
      if (!startHubNow()) {
        // Retry a few times as AC resumes from walking keys
        let tries = 0;
        const iv = setInterval(() => {
          tries++;
          if (!wantsHub || wantsRace || startHubNow() || tries > 20) clearInterval(iv);
        }, 150);
      }
    }

    function unlock() {
      bindHostSoundButton();
      safe(() => { if (typeof window.PawsEnsureAudio === "function") window.PawsEnsureAudio(); });
      withAc((ac) => { safe(() => ac.resume()); });
      if (wantsRace && raceMusicAllowed) {
        if (!startRaceNow()) {
          let tries = 0;
          const iv = setInterval(() => {
            tries++;
            if (!wantsRace || !raceMusicAllowed || startRaceNow() || tries > 30) clearInterval(iv);
          }, 120);
        }
      } else if (wantsHub && !wantsRace) {
        startHubNow();
      }
    }

    function armFromGesture() {
      unlock();
    }

    function beginRaceStart() {
      wantsRace = true;
      wantsHub = false;
      raceMusicAllowed = false; // silence until GO!
      stopHub();
      stopRace();
      stopEngine();
      pauseTownBgm();
      bindHostSoundButton();
      safe(() => { if (typeof window.PawsEnsureAudio === "function") window.PawsEnsureAudio(); });
      withAc((ac) => { safe(() => ac.resume()); });
    }

    /** Mario Kart–style count beep: same clear pip for 3 / 2 / 1 */
    function countdownBeep(_n) {
      // Classic traffic-light "bip" (C5 + soft octave)
      beep(523.25, 0.16, "square", 0.3);
      beep(1046.5, 0.08, "triangle", 0.12, 0.02);
    }

    /** Mario Kart–style GO!: brighter rising fanfare */
    function go() {
      beep(659.25, 0.1, "square", 0.28);           // E5
      beep(783.99, 0.1, "square", 0.28, 0.07);      // G5
      beep(1046.5, 0.38, "square", 0.32, 0.14);     // C6 held
      beep(1318.5, 0.3, "triangle", 0.18, 0.18);    // E6 sparkle
      noise(0.06, 0.05);
    }

    function beginRaceMusic() {
      wantsRace = true;
      wantsHub = false;
      raceMusicAllowed = true;
      unlock();
      if (!startRaceNow()) {
        let tries = 0;
        const iv = setInterval(() => {
          tries++;
          if (!wantsRace || startRaceNow() || tries > 40) clearInterval(iv);
        }, 100);
      }
    }

    function endRace(opts) {
      opts = opts || {};
      wantsRace = false;
      raceMusicAllowed = false;
      stopRace();
      stopEngine();
      if (opts.fanfare) {
        [523, 659, 784, 1047, 1319].forEach((f, i) => beep(f, 0.14, "triangle", 0.24, i * 0.08));
      } else {
        [392, 523, 659].forEach((f, i) => beep(f, 0.11, "triangle", 0.18, i * 0.07));
      }
      if (opts.resumeHub && stadiumActive) playHubBgm();
    }

    function stopAll(_immediate, resumeTown) {
      wantsHub = false;
      wantsRace = false;
      raceMusicAllowed = false;
      stopHub();
      stopRace();
      stopEngine();
      if (resumeTown) resumeTownBgm();
    }

    function drs() {
      // Space DRS: air-rush whoosh (boost vroom only on speed-up)
      boostWhoosh("drs");
      beep(880, 0.06, "triangle", 0.12, 0.02);
      beep(1180, 0.08, "triangle", 0.1, 0.08);
    }

    function turbo() {
      // Mini-turbo: shorter punchy whoosh
      boostWhoosh("turbo");
      beep(640, 0.06, "square", 0.12);
      beep(860, 0.08, "triangle", 0.1, 0.04);
    }

    function pit() {
      beep(330, 0.08, "square", 0.2);
      beep(440, 0.1, "square", 0.2, 0.1);
    }

    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", bindHostSoundButton);
    } else {
      bindHostSoundButton();
    }
    setTimeout(bindHostSoundButton, 400);

    return {
      unlock,
      armFromGesture,
      isArmed,
      isBgmPlaying,
      playHubBgm,
      stopAll,
      beginRaceStart,
      beginRaceMusic,
      endRace,
      countdownBeep,
      go,
      setEngineSpeed,
      stopEngine,
      drs,
      turbo,
      pit,
      syncSoundPrompt() { /* no UI */ },
    };
  })();

  global.PawsStadiumAudio = StadiumAudio;

  // Any gameplay gesture while inside stadium keeps AudioContext running + BGM alive
  ["pointerdown", "keydown", "mousedown", "touchstart"].forEach((ev) => {
    window.addEventListener(ev, () => {
      if (stadiumActive || modalOpen || raceActive) StadiumAudio.armFromGesture();
    }, true);
  });

  /* ---------- Free Racer track (asset pack) ---------- */
  let TRACK = null;
  let DRS_SEGS = [];
  let frAssets = null; // { meta, trackImg, mask, cars }

  function buildTrack(pts) {
    const segs = [];
    let total = 0;
    const closed = pts.length > 1 && pts[0].x === pts[pts.length - 1].x && pts[0].y === pts[pts.length - 1].y
      ? pts.slice(0, -1)
      : pts.slice();
    for (let i = 0; i < closed.length; i++) {
      const a = closed[i];
      const b = closed[(i + 1) % closed.length];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len = Math.hypot(dx, dy) || 1;
      segs.push({
        i, a, b, dx, dy, len,
        nx: -dy / len, ny: dx / len,
        ang: Math.atan2(dy, dx),
        s0: total,
      });
      total += len;
    }
    return { pts: closed, segs, total };
  }

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Failed to load " + src));
      img.src = src;
    });
  }

  function sampleMaskLuma(img) {
    const c = document.createElement("canvas");
    c.width = img.width;
    c.height = img.height;
    const ctx = c.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(img, 0, 0);
    const data = ctx.getImageData(0, 0, c.width, c.height).data;
    const luma = new Uint8Array(c.width * c.height);
    for (let i = 0, p = 0; i < luma.length; i++, p += 4) luma[i] = data[p];
    return { w: c.width, h: c.height, luma };
  }

  async function ensureFreeRacerAssets() {
    if (frAssets && TRACK) return frAssets;
    const meta = await fetch(FR_BASE + "track_meta.json").then((r) => {
      if (!r.ok) throw new Error("track_meta.json missing");
      return r.json();
    });
    const [trackImg, maskImg, hero, n1, n2, n3] = await Promise.all([
      loadImage(FR_BASE + "track_play.png"),
      loadImage(FR_BASE + "track_mask.png"),
      loadImage(FR_BASE + "Hero_Car.png"),
      loadImage(FR_BASE + "NPC_Car_1.png"),
      loadImage(FR_BASE + "NPC_Car_2.png"),
      loadImage(FR_BASE + "NPC_Car_3.png"),
    ]);
    const mask = sampleMaskLuma(maskImg);
    TRACK = buildTrack(meta.path || []);
    // Bottom main straight ≈ DRS (nearly horizontal, high Y)
    DRS_SEGS = [];
    TRACK.segs.forEach((s, i) => {
      if (s.a.y > TRACK.pts[0].y - 30 && s.b.y > TRACK.pts[0].y - 30 && Math.abs(Math.sin(s.ang)) < 0.35) {
        DRS_SEGS.push(i);
      }
    });
    if (!DRS_SEGS.length) {
      for (let i = 0; i < Math.min(18, TRACK.segs.length); i++) DRS_SEGS.push(i);
    }
    frAssets = {
      meta,
      trackImg,
      mask,
      cars: { hero, npc: [n1, n2, n3] },
      worldW: meta.worldW || trackImg.width,
      worldH: meta.worldH || trackImg.height,
      start: meta.start || { x: TRACK.pts[0].x, y: TRACK.pts[0].y, angle: 0 },
    };
    return frAssets;
  }

  function isOnAsphalt(x, y) {
    if (!frAssets) return true;
    const m = frAssets.mask;
    const ix = x | 0;
    const iy = y | 0;
    if (ix < 0 || iy < 0 || ix >= m.w || iy >= m.h) return false;
    return m.luma[iy * m.w + ix] > 160;
  }

  function projectOnTrack(x, y) {
    if (!TRACK) return null;
    let best = null;
    for (let i = 0; i < TRACK.segs.length; i++) {
      const s = TRACK.segs[i];
      let t = ((x - s.a.x) * s.dx + (y - s.a.y) * s.dy) / (s.len * s.len);
      t = Math.max(0, Math.min(1, t));
      const px = s.a.x + s.dx * t;
      const py = s.a.y + s.dy * t;
      const dist = Math.hypot(x - px, y - py);
      if (!best || dist < best.dist) {
        best = {
          seg: i,
          t,
          px, py,
          dist,
          s: s.s0 + t * s.len,
          ang: s.ang,
          nx: s.nx, ny: s.ny,
          lateral: (x - px) * s.nx + (y - py) * s.ny,
        };
      }
    }
    return best;
  }

  function pointAtS(sIn) {
    let s = ((sIn % TRACK.total) + TRACK.total) % TRACK.total;
    for (let i = 0; i < TRACK.segs.length; i++) {
      const seg = TRACK.segs[i];
      if (s <= seg.s0 + seg.len || i === TRACK.segs.length - 1) {
        const t = Math.max(0, Math.min(1, (s - seg.s0) / seg.len));
        return {
          x: seg.a.x + seg.dx * t,
          y: seg.a.y + seg.dy * t,
          ang: seg.ang,
          nx: seg.nx,
          ny: seg.ny,
          seg: i,
        };
      }
    }
    const last = TRACK.segs[0];
    return { x: last.a.x, y: last.a.y, ang: last.ang, nx: last.nx, ny: last.ny, seg: 0 };
  }

  function poseAt(sIn, lateral) {
    const p = pointAtS(sIn);
    return {
      x: p.x + p.nx * lateral,
      y: p.y + p.ny * lateral,
      ang: p.ang,
      nx: p.nx,
      ny: p.ny,
      seg: p.seg,
    };
  }

  function progressDelta(prevS, nextS) {
    let d = nextS - prevS;
    if (d > TRACK.total * 0.5) d -= TRACK.total;
    if (d < -TRACK.total * 0.5) d += TRACK.total;
    return d;
  }

  function wrapAngle(a) {
    while (a > Math.PI) a -= Math.PI * 2;
    while (a < -Math.PI) a += Math.PI * 2;
    return a;
  }

  /* ---------- Modal helpers ---------- */
  function openHostModal(html) {
    ensureStyles();
    const backdrop = document.getElementById("modal-backdrop");
    const body = document.getElementById("modal-body");
    if (!backdrop || !body) return null;
    if (raceCleanup) {
      try { raceCleanup(); } catch (e) { /* ignore */ }
      raceCleanup = null;
    }
    raceActive = false;
    body.innerHTML = html;
    backdrop.classList.add("open");
    modalOpen = true;
    return body;
  }

  function closeHostModal() {
    if (raceCleanup) {
      try { raceCleanup(); } catch (e) { /* ignore */ }
      raceCleanup = null;
    }
    raceActive = false;
    modalOpen = false;
    const backdrop = document.getElementById("modal-backdrop");
    const body = document.getElementById("modal-body");
    if (body) body.innerHTML = "";
    if (backdrop) backdrop.classList.remove("open");
    // Stop race loop; restore hub BGM inside stadium, else town
    if (stadiumActive) StadiumAudio.endRace({ resumeHub: true });
    else StadiumAudio.stopAll(false, true);
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

  /* ================================================================
   * Free Racer Grand Prix Minigame
   * ================================================================ */
  async function openGrandPrix() {
    const state = lastApi && lastApi.state;
    if (!state) return;

    StadiumAudio.unlock();

    if (state.energy < RACE_ENERGY) {
      openHostModal(`
        <h3>Grand Prix Circuit</h3>
        <div class="flavor-box">You're too tired to race right now. Head home and sleep to restore energy.</div>
        <div class="action-row" style="margin-top:0.9rem">
          <button class="action-btn" id="f1-tired-ok">Okay</button>
        </div>`);
      const b = document.getElementById("f1-tired-ok");
      if (b) b.addEventListener("click", closeHostModal);
      return;
    }

    openHostModal(`
      <div class="f1-wrap">
        <h3>Grand Prix Circuit</h3>
        <div class="flavor-box">Loading Free Racer track…</div>
      </div>`);

    let assets;
    try {
      assets = await ensureFreeRacerAssets();
    } catch (err) {
      openHostModal(`
        <h3>Grand Prix Circuit</h3>
        <div class="flavor-box">Could not load Free Racer assets. Check <code>js/buildings/stadium/runtime/</code>.</div>
        <div class="action-row" style="margin-top:0.9rem">
          <button class="action-btn" id="f1-tired-ok">Okay</button>
        </div>`);
      const b = document.getElementById("f1-tired-ok");
      if (b) b.addEventListener("click", closeHostModal);
      return;
    }

    state.energy = Math.max(0, state.energy - RACE_ENERGY);
    persist(state);

    const hasDog = playerHasDog(state) === true;
    const dog = activeDog(state);
    const dogName = (dog && dog.name) || "Pup";

    StadiumAudio.beginRaceStart();

    openHostModal(`
      <div class="f1-wrap">
        <h3>Grand Prix Circuit</h3>
        <p class="modal-sub">3 laps · W/S speed · A/D lane · Hold Shift to charge turbo, release to boost · Space DRS on the main straight · E×2 pit on lap 2${hasDog ? " · Dog copilot ready" : ""}</p>
        <div class="f1-hudline">
          <span>Entry <b>−${RACE_ENERGY} Energy</b></span>
          <span>Podium: <b>$50 / $25 / $10</b></span>
          <span id="f1-status" class="f1-drs"></span>
        </div>
        <div class="f1-canvas-wrap">
          <canvas id="f1-canvas" width="${RACE_W}" height="${RACE_H}"></canvas>
        </div>
        <div class="hint">On-rail driving · Hold Shift (charge bar), release for mini-turbo whoosh · Space = DRS on the straight</div>
      </div>`);
    startGrandPrix(state, hasDog, dogName, dog, assets);
  }

  function startGrandPrix(state, hasDog, dogName, dog, assets) {
    const canvas = document.getElementById("f1-canvas");
    if (!canvas || !assets || !TRACK) return;
    const c2 = canvas.getContext("2d");
    const statusEl = document.getElementById("f1-status");
    const worldW = assets.worldW;
    const worldH = assets.worldH;
    const trackImg = assets.trackImg;
    const heroImg = assets.cars.hero;
    const npcImgs = assets.cars.npc;

    raceActive = true;
    spaceEdge = false;
    eEdge = false;

    const dogColor = (dog && (dog.color || dog.coat)) || "#C9A574";
    const startAng = (assets.start && assets.start.angle != null) ? assets.start.angle : 0;

    function makeRailCar(sprite, sOffset, lateral, opts) {
      opts = opts || {};
      const p = poseAt(sOffset, lateral);
      return {
        sprite,
        x: p.x,
        y: p.y,
        angle: p.ang,
        speed: 0,
        s: sOffset,
        lastS: sOffset,
        progress: 0,
        lateral,
        targetLateral: lateral,
        boostUntil: 0,
        drsUntil: 0,
        driftCharge: 0,
        drifting: false,
        onGrass: false,
        ai: true,
        // Pace vs player cruise (~215): rival slightly hotter, closer second
        aiSpeed: opts.aiSpeed != null ? opts.aiSpeed : 1.02,
        aggression: opts.aggression != null ? opts.aggression : 0.7,
        skill: opts.skill != null ? opts.skill : 0.75,
        name: opts.name || "Rival",
        pitDone: false,
        tireGrip: 1,
        _laneTimer: 0.4 + Math.random() * 0.6,
        _boostCd: 1.5 + Math.random(),
        _drsCd: 0,
        _blockLat: lateral,
      };
    }

    const startS = 12;
    const startPose = poseAt(startS, 0);
    const player = {
      sprite: heroImg,
      x: startPose.x,
      y: startPose.y,
      angle: startPose.ang || startAng,
      speed: 0,
      s: startS,
      lastS: startS,
      progress: 0,
      lateral: 0,
      targetLateral: 0,
      boostUntil: 0,
      drsUntil: 0,
      driftCharge: 0,
      drifting: false,
      onGrass: false,
      ai: false,
      pitDone: false,
      tireGrip: 1,
    };
    // Pack start — close grid so the fight starts immediately
    const ai1 = makeRailCar(npcImgs[0], startS - 28, -14, {
      name: "Blitz",
      aiSpeed: 1.06,
      aggression: 0.95,
      skill: 0.88,
    });
    const ai2 = makeRailCar(npcImgs[1], startS - 52, 14, {
      name: "Nova",
      aiSpeed: 1.01,
      aggression: 0.7,
      skill: 0.8,
    });
    const cars = [player, ai1, ai2];

    let phase = "countdown";
    let countdown = 3;
    let raceEnded = false;
    let raf = null;
    let last = null;
    let pitTaps = 0;
    let pitTimer = 0;
    let pitBonus = false;
    let drsReady = false;
    let statusFlash = "";
    let statusFlashUntil = 0;
    let raceMusicStarted = false;
    let camX = player.x - RACE_W / 2;
    let camY = player.y - RACE_H / 2;

    // Mario Kart–style: 3 · 2 · 1 · GO! (~1s each), music starts on GO
    let goHoldTimer = null;
    let shiftWasDown = false;
    StadiumAudio.countdownBeep(3);
    const countdownTimer = setInterval(() => {
      countdown--;
      if (countdown > 0) {
        StadiumAudio.countdownBeep(countdown);
      } else {
        clearInterval(countdownTimer);
        countdown = 0;
        StadiumAudio.go();
        // Hold green lights + GO! briefly, then drop the flag
        goHoldTimer = setTimeout(() => {
          if (raceEnded) return;
          phase = "racing";
          if (!raceMusicStarted) {
            raceMusicStarted = true;
            StadiumAudio.beginRaceMusic();
          }
        }, 480);
      }
    }, 1000);

    function place() {
      const ranked = cars.slice().sort((a, b) => b.progress - a.progress);
      return ranked.indexOf(player) + 1;
    }

    function flashStatus(msg, ms) {
      statusFlash = msg;
      statusFlashUntil = performance.now() + (ms || 1200);
    }

    function applyRailPose(car, lean) {
      const pose = poseAt(car.s, car.lateral);
      car.x = pose.x;
      car.y = pose.y;
      car.angle = pose.ang + (lean || 0);
      car.onGrass = false; // rail-locked — never leave asphalt
      return pose;
    }

    function updatePlayer(dt, nowTs) {
      if (phase === "pit") return;

      const boosting = nowTs < player.boostUntil;
      const drsOpen = nowTs < player.drsUntil;

      let maxSpeed = 215 * player.tireGrip;
      if (boosting) maxSpeed = 295;
      if (drsOpen) maxSpeed = 345;

      // Speed only (W/S) — car advances along the track rail
      if (keys.up) player.speed = Math.min(maxSpeed, player.speed + 380 * dt);
      else if (keys.down) player.speed = Math.max(-40, player.speed - 440 * dt);
      else {
        if (player.speed > 0) player.speed = Math.max(0, player.speed - 90 * dt);
        else if (player.speed < 0) player.speed = Math.min(0, player.speed + 90 * dt);
      }
      if (player.speed > maxSpeed) player.speed += (maxSpeed - player.speed) * Math.min(1, 4 * dt);

      // Direction = lane offset (A/D). Clamped so you can't leave the track.
      if (keys.left) player.targetLateral -= LATERAL_STEER * dt;
      if (keys.right) player.targetLateral += LATERAL_STEER * dt;
      player.targetLateral = Math.max(-MAX_LATERAL, Math.min(MAX_LATERAL, player.targetLateral));
      const latDelta = player.targetLateral - player.lateral;
      const latStep = Math.sign(latDelta) * Math.min(Math.abs(latDelta), LATERAL_STEER * dt);
      player.lateral += latStep;
      player.lateral = Math.max(-MAX_LATERAL, Math.min(MAX_LATERAL, player.lateral));

      // Mini-turbo: hold Shift to charge, release (or full charge) to boost + whoosh
      function fireTurbo() {
        if (player.driftCharge < 0.22) {
          player.driftCharge = 0;
          return;
        }
        player.boostUntil = nowTs + 700 + player.driftCharge * 650;
        StadiumAudio.turbo();
        flashStatus("MINI-TURBO!", 800);
        player.driftCharge = 0;
        player.drifting = false;
      }
      const charging = keys.drift && Math.abs(player.speed) > 25;
      if (charging) {
        player.drifting = true;
        player.driftCharge = Math.min(1, player.driftCharge + dt * 1.55);
        player.speed *= (1 - 0.06 * dt);
        if (player.driftCharge >= 1) fireTurbo();
      } else {
        if (shiftWasDown && !keys.drift) fireTurbo();
        else if (!keys.drift) player.driftCharge = Math.max(0, player.driftCharge - dt * 1.6);
        player.drifting = false;
      }
      shiftWasDown = keys.drift;

      const advance = player.speed * dt;
      if (advance > 0) {
        player.s += advance;
        player.progress += advance;
      } else {
        player.s += advance;
      }
      while (player.s < 0) player.s += TRACK.total;
      while (player.s >= TRACK.total) player.s -= TRACK.total;
      player.lastS = player.s;

      const lean = latStep * 0.012;
      const pose = applyRailPose(player, lean);

      drsReady = phase === "racing" && DRS_SEGS.indexOf(pose.seg) >= 0 && !drsOpen && player.speed > 40;
      if (drsReady && spaceEdge) {
        player.drsUntil = nowTs + 1400;
        StadiumAudio.drs();
        flashStatus("DRS OPEN", 900);
        spaceEdge = false;
      }

      if (!player.pitDone && player.progress >= TRACK.total * 1) {
        player.pitDone = true;
        phase = "pit";
        pitTaps = 0;
        pitTimer = 1.0;
        pitBonus = false;
        player.speed = 0;
        StadiumAudio.pit();
        flashStatus("PIT STOP — TAP E ×2", 1500);
        if (statusEl) statusEl.textContent = "PIT STOP! Tap E twice";
      }
    }

    function updateAi(ai, dt, nowTs) {
      if (phase === "countdown") return;

      let speedMul = ai.aiSpeed;
      // Quick pit — rivals don't gift you the lead
      if (ai.pitDone === false && ai.progress >= TRACK.total * 1) {
        ai.pitDone = true;
        ai.boostUntil = nowTs;
        ai._pitWait = 0.55 + Math.random() * 0.25 * (1.1 - ai.skill);
      }
      if (ai._pitWait > 0) {
        ai._pitWait -= dt;
        speedMul *= 0.2;
        if (ai._pitWait <= 0) {
          ai.tireGrip = 1.1;
          ai.boostUntil = nowTs + 1100 + ai.aggression * 400;
        }
      }

      // Rubber band: stay in the fight with the player
      const gap = player.progress - ai.progress; // + = player ahead
      let band = 1;
      if (gap > 80) band = 1.08 + Math.min(0.22, (gap - 80) / 900);      // catch up
      else if (gap > 20) band = 1.03 + (gap - 20) / 1400;
      else if (gap < -180) band = 0.9;                                    // don't runaway forever
      else if (gap < -80) band = 0.95;

      // Racing line + defensive block when player is nearby
      const nearPlayer = Math.abs(gap) < 120;
      if (!ai._laneTimer || ai._laneTimer <= 0) {
        if (nearPlayer && ai.aggression > 0.6 && Math.random() < 0.55 + ai.aggression * 0.3) {
          // Mirror / squeeze toward player's lane
          ai.targetLateral = Math.max(-MAX_LATERAL, Math.min(MAX_LATERAL, player.lateral + (Math.random() - 0.5) * 8));
          ai._laneTimer = 0.55 + Math.random() * 0.7;
        } else {
          // Prefer inside on corners, outside on straights
          const lookAng = pointAtS(ai.s + 55).ang;
          const turn = Math.abs(wrapAngle(lookAng - ai.angle));
          if (turn > 0.35) ai.targetLateral = (Math.random() < 0.7 ? -1 : 1) * (10 + Math.random() * 12);
          else ai.targetLateral = (Math.random() - 0.5) * 36;
          ai.targetLateral = Math.max(-MAX_LATERAL, Math.min(MAX_LATERAL, ai.targetLateral));
          ai._laneTimer = 0.7 + Math.random() * 1.1;
        }
      } else {
        ai._laneTimer -= dt;
      }
      const latDelta = ai.targetLateral - ai.lateral;
      ai.lateral += Math.sign(latDelta) * Math.min(Math.abs(latDelta), (70 + ai.aggression * 40) * dt);
      ai.lateral = Math.max(-MAX_LATERAL, Math.min(MAX_LATERAL, ai.lateral));

      // Corners: skilled AI loses less speed
      const look = pointAtS(ai.s + 50);
      const turnAmt = Math.abs(wrapAngle(look.ang - ai.angle));
      const cornerFactor = 1 - Math.min(0.22, turnAmt * (0.55 - ai.skill * 0.25));

      // DRS on main straight
      ai._drsCd = Math.max(0, (ai._drsCd || 0) - dt);
      const onDrs = DRS_SEGS.indexOf(look.seg) >= 0 || DRS_SEGS.indexOf(pointAtS(ai.s).seg) >= 0;
      if (onDrs && ai._drsCd <= 0 && ai.speed > 90 && !(nowTs < ai.drsUntil)) {
        if (Math.random() < 0.35 + ai.aggression * 0.4) {
          ai.drsUntil = nowTs + 1200 + ai.skill * 300;
          ai._drsCd = 3.2 + Math.random() * 1.2;
        }
      }

      // Occasional mini-turbo bursts (especially when behind)
      ai._boostCd = Math.max(0, (ai._boostCd || 0) - dt);
      if (ai._boostCd <= 0 && ai.speed > 70 && !(nowTs < ai.boostUntil)) {
        const hungry = gap > 40 ? 0.25 : 0;
        if (Math.random() < 0.12 + ai.aggression * 0.15 + hungry) {
          ai.boostUntil = nowTs + 650 + ai.aggression * 350;
          ai._boostCd = 2.4 + Math.random() * 1.8 - hungry;
        }
      }

      const boosting = nowTs < ai.boostUntil;
      const drsOpen = nowTs < ai.drsUntil;
      let cruise = 225 * speedMul * ai.tireGrip * band * cornerFactor;
      if (boosting) cruise *= 1.28;
      if (drsOpen) cruise *= 1.38;
      // Late-race push
      if (player.progress > TRACK.total * 2) cruise *= 1.04 + ai.aggression * 0.04;

      ai.speed += (cruise - ai.speed) * Math.min(1, (2.6 + ai.skill) * dt);

      const advance = ai.speed * dt;
      ai.s += advance;
      while (ai.s < 0) ai.s += TRACK.total;
      while (ai.s >= TRACK.total) ai.s -= TRACK.total;
      ai.progress += Math.max(0, advance);
      ai.lastS = ai.s;

      const lean = latDelta * 0.01;
      const pose = poseAt(ai.s, ai.lateral);
      ai.x = pose.x;
      ai.y = pose.y;
      ai.angle = pose.ang + lean;
      ai.onGrass = false;
    }

    function updatePit(dt) {
      pitTimer -= dt;
      if (eEdge) {
        pitTaps++;
        eEdge = false;
        StadiumAudio.pit();
      }
      if (pitTaps >= 2) {
        pitBonus = pitTimer > 0;
        player.tireGrip = 1.12;
        if (pitBonus) {
          player.boostUntil = performance.now() + 1600;
          flashStatus("FRESH TIRES + BOOST!", 1200);
        } else {
          flashStatus("FRESH TIRES", 1000);
        }
        phase = "racing";
        if (statusEl) statusEl.textContent = "";
        return;
      }
      if (pitTimer < -1.2) {
        if (statusEl) statusEl.textContent = "PIT STOP! Tap E twice";
      }
    }

    function updateCamera(dt) {
      const tx = player.x - RACE_W / 2;
      const ty = player.y - RACE_H / 2;
      const k = Math.min(1, 8 * dt);
      camX += (tx - camX) * k;
      camY += (ty - camY) * k;
      camX = Math.max(0, Math.min(worldW - RACE_W, camX));
      camY = Math.max(0, Math.min(worldH - RACE_H, camY));
    }

    function drawWorld() {
      c2.clearRect(0, 0, RACE_W, RACE_H);
      c2.fillStyle = "#2A402A";
      c2.fillRect(0, 0, RACE_W, RACE_H);
      c2.drawImage(trackImg, -camX, -camY, worldW, worldH);

      // Soft start/finish marker
      const sf = TRACK.segs[0];
      c2.save();
      c2.translate(sf.a.x - camX, sf.a.y - camY);
      c2.rotate(sf.ang);
      for (let i = -4; i <= 4; i++) {
        c2.fillStyle = i % 2 === 0 ? "#1A1524" : "#FBF0DE";
        c2.fillRect(-3, i * 7 - 3, 6, 7);
      }
      c2.restore();
    }

    function drawCarSprite(car, isPlayer) {
      const img = car.sprite;
      if (!img) return;
      c2.save();
      c2.translate(car.x - camX, car.y - camY);
      // Sprites face up (nose toward -Y); world angle 0 is +X
      c2.rotate(car.angle + Math.PI / 2);
      const w = 42;
      const h = 52;
      c2.fillStyle = "rgba(0,0,0,0.28)";
      c2.beginPath();
      c2.ellipse(1, 4, w * 0.38, h * 0.18, 0, 0, Math.PI * 2);
      c2.fill();
      c2.drawImage(img, -w / 2, -h / 2, w, h);

      const nowTs = performance.now();
      if (nowTs < car.drsUntil || nowTs < car.boostUntil) {
        c2.fillStyle = nowTs < car.drsUntil ? "rgba(80,160,255,0.55)" : "rgba(232,163,61,0.5)";
        c2.beginPath();
        c2.moveTo(-6, 18);
        c2.lineTo(0, 30 + Math.random() * 6);
        c2.lineTo(6, 18);
        c2.closePath();
        c2.fill();
      }
      if (isPlayer && hasDog) {
        c2.fillStyle = dogColor;
        c2.beginPath();
        c2.ellipse(10, 4, 5, 4, 0, 0, Math.PI * 2);
        c2.fill();
        c2.fillStyle = "#C0483E";
        c2.beginPath();
        c2.arc(10, 1, 3.2, Math.PI, 0);
        c2.fill();
      }
      c2.restore();
    }

    function drawHud(nowTs) {
      c2.fillStyle = "rgba(20,18,24,0.78)";
      roundRectPath(c2, 10, 10, 178, hasDog ? 96 : 78, 10);
      c2.fill();
      c2.fillStyle = "#F5E9D3";
      c2.font = "700 14px ui-rounded, sans-serif";
      c2.textAlign = "left";
      const lap = Math.min(LAPS_TOTAL, Math.max(1, Math.floor(player.progress / TRACK.total) + 1));
      c2.fillText("Lap " + lap + " / " + LAPS_TOTAL, 20, 32);
      c2.fillText("Place " + place() + " / 3", 20, 52);
      c2.font = "600 11px ui-rounded, sans-serif";
      const laneLabel = player.lateral < -10 ? "Inner" : player.lateral > 10 ? "Outer" : "Center";
      c2.fillStyle = "#A8D4E8";
      c2.fillText("Lane: " + laneLabel + " · On rail", 20, 70);
      if (hasDog) {
        c2.fillStyle = "#D9A066";
        c2.fillText("Copilot: " + dogName, 20, 88);
      }

      if (player.driftCharge > 0.05) {
        c2.fillStyle = "rgba(20,18,24,0.7)";
        roundRectPath(c2, 10, RACE_H - 28, 120, 14, 6);
        c2.fill();
        c2.fillStyle = "#E8A33D";
        roundRectPath(c2, 12, RACE_H - 26, 116 * player.driftCharge, 10, 5);
        c2.fill();
      }

      if (drsReady && phase === "racing") {
        c2.fillStyle = "rgba(192,72,62,0.92)";
        roundRectPath(c2, RACE_W / 2 - 90, 14, 180, 28, 8);
        c2.fill();
        c2.fillStyle = "#fff";
        c2.font = "800 13px ui-rounded, sans-serif";
        c2.textAlign = "center";
        c2.fillText("DRS AVAILABLE — SPACE", RACE_W / 2, 33);
        if (statusEl) statusEl.textContent = "DRS AVAILABLE";
      } else if (nowTs < player.drsUntil) {
        if (statusEl) statusEl.textContent = "DRS OPEN";
      } else if (phase !== "pit" && statusEl && (!statusFlash || nowTs > statusFlashUntil)) {
        statusEl.textContent = "";
      }

      if (statusFlash && nowTs < statusFlashUntil) {
        c2.fillStyle = "rgba(20,18,24,0.55)";
        c2.fillRect(0, RACE_H / 2 - 30, RACE_W, 50);
        c2.fillStyle = "#FBF0DE";
        c2.font = "800 22px ui-rounded, sans-serif";
        c2.textAlign = "center";
        c2.fillText(statusFlash, RACE_W / 2, RACE_H / 2 + 6);
      }

      if (phase === "pit") {
        c2.fillStyle = "rgba(20,18,24,0.55)";
        c2.fillRect(0, 0, RACE_W, RACE_H);
        c2.fillStyle = "#E8A33D";
        c2.font = "800 28px ui-rounded, sans-serif";
        c2.textAlign = "center";
        c2.fillText("PIT STOP", RACE_W / 2, RACE_H / 2 - 16);
        c2.fillStyle = "#FBF0DE";
        c2.font = "700 16px ui-rounded, sans-serif";
        c2.fillText("Tap E  (" + pitTaps + "/2)  ·  " + Math.max(0, pitTimer).toFixed(1) + "s", RACE_W / 2, RACE_H / 2 + 14);
      }

      if (phase === "countdown") {
        // Mario Kart–style starting lights: 3 reds light up, then green GO!
        c2.fillStyle = "rgba(20,18,24,0.55)";
        c2.fillRect(0, 0, RACE_W, RACE_H);
        const lit = countdown <= 0 ? 3 : (4 - countdown); // 3→1 lit, 2→2, 1→3, GO→all green
        const lightsOn = Math.max(0, Math.min(3, lit));
        const goFlash = countdown <= 0;
        // Light bar housing
        c2.fillStyle = "#1A1524";
        roundRectPath(c2, RACE_W / 2 - 78, RACE_H / 2 - 78, 156, 52, 10);
        c2.fill();
        for (let i = 0; i < 3; i++) {
          const cx = RACE_W / 2 - 44 + i * 44;
          const cy = RACE_H / 2 - 52;
          c2.beginPath();
          c2.arc(cx, cy, 16, 0, Math.PI * 2);
          if (goFlash) {
            c2.fillStyle = "#3DCC6E";
          } else if (i < lightsOn) {
            c2.fillStyle = "#E23B3B";
          } else {
            c2.fillStyle = "#3A2C22";
          }
          c2.fill();
          // lens shine
          if ((goFlash || i < lightsOn)) {
            c2.fillStyle = "rgba(255,255,255,0.35)";
            c2.beginPath();
            c2.arc(cx - 4, cy - 5, 5, 0, Math.PI * 2);
            c2.fill();
          }
        }
        c2.fillStyle = goFlash ? "#3DCC6E" : "#FBF0DE";
        c2.font = "800 64px ui-rounded, sans-serif";
        c2.textAlign = "center";
        c2.fillText(countdown > 0 ? String(countdown) : "GO!", RACE_W / 2, RACE_H / 2 + 48);
      }

      // Mini-map
      const mmW = 140;
      const mmH = Math.round(mmW * worldH / worldW);
      const mmX = RACE_W - mmW - 12;
      const mmY = RACE_H - mmH - 12;
      c2.fillStyle = "rgba(20,18,24,0.72)";
      roundRectPath(c2, mmX - 4, mmY - 4, mmW + 8, mmH + 8, 8);
      c2.fill();
      c2.globalAlpha = 0.9;
      c2.drawImage(trackImg, mmX, mmY, mmW, mmH);
      c2.globalAlpha = 1;
      const sx = mmW / worldW;
      const sy = mmH / worldH;
      cars.forEach((car) => {
        c2.fillStyle = car === player ? "#E8A33D" : "#A8D4E8";
        c2.beginPath();
        c2.arc(mmX + car.x * sx, mmY + car.y * sy, car === player ? 3.5 : 2.5, 0, Math.PI * 2);
        c2.fill();
      });
    }

    function finishRace() {
      if (raceEnded) return;
      raceEnded = true;
      raceActive = false;
      phase = "finished";
      cancelAnimationFrame(raf);

      const pos = place();
      const reward = REWARDS[pos] || { money: 5, happy: 0 };
      state.money += reward.money;
      const d = activeDog(state);
      if (d && reward.happy) {
        d.happiness = Math.min(100, (d.happiness || 0) + reward.happy);
      }
      persist(state);
      StadiumAudio.stopEngine();
      StadiumAudio.endRace({
        fanfare: true,
        resumeHub: true,
      });

      const ordinal = pos === 1 ? "1st" : pos === 2 ? "2nd" : "3rd";
      const happyLine = reward.happy
        ? ` · Dog Happiness +${reward.happy}`
        : "";
      const root = document.getElementById("modal-body");
      if (!root) return;
      root.innerHTML = `
        <h3>Grand Prix Circuit</h3>
        <div class="result-text">You finished ${ordinal}!</div>
        <div class="flavor-box">You earned <b>$${reward.money}</b>${happyLine}.${hasDog && pos <= 2 ? "<br>" + dogName + " loved the podium lap." : ""}</div>
        <div class="action-row">
          <button class="action-btn ghost" id="f1-again">Race Again</button>
          <button class="action-btn" id="f1-done">Done</button>
        </div>`;
      const done = document.getElementById("f1-done");
      const again = document.getElementById("f1-again");
      if (done) done.addEventListener("click", closeHostModal);
      if (again) again.addEventListener("click", () => openGrandPrix());
    }

    function frame(ts) {
      if (last == null) last = ts;
      const dt = Math.min(0.05, (ts - last) / 1000);
      last = ts;
      const nowTs = performance.now();

      if (phase === "racing") {
        updatePlayer(dt, nowTs);
        updateAi(ai1, dt, nowTs);
        updateAi(ai2, dt, nowTs);
      } else if (phase === "pit") {
        updatePit(dt);
        updateAi(ai1, dt, nowTs);
        updateAi(ai2, dt, nowTs);
      }
      updateCamera(dt);

      drawWorld();
      [ai1, ai2, player].forEach((car) => drawCarSprite(car, car === player));
      drawHud(nowTs);

      if (phase === "racing" && player.progress >= LAPS_TOTAL * TRACK.total) {
        finishRace();
        return;
      }
      if (!raceEnded) raf = requestAnimationFrame(frame);
    }

    function cleanup() {
      raceEnded = true;
      raceActive = false;
      clearInterval(countdownTimer);
      if (goHoldTimer) clearTimeout(goHoldTimer);
      if (raf) cancelAnimationFrame(raf);
    }
    raceCleanup = cleanup;
    raf = requestAnimationFrame(frame);
  }

  function onStadiumEnter() {
    // Start hub BGM immediately (host AudioContext / sticky gesture from walking here)
    StadiumAudio.playHubBgm();
  }

  function onStadiumExit(hard) {
    if (hard) {
      StadiumAudio.stopAll(false, true);
    }
  }

  /* ---------- Interaction ---------- */
  function tryOpenRace() {
    if (!stadiumActive || !lastApi || modalOpen) return false;
    openGrandPrix();
    return true;
  }

  function isShiftKey(e) {
    return e.key === "Shift" || e.code === "ShiftLeft" || e.code === "ShiftRight";
  }

  window.addEventListener("keydown", (e) => {
    if (KEY_MAP[e.key]) keys[KEY_MAP[e.key]] = true;
    if (isShiftKey(e)) { keys.run = true; keys.drift = true; }

    if (raceActive) {
      if (e.key === " " || e.key === "Spacebar" || e.code === "Space") {
        if (!keys.space) spaceEdge = true;
        keys.space = true;
        e.preventDefault();
        e.stopImmediatePropagation();
        return;
      }
      if (e.key === "e" || e.key === "E") {
        if (!e.repeat) eEdge = true;
        e.preventDefault();
        e.stopImmediatePropagation();
        return;
      }
      if (KEY_MAP[e.key] || isShiftKey(e)) {
        e.preventDefault();
        e.stopImmediatePropagation();
      }
      return;
    }

    if (!stadiumActive || modalOpen) return;
    if (e.key === "e" || e.key === "E") {
      const promptText = document.getElementById("prompt-text");
      const label = promptText ? (promptText.textContent || "") : "";
      // Counter prompt ("Start a race") or banner — open upgraded GP, block host oval
      if (/race|grand prix|start/i.test(label)) {
        if (tryOpenRace()) {
          e.preventDefault();
          e.stopImmediatePropagation();
        }
      }
    }
  }, true);

  window.addEventListener("keyup", (e) => {
    if (KEY_MAP[e.key]) keys[KEY_MAP[e.key]] = false;
    if (isShiftKey(e)) { keys.run = false; keys.drift = false; }
    if (e.key === " " || e.key === "Spacebar" || e.code === "Space") keys.space = false;
  }, true);

  document.addEventListener("click", (e) => {
    if (modalOpen) {
      if (e.target && (e.target.id === "modal-close" || e.target.id === "modal-backdrop")) {
        closeHostModal();
        e.preventDefault();
        e.stopImmediatePropagation();
        return;
      }
    }
    if (!stadiumActive || modalOpen) return;
    const btn = e.target && e.target.closest && e.target.closest("#prompt-btn");
    const act = e.target && e.target.closest && e.target.closest("#btn-building-act");
    if (act) {
      if (tryOpenRace()) {
        e.preventDefault();
        e.stopImmediatePropagation();
      }
      return;
    }
    if (btn) {
      const promptText = document.getElementById("prompt-text");
      const label = promptText ? (promptText.textContent || "") : "";
      if (/race|grand prix|start/i.test(label) && tryOpenRace()) {
        e.preventDefault();
        e.stopImmediatePropagation();
      }
    }
  }, true);

  setInterval(() => {
    if (!stadiumActive && !lastDrawT) return;
    const idle = performance.now() - lastDrawT;
    if (stadiumActive && idle > 400) {
      stadiumActive = false;
      if (!modalOpen) onStadiumExit(false);
    }
    if (idle > 1500 && StadiumAudio.isBgmPlaying() && !modalOpen && !raceActive) {
      onStadiumExit(true);
    }
  }, 200);

  /* ---------- Interior décor helpers ---------- */
  function drawTireStack(ctx, x, y, scale) {
    const s = scale || 1;
    for (let i = 0; i < 3; i++) {
      ctx.fillStyle = i === 1 ? "#1A1524" : "#2A2A2E";
      ctx.beginPath();
      ctx.ellipse(x, y - i * 10 * s, 16 * s, 7 * s, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#4A4A52";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(x, y - i * 10 * s, 10 * s, 4 * s, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  function drawToolChest(ctx, roundRect, x, y, w, h, color) {
    ctx.fillStyle = "rgba(0,0,0,0.22)";
    roundRect(x + 3, y + h - 4, w - 6, 8, 3); ctx.fill();
    ctx.fillStyle = color || "#C0483E";
    roundRect(x, y, w, h, 6); ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.18)";
    roundRect(x + 6, y + 6, w - 12, 8, 3); ctx.fill();
    ctx.fillStyle = "#1A1524";
    for (let i = 0; i < 3; i++) {
      ctx.fillRect(x + 8, y + 20 + i * 12, w - 16, 2);
    }
    ctx.fillStyle = "#E8A33D";
    roundRect(x + w / 2 - 8, y + h / 2 - 4, 16, 8, 2); ctx.fill();
  }

  function drawCheckeredFlag(ctx, x, y, bob) {
    ctx.save();
    ctx.translate(x, y + bob);
    ctx.strokeStyle = "#3A2C22";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, 36);
    ctx.stroke();
    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < 3; j++) {
        ctx.fillStyle = (i + j) % 2 ? "#FBF0DE" : "#1A1524";
        ctx.fillRect(2 + i * 7, j * 7, 7, 7);
      }
    }
    ctx.restore();
  }

  function drawMarketBezel(ctx, roundRect, x, y, w, h, t, accent) {
    // Trading-terminal chrome (no ticker text)
    ctx.fillStyle = "#12141A";
    roundRect(x, y, w, h, 6); ctx.fill();
    ctx.fillStyle = "#0A0E12";
    roundRect(x + 4, y + 4, w - 8, h - 8, 4); ctx.fill();
    const glow = 0.2 + Math.sin(t / 280) * 0.12;
    const col = accent || "#3DCC6E";
    // soft accent from hex-ish colors via stroke only
    ctx.strokeStyle = col.length === 7
      ? `rgba(${parseInt(col.slice(1, 3), 16)},${parseInt(col.slice(3, 5), 16)},${parseInt(col.slice(5, 7), 16)},${glow})`
      : `rgba(61,204,110,${glow})`;
    ctx.lineWidth = 1.5;
    roundRect(x + 1, y + 1, w - 2, h - 2, 5); ctx.stroke();
  }

  /** Left screen: championship trophy + market sparkline */
  function drawTrophyScreen(ctx, roundRect, x, y, w, h, t) {
    drawMarketBezel(ctx, roundRect, x, y, w, h, t, "#E8A33D");
    const ix = x + 4; const iy = y + 4; const iw = w - 8; const ih = h - 8;
    ctx.fillStyle = "#0B1210";
    roundRect(ix, iy, iw, ih, 3); ctx.fill();
    ctx.fillStyle = "#3DCC6E";
    ctx.font = "700 6px ui-rounded, monospace, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText("CUP · LIVE", ix + 4, iy + 9);
    // sparkline (market vibe)
    ctx.strokeStyle = "rgba(61,204,110,0.55)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i < 16; i++) {
      const px = ix + 4 + i * ((iw - 8) / 15);
      const py = iy + 16 + Math.sin(t / 220 + i * 0.7) * 3 + (i % 3) * 0.6;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.stroke();
    // trophy
    const tx = x + w / 2;
    const ty = y + h / 2 + 2;
    const bob = Math.sin(t / 400) * 1.2;
    ctx.fillStyle = "#E8A33D";
    ctx.beginPath();
    ctx.moveTo(tx - 10, ty - 6 + bob);
    ctx.quadraticCurveTo(tx - 14, ty + 4 + bob, tx - 6, ty + 8 + bob);
    ctx.lineTo(tx + 6, ty + 8 + bob);
    ctx.quadraticCurveTo(tx + 14, ty + 4 + bob, tx + 10, ty - 6 + bob);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#F5D76E";
    ctx.fillRect(tx - 8, ty - 10 + bob, 16, 5);
    ctx.fillRect(tx - 3, ty + 8 + bob, 6, 6);
    ctx.fillRect(tx - 8, ty + 13 + bob, 16, 3);
    // handles
    ctx.strokeStyle = "#E8A33D";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(tx - 10, ty - 1 + bob, 5, Math.PI * 0.2, Math.PI * 0.9);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(tx + 10, ty - 1 + bob, 5, Math.PI * 0.1, Math.PI * 0.8, true);
    ctx.stroke();
    ctx.fillStyle = "#FBF0DE";
    ctx.font = "700 7px ui-rounded, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("1st", tx, ty + 2 + bob);
  }

  /** Middle screen: looping clip — car racing to finish line */
  function drawFinishClipScreen(ctx, roundRect, x, y, w, h, t) {
    drawMarketBezel(ctx, roundRect, x, y, w, h, t, "#5AA8E8");
    const ix = x + 4; const iy = y + 4; const iw = w - 8; const ih = h - 8;
    // track backdrop
    ctx.fillStyle = "#1A3A28";
    roundRect(ix, iy, iw, ih, 3); ctx.fill();
    ctx.fillStyle = "#2A2A2E";
    ctx.fillRect(ix, iy + ih * 0.35, iw, ih * 0.45);
    // dashed lane
    ctx.strokeStyle = "rgba(255,255,255,0.35)";
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(ix + 2, iy + ih * 0.55);
    ctx.lineTo(ix + iw - 2, iy + ih * 0.55);
    ctx.stroke();
    ctx.setLineDash([]);
    // finish line chequer at right
    const fx = ix + iw - 14;
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 2; c++) {
        ctx.fillStyle = (r + c) % 2 ? "#FBF0DE" : "#1A1524";
        ctx.fillRect(fx + c * 5, iy + ih * 0.35 + r * 5, 5, 5);
      }
    }
    // car loops left → finish
    const cycle = (t / 18) % (iw + 30);
    const carX = ix - 10 + cycle;
    const carY = iy + ih * 0.52;
    ctx.fillStyle = "#C0483E";
    roundRect(carX, carY - 4, 16, 7, 2); ctx.fill();
    ctx.fillStyle = "#1A1524";
    ctx.fillRect(carX - 2, carY - 7, 3, 12);
    ctx.fillStyle = "#111";
    ctx.beginPath(); ctx.arc(carX + 3, carY + 4, 2, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(carX + 12, carY + 4, 2, 0, Math.PI * 2); ctx.fill();
    // motion streaks
    ctx.strokeStyle = "rgba(232,163,61,0.55)";
    ctx.lineWidth = 1;
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.moveTo(carX - 4 - i * 5, carY - 2 + i);
      ctx.lineTo(carX - 14 - i * 5, carY - 2 + i);
      ctx.stroke();
    }
    ctx.fillStyle = "#5AA8E8";
    ctx.font = "700 6px ui-rounded, monospace, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText("▶ FINISH CAM", ix + 3, iy + 8);
  }

  /** Right screen: top scoreboard */
  function drawScoreboardScreen(ctx, roundRect, x, y, w, h, t) {
    drawMarketBezel(ctx, roundRect, x, y, w, h, t, "#C0483E");
    const ix = x + 4; const iy = y + 4; const iw = w - 8; const ih = h - 8;
    ctx.fillStyle = "#0C1016";
    roundRect(ix, iy, iw, ih, 3); ctx.fill();
    ctx.fillStyle = "#C0483E";
    ctx.font = "700 6px ui-rounded, monospace, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText("TOP BOARD", ix + 3, iy + 8);
    const rows = [
      { p: "1", n: "YOU", s: "1:42.1", c: "#E8A33D" },
      { p: "2", n: "BLITZ", s: "1:43.0", c: "#A8D4E8" },
      { p: "3", n: "NOVA", s: "1:44.6", c: "#A8D4E8" },
      { p: "4", n: "PIP", s: "1:46.2", c: "#8A8A92" },
    ];
    const blink = Math.sin(t / 200) > 0;
    rows.forEach((row, i) => {
      const ry = iy + 12 + i * 8;
      if (i === 0 && blink) {
        ctx.fillStyle = "rgba(232,163,61,0.15)";
        ctx.fillRect(ix + 2, ry - 5, iw - 4, 8);
      }
      ctx.fillStyle = row.c;
      ctx.font = "700 6px ui-rounded, monospace, sans-serif";
      ctx.textAlign = "left";
      ctx.fillText(row.p, ix + 3, ry);
      ctx.fillText(row.n, ix + 12, ry);
      ctx.textAlign = "right";
      ctx.fillText(row.s, ix + iw - 3, ry);
    });
  }

  function drawDisplayF1Car(ctx, roundRect, x, y, color, facing, scale) {
    const dir = facing || 1;
    const s = scale != null ? scale : 1.65;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(dir * s, s);
    ctx.fillStyle = "rgba(0,0,0,0.28)";
    ctx.beginPath();
    ctx.ellipse(0, 18, 46, 11, 0, 0, Math.PI * 2);
    ctx.fill();
    // body
    ctx.fillStyle = color;
    roundRect(-38, -8, 70, 20, 7); ctx.fill();
    // nose
    ctx.beginPath();
    ctx.moveTo(30, -3);
    ctx.lineTo(54, 4);
    ctx.lineTo(30, 11);
    ctx.closePath();
    ctx.fill();
    // sidepods highlight
    ctx.fillStyle = "rgba(255,255,255,0.12)";
    roundRect(-20, -4, 36, 5, 2); ctx.fill();
    // rear wing
    ctx.fillStyle = "#1A1524";
    ctx.fillRect(-52, -18, 14, 40);
    ctx.fillRect(-56, -20, 22, 5);
    ctx.fillRect(-56, 18, 22, 5);
    // front wing
    ctx.fillRect(40, -14, 14, 4);
    ctx.fillRect(40, 13, 14, 4);
    // cockpit halo
    ctx.fillStyle = "#2A2A2E";
    roundRect(-8, -5, 22, 13, 4); ctx.fill();
    ctx.fillStyle = "rgba(120,180,220,0.35)";
    roundRect(-4, -2, 12, 6, 2); ctx.fill();
    // open wheels
    ctx.fillStyle = "#111";
    [[20, -16], [20, 16], [-24, -16], [-24, 16]].forEach(([wx, wy]) => {
      ctx.beginPath();
      ctx.ellipse(wx, wy, 9, 6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#5A5A62";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.ellipse(wx, wy, 4.5, 3, 0, 0, Math.PI * 2);
      ctx.stroke();
    });
    // number plate
    ctx.fillStyle = "#FBF0DE";
    roundRect(4, -1, 14, 10, 2); ctx.fill();
    ctx.fillStyle = "#C0483E";
    ctx.font = "800 9px ui-rounded, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("1", 11, 7);
    ctx.restore();
  }

  function stadiumSolids(HOUSE) {
    return [
      { x: HOUSE.x + 55, y: HOUSE.y + 285, w: 150, h: 95 },
      { x: HOUSE.x + HOUSE.w - 205, y: HOUSE.y + 285, w: 150, h: 95 },
      { x: HOUSE.x + 48, y: HOUSE.y + 95, w: 70, h: 80 },
      { x: HOUSE.x + HOUSE.w - 118, y: HOUSE.y + 95, w: 70, h: 80 },
      { x: HOUSE.x + 160, y: HOUSE.y + 100, w: 55, h: 50 },
      { x: HOUSE.x + HOUSE.w - 215, y: HOUSE.y + 100, w: 55, h: 50 },
    ];
  }

  /* ---------- Register building ---------- */
  B.register({
    id: "stadium",
    info: {
      label: "Grand Prix Stadium",
      wall: "#5A5058",
      floor: "#2A2A2E",
      accent: "#C0483E",
      activity: "Start a race",
      blurb: "Pit lounge with live boards and podium screens.",
    },
    getSolids(HOUSE) {
      return stadiumSolids(HOUSE);
    },
    drawIcon(ctx, api, cx, cy) {
      const S = B.shared; S.bind(api);
      const roundRect = api.roundRect;
      const acShadow = S.acShadow, acBrickWall = S.acBrickWall,
        acGableRoof = S.acGableRoof, acDoor = S.acDoor;
      ctx.save();
      ctx.translate(cx, cy);
      acShadow(88, 66);
      acBrickWall(-70, 4, 140, 50, "#6A6068");
      acGableRoof(74, -36, 4, "#C0483E", "#D9705C");
      // asphalt oval with DRS stripe
      ctx.fillStyle = "#2A2A2E";
      ctx.beginPath(); ctx.ellipse(0, 28, 36, 16, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = "#C0483E"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(0, 28, 36, 16, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = "rgba(80,160,255,0.7)"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(0, 28, 22, 8, 0, -0.4, 0.4); ctx.stroke();
      acDoor(-12, 28, 24, 24, "#1A1524");
      // checkered pennants
      for (let i = 0; i < 6; i++) {
        ctx.fillStyle = i % 2 ? "#FBF0DE" : "#1A1524";
        ctx.beginPath();
        ctx.moveTo(-48 + i * 16, -20);
        ctx.lineTo(-40 + i * 16, -20);
        ctx.lineTo(-44 + i * 16, -8);
        ctx.closePath(); ctx.fill();
      }
      ctx.restore();
    },

    drawInterior(ctx, api, t, cx, cy) {
      const roundRect = api.roundRect;
      const HOUSE = api.HOUSE;
      const drawBuildingPatron = api.drawBuildingPatron;
      const drawNpcNameTag = api.drawNpcNameTag;

      lastApi = api;
      lastDrawT = performance.now();
      if (!stadiumActive) {
        stadiumActive = true;
        onStadiumEnter();
      } else {
        stadiumActive = true;
      }

      const floorX = HOUSE.x + HOUSE.wall;
      const floorY = HOUSE.y + HOUSE.wall + 36;
      const floorW = HOUSE.w - HOUSE.wall * 2;
      const floorH = HOUSE.h - HOUSE.wall * 2 - 36;

      /* ---- Asphalt / concrete floor (covers host wood boards) ---- */
      ctx.fillStyle = "#2A2A2E";
      ctx.fillRect(floorX, floorY, floorW, floorH);
      // subtle concrete noise bands
      for (let row = 0; row < 18; row++) {
        ctx.fillStyle = row % 2 === 0 ? "rgba(255,255,255,0.015)" : "rgba(0,0,0,0.04)";
        ctx.fillRect(floorX, floorY + row * 18, floorW, 18);
      }
      // lane dashed markings
      ctx.strokeStyle = "rgba(255,255,255,0.12)";
      ctx.lineWidth = 2;
      ctx.setLineDash([14, 12]);
      ctx.beginPath();
      ctx.moveTo(floorX + 40, floorY + floorH * 0.55);
      ctx.lineTo(floorX + floorW - 40, floorY + floorH * 0.55);
      ctx.stroke();
      ctx.setLineDash([]);

      /* ---- Red / white apex curb strips along floor edges ---- */
      const curbH = 10;
      const drawEdgeCurb = (x, y, w, vertical) => {
        const n = vertical ? Math.ceil(w / 14) : Math.ceil(w / 16);
        for (let i = 0; i < n; i++) {
          ctx.fillStyle = i % 2 === 0 ? "#C0483E" : "#F5F5F5";
          if (vertical) ctx.fillRect(x, y + i * 14, curbH, 14);
          else ctx.fillRect(x + i * 16, y, 16, curbH);
        }
      };
      drawEdgeCurb(floorX, floorY + floorH - curbH, floorW, false);
      drawEdgeCurb(floorX, floorY, floorW, false);
      drawEdgeCurb(floorX, floorY, floorH, true);
      drawEdgeCurb(floorX + floorW - curbH, floorY, floorH, true);

      /* ---- Back wall: trading-desk style screens ---- */
      ctx.fillStyle = "#2A3038";
      ctx.fillRect(HOUSE.x + HOUSE.wall, HOUSE.y + HOUSE.wall, HOUSE.w - HOUSE.wall * 2, 62);
      // subtle market grid on wall
      ctx.strokeStyle = "rgba(61,204,110,0.06)";
      ctx.lineWidth = 1;
      for (let gx = 0; gx < 12; gx++) {
        ctx.beginPath();
        ctx.moveTo(HOUSE.x + HOUSE.wall + 20 + gx * 48, HOUSE.y + HOUSE.wall);
        ctx.lineTo(HOUSE.x + HOUSE.wall + 20 + gx * 48, HOUSE.y + HOUSE.wall + 62);
        ctx.stroke();
      }
      const mw = 108;
      const mh = 54;
      const my = HOUSE.y + HOUSE.wall + 4;
      drawTrophyScreen(ctx, roundRect, HOUSE.x + 110, my, mw, mh, t);
      drawFinishClipScreen(ctx, roundRect, HOUSE.x + HOUSE.w / 2 - mw / 2, my, mw, mh, t);
      drawScoreboardScreen(ctx, roundRect, HOUSE.x + HOUSE.w - 110 - mw, my, mw, mh, t);

      /* ---- Wall shelves: checkered flags + small tire / gear ---- */
      [[HOUSE.x + 55, HOUSE.y + 100], [HOUSE.x + HOUSE.w - 115, HOUSE.y + 100]].forEach(([sx, sy], i) => {
        ctx.fillStyle = "#3A343A";
        roundRect(sx, sy, 60, 14, 3); ctx.fill();
        ctx.fillStyle = "#6A6068";
        roundRect(sx, sy + 14, 60, 50, 4); ctx.fill();
        for (let col = 0; col < 4; col++) {
          for (let row = 0; row < 3; row++) {
            ctx.fillStyle = (col + row + i) % 2 ? "#FBF0DE" : "#1A1524";
            ctx.fillRect(sx + 8 + col * 11, sy + 22 + row * 11, 11, 11);
          }
        }
      });
      drawCheckeredFlag(ctx, HOUSE.x + 175, HOUSE.y + 105, Math.sin(t / 400) * 1.5);
      drawCheckeredFlag(ctx, HOUSE.x + HOUSE.w - 185, HOUSE.y + 108, Math.sin(t / 380 + 1) * 1.5);

      /* ---- Tool chests ---- */
      drawToolChest(ctx, roundRect, HOUSE.x + 160, HOUSE.y + 118, 50, 42, "#C0483E");
      drawToolChest(ctx, roundRect, HOUSE.x + HOUSE.w - 210, HOUSE.y + 118, 50, 42, "#3A6EA5");

      /* ---- Stacked racing tires ---- */
      drawTireStack(ctx, HOUSE.x + 95, HOUSE.y + 200, 1);
      drawTireStack(ctx, HOUSE.x + HOUSE.w - 95, HOUSE.y + 205, 1);
      drawTireStack(ctx, HOUSE.x + 130, HOUSE.y + 360, 0.85);
      drawTireStack(ctx, HOUSE.x + HOUSE.w - 130, HOUSE.y + 358, 0.85);

      /* ---- Bleachers (pit garage stands) ---- */
      ctx.fillStyle = "#C0483E";
      for (let i = 0; i < 4; i++) {
        roundRect(HOUSE.x + 200, HOUSE.y + 95 + i * 14, 100, 11, 3); ctx.fill();
        roundRect(HOUSE.x + HOUSE.w - 300, HOUSE.y + 95 + i * 14, 100, 11, 3); ctx.fill();
      }
      // hazard stripe kickplate under bleachers
      for (let i = 0; i < 8; i++) {
        ctx.fillStyle = i % 2 ? "#E8A33D" : "#1A1524";
        ctx.fillRect(HOUSE.x + 200 + i * 12.5, HOUSE.y + 150, 12.5, 6);
        ctx.fillRect(HOUSE.x + HOUSE.w - 300 + i * 12.5, HOUSE.y + 150, 12.5, 6);
      }

      /* ---- Display F1 open-wheel cars (larger showpieces) ---- */
      drawDisplayF1Car(ctx, roundRect, HOUSE.x + 130, HOUSE.y + 325, "#C0483E", 1, 1.75);
      drawDisplayF1Car(ctx, roundRect, HOUSE.x + HOUSE.w - 130, HOUSE.y + 325, "#5A7FB0", -1, 1.75);

      /* ---- Pit desk (restyle host counter) ---- */
      ctx.fillStyle = "#1A1524";
      roundRect(cx - 95, cy - 22, 190, 55, 10); ctx.fill();
      ctx.fillStyle = "#3A3A40";
      roundRect(cx - 88, cy - 14, 176, 18, 6); ctx.fill();
      for (let i = 0; i < 10; i++) {
        ctx.fillStyle = i % 2 ? "#E8A33D" : "#1A1524";
        ctx.fillRect(cx - 90 + i * 18, cy + 22, 18, 6);
      }
      ctx.fillStyle = "#C0483E";
      roundRect(cx - 36, cy - 32, 72, 24, 7); ctx.fill();
      ctx.fillStyle = "#FBF0DE";
      ctx.font = "700 11px ui-rounded, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("Start a race", cx, cy + 20);

      /* ---- Pit crew / fans ---- */
      drawBuildingPatron(cx - 25, cy - 28, "#B87A4B", "#C0483E", "#111111", Math.sin(t / 500) * 1.1);
      drawNpcNameTag(cx - 25, cy - 52, "Rex");
      drawBuildingPatron(HOUSE.x + 130, HOUSE.y + 200, "#F0C08A", "#4A4A4A", "#3A2417", Math.sin(t / 400) * 1.5);
      drawNpcNameTag(HOUSE.x + 130, HOUSE.y + 176, "Pip");
      drawBuildingPatron(HOUSE.x + HOUSE.w - 130, HOUSE.y + 210, "#D9A066", "#5A7FB0", "#6B4423", Math.sin(t / 430) * 1.5);
      drawNpcNameTag(HOUSE.x + HOUSE.w - 130, HOUSE.y + 186, "Sam");
      drawBuildingPatron(HOUSE.x + 380, HOUSE.y + 380, "#F7D9B6", "#D9705C", "#B5651D", Math.sin(t / 460) * 1.3);
      drawNpcNameTag(HOUSE.x + 380, HOUSE.y + 356, "Theo");
    },
  });

  global.PawsStadium = {
    openRace: openGrandPrix,
    close: closeHostModal,
  };
})(typeof window !== "undefined" ? window : globalThis);
