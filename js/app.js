/* Entry point: screen manager and boot. Navigation is explicit — each
 * screen knows its parent (see backTarget on grid / returnTo on kiosk). */
(function () {
  const $ = (id) => document.getElementById(id);
  const SCREENS = ["sources", "collections", "grid", "viewer", "kiosk"];
  let toastTimer = null;

  window.App = {
    show(name) {
      for (const s of SCREENS) $("screen-" + s).hidden = s !== name;
      window.Keys.activate(name);
    },

    back() {
      window.App.show("sources");
    },

    exit() {
      // disableBackHistoryAPI is on: the app must close itself.
      window.close();
    },

    toast(msg, ms) {
      const el = $("toast");
      el.textContent = msg;
      el.hidden = false;
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => (el.hidden = true), ms || 3000);
    },
  };

  function boot() {
    window.Keys.bind("sources", (e) => window.SourcesScreen.onKey(e));
    window.Keys.bind("collections", (e) => window.CollectionsScreen.onKey(e));
    window.Keys.bind("grid", (e) => window.GridScreen.onKey(e));
    window.Keys.bind("viewer", (e) => window.ViewerScreen.onKey(e));
    window.Keys.bind("kiosk", (e) => window.KioskScreen.onKey(e));
    window.Keys.bind("pin", (e) => window.Pin.onKey(e));
    window.Keys.bind("settings", (e) => window.SettingsScreen.onKey(e));

    $("grid-viewport").addEventListener("scroll", (e) =>
      window.GridScreen.onScroll(e.target.scrollTop)
    );

    // Cold-start straight into the kiosk when configured and possible.
    if (window.Store.get("startup") === "kiosk" && window.Store.get("lastSource")) {
      const source = window.Sources.byId(window.Store.get("lastSource"));
      if (source) {
        // Locked sources still ask for the PIN even on kiosk autostart.
        window.Pin.gate(source, async () => {
          try {
            const client = window.Sources.client(source);
            const cols = await client.collections();
            const lastCol = window.Store.get("lastCollection");
            const ids = lastCol && cols.some((c) => c.id === lastCol)
              ? [lastCol]
              : cols.map((c) => c.id);
            window.KioskScreen.open(source, ids, { shuffle: true });
          } catch (e) {
            window.App.toast("无法连接 " + source.name);
            window.SourcesScreen.open();
          }
        });
        return;
      }
    }
    window.SourcesScreen.open();
  }

  document.addEventListener("DOMContentLoaded", boot);
})();
