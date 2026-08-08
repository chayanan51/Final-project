/**
 * cafe building module
 * Shelves + glass coolers with buyable food, and the "Leash slipped!" dog chase.
 * Edit icon / colors / interior here without touching other buildings.
 */
(function () {
  const B = window.PawsBuildings;
  const SAVE_KEY = "pawPrintsDemoSave_v3";
  const TILE = 32;

  /* ---------- Global asset / sprite map (Ghostpixxells Pixel Food) ---------- */
  const globalAssets = (window.globalAssets = window.globalAssets || {});
  const globalConstants = (window.globalConstants = window.globalConstants || {});
  const FOOD_DIR = "assets/Ghostpixxells_pixelfood/";

  // Menu item → Ghostpixxells filename (32×32 PNGs from presentation pack)
  const FOOD_FILES = {
    quick_biscuit: "28_cookies.png",
    fresh_croissant: "09_baguette.png",
    warm_muffin: "42_eggtart.png",
    fresh_sandwich: "92_sandwich.png",
    hot_dog_roll: "54_hotdog.png",
    bento_box: "97_sushi.png",
    gourmet_dog_treat: "52_gingerbreadman.png",
    coffee_bean_bag: "26_chocolate.png",
    iced_milk_tea: "61_jam.png",
    fruit_smoothie: "41_eggsalad_bowl.png",
    fruit_jelly_cup: "59_jelly.png",
    rainbow_gelatin: "50_giantgummybear.png",
    caramel_pudding: "75_pudding.png",
    popsicle: "57_icecream.png",
    double_ice_cream: "58_icecream_bowl.png",
  };

  // Atlas slot order for globalAssets.pixel_food_icons (6×3 grid, 32×32 cells)
  const FOOD_ATLAS_ORDER = [
    "quick_biscuit", "fresh_croissant", "warm_muffin", "fresh_sandwich", "hot_dog_roll", "bento_box",
    "gourmet_dog_treat", "coffee_bean_bag", "iced_milk_tea", "fruit_smoothie", "fruit_jelly_cup", "rainbow_gelatin",
    "caramel_pudding", "popsicle", "double_ice_cream",
  ];

  if (!globalConstants.FoodSpriteMap) {
    globalConstants.FoodSpriteMap = {};
    FOOD_ATLAS_ORDER.forEach((id, i) => {
      globalConstants.FoodSpriteMap[id] = [i % 6, Math.floor(i / 6)];
    });
  }
  // Also keep filename lookup for direct draws
  if (!globalConstants.FoodFileMap) globalConstants.FoodFileMap = FOOD_FILES;
  const FoodSpriteMap = globalConstants.FoodSpriteMap;

  globalAssets.foodIcons = globalAssets.foodIcons || {};

  function loadFoodImage(file) {
    if (globalAssets.foodIcons[file] && (globalAssets.foodIcons[file].complete || globalAssets.foodIcons[file].width)) {
      return globalAssets.foodIcons[file];
    }
    const img = new Image();
    img.src = FOOD_DIR + file;
    globalAssets.foodIcons[file] = img;
    return img;
  }

  function rebuildFoodAtlas() {
    const cols = 6, rows = 3;
    const c = document.createElement("canvas");
    c.width = cols * TILE;
    c.height = rows * TILE;
    const g = c.getContext("2d");
    g.imageSmoothingEnabled = false;
    let ready = 0;
    FOOD_ATLAS_ORDER.forEach((id, i) => {
      const file = FOOD_FILES[id];
      const img = loadFoodImage(file);
      const col = i % cols, row = Math.floor(i / cols);
      const paint = () => {
        if (img.complete && img.naturalWidth) {
          g.clearRect(col * TILE, row * TILE, TILE, TILE);
          g.drawImage(img, 0, 0, img.naturalWidth, img.naturalHeight, col * TILE, row * TILE, TILE, TILE);
        }
        ready++;
        if (ready >= FOOD_ATLAS_ORDER.length) {
          const sheet = new Image();
          sheet.src = c.toDataURL("image/png");
          globalAssets.pixel_food_icons = sheet;
        }
      };
      if (img.complete && img.naturalWidth) paint();
      else img.addEventListener("load", paint, { once: true });
    });
  }

  function ensureFoodSheet() {
    if (!globalAssets._pixel_food_loading) {
      globalAssets._pixel_food_loading = true;
      Object.values(FOOD_FILES).forEach(loadFoodImage);
      rebuildFoodAtlas();
    }
    return globalAssets.pixel_food_icons;
  }
  ensureFoodSheet();

  /* ---------- Catalog ---------- */
  const ITEMS = {
    quick_biscuit: { id: "quick_biscuit", name: "Quick Biscuit", price: 5, energy: 10, happy: 0, bond: 0, blurb: "Restores +10 Energy" },
    fresh_croissant: { id: "fresh_croissant", name: "Fresh Croissant", price: 12, energy: 30, happy: 0, bond: 0, blurb: "Restores +30 Energy" },
    warm_muffin: { id: "warm_muffin", name: "Warm Muffin", price: 18, energy: 45, happy: 0, bond: 0, blurb: "Restores +45 Energy" },
    fresh_sandwich: { id: "fresh_sandwich", name: "Fresh Sandwich", price: 20, energy: 50, happy: 0, bond: 0, blurb: "Restores +50 Energy" },
    hot_dog_roll: { id: "hot_dog_roll", name: "Hot Dog Roll", price: 25, energy: 60, happy: 0, bond: 0, blurb: "Restores +60 Energy" },
    bento_box: { id: "bento_box", name: "Bento Box", price: 40, energy: 100, happy: 0, bond: 0, blurb: "Full max energy restore", fullEnergy: true },
    gourmet_dog_treat: { id: "gourmet_dog_treat", name: "Gourmet Dog Treat", price: 15, energy: 0, happy: 20, bond: 20, blurb: "+20 Dog Bond / Happiness" },
    coffee_bean_bag: { id: "coffee_bean_bag", name: "Coffee Bean Bag", price: 30, energy: 75, happy: 0, bond: 0, blurb: "Restores +75 Energy" },
    iced_milk_tea: { id: "iced_milk_tea", name: "Iced Milk Tea", price: 8, energy: 20, happy: 0, bond: 0, blurb: "Restores +20 Energy" },
    fruit_smoothie: { id: "fruit_smoothie", name: "Fruit Smoothie", price: 15, energy: 40, happy: 0, bond: 0, blurb: "Restores +40 Energy" },
    fruit_jelly_cup: { id: "fruit_jelly_cup", name: "Fruit Jelly Cup", price: 10, energy: 25, happy: 0, bond: 0, blurb: "Restores +25 Energy" },
    rainbow_gelatin: { id: "rainbow_gelatin", name: "Rainbow Gelatin", price: 22, energy: 55, happy: 0, bond: 0, blurb: "Restores +55 Energy" },
    caramel_pudding: { id: "caramel_pudding", name: "Caramel Pudding", price: 28, energy: 70, happy: 5, bond: 0, blurb: "+70 Energy & +5 Happiness" },
    popsicle: { id: "popsicle", name: "Popsicle", price: 7, energy: 15, happy: 0, bond: 0, blurb: "Restores +15 Energy" },
    double_ice_cream: { id: "double_ice_cream", name: "Double Ice Cream Cone", price: 16, energy: 40, happy: 5, bond: 0, blurb: "+40 Energy & +5 Happiness" },
  };

  const ZONES = {
    leftShelf: {
      id: "leftShelf",
      label: "Pastries & Bakes",
      prompt: "Browse pastries",
      items: ["quick_biscuit", "fresh_croissant", "warm_muffin"],
    },
    rightShelf: {
      id: "rightShelf",
      label: "Savories & Lunch",
      prompt: "Browse lunch shelf",
      items: ["fresh_sandwich", "hot_dog_roll", "bento_box"],
    },
    counter: {
      id: "counter",
      label: "Specialty & Dog Treats",
      prompt: "Browse counter treats",
      items: ["gourmet_dog_treat", "coffee_bean_bag"],
    },
    cooler1: {
      id: "cooler1",
      label: "Bottled Drinks",
      prompt: "Open left cooler",
      items: ["iced_milk_tea", "fruit_smoothie"],
    },
    cooler2: {
      id: "cooler2",
      label: "Chilled Desserts",
      prompt: "Open middle cooler",
      items: ["fruit_jelly_cup", "rainbow_gelatin", "caramel_pudding"],
    },
    cooler3: {
      id: "cooler3",
      label: "Frozen Treats",
      prompt: "Open right cooler",
      items: ["popsicle", "double_ice_cream"],
    },
  };

  /* ---------- Runtime session ---------- */
  const keys = { up: false, down: false, left: false, right: false, run: false };
  const KEY_MAP = {
    ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right",
    w: "up", s: "down", a: "left", d: "right",
    W: "up", S: "down", A: "left", D: "right",
  };

  let cafeActive = false;
  let lastApi = null;
  let lastDrawT = 0;
  let lastLogicT = 0;
  let mirror = { x: 0, y: 0, r: 14, speed: 170 };
  let activeZone = null;
  let floats = [];
  let chase = null; // { timeLeft, dog, floor, phase:'intro'|'chase'|'follow', resolved, introLeft }
  let cafeTrail = [];
  let cafeMsg = null; // { title, body, life, max, tone }
  const breedImgCache = Object.create(null);
  let menuOpen = false;

  function playerHasDog(state) {
    return !!(state && ((state.dogs && state.dogs.length) || state.adopted));
  }

  function activeDog(state) {
    if (!state || !state.dogs || !state.dogs.length) return null;
    return state.dogs.find((d) => d.id === state.activeDogId) || state.dogs[0];
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

  function refreshHud(state) {
    const energyNum = document.getElementById("hud-energy-num");
    const energyBar = document.getElementById("hud-energy-bar");
    const money = document.getElementById("hud-money");
    if (energyNum) energyNum.textContent = Math.round(state.energy);
    if (energyBar) energyBar.style.width = (state.energy / state.maxEnergy * 100) + "%";
    if (money) money.textContent = "$" + state.money;
    const dog = activeDog(state);
    const happyBar = document.getElementById("hud-happy-bar");
    const bondBar = document.getElementById("hud-bond-bar");
    const happyWrap = document.getElementById("hud-happy-wrap");
    const bondWrap = document.getElementById("hud-bond-wrap");
    if (dog) {
      if (happyWrap) happyWrap.style.display = "flex";
      if (bondWrap) bondWrap.style.display = "flex";
      if (happyBar) happyBar.style.width = dog.happiness + "%";
      if (bondBar) bondBar.style.width = Math.min(100, dog.bond) + "%";
      state.happiness = dog.happiness;
      state.bond = dog.bond;
    }
  }

  function persist(state) {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(state));
    } catch (e) { /* ignore quota */ }
    refreshHud(state);
  }

  function sfxPurchase() {
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      const ac = new AC();
      const beep = (freq, t0, dur) => {
        const o = ac.createOscillator();
        const g = ac.createGain();
        o.type = "triangle";
        o.frequency.value = freq;
        g.gain.value = 0.1;
        o.connect(g); g.connect(ac.destination);
        o.start(t0); o.stop(t0 + dur);
      };
      const t = ac.currentTime;
      beep(660, t, 0.07);
      beep(880, t + 0.07, 0.09);
    } catch (e) { /* ignore */ }
  }

  function coolerRects(HOUSE) {
    return [
      { x: HOUSE.x + 120, y: HOUSE.y + HOUSE.wall + 6, w: 90, h: 50 },
      { x: HOUSE.x + HOUSE.w / 2 - 45, y: HOUSE.y + HOUSE.wall + 6, w: 90, h: 50 },
      { x: HOUSE.x + HOUSE.w - 210, y: HOUSE.y + HOUSE.wall + 6, w: 90, h: 50 },
    ];
  }

  function zoneHitboxes(HOUSE) {
    const coolers = coolerRects(HOUSE);
    return {
      leftShelf: { x: HOUSE.x + 50, y: HOUSE.y + 95, w: 60, h: 80, pad: 36 },
      rightShelf: { x: HOUSE.x + HOUSE.w - 110, y: HOUSE.y + 95, w: 60, h: 80, pad: 36 },
      counter: { x: HOUSE.x + HOUSE.w / 2 - 95, y: HOUSE.y + 115, w: 190, h: 55, pad: 28 },
      cooler1: { x: coolers[0].x, y: coolers[0].y, w: coolers[0].w, h: coolers[0].h + 40, pad: 18 },
      cooler2: { x: coolers[1].x, y: coolers[1].y, w: coolers[1].w, h: coolers[1].h + 40, pad: 18 },
      cooler3: { x: coolers[2].x, y: coolers[2].y, w: coolers[2].w, h: coolers[2].h + 40, pad: 18 },
    };
  }

  function cafeSolids(HOUSE) {
    return [
      { x: HOUSE.x + HOUSE.w / 2 - 95, y: HOUSE.y + 115, w: 190, h: 55 },
      { x: HOUSE.x + 55, y: HOUSE.y + 280, w: 70, h: 55 },
      { x: HOUSE.x + 160, y: HOUSE.y + 280, w: 70, h: 55 },
      { x: HOUSE.x + 590, y: HOUSE.y + 280, w: 70, h: 55 },
      { x: HOUSE.x + 695, y: HOUSE.y + 280, w: 70, h: 55 },
      { x: HOUSE.x + 50, y: HOUSE.y + 95, w: 60, h: 80 },
      { x: HOUSE.x + HOUSE.w - 110, y: HOUSE.y + 95, w: 60, h: 80 },
    ];
  }

  function solidAt(HOUSE, px, py, pr) {
    if (px - pr < HOUSE.x + HOUSE.wall) return true;
    if (px + pr > HOUSE.x + HOUSE.w - HOUSE.wall) return true;
    if (py - pr < HOUSE.y + HOUSE.wall + 36) return true;
    if (py + pr > HOUSE.y + HOUSE.h - HOUSE.wall) {
      if (px < HOUSE.door.x + 8 || px > HOUSE.door.x + HOUSE.door.w - 8) return true;
    }
    for (const f of cafeSolids(HOUSE)) {
      if (px > f.x && px < f.x + f.w && py > f.y && py < f.y + f.h) return true;
    }
    return false;
  }

  function nearBox(px, py, box) {
    const pad = box.pad || 24;
    return px > box.x - pad && px < box.x + box.w + pad && py > box.y - pad && py < box.y + box.h + pad;
  }

  function findZone(HOUSE, px, py) {
    // Door handled by host game — skip if at exit
    if (
      py > HOUSE.y + HOUSE.h - HOUSE.wall - 48 &&
      px > HOUSE.door.x - 24 &&
      px < HOUSE.door.x + HOUSE.door.w + 24
    ) {
      return null;
    }
    const boxes = zoneHitboxes(HOUSE);
    const order = ["leftShelf", "rightShelf", "cooler1", "cooler2", "cooler3", "counter"];
    for (const id of order) {
      if (nearBox(px, py, boxes[id])) return ZONES[id];
    }
    return null;
  }

  function drawFoodSprite(ctx, key, dx, dy, size) {
    const s = size || 22;
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    const file = (globalConstants.FoodFileMap && globalConstants.FoodFileMap[key]) || FOOD_FILES[key];
    const img = file ? loadFoodImage(file) : null;
    if (img && img.complete && img.naturalWidth) {
      ctx.drawImage(img, 0, 0, img.naturalWidth, img.naturalHeight, dx, dy, s, s);
    } else {
      const sheet = ensureFoodSheet();
      const map = FoodSpriteMap[key] || [0, 0];
      if (sheet && (sheet.complete || sheet.width)) {
        ctx.drawImage(sheet, map[0] * TILE, map[1] * TILE, TILE, TILE, dx, dy, s, s);
      } else {
        ctx.fillStyle = "#D98F2B";
        ctx.fillRect(dx, dy, s, s);
      }
    }
    ctx.restore();
  }

  function pushFloat(text, x, y) {
    floats.push({ text, x, y, life: 1.35, max: 1.35 });
  }

  function buyItem(state, item) {
    if (!state) return;
    if (state.money < item.price) {
      toast("Not enough money");
      return;
    }
    state.money = Math.max(0, state.money - item.price);
    const bits = [];
    if (item.fullEnergy) {
      state.energy = state.maxEnergy;
      bits.push("Full Energy!");
    } else if (item.energy) {
      state.energy = Math.min(state.maxEnergy, state.energy + item.energy);
      bits.push("+" + item.energy + " Energy!");
    }
    const dog = activeDog(state);
    if (dog) {
      if (item.happy) {
        dog.happiness = Math.min(100, dog.happiness + item.happy);
        bits.push("+" + item.happy + " Happiness!");
      }
      if (item.bond) {
        dog.bond = Math.max(0, dog.bond + item.bond);
        bits.push("+" + item.bond + " Dog Bond!");
      }
    } else if (item.bond || (item.id === "gourmet_dog_treat")) {
      toast("You need a dog for that treat");
      // refund treat-only if no dog and no energy gain
      if (!item.energy && !item.fullEnergy) {
        state.money += item.price;
        return;
      }
    }
    sfxPurchase();
    persist(state);
    const msg = bits[0] || "Purchased!";
    pushFloat(msg, mirror.x, mirror.y - 28);
    toast(item.name + " · " + bits.join(" "));
    closeCafeMenu();
  }

  function openCafeMenu(zone) {
    if (!zone || menuOpen) return;
    const state = lastApi && lastApi.state;
    if (!state) return;
    const backdrop = document.getElementById("modal-backdrop");
    const body = document.getElementById("modal-body");
    if (!backdrop || !body) return;
    menuOpen = true;
    const cards = zone.items.map((id) => {
      const item = ITEMS[id];
      const can = state.money >= item.price;
      return `
        <div class="item-card" style="display:flex;align-items:center;gap:0.65rem;justify-content:space-between;">
          <div style="display:flex;align-items:center;gap:0.55rem;">
            <canvas data-food-icon="${item.id}" width="32" height="32" style="width:32px;height:32px;image-rendering:pixelated;"></canvas>
            <div>
              <b>${item.name}</b>
              <div style="font-size:0.75rem;opacity:0.75;">${item.blurb}</div>
            </div>
          </div>
          <button class="action-btn ${can ? "" : "ghost"}" data-cafe-buy="${item.id}" ${can ? "" : "disabled"}>$${item.price}</button>
        </div>`;
    }).join("");
    body.innerHTML = `
      <h3>${zone.label}</h3>
      <p class="modal-sub">Willow Café · You have <b>$${state.money}</b></p>
      <div style="display:flex;flex-direction:column;gap:0.55rem;margin-top:0.4rem;">${cards}</div>
      <div class="action-row" style="margin-top:0.9rem">
        <button class="action-btn ghost" id="cafe-menu-close">Close</button>
      </div>`;
    backdrop.classList.add("open");
    body.querySelectorAll("[data-food-icon]").forEach((cv) => {
      const g = cv.getContext("2d");
      g.imageSmoothingEnabled = false;
      drawFoodSprite(g, cv.getAttribute("data-food-icon"), 0, 0, 32);
    });
    body.querySelectorAll("[data-cafe-buy]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const item = ITEMS[btn.getAttribute("data-cafe-buy")];
        if (item) buyItem(state, item);
      });
    });
    const closeBtn = document.getElementById("cafe-menu-close");
    if (closeBtn) closeBtn.addEventListener("click", closeCafeMenu);
  }

  function closeCafeMenu() {
    menuOpen = false;
    const backdrop = document.getElementById("modal-backdrop");
    const body = document.getElementById("modal-body");
    if (body && body.querySelector("[data-cafe-buy]")) body.innerHTML = "";
    if (backdrop) backdrop.classList.remove("open");
  }

  document.addEventListener("click", (e) => {
    if (!menuOpen) return;
    if (e.target && e.target.id === "modal-close") closeCafeMenu();
    if (e.target && e.target.id === "modal-backdrop") closeCafeMenu();
  }, true);

  function ensureMsgEl() {
    let el = document.getElementById("cafe-chase-msg");
    if (el) return el;
    el = document.createElement("div");
    el.id = "cafe-chase-msg";
    el.style.cssText = [
      "position:absolute", "inset:0", "display:none", "align-items:center",
      "justify-content:center", "pointer-events:none", "z-index:40",
      "background:rgba(42,33,24,0.28)", "padding:1rem",
    ].join(";");
    const card = document.createElement("div");
    card.id = "cafe-chase-msg-card";
    card.style.cssText = [
      "max-width:420px", "width:min(420px,92%)", "background:#F5E9D3",
      "border:3px solid #C4785A", "border-radius:16px", "padding:1.1rem 1.2rem 1.15rem",
      "box-shadow:0 12px 40px rgba(42,33,24,0.28)", "text-align:center",
      "font-family:ui-rounded, system-ui, sans-serif", "color:#3A2C22",
    ].join(";");
    card.innerHTML = '<div id="cafe-chase-msg-accent" style="height:6px;border-radius:3px;background:#C4785A;margin-bottom:0.75rem;"></div><div id="cafe-chase-msg-title" style="font-weight:800;font-size:1.35rem;margin-bottom:0.45rem;"></div><div id="cafe-chase-msg-body" style="font-weight:600;font-size:0.92rem;line-height:1.45;color:#6E5C49;white-space:pre-line;"></div>';
    el.appendChild(card);
    const stage = document.querySelector(".stage") || document.getElementById("town")?.parentElement || document.body;
    if (stage && getComputedStyle(stage).position === "static") stage.style.position = "relative";
    stage.appendChild(el);
    return el;
  }

  function syncCafeMessageDom() {
    const el = ensureMsgEl();
    if (!cafeMsg) {
      el.style.display = "none";
      return;
    }
    const accent = cafeMsg.tone === "good" ? "#3E7C74" : cafeMsg.tone === "bad" ? "#C0483E" : "#C4785A";
    const a = Math.min(1, cafeMsg.life / 0.35, (cafeMsg.max - cafeMsg.life) < 0.35 ? cafeMsg.life / 0.35 : 1);
    el.style.display = "flex";
    el.style.opacity = String(a);
    const card = document.getElementById("cafe-chase-msg-card");
    const bar = document.getElementById("cafe-chase-msg-accent");
    const title = document.getElementById("cafe-chase-msg-title");
    const body = document.getElementById("cafe-chase-msg-body");
    if (card) card.style.borderColor = accent;
    if (bar) bar.style.background = accent;
    if (title) title.textContent = cafeMsg.title;
    if (body) body.textContent = cafeMsg.body;
  }

  function showCafeMessage(title, body, duration, tone) {
    cafeMsg = {
      title: title || "",
      body: body || "",
      life: duration != null ? duration : 3.4,
      max: duration != null ? duration : 3.4,
      tone: tone || "alert",
    };
    syncCafeMessageDom();
  }

  function isBreedBgPixel(r, g, b) {
    // pale paper / white circle behind cartoons (same as game_demo)
    return r >= 232 && g >= 226 && b >= 214 && (r + g + b) >= 700;
  }

  function makeBreedCutout(img) {
    const size = 256;
    const c = document.createElement("canvas");
    c.width = size;
    c.height = size;
    const c2 = c.getContext("2d");
    c2.drawImage(img, 0, 0, size, size);
    const imageData = c2.getImageData(0, 0, size, size);
    const d = imageData.data;
    const visited = new Uint8Array(size * size);
    const stack = [];
    function tryPush(x, y) {
      if (x < 0 || y < 0 || x >= size || y >= size) return;
      const i = y * size + x;
      if (visited[i]) return;
      const o = i * 4;
      if (!isBreedBgPixel(d[o], d[o + 1], d[o + 2])) return;
      visited[i] = 1;
      stack.push(i);
    }
    for (let x = 0; x < size; x++) { tryPush(x, 0); tryPush(x, size - 1); }
    for (let y = 0; y < size; y++) { tryPush(0, y); tryPush(size - 1, y); }
    while (stack.length) {
      const i = stack.pop();
      d[i * 4 + 3] = 0;
      const x = i % size, y = (i / size) | 0;
      tryPush(x + 1, y); tryPush(x - 1, y); tryPush(x, y + 1); tryPush(x, y - 1);
    }
    for (let y = 1; y < size - 1; y++) {
      for (let x = 1; x < size - 1; x++) {
        const i = y * size + x;
        const o = i * 4;
        if (d[o + 3] === 0) continue;
        let near = false;
        for (let dy = -1; dy <= 1 && !near; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (d[((y + dy) * size + (x + dx)) * 4 + 3] === 0) { near = true; break; }
          }
        }
        if (near && isBreedBgPixel(d[o], d[o + 1], d[o + 2])) d[o + 3] = 0;
        else if (near) d[o + 3] = Math.min(d[o + 3], 200);
      }
    }
    c2.putImageData(imageData, 0, 0);
    return c;
  }

  function findBreedDataUri(breedId) {
    if (!breedId) return null;
    if (breedImgCache[breedId] && breedImgCache[breedId]._src) return breedImgCache[breedId]._src;
    const key = '"' + breedId + '"';
    for (let s = 0; s < document.scripts.length; s++) {
      const t = document.scripts[s].textContent || "";
      if (t.indexOf("const BREEDS") < 0) continue;
      let pos = t.indexOf(key);
      while (pos >= 0) {
        const slice = t.slice(pos, pos + 250000);
        const m = slice.match(/img:\s*"(data:image\/[a-zA-Z0-9+.-]+;base64,[A-Za-z0-9+/=]+)"/);
        if (m) return m[1];
        pos = t.indexOf(key, pos + key.length);
      }
    }
    return null;
  }

  const breedCutoutCache = Object.create(null);

  function getBreedCutout(breedId) {
    if (!breedId) return null;
    if (breedCutoutCache[breedId]) return breedCutoutCache[breedId];
    const img = getBreedSprite(breedId);
    if (img && ((img.complete && img.naturalWidth) || img.width)) {
      try {
        breedCutoutCache[breedId] = makeBreedCutout(img);
        return breedCutoutCache[breedId];
      } catch (e) {
        return img;
      }
    }
    if (img && !img._cutoutHooked) {
      img._cutoutHooked = true;
      img.addEventListener("load", () => {
        try { breedCutoutCache[breedId] = makeBreedCutout(img); } catch (e) { /* ignore */ }
      }, { once: true });
    }
    return null;
  }

  function getBreedSprite(breedId) {
    if (!breedId) return null;
    if (breedImgCache[breedId]) return breedImgCache[breedId];
    const src = findBreedDataUri(breedId);
    const img = new Image();
    if (src) {
      img._src = src;
      img.onload = () => {
        try { breedCutoutCache[breedId] = makeBreedCutout(img); } catch (e) { /* ignore */ }
      };
      img.src = src;
    }
    breedImgCache[breedId] = img;
    return img;
  }

  function seedCafeTrail(fromX, fromY) {
    cafeTrail.length = 0;
    // unused for side-by-side follow; kept for a soft handoff from chase position
    cafeTrail.push({ x: fromX, y: fromY });
  }

  function updateFollowBeside(dt) {
    if (!chase || !chase.dog) return;
    // Side-by-side like town: dog on the player's left, slightly lower
    const tx = mirror.x - 30;
    const ty = mirror.y + 6;
    const k = Math.min(1, dt * 7);
    chase.dog.x += (tx - chase.dog.x) * k;
    chase.dog.y += (ty - chase.dog.y) * k;
  }

  function drawMoodBubble(ctx, x, y, happiness) {
    const curve = ((happiness != null ? happiness : 60) - 50) / 50;
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = "#FFF7EA";
    ctx.strokeStyle = "rgba(58,44,34,0.25)";
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(0, 0, 9, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = "#3A2C22";
    ctx.beginPath(); ctx.arc(-3, -1, 0.9, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(3, -1, 0.9, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "#3A2C22";
    ctx.lineWidth = 1.2;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(-3.5, 2);
    ctx.quadraticCurveTo(0, 2 + curve * 3.5, 3.5, 2);
    ctx.stroke();
    ctx.restore();
  }

  function drawPlayerDog(ctx, x, y, dog, bob, withMood) {
    if (!dog) return;
    const cut = getBreedCutout(dog.breed);
    const img = cut || getBreedSprite(dog.breed);
    ctx.save();
    ctx.translate(x, y + (bob || 0));
    ctx.fillStyle = "rgba(58,44,34,0.16)";
    ctx.beginPath(); ctx.ellipse(0, 10, 11, 3.5, 0, 0, Math.PI * 2); ctx.fill();
    if (img && ((img.complete && img.naturalWidth) || img.width)) {
      ctx.drawImage(img, -18, -20, 36, 36);
      if (dog.accessory) {
        ctx.strokeStyle = dog.accessory;
        ctx.lineWidth = 3;
        ctx.lineCap = "round";
        ctx.beginPath(); ctx.arc(0, 8, 7, 0.2, Math.PI - 0.2); ctx.stroke();
      }
    } else {
      ctx.fillStyle = "#C8935B";
      ctx.beginPath(); ctx.ellipse(0, 4, 13, 8, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(12, 2, 6, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(-11, 0, 7, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
    if (withMood) drawMoodBubble(ctx, x + 16, y - 18 + (bob || 0), dog.happiness);
  }

  function startChase(HOUSE, state) {
    const floor = {
      x: HOUSE.x + HOUSE.wall + 40,
      y: HOUSE.y + 200,
      w: HOUSE.w - HOUSE.wall * 2 - 80,
      h: 170,
    };
    const dog = activeDog(state);
    const dogName = (dog && dog.name) || "your pup";
    if (dog) getBreedSprite(dog.breed);
    chase = {
      timeLeft: 15,
      introLeft: 2.6,
      phase: "intro",
      resolved: false,
      dog: {
        x: floor.x + floor.w * 0.55,
        y: floor.y + floor.h * 0.4,
        vx: 180,
        vy: -140,
      },
      floor,
    };
    cafeTrail.length = 0;
    showCafeMessage(
      "Leash slipped!",
      "Plot twist — " + dogName + " slipped the leash and is zooming between the tables!\nCatch them in 15 seconds before Willow Café becomes a pastry crime scene.",
      2.8,
      "alert"
    );
  }

  function resolveChase(state, success) {
    if (!chase || chase.resolved) return;
    chase.resolved = true;
    chase.phase = "follow";
    const dog = activeDog(state);
    const dogName = (dog && dog.name) || "Your pup";
    if (success) {
      if (dog) {
        dog.bond = Math.max(0, dog.bond + 15);
        dog.happiness = Math.min(100, dog.happiness + 15);
      }
      showCafeMessage(
        "Leash secured!",
        "Gotcha! " + dogName + " skids into a happy spin — flour on the nose, heart full.\n+15 Dog Bond & Happiness. The café exhales.",
        3.6,
        "good"
      );
      pushFloat("+15 Dog Bond!", mirror.x, mirror.y - 28);
      sfxPurchase();
    } else {
      state.money = Math.max(0, state.money - 50);
      if (dog) {
        dog.bond = Math.max(0, dog.bond - 10);
        dog.happiness = Math.max(0, dog.happiness - 10);
      }
      showCafeMessage(
        "Café chaos…",
        dogName + " ricocheted through a tray of croissants. Mara is… understanding. Mostly.\nShop damage fine: $50. Bond −10. At least " + dogName + " is back on the leash now.",
        4.2,
        "bad"
      );
      pushFloat("-$50", mirror.x, mirror.y - 28);
    }
    persist(state);
    // Reattach: follow the player like outside (trail delay)
    seedCafeTrail(chase.dog.x, chase.dog.y);
  }

  function updateChase(dt, HOUSE, state) {
    if (!chase) return;

    if (cafeMsg) {
      cafeMsg.life -= dt;
      if (cafeMsg.life <= 0) cafeMsg = null;
      syncCafeMessageDom();
    } else {
      const el = document.getElementById("cafe-chase-msg");
      if (el) el.style.display = "none";
    }

    if (chase.phase === "follow") {
      updateFollowBeside(dt);
      return;
    }

    if (chase.phase === "intro") {
      chase.introLeft -= dt;
      // gentle pacing during the reveal
      const d = chase.dog;
      d.x += Math.sin(performance.now() / 180) * 40 * dt;
      d.y += Math.cos(performance.now() / 220) * 28 * dt;
      if (chase.introLeft <= 0) {
        chase.phase = "chase";
        chase.introLeft = 0;
      }
      return;
    }

    if (chase.resolved) return;
    chase.timeLeft -= dt;
    const d = chase.dog;
    const f = chase.floor;
    if (Math.random() < 0.04) {
      const ang = Math.random() * Math.PI * 2;
      const sp = 140 + Math.random() * 160;
      d.vx = Math.cos(ang) * sp;
      d.vy = Math.sin(ang) * sp;
    }
    d.x += d.vx * dt;
    d.y += d.vy * dt;
    if (d.x < f.x) { d.x = f.x; d.vx = Math.abs(d.vx); }
    if (d.x > f.x + f.w) { d.x = f.x + f.w; d.vx = -Math.abs(d.vx); }
    if (d.y < f.y) { d.y = f.y; d.vy = Math.abs(d.vy); }
    if (d.y > f.y + f.h) { d.y = f.y + f.h; d.vy = -Math.abs(d.vy); }

    if (Math.hypot(mirror.x - d.x, mirror.y - d.y) < 34) {
      resolveChase(state, true);
      return;
    }
    if (chase.timeLeft <= 0) {
      chase.timeLeft = 0;
      resolveChase(state, false);
    }
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

  function onCafeEnter(api) {
    const HOUSE = api.HOUSE;
    const state = api.state;
    mirror.x = HOUSE.door.x + HOUSE.door.w / 2;
    mirror.y = HOUSE.y + HOUSE.h - HOUSE.wall - 40;
    floats = [];
    activeZone = null;
    chase = null;
    cafeTrail.length = 0;
    cafeMsg = null;
    lastLogicT = performance.now();
    if (playerHasDog(state) === true) {
      startChase(HOUSE, state);
    }
  }

  function onCafeExit() {
    cafeActive = false;
    activeZone = null;
    chase = null;
    cafeTrail.length = 0;
    cafeMsg = null;
    floats = [];
    const el = document.getElementById("cafe-chase-msg");
    if (el) el.style.display = "none";
    if (menuOpen) closeCafeMenu();
  }

  function tryInteract() {
    if (!cafeActive || !lastApi) return false;
    const state = lastApi.state;
    if (chase && chase.phase === "chase" && !chase.resolved && Math.hypot(mirror.x - chase.dog.x, mirror.y - chase.dog.y) < 42) {
      resolveChase(state, true);
      return true;
    }
    if (activeZone) {
      openCafeMenu(activeZone);
      return true;
    }
    return false;
  }

  // Capture-phase so café zones win over host "Cook orders" on E at counter
  window.addEventListener("keydown", (e) => {
    if (KEY_MAP[e.key]) keys[KEY_MAP[e.key]] = true;
    if (e.key === "Shift") keys.run = true;
    if (!cafeActive) return;
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
  }, true);

  document.addEventListener("click", (e) => {
    if (!cafeActive) return;
    const btn = e.target && e.target.closest && e.target.closest("#prompt-btn");
    if (!btn) return;
    if (activeZone || (chase && chase.phase === "chase" && !chase.resolved)) {
      if (tryInteract()) {
        e.preventDefault();
        e.stopImmediatePropagation();
      }
    }
  }, true);

  // Detect leaving the café when host stops drawing our interior
  setInterval(() => {
    if (cafeActive && performance.now() - lastDrawT > 400) onCafeExit();
  }, 200);

  function drawShelfGoods(ctx, HOUSE) {
    // Left pastry shelf — 3 icons over existing shelf slots
    const lx = HOUSE.x + 50, ly = HOUSE.y + 95;
    ["quick_biscuit", "fresh_croissant", "warm_muffin"].forEach((id, i) => {
      const col = i % 2, row = Math.floor(i / 2);
      drawFoodSprite(ctx, id, lx + 10 + col * 28, ly + 18 + row * 28, 20);
    });
    // Right savory shelf
    const rx = HOUSE.x + HOUSE.w - 110, ry = HOUSE.y + 95;
    ["fresh_sandwich", "hot_dog_roll", "bento_box"].forEach((id, i) => {
      const col = i % 2, row = Math.floor(i / 2);
      drawFoodSprite(ctx, id, rx + 10 + col * 28, ry + 18 + row * 28, 20);
    });
  }

  function drawCounterGoods(ctx, cx, cy) {
    drawFoodSprite(ctx, "gourmet_dog_treat", cx - 70, cy - 4, 22);
    drawFoodSprite(ctx, "coffee_bean_bag", cx + 48, cy - 4, 22);
  }

  function drawCoolerGoods(ctx, HOUSE) {
    const coolers = coolerRects(HOUSE);
    const lists = [
      ["iced_milk_tea", "fruit_smoothie"],
      ["fruit_jelly_cup", "rainbow_gelatin", "caramel_pudding"],
      ["popsicle", "double_ice_cream"],
    ];
    coolers.forEach((win, wi) => {
      // glass frame highlight (items sit inside the existing cooler windows)
      ctx.fillStyle = "rgba(255,255,255,0.12)";
      ctx.fillRect(win.x + 6, win.y + 6, win.w - 12, win.h - 12);
      const ids = lists[wi];
      ids.forEach((id, i) => {
        const n = ids.length;
        const gap = (win.w - 16) / n;
        drawFoodSprite(ctx, id, win.x + 8 + i * gap + (gap - 20) / 2, win.y + 14, 20);
      });
    });
  }

  function drawChaseDog(ctx, t, state) {
    if (!chase || !chase.dog) return;
    const dog = activeDog(state);
    const bob = chase.phase === "chase" ? Math.sin(t / 90) * 2 : Math.sin(t / 280) * 1.2;
    drawPlayerDog(ctx, chase.dog.x, chase.dog.y, dog, bob, chase.phase === "follow");
  }

  function drawChaseHud(ctx, W) {
    if (!chase || chase.phase !== "chase" || chase.resolved) return;
    const sec = Math.ceil(Math.max(0, chase.timeLeft));
    ctx.save();
    const bw = 200, bh = 30;
    const bx = (W || 900) / 2 - bw / 2;
    const by = 10;
    ctx.fillStyle = "rgba(58,44,34,0.72)";
    roundRectPath(ctx, bx, by, bw, bh, 10); ctx.fill();
    ctx.fillStyle = sec <= 5 ? "#F0C36A" : "#FBF0DE";
    ctx.font = "700 13px ui-rounded, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("Catch timer · " + sec + "s", bx + bw / 2, by + bh / 2);
    ctx.restore();
  }

  function roundRectPath(ctx, x, y, w, h, r) {
    const rr = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  }

  function drawFloats(ctx, dt) {
    floats = floats.filter((f) => {
      f.life -= dt;
      if (f.life <= 0) return false;
      const a = Math.min(1, f.life / 0.35);
      const rise = (1 - f.life / f.max) * 28;
      ctx.save();
      ctx.globalAlpha = a;
      ctx.fillStyle = "#2A2118";
      ctx.font = "700 13px ui-rounded, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(f.text, f.x + 1, f.y - rise + 1);
      ctx.fillStyle = "#FBF0DE";
      ctx.fillText(f.text, f.x, f.y - rise);
      ctx.restore();
      return true;
    });
  }

  function tickCafe(ctx, api, t, cx, cy) {
    const HOUSE = api.HOUSE;
    const state = api.state;
    const now = performance.now();
    const dt = Math.min(0.05, (now - lastLogicT) / 1000) || 0.016;
    lastLogicT = now;
    lastDrawT = now;
    lastApi = api;

    if (!cafeActive) {
      cafeActive = true;
      onCafeEnter(api);
    }

    if (!menuOpen) {
      // Allow movement during chase/follow; soft-lock less during intro message
      if (!(chase && chase.phase === "intro" && cafeMsg)) updateMirror(dt, HOUSE);
      updateChase(dt, HOUSE, state);
    }

    activeZone = findZone(HOUSE, mirror.x, mirror.y);

    const atDoor =
      mirror.y > HOUSE.y + HOUSE.h - HOUSE.wall - 48 &&
      mirror.x > HOUSE.door.x - 24 &&
      mirror.x < HOUSE.door.x + HOUSE.door.w + 24;
    const promptBtn = document.getElementById("prompt-btn");
    const promptText = document.getElementById("prompt-text");
    if (!atDoor && promptBtn && promptText) {
      if (chase && chase.phase === "chase" && !chase.resolved && Math.hypot(mirror.x - chase.dog.x, mirror.y - chase.dog.y) < 42) {
        promptText.textContent = "Catch dog!";
        promptBtn.style.display = "flex";
      } else if (chase && chase.phase === "chase" && !chase.resolved) {
        promptText.textContent = "Chase your dog!";
        promptBtn.style.display = "flex";
      } else if (activeZone) {
        promptText.textContent = activeZone.prompt;
        promptBtn.style.display = "flex";
      }
    }

    drawShelfGoods(ctx, HOUSE);
    drawCounterGoods(ctx, cx, cy);
    drawCoolerGoods(ctx, HOUSE);
    drawChaseDog(ctx, t, state);
    const W = ctx.canvas ? ctx.canvas.width : 900;
    drawChaseHud(ctx, W);
    drawFloats(ctx, dt);
    syncCafeMessageDom();
  }

  B.register({
    id: "cafe",
    info: { label: "Willow Café", wall: "#D4B896", floor: "#E8D4B0", accent: "#C4785A", activity: "Cook orders", blurb: "Espresso steam and pastry trays." },
    drawIcon(ctx, api, cx, cy) {
      const S = B.shared; S.bind(api);
      const roundRect = api.roundRect;
      const acShadow = S.acShadow, acWoodWall = S.acWoodWall,
        acGableRoof = S.acGableRoof,
        acDoor = S.acDoor, acWindow = S.acWindow;
      ctx.save();
      ctx.translate(cx, cy);
      acShadow(68, 60);
      acWoodWall(-54, 0, 108, 54, "#F1E3C6", true);
      acGableRoof(58, -46, 0, "#D9705C", "#E3998A");
      for (let i = 0; i < 7; i++) {
        ctx.fillStyle = i % 2 ? "#D9705C" : "#FBF0DE";
        roundRect(-48 + i * 14, -8, 14, 12, 2); ctx.fill();
      }
      acDoor(-11, 22, 22, 30, "#8C5A3B");
      acWindow(-40, 8, 18, 16);
      acWindow(22, 8, 18, 16);
      ctx.fillStyle = "#8C5A3B";
      ctx.beginPath(); ctx.moveTo(-6, -40); ctx.lineTo(6, -40); ctx.lineTo(4, -28); ctx.lineTo(-4, -28); ctx.closePath(); ctx.fill();
      ctx.restore();
    },

    drawInterior(ctx, api, t, cx, cy) {
      const roundRect = api.roundRect;
      const HOUSE = api.HOUSE;
      const drawBuildingPatron = api.drawBuildingPatron;
      const drawNpcNameTag = api.drawNpcNameTag;
      const drawBuildingShelf = api.drawBuildingShelf;
      const drawBuildingPlant = api.drawBuildingPlant;
      const drawBuildingTable = api.drawBuildingTable;
      const drawBuildingChair = api.drawBuildingChair;

      // Exact original layout furniture / collision anchors
      drawBuildingShelf(HOUSE.x + 50, HOUSE.y + 95, 60, 80, ["#D9705C", "#D98F2B", "#6B8E6B", "#5A7FB0"]);
      drawBuildingShelf(HOUSE.x + HOUSE.w - 110, HOUSE.y + 95, 60, 80, ["#E3998A", "#3E7C74", "#D98F2B", "#8A6BAE"]);
      [[70, 300], [175, 300], [605, 300], [710, 300]].forEach(([x, y]) => {
        drawBuildingTable(HOUSE.x + x, HOUSE.y + y, 60, 45);
        drawBuildingChair(HOUSE.x + x - 8, HOUSE.y + y + 38);
        drawBuildingChair(HOUSE.x + x + 38, HOUSE.y + y + 38);
      });
      drawBuildingPlant(HOUSE.x + 140, HOUSE.y + 200);
      drawBuildingPlant(HOUSE.x + HOUSE.w - 140, HOUSE.y + 200);
      for (let i = 0; i < 3; i++) {
        const sy = cy - 40 - ((t / 40 + i * 18) % 40);
        ctx.fillStyle = `rgba(255,255,255,${0.25 - i * 0.05})`;
        ctx.beginPath(); ctx.ellipse(cx - 40 + i * 20, sy, 5, 8, 0, 0, Math.PI * 2); ctx.fill();
      }
      drawBuildingPatron(HOUSE.x + 95, HOUSE.y + 360, "#F0C08A", "#8A6BAE", "#3A2417", Math.sin(t / 500) * 1.5);
      drawNpcNameTag(HOUSE.x + 95, HOUSE.y + 336, "Theo");
      drawBuildingPatron(HOUSE.x + 640, HOUSE.y + 355, "#D9A066", "#5A7FB0", "#6B4423", Math.sin(t / 450 + 1) * 1.5);
      drawNpcNameTag(HOUSE.x + 640, HOUSE.y + 331, "Pip");
      drawBuildingPatron(HOUSE.x + 400, HOUSE.y + 380, "#F7D9B6", "#D98F2B", "#B5651D", Math.sin(t / 470) * 1.3);
      drawNpcNameTag(HOUSE.x + 400, HOUSE.y + 356, "Sam");
      drawBuildingPatron(cx + 40, cy - 28, "#B87A4B", "#C4785A", "#111111", Math.sin(t / 600) * 1);
      drawNpcNameTag(cx + 40, cy - 52, "Mara");

      tickCafe(ctx, api, t, cx, cy);
    },
  });
})();
