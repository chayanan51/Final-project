/**
 * Café cook-order station icons (Ghostpixxells pixel food).
 * Loaded by game_demo.html — keeps cook UI assets with the café module.
 */
(function (global) {
  const FOOD_DIR = "js/buildings/cafe/food/";

  const stations = [
    { id: "bread", name: "Bread", color: "#D9A066", sprite: "07_bread.png" },
    { id: "veg", name: "Veggie", color: "#6B8E6B", sprite: "40_eggsalad.png" },
    { id: "grill", name: "Grill", color: "#B5654A", sprite: "95_steak.png" },
    { id: "plate", name: "Plate", color: "#CFE7F2", sprite: "01_dish.png" },
  ];

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

  global.PawsCafeCook = {
    foodDir: FOOD_DIR,
    stations: stations,
    stationIcon: stationIcon,
  };
})(typeof window !== "undefined" ? window : globalThis);
