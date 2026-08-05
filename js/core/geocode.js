/* Reverse geocoding for optional EXIF GPS coordinates. Results are cached for
 * the app session so nearby slideshow revisits do not repeat network calls. */
(function () {
  const CACHE_MAX = 128;
  const TIMEOUT_MS = 6000;
  const cache = window.LRU.create(CACHE_MAX);

  function coordinate(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  function placeName(data) {
    if (!data) return null;
    // Combine city and ward/district without punctuation for a compact but
    // precise label (for example, 千叶市美滨区). Avoid repeating the city when
    // the API already includes it in the locality string.
    if (data.city && data.locality) {
      return data.locality.indexOf(data.city) === 0
        ? data.locality
        : data.city + data.locality;
    }
    return data.city || data.locality || data.principalSubdivision || data.countryName || null;
  }

  function reverse(latlng) {
    if (!latlng) return Promise.resolve(null);
    const lat = coordinate(latlng.lat);
    const lng = coordinate(latlng.lng);
    if (lat === null || lng === null || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
      return Promise.resolve(null);
    }

    // Four decimals identify roughly an 11 m cell while keeping cache keys
    // stable across insignificant EXIF floating-point differences.
    const key = lat.toFixed(4) + "," + lng.toFixed(4);
    const existing = cache.get(key);
    if (existing) return existing;

    const request = (async () => {
      let timer = null;
      const timeout = new Promise((resolve) => {
        timer = setTimeout(() => resolve(null), TIMEOUT_MS);
      });
      const lookup = (async () => {
        try {
          // Follow the UI language. Cache entries keep the language they were
          // fetched in; a mid-session switch only affects new lookups.
          const language = window.I18N.lang === "zh-CN" ? "zh-Hans" : "en";
          const query =
            "latitude=" + encodeURIComponent(lat) +
            "&longitude=" + encodeURIComponent(lng) +
            "&localityLanguage=" + language;
          const response = await fetch(
            "https://api.bigdatacloud.net/data/reverse-geocode-client?" + query
          );
          if (!response.ok) return null;
          return placeName(await response.json());
        } catch (e) {
          return null;
        }
      })();
      try {
        return await Promise.race([lookup, timeout]);
      } finally {
        clearTimeout(timer);
      }
    })();
    cache.set(key, request);
    request.then((location) => {
      if (!location && cache.get(key) === request) cache.delete(key);
    });
    return request;
  }

  window.Geocode = { reverse };
})();
