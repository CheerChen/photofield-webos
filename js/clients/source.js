/* Source registry + client contract.
 *
 * A "source" is one upstream server. The app never mixes sources: the
 * current source is top-level state and switching means going back to the
 * source screen.
 *
 * Sources are discovered at boot by probing a port range on a configurable
 * host (default 192.168.0.110, ports 8000-8010). Each responsive port is
 * verified as a photofield instance via /api/collections, and its display
 * name is derived from the top-level directory of its collections.
 *
 * Client contract (implemented per upstream, see photofield.js):
 *   collections()            -> Promise<[{id, name, count}]>
 *   photoCount(collectionId) -> Promise<number>
 *   photoAt(collectionId, i) -> Promise<Photo|null>   (null = hole, skip it)
 *   slice(collectionId, y, h)-> Promise<[{i, x, y, w, h, photo}]>  grid rows
 *   thumbCandidates(photo, width)   -> ordered grid-thumbnail URLs
 *   ambienceCandidates(photo, width)-> ordered low-res blur-layer URLs, never the original
 *   previewCandidates(photo, width) -> ordered fullscreen-image URLs
 *   thumbUrl/previewUrl              -> preferred URL compatibility helpers
 *   originalUrl(photo)               -> untouched file bytes
 *
 * Photo = {id, width, height, takenAt, isVideo, filename}
 */
(function () {
  const STORE_KEY = "photofield.sources.v1";
  const HOST_KEY = "photofield.host";
  const DEFAULT_HOST = "192.168.0.110";
  const PORT_START = 8000;
  const PORT_END = 8010;
  const PROBE_TIMEOUT_MS = 1500;

  let sources = [];
  const clientCache = new Map();
  // In-memory scan state keyed by source id. Not persisted: a reboot clears
  // it, which is correct because no scan is in flight across an app restart.
  // Kept separate from `sources` so discover() rebuilds preserve it (the
  // port-based id is stable across a re-probe) and the UI can grey a card
  // even while counts are still loading.
  const busy = new Map(); // sourceId -> { status: "scanning" | "error" }

  /* Derive a human-friendly name from the collection directory paths.
   * e.g. "/X/yukiAstra/" -> "X", "/wallpaper/sub/" -> "Wallpaper",
   * "/wf/20230730_WF/" -> "WF". Falls back to the port number. */
  function deriveName(collections, port) {
    for (const c of collections) {
      const dirs = c.dirs || [];
      for (const d of dirs) {
        const m = d.match(/^\/([^/]+)/);
        if (m && m[1] !== "data") {
          const name = m[1];
          return name.charAt(0).toUpperCase() + name.slice(1);
        }
      }
    }
    return ":" + port;
  }

  async function probePort(host, port) {
    const base = "http://" + host + ":" + port;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), PROBE_TIMEOUT_MS);
    try {
      const r = await fetch(base + "/api/collections", { signal: ctrl.signal });
      if (!r.ok) return null;
      const data = await r.json();
      const cols = data.items || [];
      if (cols.length === 0) return null;
      return { base, cols };
    } catch (e) {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  /* Scan the port range and rebuild the source list. Resolves to the new
   * source array. Also persists to localStorage so the UI can render
   * immediately on next boot while a refresh runs in the background. */
  async function discover() {
    const host = window.Store.get(HOST_KEY) || DEFAULT_HOST;
    const found = [];

    // Probe all ports in parallel for speed.
    const probes = [];
    for (let port = PORT_START; port <= PORT_END; port++) {
      probes.push(
        probePort(host, port).then((result) => {
          if (!result) return;
          const id = "port-" + port;
          const name = deriveName(result.cols, port);
          // Preserve locked flag from previous config.
          const prev = sources.find((s) => s.id === id);
          found.push({
            id,
            name,
            baseUrl: result.base,
            locked: prev ? prev.locked : false,
          });
        })
      );
    }
    await Promise.all(probes);

    // Sort by port number (which is the natural order).
    found.sort((a, b) => {
      const pa = parseInt(a.id.replace("port-", ""), 10);
      const pb = parseInt(b.id.replace("port-", ""), 10);
      return pa - pb;
    });

    // An empty scan (server rebooting, router down, wrong host) must NOT
    // wipe the cached source list: lastSource would be invalidated and the
    // kiosk autostart would silently break until a manual rescan. Only
    // overwrite when at least one instance responded; otherwise keep the
    // cached list (still in effect via Sources.all()) and return it so the
    // return value matches the live state callers render against.
    if (found.length > 0) {
      sources = found;
      persist();
    }
    return sources;
  }

  function persist() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(sources));
    } catch (e) {
      /* ignore quota errors */
    }
  }

  function loadCached() {
    try {
      const cached = JSON.parse(localStorage.getItem(STORE_KEY) || "[]");
      if (Array.isArray(cached) && cached.length > 0) {
        sources = cached;
      }
    } catch (e) {
      /* ignore */
    }
  }

  // Load cached sources synchronously so the UI has something to show
  // immediately; discover() will update them in the background.
  loadCached();

  window.Sources = {
    all: () => sources,
    byId: (id) => sources.find((s) => s.id === id),
    discover,
    client(source) {
      if (!clientCache.has(source.id)) {
        clientCache.set(source.id, window.PhotofieldClient.create(source));
      }
      return clientCache.get(source.id);
    },
    busy: (id) => busy.get(id) || null,
    setBusy(id, info) { busy.set(id, info); },
    clearBusy(id) { busy.delete(id); },
  };
})();
