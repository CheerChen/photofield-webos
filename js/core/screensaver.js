/* Screensaver inhibition via Luna tvpower service.
 *
 * webOS runs an idle timer even when a web app is playing audio or animating
 * a canvas. Without a veto the screensaver drops over the app mid-playback.
 * This module registers a subscription on
 * luna://com.webos.service.tvpower/power/registerScreenSaverRequest and
 * replies ack:false to every request to keep the screen active.
 *
 * Three silent failure modes (see references/tvpower-screensaver.md):
 *  1. App not on the Luna bus — needs the three role/permission/manifest
 *     files + ls-control scan-services + cold restart.
 *  2. Wrong payload field — must be `ack` (boolean), not `response`.
 *  3. Re-registration returns -3 on Page.reload — handled by re-registering
 *     under a suffixed clientName.
 *
 * Bridge objects must be kept alive (window.__ssBridges) or GC eats the
 * callback before it fires. */
(function () {
  const APPID = "com.cheerchen.photofield";
  const REGISTER_URI = "luna://com.webos.service.tvpower/power/registerScreenSaverRequest";
  const RESPONSE_URI = "luna://com.webos.service.tvpower/power/responseScreenSaverRequest";

  let registered = false;
  let clientName = null;
  let active = false; // whether we are currently vetoing

  // Keep bridge references alive so GC does not eat callbacks.
  window.__ssBridges = window.__ssBridges || [];

  function newBridge() {
    const b = new PalmServiceBridge();
    window.__ssBridges.push(b);
    return b;
  }

  // Register a screensaver-request subscription. On -3 (already registered,
  // happens after Page.reload) re-register under a suffixed name.
  function register(name) {
    const b = newBridge();
    b.onservicecallback = (msg) => {
      let res;
      try { res = JSON.parse(msg); } catch (e) { return; }

      // -3: client already registered — re-register with a fresh suffix.
      if (res.returnValue === false && String(res.errorCode) === "-3") {
        registered = false;
        register(APPID + "." + Date.now());
        return;
      }

      if (res.returnValue === true && res.subscribed) {
        registered = true;
        return;
      }

      // A request arrived (has timestamp, no subscribed field).
      if (res.timestamp != null) {
        if (active) {
          respond(res.timestamp, false);
        }
      }
    };
    clientName = name;
    b.call(REGISTER_URI, JSON.stringify({ clientName: name, subscribe: true }));
  }

  function respond(timestamp, ack) {
    const b = newBridge();
    b.onservicecallback = () => {};
    b.call(RESPONSE_URI, JSON.stringify({
      clientName: clientName,
      timestamp: timestamp,
      ack: ack,
    }));
  }

  window.Screensaver = {
    // Start vetoing the screensaver. Safe to call multiple times.
    inhibit() {
      active = true;
      if (!registered) {
        register(APPID + "." + Date.now());
      }
    },

    // Stop vetoing — let the screensaver appear on the next idle timeout.
    // The subscription stays alive (there is no unregister method); we just
    // stop answering with ack:false.
    allow() {
      active = false;
    },
  };
})();
