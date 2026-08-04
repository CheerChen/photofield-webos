/* Entry point: shared app services and boot. Screen visibility, overlay
 * layering, key activation, and back behavior are owned by Navigation. */
(function () {
  const $ = (id) => document.getElementById(id);

  window.App = {
    back() {
      window.Navigation.pop();
    },

    exit() {
      // disableBackHistoryAPI is on: the app must close itself.
      window.WebOSPlatform.exitApp();
    },

    toast(msg, ms, kind) {
      // kind === "error" uses a separate top-center slot with a longer
      // default lifetime, so a routine toast (track name, "扫描完成") can
      // not overwrite a critical "playback stopped" message.
      const el = kind === "error" ? $("toast-error") : $("toast");
      el.textContent = msg;
      el.hidden = false;
      clearTimeout(el._toastTimer);
      el._toastTimer = setTimeout(
        () => (el.hidden = true),
        ms || (kind === "error" ? 6000 : 3000)
      );
    },
  };

  async function boot() {
    window.Keys.bind("sources", (e) => window.SourcesScreen.onKey(e));
    window.Keys.bind("collections", (e) => window.CollectionsScreen.onKey(e));
    window.Keys.bind("grid", (e) => window.GridScreen.onKey(e));
    window.Keys.bind("viewer", (e) => window.ViewerScreen.onKey(e));
    window.Keys.bind("kiosk", (e) => window.KioskScreen.onKey(e));
    window.Keys.bind("pin", (e) => window.Pin.onKey(e));
    window.Keys.bind("ipinput", (e) => window.IpInput.onKey(e));
    window.Keys.bind("settings", (e) => window.SettingsScreen.onKey(e));


    // Discover sources by probing the port range. Cached sources (from
    // localStorage) are already loaded synchronously by Sources, so the
    // screen can render immediately if the discovery is slow.
    window.SourcesScreen.open();
    await window.Sources.discover();
    if (window.Keys.current() === "sources") window.SourcesScreen.refresh();

    // Cold-start straight into the kiosk when configured and possible.
    if (window.Store.get("startup") === "kiosk" && window.Store.get("lastSource")) {
      const source = window.Sources.byId(window.Store.get("lastSource"));
      if (source) {
        window.Playback.resume(source, {
          onError: () => window.SourcesScreen.open(),
        });
        return;
      }
    }
    window.SourcesScreen.open();
  }

  document.addEventListener("DOMContentLoaded", boot);
})();
