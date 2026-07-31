/* Slideshow engine: ordered/shuffled playback over one or more collections
 * with a 3-image memory window (prev/current/next). The TV has 2.5GB RAM
 * shared with the system — never hold more than these three decoded images. */
(function () {
  function createPlayer(opts) {
    const {
      client,
      collections, // [collectionId, ...] — chained into one order
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
    const cache = new Map(); // pos -> Image (only pos-1..pos+1 kept)

    async function buildOrder() {
      const parts = [];
      for (const c of collections) {
        const count = await client.photoCount(c);
        for (let i = 0; i < count; i++) parts.push({ c, i });
      }
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
        onPhoto(photo, client.previewUrl(photo, 1920), pos, order.length);
        schedule();
      } catch (e) {
        if (onError) onError(e);
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
