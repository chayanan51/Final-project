/**
 * Building registry — teammates register one module per building.
 * Loaded before game_demo.html main logic.
 */
(function (global) {
  const PawsBuildings = {
    map: Object.create(null),
    shared: {},
    register(mod) {
      if (!mod || !mod.id) throw new Error("Building module needs an id");
      this.map[mod.id] = mod;
      return mod;
    },
    get(id) {
      return this.map[id] || null;
    },
    all() {
      return Object.values(this.map);
    },
    buildInfo() {
      const info = {};
      this.all().forEach((m) => {
        if (m.info) info[m.id] = Object.assign({}, m.info);
      });
      return info;
    },
    drawIcon(id, ctx, api, cx, cy) {
      const m = this.get(id);
      if (m && typeof m.drawIcon === "function") {
        m.drawIcon(ctx, api, cx, cy);
        return true;
      }
      return false;
    },
    drawInterior(id, ctx, api, t, cx, cy) {
      const m = this.get(id);
      if (m && typeof m.drawInterior === "function") {
        m.drawInterior(ctx, api, t, cx, cy);
        return true;
      }
      return false;
    },
    getSolids(id, HOUSE) {
      const m = this.get(id);
      if (m && typeof m.getSolids === "function") {
        return m.getSolids(HOUSE) || [];
      }
      return null;
    },
  };
  global.PawsBuildings = PawsBuildings;
})(typeof window !== "undefined" ? window : globalThis);
