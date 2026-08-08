/**
 * Café cook-order minigame + Ghostpixxells station icons.
 * Food sprites: js/buildings/cafe/food/
 *
 * game_demo.html calls: PawsCafeCook.openJob(api)
 * api needs: state, openModal, closeModal, SFX, setEnergy, saveState, updateHud,
 *            modalBody (element), setModalCleanup(fn)
 */
(function (global) {
  const FOOD_DIR = "js/buildings/cafe/food/";

  const stations = [
    { id: "bread", name: "Bread", color: "#D9A066", sprite: "07_bread.png" },
    { id: "veg", name: "Veggie", color: "#6B8E6B", sprite: "40_eggsalad.png" },
    { id: "grill", name: "Grill", color: "#B5654A", sprite: "95_steak.png" },
    { id: "plate", name: "Plate", color: "#CFE7F2", sprite: "01_dish.png" },
  ];

  const COOK_CSS = `
.recipe-card{
  display:flex; gap:0.55rem; justify-content:center; align-items:center; padding:0.75rem;
  border-radius:14px; border:1px solid var(--line); background: rgba(255,255,255,0.55);
}
.recipe-icon{ opacity:0.35; filter: grayscale(1); transition: opacity 0.2s, filter 0.2s, transform 0.2s; }
.recipe-icon.done{ opacity:0.5; filter: grayscale(0.6); }
.recipe-icon.next{ opacity:1; filter: grayscale(0); transform: scale(1.25); }
.station-tile{
  aspect-ratio:1; border-radius:16px; background: rgba(255,255,255,0.5); border:2px solid var(--line-strong);
  display:flex; flex-direction:column; align-items:center; justify-content:center; gap:0.2rem;
  cursor:pointer; user-select:none; transition: background 0.12s, transform 0.08s;
}
.station-tile span{ font-family: var(--mono); font-size:0.6rem; color: var(--ink-soft); }
.station-tile:active{ transform: scale(0.94); background: var(--marigold-pale); }
.station-food{
  width:36px; height:36px; image-rendering: pixelated; image-rendering: crisp-edges;
  object-fit: contain; display:block; filter: drop-shadow(0 1px 0 rgba(58,44,34,0.12));
}
.recipe-icon .station-food{ width:28px; height:28px; }
.recipe-icon.next .station-food{ filter: drop-shadow(0 1px 2px rgba(196,120,90,0.35)); }
`.trim();

  function ensureStyles() {
    if (document.getElementById("paws-cafe-cook-css")) return;
    const style = document.createElement("style");
    style.id = "paws-cafe-cook-css";
    style.textContent = COOK_CSS;
    document.head.appendChild(style);
  }

  function stationIcon(id, color) {
    const st = stations.find((s) => s.id === id);
    if (st && st.sprite) {
      return (
        '<img class="station-food" src="' +
        FOOD_DIR +
        st.sprite +
        '" alt="' +
        st.name +
        '" width="36" height="36" draggable="false">'
      );
    }
    const c = color || "#D9A066";
    switch (id) {
      case "veg":
        return (
          '<svg viewBox="0 0 24 24" width="26" height="26"><circle cx="8" cy="9" r="5" fill="' +
          c +
          '"/><circle cx="15" cy="7" r="4" fill="' +
          c +
          '"/><circle cx="16" cy="13" r="5" fill="' +
          c +
          '"/></svg>'
        );
      case "grill":
        return (
          '<svg viewBox="0 0 24 24" width="26" height="26"><path d="M12 2c2 3-1 4-1 6a3 3 0 0 0 6 0c0-1-1-2-1-3 2 2 3 5 3 7a6 6 0 0 1-12 0c0-4 3-6 5-10Z" fill="' +
          c +
          '"/></svg>'
        );
      case "plate":
        return (
          '<svg viewBox="0 0 24 24" width="26" height="26"><circle cx="12" cy="12" r="9" fill="' +
          c +
          '"/><circle cx="12" cy="12" r="5.5" fill="#fff" opacity="0.5"/></svg>'
        );
      default:
        return (
          '<svg viewBox="0 0 24 24" width="26" height="26"><rect x="4" y="9" width="16" height="9" rx="4.5" fill="' +
          c +
          '"/><rect x="4" y="7" width="16" height="6" rx="3" fill="' +
          c +
          '" opacity="0.7"/></svg>'
        );
    }
  }

  function makeRecipe(len) {
    const seq = [];
    for (let i = 0; i < len; i++) {
      seq.push(stations[Math.floor(Math.random() * stations.length)].id);
    }
    return seq;
  }

  function openJob(api) {
    if (!api || !api.state || !api.openModal) {
      console.warn("PawsCafeCook.openJob needs a game api");
      return;
    }
    ensureStyles();
    const state = api.state;
    const openModal = api.openModal;
    const closeModal = api.closeModal;
    const SFX = api.SFX || {};
    const setEnergy = api.setEnergy || function () {};
    const saveState = api.saveState || function () {};
    const updateHud = api.updateHud || function () {};
    const modalBody = api.modalBody;
    const setModalCleanup = api.setModalCleanup || function () {};

    if (state.energy < 10) {
      openModal(
        '<h3>Café - Cook the Order</h3><div class="flavor-box">You\'re too tired to work right now. Head home and sleep to restore energy.</div>'
      );
      return;
    }

    openModal(
      "<h3>Café - Cook the Order</h3>" +
        '<p class="modal-sub">Tap the stations in the order shown on the ticket, before time runs out.</p>' +
        '<div class="mg-scoreline"><span>Order <b id="ck-order-num">1</b> / 4</span><span>Tips: $<b id="ck-money">0</b></span></div>' +
        '<div class="mg-timerbar"><div class="mg-timerfill" id="ck-timerfill" style="width:100%"></div></div>' +
        '<div class="recipe-card" id="ck-recipe"></div>' +
        '<div class="mg-grid" id="ck-stations" style="grid-template-columns:repeat(4,1fr);">' +
        stations
          .map(function (s) {
            return (
              '<div class="station-tile" data-id="' +
              s.id +
              '">' +
              stationIcon(s.id, s.color) +
              "<span>" +
              s.name +
              "</span></div>"
            );
          })
          .join("") +
        "</div>"
    );
    startCooking({
      state: state,
      openModal: openModal,
      closeModal: closeModal,
      SFX: SFX,
      setEnergy: setEnergy,
      saveState: saveState,
      updateHud: updateHud,
      modalBody: modalBody,
      setModalCleanup: setModalCleanup,
    });
  }

  function startCooking(api) {
    const ORDERS_TOTAL = 4;
    let orderNum = 1;
    let sequence = [];
    let stepIdx = 0;
    let sessionMoney = 0;
    let ended = false;
    let tickInterval = null;
    let deadline = 0;
    const DURATION = 11000;

    const recipeEl = document.getElementById("ck-recipe");
    const timerFill = document.getElementById("ck-timerfill");
    const orderNumEl = document.getElementById("ck-order-num");
    const moneyEl = document.getElementById("ck-money");

    function renderRecipe() {
      recipeEl.innerHTML = sequence
        .map(function (id, i) {
          const st = stations.find(function (s) {
            return s.id === id;
          });
          const cls = i < stepIdx ? "done" : i === stepIdx ? "next" : "";
          return (
            '<div class="recipe-icon ' +
            cls +
            '">' +
            stationIcon(id, st.color) +
            "</div>"
          );
        })
        .join("");
    }

    function newOrder() {
      if (orderNum > ORDERS_TOTAL) {
        finishCooking();
        return;
      }
      orderNumEl.textContent = orderNum;
      sequence = makeRecipe(3 + Math.min(2, Math.floor(orderNum / 2)));
      stepIdx = 0;
      deadline = performance.now() + DURATION;
      renderRecipe();
    }

    function onStationClick(e) {
      if (ended) return;
      const id = e.currentTarget.dataset.id;
      if (id === sequence[stepIdx]) {
        stepIdx++;
        if (api.SFX.hit) api.SFX.hit();
        renderRecipe();
        if (stepIdx >= sequence.length) {
          const remainingFrac = Math.max(0, (deadline - performance.now()) / DURATION);
          const tip = 4 + Math.round(remainingFrac * 6);
          sessionMoney += tip;
          api.state.money += tip;
          api.updateHud();
          moneyEl.textContent = sessionMoney;
          if (api.SFX.purchase) api.SFX.purchase();
          orderNum++;
          setTimeout(newOrder, 500);
        }
      }
    }
    document.querySelectorAll(".station-tile").forEach(function (t) {
      t.addEventListener("click", onStationClick);
    });

    tickInterval = setInterval(function () {
      if (ended) return;
      const remaining = Math.max(0, deadline - performance.now());
      timerFill.style.width = (remaining / DURATION) * 100 + "%";
      if (remaining <= 0) {
        orderNum++;
        newOrder();
      }
    }, 100);

    function cleanup() {
      ended = true;
      clearInterval(tickInterval);
    }
    api.setModalCleanup(cleanup);

    function finishCooking() {
      cleanup();
      api.setEnergy(api.state.energy - 10);
      api.saveState(true);
      if (!api.modalBody) return;
      api.modalBody.innerHTML =
        "<h3>Café - Cook the Order</h3>" +
        '<div class="result-text">Shift complete!</div>' +
        '<div class="flavor-box">You earned $' +
        sessionMoney +
        " in tips.</div>" +
        '<div class="action-row">' +
        '<button class="action-btn ghost" id="ck-again">Work Again</button>' +
        '<button class="action-btn" id="ck-done">Done</button>' +
        "</div>";
      document.getElementById("ck-done").addEventListener("click", api.closeModal);
      document.getElementById("ck-again").addEventListener("click", function () {
        openJob(api);
      });
    }

    newOrder();
  }

  global.PawsCafeCook = {
    foodDir: FOOD_DIR,
    stations: stations,
    stationIcon: stationIcon,
    openJob: openJob,
  };
})(typeof window !== "undefined" ? window : globalThis);
