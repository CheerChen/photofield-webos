/* Kiosk lofi controller. Each color owns a shuffled playlist cycle. Color keys
 * select a fresh cycle; finishing a cycle picks another color at random. Up /
 * Down navigate the current cycle. Only one active Audio element is used at a time.
 *
 * Two sources share this engine. "local" plays the bundled CC0 tracks from
 * the Open Lo-Fi collection by btahir/open-lofi under assets/audio/ (see
 * assets/audio/README.md). "radio" plays curated live MP3 station streams
 * (from github.com/88lin/lofi-radio-web): live streams never fire `ended`, so
 * colors only change on a manual key press, resume rejoins the live edge
 * instead of seeking, and a failed stream auto-advances to the next station
 * so the kiosk never falls silent on a single dead station. */
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

  /* Live station streams, curated from lofi-radio-web's public radio list.
   * Same four colors as the local library; color themes follow it: red = dawn
   * bells & fireside glow, green = misty bamboo morning, yellow = golden
   * afternoon & city dusk, blue = moonlit deep-night sleep.
   * Unreachable-at-curation streams (SomaFM, B3ck, Chill Sky), pure
   * white-noise/ambient-drone stations (Rain Sounds, ASP), and unwanted
   * stations (Jazz Box) were dropped. */
  const STATIONS = {
    red: [
      { name: "Paradise", src: "https://stream.radioparadise.com/mellow-128" },
      { name: "Lofi Chilling", src: "https://radio.loficafe.net/listen/chilling/radio.mp3" },
      { name: "Rap Beats", src: "https://boxradio-edge-00.streamafrica.net/rap" },
    ],
    green: [
      { name: "Lofi Japanese", src: "https://radio.loficafe.net/listen/japanese-lofi/radio.mp3" },
      { name: "Swiss Classic", src: "https://stream.srg-ssr.ch/m/rsc_de/mp3_128" },
      { name: "Lofi Box", src: "https://boxradio-edge-00.streamafrica.net/lofi" },
    ],
    yellow: [
      { name: "Jazz Smooth", src: "https://smoothjazz.cdnstream1.com/2585_128.mp3" },
      { name: "Jazz Groove", src: "https://west-mp3-128.streamthejazzgroove.com/stream" },
      { name: "Code Radio", src: "https://coderadio-admin-v2.freecodecamp.org/listen/coderadio/radio.mp3" },
      { name: "Lofi Gaming", src: "https://radio.loficafe.net/listen/gaming/radio.mp3" },
    ],
    blue: [
      { name: "Lofi Sleeping", src: "https://radio.loficafe.net/listen/sleeping/radio.mp3" },
      { name: "Lofi Studying", src: "https://radio.loficafe.net/listen/studying/radio.mp3" },
      { name: "Chill Wave", src: "https://boxradio-edge-00.streamafrica.net/chillwave" },
    ],
  };

  const COLORS = Object.keys(TRACKS);

  // Active source: "local" (bundled CC0 tracks) or "radio" (live streams).
  // Resolved lazily so script load order with store.js does not matter.
  let source = null;
  function resolveSource() {
    if (!source) {
      const stored = typeof window.Store !== "undefined" ? window.Store.get("lofiSource") : null;
      source = stored === "radio" ? "radio" : "local";
    }
    return source;
  }
  function library() {
    return resolveSource() === "radio" ? STATIONS : TRACKS;
  }

  const playlists = {};
  const playlistPos = {};
  for (const color of COLORS) {
    playlists[color] = null;
    playlistPos[color] = 0;
  }

  let audio = null;
  let activeColor = null;
  let playing = false;
  let loading = false; // radio stream is connecting (play() not settled yet)
  let suspended = false;
  let suspendOffset = 0;
  let resumeRetryTimer = null;
  const generation = window.Generation.create();
  // Delay before retrying a resume whose play() was rejected, typically
  // because webOS is still tearing down the media pipeline of a just-released
  // video element.
  const RESUME_RETRY_MS = 600;
  // Delay before auto-advancing to the next radio station after a stream
  // failure, so a flapping station does not spin the loader hot.
  const RADIO_RETRY_MS = 1500;
  // A hung stream (server accepts the connection but never delivers data)
  // fires neither a play() rejection nor an error event. Give the connection
  // this long to produce decoded audio (timeupdate/playing), then treat it
  // as a dead station and advance the pool.
  const RADIO_CONNECT_MS = 6000;
  // Volume fade shape for live streams: a live stream starts mid-song, so
  // fade in to mask the abrupt join; fade out briefly before a manual
  // station/color switch. Durations in ms; rAF-driven when available.
  const RADIO_FADE_IN_MS = 1200;
  const RADIO_FADE_OUT_MS = 300;
  const TARGET_VOLUME = 0.32;
  const listeners = new Set();
  // Token of the most recent load that reached play(); used to invalidate a
  // radio auto-advance scheduled from an element error event.
  let activeToken = null;
  let radioFailures = 0;
  let radioRetryTimer = null;
  let radioWatchdogTimer = null;

  function randomIndex(length) {
    return Math.min(length - 1, Math.floor(Math.random() * length));
  }

  function shuffledIndexes(color) {
    const order = library()[color].map((_, index) => index);
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
      track: library()[color][trackIndex],
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
      total: library()[activeColor].length,
      playing,
      loading: playing ? false : loading,
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

  // Mark pauses initiated by this controller so a platform-level pause event
  // cannot turn an intentional suspend/stop into a false external transition.
  // All internal callers also clear `playing` before pausing, so a late event
  // remains harmless even on runtimes that dispatch `pause` asynchronously.
  function pauseForMusic(el) {
    if (!el) return;
    el._musicPause = true;
    try { el.pause(); } catch (e) { /* ignore */ }
    const clear = () => { el._musicPause = false; };
    if (typeof queueMicrotask === "function") queueMicrotask(clear);
    else setTimeout(clear, 0);
  }

  // A live stream can fail at open or drop mid-play: the station may be
  // down or the connection timed out. Instead of leaving the kiosk silent,
  // advance to the next station in the color. Give up only after the whole
  // pool has failed, which normally means the network itself is gone.
  // Returns false when no retry is possible (local source or pool exhausted).
  function scheduleRadioRetry(el, token, color) {
    if (resolveSource() !== "radio" || !playlists[color]) return false;
    // The watchdog's job (advance on failure) is taken over by the retry
    // path, so stand it down.
    clearRadioWatchdog();
    // A failed element can report its error both via the error event and via
    // the rejected play() promise; retry only once per failure.
    if (el && el._radioRetry) return true;
    if (el) el._radioRetry = true;
    if (radioFailures >= library()[color].length) return false;
    radioFailures += 1;
    clearRadioRetryTimer();
    radioRetryTimer = setTimeout(() => {
      radioRetryTimer = null;
      if (!token || !token.isCurrent() || activeColor !== color || suspended) return;
      step(1).catch(() => {});
    }, RADIO_RETRY_MS);
    return true;
  }

  function clearRadioRetryTimer() {
    if (radioRetryTimer) {
      clearTimeout(radioRetryTimer);
      radioRetryTimer = null;
    }
  }

  function clearRadioWatchdog() {
    if (radioWatchdogTimer) {
      clearTimeout(radioWatchdogTimer);
      radioWatchdogTimer = null;
    }
  }

  /* Connect watchdog for live streams. Fires when a stream produced no
   * decoded audio within RADIO_CONNECT_MS: demotes the state back to
   * loading, invalidates the still-pending play() so a late settle cannot
   * revive the hung element, and advances to the next station via the
   * standard retry path. */
  function onRadioConnectTimeout(el, token, color) {
    if (!token.isCurrent() || activeColor !== color || suspended) return;
    if (el._radioData) return; // audio arrived after the timer was set
    playing = false;
    loading = true;
    generation.cancel();
    const retryToken = generation.next();
    if (!scheduleRadioRetry(el, retryToken, color)) {
      activeColor = null;
      playing = false;
      loading = false;
      notify(null);
      return;
    }
    notify(snapshot());
  }

  /* Volume ramp for live streams. Returns a Promise that settles when the
   * ramp finishes (or is aborted by a superseding load). Falls back to
   * setting the final volume directly when requestAnimationFrame is
   * unavailable (node tests, old webviews). The token guard stops the ramp
   * as soon as its element or load is superseded, so a replaced element is
   * never ghost-ramped. */
  function fadeVolume(el, from, to, durationMs, token) {
    return new Promise((resolve) => {
      if (durationMs <= 0 || typeof requestAnimationFrame !== "function") {
        try { el.volume = to; } catch (e) { /* ignore */ }
        resolve();
        return;
      }
      const start = Date.now();
      const tick = () => {
        if (!token || !token.isCurrent() || audio !== el) {
          resolve();
          return;
        }
        const k = Math.min(1, (Date.now() - start) / durationMs);
        try { el.volume = from + (to - from) * k; } catch (e) { /* ignore */ }
        if (k < 1) requestAnimationFrame(tick);
        else resolve();
      };
      requestAnimationFrame(tick);
    });
  }

  /* Fade a live stream in when its audio actually starts flowing. On webOS
   * the play() promise can settle while the stream is still buffering, so
   * keying the ramp to the first timeupdate/playing event is what makes it
   * audible; whichever signal fires first wins. */
  function startFadeIn(el, token) {
    if (el._fadeStarted) return;
    el._fadeStarted = true;
    fadeVolume(el, el.volume, TARGET_VOLUME, RADIO_FADE_IN_MS, token);
  }

  // Only live streams ramp: local files start at their beginning, and a
  // suspend/stop must release the media pipeline immediately.
  function isLive() {
    return resolveSource() === "radio";
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
    el.volume = TARGET_VOLUME;
    el.addEventListener("ended", () => {
      // A new Audio object is created for every load. Ignore a delayed event
      // from an object that was replaced by a manual track/color switch.
      if (audio !== el) return;
      // Do not leave a rejected async transition as an unhandled promise.
      advanceAfterEnded().catch(() => {});
    });
    el.addEventListener("error", () => {
      if (audio !== el) return;
      if (resolveSource() !== "radio" || !activeColor || suspended) return;
      if (el.ended) return;
      scheduleRadioRetry(el, activeToken, activeColor);
    });
    el.addEventListener("pause", () => {
      if (audio !== el) return;
      if (el._musicPause) {
        el._musicPause = false;
        return;
      }
      // A media element fires pause immediately before ended when a track
      // finishes naturally. That pause belongs to the ended handler's
      // advance, not to an external interruption.
      if (el.ended) return;
      // webOS may pause an Audio element when a video claims the media
      // pipeline. Keep the logical state and indicator synchronized even
      // though no JavaScript called pause(), and treat the focus loss as a
      // suspension so a later resume() restarts this exact track.
      if (!playing) return;
      playing = false;
      suspended = !!activeColor;
      suspendOffset = el.currentTime || 0;
      notify(snapshot());
    });
    return el;
  }

  function ensureAudio() {
    if (!audio) audio = createAudio();
    return audio;
  }

  function replaceAudio() {
    if (audio) {
      // A manual track/color change is an internal pause. Clear state first so
      // a delayed platform pause event cannot report a phantom interruption.
      playing = false;
      pauseForMusic(audio);
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
    const live = isLive();
    const token = generation.next();
    activeToken = token;
    // Fade the outgoing stream down before the element is replaced so a
    // manual station/color switch does not cut mid-song at full volume.
    if (live && audio && playing) {
      const outgoing = audio;
      // A genuine await: the outgoing stream ramps down before replacement.
      await fadeVolume(outgoing, outgoing.volume, 0, RADIO_FADE_OUT_MS, token);
      if (!token.isCurrent()) return null;
    }
    const el = replaceAudio();
    // A live stream joins mid-song: start silent and ramp up once play()
    // settles, so the join is a fade-in instead of an abrupt jump.
    if (live) {
      el.volume = 0;
      loading = true;
    }

    el.src = current.track.src;
    el.currentTime = 0;
    activeColor = color;
    playing = false;
    if (live) {
      // Watchdog: a hung connection must advance the pool on its own, not
      // wait for an error event that may never come. Either of these events
      // proves decoded audio is flowing, so the timeout is stood down.
      el._radioData = false;
      const onData = () => {
        el._radioData = true;
        clearRadioWatchdog();
        // Audio is flowing now: this is the moment the fade-in becomes
        // audible, so run it from here when play() settled first.
        if (playing) startFadeIn(el, token);
      };
      el.addEventListener("timeupdate", onData, { once: true });
      el.addEventListener("playing", onData, { once: true });
      clearRadioWatchdog();
      radioWatchdogTimer = setTimeout(() => {
        radioWatchdogTimer = null;
        onRadioConnectTimeout(el, token, color);
      }, RADIO_CONNECT_MS);
      notify(snapshot());
    }

    try {
      const started = el.play();
      if (started && typeof started.then === "function") await started;
      if (!token.isCurrent() || activeColor !== color) {
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
      loading = false;
      radioFailures = 0;
      if (live) {
        // If audio is already flowing, fade in now; otherwise onData fires
        // it at the moment sound actually starts.
        if (el._radioData) startFadeIn(el, token);
        else el._fadeStarted = false;
      }
      const state = snapshot();
      notify(state);
      return state;
    } catch (error) {
      if (!token.isCurrent() || activeColor !== color) {
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
      // A radio stream that fails to open still has the rest of its pool to
      // try; keep the color active and advance after a short delay.
      playing = false;
      if (live) loading = true;
      if (scheduleRadioRetry(el, token, color)) {
        notify(snapshot());
        return {
          color,
          track: current.track,
          playing: false,
          index: position,
          playlistIndex: position,
          trackIndex: current.trackIndex,
          total: order.length,
          retryScheduled: true,
          error,
        };
      }
      activeColor = null;
      playing = false;
      loading = false;
      notify(null);
      return {
        color,
        track: current.track,
        playing: false,
        loading: false,
        index: position,
        playlistIndex: position,
        trackIndex: current.trackIndex,
        total: order.length,
        error,
      };
    }
  }

  function startColor(color) {
    if (!library()[color]) throw new Error("unknown lofi track");
    suspended = false;
    beginPlaylist(color);
    return loadCurrent(color);
  }

  async function toggle(color) {
    if (!library()[color]) throw new Error("unknown lofi track");

    // activeColor is assigned before play() settles, so a second quick press
    // also toggles off a track that is still opening from disk.
    if (activeColor === color) {
      const state = snapshot();
      const el = ensureAudio();
      generation.cancel();
      clearRadioRetryTimer();
      clearRadioWatchdog();
      radioFailures = 0;
      loading = false;
      activeColor = null;
      playing = false;
      suspended = false;
      pauseForMusic(el);
      notify(null);
      return Object.assign({}, state, { playing: false });
    }

    return startColor(color);
  }

  // Step within the active color's current shuffled playlist. Manual stepping
  // wraps within that color; only natural track completion changes colors.
  async function step(delta) {
    if (!activeColor) return null;
    suspended = false;
    const color = activeColor;
    const order = playlists[color];
    playlistPos[color] = (playlistPos[color] + delta + order.length) % order.length;
    return loadCurrent(color);
  }

  function autoStart() {
    return startColor(randomColor(null));
  }

  function clearResumeRetry() {
    if (resumeRetryTimer) {
      clearTimeout(resumeRetryTimer);
      resumeRetryTimer = null;
    }
  }

  function suspend() {
    // A pending resume retry must never fire into the suspension a new video
    // session just requested, so kill it even when already suspended.
    clearResumeRetry();
    clearRadioRetryTimer();
    clearRadioWatchdog();
    if (!activeColor || !audio || suspended) return snapshot();
    suspended = true;
    suspendOffset = audio.currentTime || 0;
    // Invalidate both established and still-pending play() attempts. A video
    // can claim the webOS media pipeline before the music promise settles.
    generation.cancel();
    if (playing) {
      playing = false;
      pauseForMusic(audio);
      notify(snapshot());
    }
    return snapshot();
  }

  async function resume() {
    clearResumeRetry();
    if (!suspended) return snapshot();
    if (!activeColor || !audio || !playlists[activeColor]) {
      suspended = false;
      return null;
    }

    const color = activeColor;
    const order = playlists[color];
    const position = playlistPos[color];
    const current = currentTrack(color, position);
    // The suspended element's media pipeline was torn down while a video
    // owned it; on webOS such an element can accept play() yet stay silent.
    // Resume on a fresh element like every other playback path, then seek
    // back to where the suspension happened.
    const offset = suspendOffset;
    const el = replaceAudio();
    el.src = current.track.src;
    el.currentTime = 0;
    const token = generation.next();
    playing = false;

    try {
      const started = el.play();
      if (started && typeof started.then === "function") await started;
      if (
        !token.isCurrent() ||
        activeColor !== color ||
        audio !== el ||
        !suspended
      ) {
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
      suspended = false;
      suspendOffset = 0;
      loading = false;
      radioFailures = 0;
      // Live streams have no meaningful position: resuming a radio station
      // rejoins the live edge instead of seeking into a stale buffer.
      if (offset > 0 && resolveSource() !== "radio") {
        // Seek only after play() settles: setting currentTime on a fresh
        // element before its metadata loads is unreliable on webOS Chromium.
        try { el.currentTime = offset; } catch (e) { /* restart from 0 */ }
      }
      const state = snapshot();
      notify(state);
      return state;
    } catch (error) {
      if (
        !token.isCurrent() ||
        activeColor !== color ||
        audio !== el ||
        !suspended
      ) {
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
      // A rejected play() here is usually webOS still tearing down the media
      // pipeline of a just-released video, not a broken track. Stay suspended
      // with the cycle position intact — the kiosk retries on every non-video
      // commit — and schedule one quick retry in case no commit is imminent.
      playing = false;
      resumeRetryTimer = setTimeout(() => {
        resumeRetryTimer = null;
        if (token.isCurrent() && suspended && activeColor === color) {
          resume().catch(() => {});
        }
      }, RESUME_RETRY_MS);
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

  function stop() {
    clearResumeRetry();
    clearRadioRetryTimer();
    clearRadioWatchdog();
    radioFailures = 0;
    generation.cancel();
    activeColor = null;
    playing = false;
    loading = false;
    suspended = false;
    suspendOffset = 0;
    if (audio) {
      pauseForMusic(audio);
      audio.currentTime = 0;
    }
    notify(null);
  }

  // Switch the track library ("local" | "radio"). Any playback under the old
  // source stops; the kiosk restarts music with the new library on its next
  // color key or auto-start. Persistence is the caller's (settings) job.
  function setSource(next) {
    if (next !== "radio" && next !== "local") return resolveSource();
    if (next === resolveSource()) return next;
    stop();
    source = next;
    for (const color of COLORS) {
      playlists[color] = null;
      playlistPos[color] = 0;
    }
    return source;
  }

  window.Music = {
    tracks: () => library(),
    colors: () => COLORS.slice(),
    source: () => resolveSource(),
    setSource,
    subscribe(listener) {
      if (typeof listener !== "function") return () => {};
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    autoStart,
    toggle,
    next: () => step(1),
    prev: () => step(-1),
    suspend,
    resume,
    stop,
    active: snapshot,
  };
})();
