/* Slideshow engine: ordered/shuffled playback over one or more collections
 * with a 3-image memory window (prev/current/next). The TV has 2.5GB RAM
 * shared with the system — never hold more than these three decoded images. */
(function () {
  function createPlayer(opts) {
    const {
      client,
      collections, // [collectionId, ...] — chained into one order
      counts, // optional [number] aligned with collections; when supplied,
              // buildOrder skips per-collection photoCount() so the pi does
              // not have to create+poll N scenes before the first photo.
              // Falls back to photoCount() when absent (e.g. unit tests).
      shuffle,
      start, // {collectionId, index} to start from, else 0
      duration,
      onPhoto,
      onError,
    } = opts;
    let order = []; // [{c, i}]
    let pos = 0;
    let timer = null;
    let paused = false;
    let stopped = false;
    let consecutiveErrors = 0;
    const cache = new Map(); // pos -> Image (only pos-1..pos+1 kept)

    async function buildOrder() {
      // Prefer pre-supplied counts (from collections().indexed_count) so
      // scene creation is deferred to the first photoAt touch instead of
      // fan-out across every collection. Without counts, fall back to
      // parallel photoCount() — which forces ensureScene on each.
      const nums = counts
        ? counts
        : await Promise.all(collections.map((c) => client.photoCount(c)));
      const parts = [];
      collections.forEach((c, ci) => {
        for (let i = 0; i < nums[ci]; i++) parts.push({ c, i });
      });
      if (shuffle) {
        for (let i = parts.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [parts[i], parts[j]] = [parts[j], parts[i]];
        }
      }
      order = parts;
      pos = 0;
      if (start) {
        const at = order.findIndex((e) => e.c === start.collectionId && e.i === start.index);
        if (at >= 0) pos = at;
      }
      if (!order.length) throw new Error("empty collection");
    }

    function preload(p) {
      if (p < 0 || p >= order.length || cache.has(p)) return;
      const entry = order[p];
      const img = new Image();
      // Resolve metadata lazily: src set once photoAt resolves.
      client.photoAt(entry.c, entry.i).then((photo) => {
        if (!stopped && photo) img.src = client.previewUrl(photo, 1920);
      }).catch(() => {});
      cache.set(p, img);
    }

    function prune() {
      for (const [p, img] of cache) {
        if (Math.abs(p - pos) > 1) {
          img.src = "";
          cache.delete(p);
        }
      }
    }

    async function show() {
      if (stopped) return;
      prune();
      preload(pos + 1);
      preload(pos - 1);
      const entry = order[pos];
      try {
        const photo = await client.photoAt(entry.c, entry.i);
        if (stopped) return;
        if (!photo) return next(); // hole in region ids — skip
        consecutiveErrors = 0;
        onPhoto(photo, client.previewUrl(photo, 1920), pos, order.length);
        schedule();
      } catch (e) {
        consecutiveErrors++;
        if (onError) onError(e);
        if (consecutiveErrors >= 3) {
          // Server is likely down or pool exhausted — stop spinning.
          // Signal via a stable error code, not a localized message string:
          // kiosk.js branches on e.code === "STOPPED" so wording changes
          // can't break the control flow.
          stopped = true;
          if (onError) {
            const err = new Error("服务器连续错误，已停止播放");
            err.code = "STOPPED";
            onError(err);
          }
          return;
        }
        next();
      }
    }

    function schedule() {
      clearTimeout(timer);
      if (!paused && !stopped) timer = setTimeout(next, duration * 1000);
    }

    function next() {
      if (stopped) return;
      pos = (pos + 1) % order.length;
      show();
    }

    function prev() {
      if (stopped) return;
      pos = (pos - 1 + order.length) % order.length;
      show();
    }

    return {
      start: buildOrder().then(show),
      next,
      prev,
      togglePause() {
        paused = !paused;
        schedule();
        return paused;
      },
      stop() {
        stopped = true;
        clearTimeout(timer);
        prune();
        for (const [, img] of cache) img.src = "";
        cache.clear();
      },
    };
  }

  window.Player = { create: createPlayer };
})();
