/* Bounded least-recently-used map. get() refreshes recency; set() evicts the
 * oldest entry once the limit is exceeded. Used for per-session metadata and
 * resolved-URL caches that must not grow unbounded during long slideshows. */
(function () {
  function create(limit) {
    const map = new Map();

    return {
      get(key) {
        if (!map.has(key)) return undefined;
        const value = map.get(key);
        map.delete(key);
        map.set(key, value); // move to most-recent
        return value;
      },
      set(key, value) {
        if (map.has(key)) map.delete(key);
        map.set(key, value);
        if (map.size > limit) map.delete(map.keys().next().value);
      },
      has: (key) => map.has(key),
      delete: (key) => map.delete(key),
      clear: () => map.clear(),
      get size() {
        return map.size;
      },
    };
  }

  window.LRU = { create };
})();
