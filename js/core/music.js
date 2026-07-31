/* Kiosk lofi controller. Color keys select a lazily loaded loop from a
 * per-color playlist; pressing the active color toggles it off. Up/Down
 * step through the active color's playlist. A single Audio element
 * prevents overlap.
 *
 * Tracks are CC0 1.0 (public domain) from the Open Lo-Fi collection by
 * btahir/open-lofi, bundled locally under assets/audio/. See
 * assets/audio/README.md for provenance. */
(function () {
  const DIR = "assets/audio/";

  const TRACKS = {
    red: [
      { name: "Temple at Dawn", src: DIR + "temple-at-dawn.mp3" },
      { name: "Bells Before Sunrise", src: DIR + "bells-before-sunrise.mp3" },
      { name: "Moon Through Bamboo", src: DIR + "moon-through-bamboo.mp3" },
      { name: "Bamboo Shadow Waltz", src: DIR + "bamboo-shadow-waltz.mp3" },
    ],
    green: [
      { name: "Teacup Morning Fog", src: DIR + "teacup-morning-fog.mp3" },
      { name: "Paper Lantern Rain", src: DIR + "paper-lantern-rain.mp3" },
      { name: "Lanterns in Slow Motion", src: DIR + "lanterns-in-slow-motion.mp3" },
      { name: "Misty Steam Quiet Dreams", src: DIR + "misty-steam-quiet-dreams.mp3" },
    ],
    yellow: [
      { name: "Soft Gold Sky", src: DIR + "soft-gold-sky.mp3" },
      { name: "Porchlight Golden Hour", src: DIR + "porchlight-golden-hour.mp3" },
      { name: "Window Seat Daydream", src: DIR + "window-seat-daydream.mp3" },
      { name: "Dust on the Morning Keys", src: DIR + "dust-on-the-morning-keys.mp3" },
    ],
    blue: [
      { name: "Moonlit Moss", src: DIR + "moonlit-moss.mp3" },
      { name: "Drifting Through Fog", src: DIR + "drifting-through-fog.mp3" },
      { name: "Soft Weightless Hours", src: DIR + "soft-weightless-hours.mp3" },
      { name: "Warm Constellations", src: DIR + "warm-constellations.mp3" },
    ],
  };

  const cursor = { red: 0, green: 0, yellow: 0, blue: 0 };

  let audio = null;
  let activeColor = null;
  let playing = false;
  let generation = 0;

  function ensureAudio() {
    if (audio) return audio;
    const AudioCtor = window.Audio;
    audio = new AudioCtor();
    audio.loop = false; // advance to next track on 'ended' instead of looping
    audio.preload = "none";
    audio.volume = 0.32;
    // Auto-advance to the next track in the active playlist when the current
    // one finishes. The generation guard in load() prevents a stale ended
    // event (from before a manual switch) from resurrecting the wrong track.
    audio.addEventListener("ended", () => {
      if (!activeColor) return;
      const list = TRACKS[activeColor];
      cursor[activeColor] = (cursor[activeColor] + 1) % list.length;
      load(activeColor);
    });
    return audio;
  }

  // Load and play the track at cursor[color]. The generation guard keeps a
  // late play() resolution from resurrecting a track that was switched away
  // while it was still opening from disk.
  async function load(color) {
    const list = TRACKS[color];
    const idx = cursor[color];
    const track = list[idx];
    const el = ensureAudio();
    const op = ++generation;

    el.pause();
    el.src = track.src;
    el.currentTime = 0;
    activeColor = color;
    playing = false;

    try {
      const started = el.play();
      if (started && typeof started.then === "function") await started;
      if (op !== generation || activeColor !== color) {
        return { color, track, playing: false, index: idx, total: list.length, stale: true };
      }
      playing = true;
      return { color, track, playing: true, index: idx, total: list.length };
    } catch (error) {
      if (op !== generation || activeColor !== color) {
        return { color, track, playing: false, index: idx, total: list.length, stale: true };
      }
      activeColor = null;
      playing = false;
      return { color, track, playing: false, index: idx, total: list.length, error };
    }
  }

  async function toggle(color) {
    const list = TRACKS[color];
    if (!list) throw new Error("unknown lofi track");

    // activeColor is assigned before play() settles, so a second quick press
    // also toggles off a track that is still opening from disk.
    if (activeColor === color) {
      const el = ensureAudio();
      el.pause();
      activeColor = null;
      playing = false;
      return { color, track: list[cursor[color]], playing: false, index: cursor[color], total: list.length };
    }

    return load(color);
  }

  // Step within the active color's playlist; wraps around. No-op when nothing
  // is active so the keys stay harmless while music is off.
  async function step(delta) {
    if (!activeColor) return null;
    const list = TRACKS[activeColor];
    const len = list.length;
    cursor[activeColor] = (cursor[activeColor] + delta + len) % len;
    return load(activeColor);
  }

  function next() {
    return step(1);
  }

  function prev() {
    return step(-1);
  }

  function stop() {
    generation++;
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
    }
    activeColor = null;
    playing = false;
  }

  window.Music = {
    tracks: () => TRACKS,
    toggle,
    next,
    prev,
    stop,
    active: () =>
      activeColor
        ? { color: activeColor, track: TRACKS[activeColor][cursor[activeColor]], playing, index: cursor[activeColor], total: TRACKS[activeColor].length }
        : null,
  };
})();
