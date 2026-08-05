/* Slideshow engine: ordered/shuffled playback over one or more collections
 * with a 3-image memory window (prev/current/next). The TV has 2.5GB RAM
 * shared with the system — never hold more than these three decoded images. */
(function () {
  const MAX_CONSECUTIVE_ERRORS = 5;
  const RESOLVED_URL_CACHE_MAX = 64;

  function cancelledError() {
    const error = new Error("image load cancelled");
    error.code = "CANCELLED";
    return error;
  }

  function holeError() {
    const error = new Error("photo region is empty");
    error.code = "HOLE";
    return error;
  }

  function skippedError() {
    const error = new Error("photo outside media scope");
    error.code = "SKIPPED";
    return error;
  }

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
      photosOnly, // skip videos entirely (mediaScope "photos")
      onPhoto,
      onError,
      onNavigate,
    } = opts;
    let order = []; // [{c, i}]
    let pos = 0;
    let dir = 1; // last navigation direction; holes/skips step the same way
    let skipRun = 0; // consecutive holes/skips; a full lap means nothing playable
    let timer = null;
    let paused = false;
    let stopped = false;
    let consecutiveErrors = 0;
    const showGeneration = window.Generation.create();
    const cache = new Map(); // pos -> in-flight/decoded image state
    // "collection:index" -> last good URL, most-recent-first.
    const resolvedUrls = window.LRU.create(RESOLVED_URL_CACHE_MAX);

    function entryKey(entry) {
      return entry.c + ":" + entry.i;
    }

    function previewCandidates(photo, preferred) {
      return window.Media.previewCandidates(client, photo, preferred);
    }

    function ensurePreview(p) {
      if (p < 0 || p >= order.length) {
        return Promise.reject(new Error("photo position out of range"));
      }
      const existing = cache.get(p);
      if (existing && !existing.cancelled) return existing.promise;

      const entry = order[p];
      const key = entryKey(entry);
      const state = {
        cancelled: false,
        request: null,
        image: null,
        photo: null,
        url: null,
      };

      state.promise = Promise.resolve()
        .then(() => client.photoAt(entry.c, entry.i))
        .then((photo) => {
          if (stopped || state.cancelled) throw cancelledError();
          if (!photo) throw holeError();
          if (photosOnly && photo.isVideo) throw skippedError();
          state.photo = photo;
          const preferred = resolvedUrls.get(key);
          const candidates = previewCandidates(photo, preferred);
          if (!window.ImageLoader) throw new Error("ImageLoader unavailable");
          state.request = window.ImageLoader.load(candidates);
          return state.request.promise;
        })
        .then((result) => {
          if (stopped || state.cancelled) throw cancelledError();
          state.image = result.image;
          state.url = result.url;
          resolvedUrls.set(key, result.url);
          return { photo: state.photo, url: state.url, image: state.image };
        })
        .catch((error) => {
          // A failed preload must not poison the collection/index forever.
          // The next show() will create a fresh request and retry the chain.
          if (state.request && state.request.image) {
            try { state.request.image.src = ""; } catch (e) { /* ignore */ }
          }
          if (cache.get(p) === state) cache.delete(p);
          throw error;
        });
      // Preloads intentionally run in the background; consume their rejection
      // here while returning the original promise to show() when it is needed.
      state.promise.catch(() => {});
      cache.set(p, state);
      return state.promise;
    }

    function preload(p) {
      if (p < 0 || p >= order.length || stopped) return;
      ensurePreview(p).catch(() => {});
    }

    function cancelState(state) {
      state.cancelled = true;
      if (state.request) state.request.cancel();
      if (state.image) {
        try { state.image.src = ""; } catch (e) { /* ignore */ }
      }
    }

    function prune() {
      for (const [p, state] of cache) {
        if (Math.abs(p - pos) > 1) {
          cancelState(state);
          cache.delete(p);
        }
      }
    }

    function stopForErrors() {
      stopped = true;
      showGeneration.cancel();
      clearTimeout(timer);
      for (const state of cache.values()) cancelState(state);
      cache.clear();
      if (onError) {
        const error = new Error(window.I18N.t("player.serverErrors"));
        error.code = "STOPPED";
        onError(error);
      }
    }

    function recordError(error) {
      consecutiveErrors++;
      if (onError) onError(error);
      if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
        stopForErrors();
        return false;
      }
      return true;
    }

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

    /* Step past a hole/skipped entry in the direction the user was heading —
     * routing through next() would bounce a prev() back where it came from
     * and make anything behind a video unreachable. */
    function stepOver() {
      skipRun++;
      if (skipRun >= order.length) {
        stopped = true;
        showGeneration.cancel();
        clearTimeout(timer);
        for (const state of cache.values()) cancelState(state);
        cache.clear();
        if (onError) {
          const error = new Error(window.I18N.t("player.noPhotos"));
          error.code = "STOPPED";
          onError(error);
        }
        return;
      }
      pos = (pos + dir + order.length) % order.length;
      show();
    }

    async function show() {
      if (stopped) return;
      const token = showGeneration.next();
      prune();
      preload(pos + 1);
      preload(pos - 1);
      const current = pos;
      try {
        const result = await ensurePreview(current);
        if (stopped || !token.isCurrent() || current !== pos) return;
        // Reset only after the current photo itself has loaded successfully;
        // metadata success alone is not enough to clear the circuit breaker.
        consecutiveErrors = 0;
        skipRun = 0;
        onPhoto(result.photo, result.url, current, order.length);
        schedule();
      } catch (error) {
        if (stopped || !token.isCurrent() || current !== pos) return;
        if (error.code === "CANCELLED") return;
        if (error.code === "HOLE" || error.code === "SKIPPED") return stepOver();
        if (recordError(error)) next();
      }
    }

    function schedule() {
      clearTimeout(timer);
      if (!paused && !stopped) timer = setTimeout(next, duration * 1000);
    }

    function next() {
      if (stopped) return;
      clearTimeout(timer);
      if (onNavigate) onNavigate();
      dir = 1;
      pos = (pos + 1) % order.length;
      show();
    }

    function prev() {
      if (stopped) return;
      clearTimeout(timer);
      if (onNavigate) onNavigate();
      dir = -1;
      pos = (pos - 1 + order.length) % order.length;
      show();
    }

    function reportImageError(error) {
      if (stopped) return false;
      const failure = error || new Error("image load failed");
      if (!recordError(failure)) return false;
      next();
      return true;
    }

    return {
      start: buildOrder().then(show),
      next,
      prev,
      reportImageError,
      togglePause() {
        paused = !paused;
        schedule();
        return paused;
      },
      stop() {
        stopped = true;
        showGeneration.cancel();
        clearTimeout(timer);
        for (const state of cache.values()) cancelState(state);
        cache.clear();
        resolvedUrls.clear();
      },
    };
  }

  window.Player = { create: createPlayer };
})();
