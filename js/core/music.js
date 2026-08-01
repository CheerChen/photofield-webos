/* Kiosk lofi controller. Each color owns a shuffled playlist cycle. Color keys
 * select a fresh cycle; finishing a cycle picks another color at random. Up /
 * Down navigate the current cycle. Only one active Audio element is used at a time.
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
      { name: "Paper Lantern Rain", src: DIR + "paper-lantern-rain.mp3" },
      { name: "Lanterns in Slow Motion", src: DIR + "lanterns-in-slow-motion.mp3" },
      { name: "Fireplace Loop", src: DIR + "fireplace-loop.mp3" },
      { name: "Embers After Midnight", src: DIR + "embers-after-midnight.mp3" },
      { name: "Dusk on Red Earth", src: DIR + "dusk-on-red-earth.mp3" },
    ],
    green: [
      { name: "Bamboo Shadow Waltz", src: DIR + "bamboo-shadow-waltz.mp3" },
      { name: "Moon Through Bamboo", src: DIR + "moon-through-bamboo.mp3" },
      { name: "Teacup Morning Fog", src: DIR + "teacup-morning-fog.mp3" },
      { name: "Misty Steam Quiet Dreams", src: DIR + "misty-steam-quiet-dreams.mp3" },
      { name: "Mist Over Green Fields", src: DIR + "mist-over-green-fields.mp3" },
      { name: "Spring Garden Loops", src: DIR + "spring-garden-loops.mp3" },
      { name: "A Taste of Spring", src: DIR + "a-taste-of-spring.mp3" },
    ],
    yellow: [
      { name: "Soft Gold Sky", src: DIR + "soft-gold-sky.mp3" },
      { name: "Porchlight Golden Hour", src: DIR + "porchlight-golden-hour.mp3" },
      { name: "Window Seat Daydream", src: DIR + "window-seat-daydream.mp3" },
      { name: "Dust on the Morning Keys", src: DIR + "dust-on-the-morning-keys.mp3" },
      { name: "Sunset Offbeat", src: DIR + "sunset-offbeat.mp3" },
      { name: "Glow on the Overpass", src: DIR + "glow-on-the-overpass.mp3" },
      { name: "Dusk Between Stoops", src: DIR + "dusk-between-stoops.mp3" },
    ],
    blue: [
      { name: "Moonlit Moss", src: DIR + "moonlit-moss.mp3" },
      { name: "Drifting Through Fog", src: DIR + "drifting-through-fog.mp3" },
      { name: "Soft Weightless Hours", src: DIR + "soft-weightless-hours.mp3" },
      { name: "Warm Constellations", src: DIR + "warm-constellations.mp3" },
      { name: "Blue Below the Surface", src: DIR + "blue-below-the-surface.mp3" },
      { name: "Sea Glass Evening", src: DIR + "sea-glass-evening.mp3" },
      { name: "Satellite Lullaby", src: DIR + "satellite-lullaby.mp3" },
    ],
  };

  const COLORS = Object.keys(TRACKS);
  const playlists = {};
  const playlistPos = {};
  for (const color of COLORS) {
    playlists[color] = null;
    playlistPos[color] = 0;
  }

  let audio = null;
  let activeColor = null;
  let playing = false;
  let generation = 0;
  const listeners = new Set();

  function randomIndex(length) {
    return Math.min(length - 1, Math.floor(Math.random() * length));
  }

  function shuffledIndexes(color) {
    const order = TRACKS[color].map((_, index) => index);
    for (let i = order.length - 1; i > 0; i--) {
      const j = randomIndex(i + 1);
      [order[i], order[j]] = [order[j], order[i]];
    }
    return order;
  }

  function beginPlaylist(color) {
    playlists[color] = shuffledIndexes(color);
    playlistPos[color] = 0;
  }

  function currentTrack(color, position) {
    const trackIndex = playlists[color][position];
    return {
      track: TRACKS[color][trackIndex],
      trackIndex,
    };
  }

  function snapshot() {
    if (!activeColor || !playlists[activeColor]) return null;
    const position = playlistPos[activeColor];
    const current = currentTrack(activeColor, position);
    return {
      color: activeColor,
      track: current.track,
      // index is the position in this random cycle, rather than the source
      // array index. This keeps the on-screen cycle progress meaningful.
      index: position,
      playlistIndex: position,
      trackIndex: current.trackIndex,
      total: TRACKS[activeColor].length,
      playing,
    };
  }

  function notify(state) {
    for (const listener of listeners) {
      try {
        listener(state);
      } catch (e) {
        // A UI observer must never interrupt audio state transitions.
      }
    }
  }

  function randomColor(exclude) {
    const choices = COLORS.filter((color) => color !== exclude);
    return choices[randomIndex(choices.length)] || exclude || COLORS[0];
  }

  async function advanceAfterEnded() {
    if (!activeColor || !playing) return null;

    const color = activeColor;
    const order = playlists[color];
    const position = playlistPos[color];
    if (!order || color !== activeColor) return null;

    if (position + 1 < order.length) {
      playlistPos[color] = position + 1;
      return loadCurrent(color);
    }

    // Every track in this color has played once. Start a fresh random cycle
    // for another color; excluding the current color avoids an immediate
    // same-color repeat while still allowing it later in the rotation.
    const nextColor = randomColor(color);
    beginPlaylist(nextColor);
    return loadCurrent(nextColor);
  }

  function createAudio() {
    const AudioCtor = window.Audio;
    const el = new AudioCtor();
    el.loop = false;
    el.preload = "none";
    el.volume = 0.32;
    el.addEventListener("ended", () => {
      // A new Audio object is created for every load. Ignore a delayed event
      // from an object that was replaced by a manual track/color switch.
      if (audio !== el) return;
      // Do not leave a rejected async transition as an unhandled promise.
      advanceAfterEnded().catch(() => {});
    });
    return el;
  }

  function ensureAudio() {
    if (!audio) audio = createAudio();
    return audio;
  }

  function replaceAudio() {
    if (audio) {
      audio.pause();
      audio.src = "";
    }
    audio = createAudio();
    return audio;
  }

  // Load and play the current item. The generation guard keeps a late
  // play() resolution from resurrecting a track that was switched away while
  // it was still opening from disk.
  async function loadCurrent(color) {
    const order = playlists[color];
    const position = playlistPos[color];
    const current = currentTrack(color, position);
    const op = ++generation;
    const el = replaceAudio();

    el.src = current.track.src;
    el.currentTime = 0;
    activeColor = color;
    playing = false;

    try {
      const started = el.play();
      if (started && typeof started.then === "function") await started;
      if (op !== generation || activeColor !== color) {
        return {
          color,
          track: current.track,
          playing: false,
          index: position,
          playlistIndex: position,
          trackIndex: current.trackIndex,
          total: order.length,
          stale: true,
        };
      }
      playing = true;
      const state = snapshot();
      notify(state);
      return state;
    } catch (error) {
      if (op !== generation || activeColor !== color) {
        return {
          color,
          track: current.track,
          playing: false,
          index: position,
          playlistIndex: position,
          trackIndex: current.trackIndex,
          total: order.length,
          stale: true,
        };
      }
      activeColor = null;
      playing = false;
      notify(null);
      return {
        color,
        track: current.track,
        playing: false,
        index: position,
        playlistIndex: position,
        trackIndex: current.trackIndex,
        total: order.length,
        error,
      };
    }
  }

  function startColor(color) {
    if (!TRACKS[color]) throw new Error("unknown lofi track");
    beginPlaylist(color);
    return loadCurrent(color);
  }

  async function toggle(color) {
    if (!TRACKS[color]) throw new Error("unknown lofi track");

    // activeColor is assigned before play() settles, so a second quick press
    // also toggles off a track that is still opening from disk.
    if (activeColor === color) {
      const state = snapshot();
      const el = ensureAudio();
      generation++;
      el.pause();
      activeColor = null;
      playing = false;
      notify(null);
      return Object.assign({}, state, { playing: false });
    }

    return startColor(color);
  }

  // Step within the active color's current shuffled playlist. Manual stepping
  // wraps within that color; only natural track completion changes colors.
  async function step(delta) {
    if (!activeColor) return null;
    const color = activeColor;
    const order = playlists[color];
    playlistPos[color] = (playlistPos[color] + delta + order.length) % order.length;
    return loadCurrent(color);
  }

  function autoStart() {
    return startColor(randomColor(null));
  }

  function stop() {
    generation++;
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
    }
    activeColor = null;
    playing = false;
    notify(null);
  }

  window.Music = {
    tracks: () => TRACKS,
    colors: () => COLORS.slice(),
    subscribe(listener) {
      if (typeof listener !== "function") return () => {};
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    autoStart,
    toggle,
    next: () => step(1),
    prev: () => step(-1),
    stop,
    active: snapshot,
  };
})();
