/* Persistent settings in localStorage. Soft-lock grade only — the PIN here
 * guards the TV remote, not the network. */
(function () {
  const KEY = "photofield.settings.v1";

  const DEFAULTS = {
    duration: 12, // kiosk seconds per photo
    fitMode: "ambient", // "ambient" | "contain" | "cover"
    playOrder: "shuffle", // "shuffle" | "sequential"
    albumSort: "nameAsc", // collection list order: "nameAsc" | "nameDesc"
    mediaScope: "photos", // "photos" skips videos in viewer/kiosk | "all"
    autoLofi: true, // start a random Lofi color when entering Kiosk
    lofiSource: "local", // "local" bundled CC0 tracks | "radio" live station streams
    infoDisplay: "clock", // "all" | "details" | "clock" | "hidden"
    pinHash: null, // hash of 4-digit PIN, null = not set
    lastSource: null,
    lastCollection: null,
  };

  let cache = null;

  function load() {
    if (cache) return cache;
    try {
      cache = Object.assign({}, DEFAULTS, JSON.parse(localStorage.getItem(KEY) || "{}"));
    } catch (e) {
      cache = Object.assign({}, DEFAULTS);
    }
    return cache;
  }

  function save() {
    localStorage.setItem(KEY, JSON.stringify(cache));
  }

  /* cyrb53 — non-crypto hash, enough for a soft PIN lock. */
  function hash(str) {
    let h1 = 0xdeadbeef ^ 0x9e3779b9;
    let h2 = 0x41c6ce57 ^ 0x9e3779b9;
    for (let i = 0; i < str.length; i++) {
      const ch = str.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 2654435761);
      h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (h2 >>> 0).toString(16) + (h1 >>> 0).toString(16);
  }

  window.Store = {
    get: (k) => load()[k],
    set(k, v) {
      load()[k] = v;
      save();
    },
    hashPin: (pin) => hash("photofield-pin:" + pin),
    verifyPin(pin) {
      const stored = load().pinHash;
      return stored !== null && hash("photofield-pin:" + pin) === stored;
    },
    hasPin: () => load().pinHash !== null,
    setPin(pin) {
      load().pinHash = hash("photofield-pin:" + pin);
      save();
    },
  };
})();
