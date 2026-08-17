/* Kiosk slideshow: two stacked frames crossfading (immich-kiosk style),
 * optional portrait ambience, color-key lofi playback, and sound-on video
 * sessions (lofi suspends during a video and resumes on the next photo).
 * Only one <video> is ever attached: webOS has one practical hardware
 * decode pipeline, so every transition explicitly releases it. */
(function () {
  const $ = (id) => document.getElementById(id);
  const MUSIC_COLORS = ["red", "green", "yellow", "blue"];
  const MUSIC_COLORS_HEX = {
    red: "#e5484d",
    green: "#46a758",
    yellow: "#f5d90a",
    blue: "#4c9aff",
  };
  const VIDEO_MAX_SECONDS = 60;
  const KEN_BURNS_CLASS = "kiosk-ken-burns";
  const KEN_BURNS_DIRECTION_CLASSES = [
    "kiosk-ken-burns-tl-br",
    "kiosk-ken-burns-br-tl",
    "kiosk-ken-burns-tr-bl",
    "kiosk-ken-burns-bl-tr",
  ];
  let player = null;
  let client = null;
  let front = null; // frame currently visible
  let collectionNames = {};
  let hintTimer = null;
  const openGeneration = window.Generation.create();
  const frameGeneration = window.Generation.create();
  let pendingFrameRequest = null;
  let videoSession = null;
  const videoGeneration = window.Generation.create();
  let slideshowPaused = false;
  const infoGeneration = window.Generation.create();
  let infoTimer = null;
  let clockTimer = null;
  let musicTimer = null;

  // Show the lofi controls hint for a few seconds on entry, then fade it
  // out — the kiosk has no hintbar (immersive), so without this the bundled
  // music is effectively a hidden feature.
  function showHint() {
    const el = $("kiosk-hint");
    el.hidden = false;
    el.classList.remove("fade");
    clearTimeout(hintTimer);
    hintTimer = setTimeout(() => {
      el.classList.add("fade");
      hintTimer = setTimeout(() => { el.hidden = true; }, 1000);
    }, 4500);
  }
  function hideHint() {
    clearTimeout(hintTimer);
    $("kiosk-hint").hidden = true;
    $("kiosk-hint").classList.remove("fade");
  }

  function fmtDate(iso) {
    if (!iso) return "";
    const d = new Date(iso);
    if (isNaN(d)) return iso.slice(0, 10);
    return d.toLocaleDateString(window.I18N.t("html.lang"), { year: "numeric", month: "long", day: "numeric" });
  }

  function updateClock() {
    const now = new Date();
    const time = $("kiosk-clock-time");
    const date = $("kiosk-clock-date");
    const locale = window.I18N.t("html.lang");
    if (time) time.textContent = now.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit", hour12: false });
    if (date) date.textContent = now.toLocaleDateString(locale, { weekday: "long", month: "long", day: "numeric" });
  }

  function showInformation(temporary) {
    const mode = window.Store.get("infoDisplay") || "clock";
    const screen = $("screen-kiosk");
    if (!screen || !screen.classList) return;
    screen.classList.toggle("kiosk-info-hidden", mode === "hidden" && !temporary);
    screen.classList.toggle("kiosk-info-details", mode === "details" && !temporary);
    screen.classList.toggle("kiosk-info-clock", mode === "clock" && !temporary);
    screen.classList.toggle("kiosk-info-visible", mode === "all" || temporary);
    clearTimeout(infoTimer);
    if (temporary && mode !== "all") infoTimer = setTimeout(() => showInformation(false), 8000);
  }

  function setSlideshowPaused(paused) {
    slideshowPaused = !!paused;
    const screen = $("screen-kiosk");
    if (screen && screen.classList) {
      screen.classList.toggle("kiosk-slideshow-paused", slideshowPaused);
    }
    const indicator = $("kiosk-paused");
    if (indicator) indicator.hidden = !slideshowPaused;
    return slideshowPaused;
  }

  function clearPhotoInfo() {
    $("kiosk-date").textContent = "";
    $("kiosk-album").textContent = "";
    const location = $("kiosk-location");
    location.classList.remove("visible");
    location.textContent = "";
  }

  function setPhotoInfo(photo) {
    const token = infoGeneration.next();
    $("kiosk-date").textContent = fmtDate(photo.takenAt);
    const album = $("kiosk-album");
    if (album) album.textContent = collectionNames[photo.collectionId] || "";
    const location = $("kiosk-location");
    location.classList.remove("visible");
    location.textContent = "";
    if (!photo.latlng || !window.Geocode) return;
    window.Geocode.reverse(photo.latlng).then((place) => {
      if (!token.isCurrent() || !place) return;
      location.textContent = place;
      // Commit the hidden state before adding the class so cached geocodes
      // animate too instead of appearing in the same paint.
      void location.offsetWidth;
      requestAnimationFrame(() => {
        if (token.isCurrent()) location.classList.add("visible");
      });
    }).catch(() => {});
  }

  function clearKenBurns(photo) {
    if (!photo) return;
    photo.classList.remove(KEN_BURNS_CLASS, ...KEN_BURNS_DIRECTION_CLASSES);
    photo.style.animation = "";
    photo.style.animationName = "";
    photo.style.animationDuration = "";
    photo.style.transformOrigin = "";
  }

  function restartKenBurns(frame, fit) {
    const photo = frame.querySelector(".kiosk-photo");
    clearKenBurns(photo);
    if (!photo || fit !== "cover") return;

    const duration = Number(window.Store.get("duration"));
    if (!Number.isFinite(duration) || duration <= 0) return;
    const direction = KEN_BURNS_DIRECTION_CLASSES[
      Math.floor(Math.random() * KEN_BURNS_DIRECTION_CLASSES.length)
    ];
    photo.classList.add(KEN_BURNS_CLASS, direction);
    photo.style.animation = "none";
    void photo.offsetWidth;
    photo.style.animation = "";
    photo.style.animationDuration = duration + "s";
  }

  function resetFrame(frame) {
    frame.className = "kiosk-frame";
    const photo = frame.querySelector(".kiosk-photo");
    clearKenBurns(photo);
    photo.style.backgroundImage = "";
    frame.querySelector(".kiosk-backdrop").style.backgroundImage = "";
    const slot = frame.querySelector(".kiosk-video-slot");
    if (slot) {
      const video = slot.querySelector("video");
      if (video) window.Media.releaseVideo(video);
      slot.innerHTML = "";
    }
  }

  function cancelPendingFrame() {
    frameGeneration.cancel();
    if (pendingFrameRequest) pendingFrameRequest.cancel();
    pendingFrameRequest = null;
  }

  function previewCandidates(photo, preferred) {
    return window.Media.previewCandidates(client, photo, preferred);
  }

  function cssUrl(url) {
    return window.Media.cssUrl(url);
  }

  function videoUrl(photo) {
    return window.Media.videoUrl(client, photo);
  }

  function sessionIsCurrent(session) {
    return (
      videoSession === session &&
      session.videoToken.isCurrent() &&
      session.openToken.isCurrent() &&
      session.frameToken.isCurrent() &&
      player === session.owner
    );
  }

  function armVideoLimit(session) {
    if (!sessionIsCurrent(session) || session.limitTimer) return;
    const delay = Math.max(0, session.limitRemaining);
    session.limitStartedAt = Date.now();
    session.limitTimer = setTimeout(() => {
      if (!sessionIsCurrent(session)) return;
      session.limitTimer = null;
      if (session.playing) {
        advanceVideo(session);
      } else if (session.posterUrl) {
        // A decoder that never reaches play is treated like an unsupported
        // codec: keep the poster for the normal slideshow duration.
        fallbackVideo(session);
      } else {
        const error = new Error("video load timeout");
        endVideoSession(session, true);
        session.owner.reportImageError(error);
      }
    }, delay);
  }

  function pauseVideoLimit(session) {
    if (!session.limitTimer) return;
    clearTimeout(session.limitTimer);
    session.limitTimer = null;
    session.limitRemaining = Math.max(
      0,
      session.limitRemaining - (Date.now() - session.limitStartedAt)
    );
  }

  function resumePlayerAfterVideo(session) {
    if (
      session.playerPaused &&
      player === session.owner &&
      !slideshowPaused
    ) {
      // This also re-arms the normal fixed-duration timer for poster fallback
      // and for the short gap before the next slide is ready.
      session.owner.togglePause();
    }
  }

  function endVideoSession(session, resumePlayer) {
    if (!session || videoSession !== session) return;
    videoSession = null;
    session.videoToken.cancel();
    clearTimeout(session.limitTimer);
    session.limitTimer = null;
    if (session.posterRequest && pendingFrameRequest === session.posterRequest) {
      session.posterRequest.cancel();
      pendingFrameRequest = null;
    }
    if (session.video) {
      window.Media.releaseVideo(session.video);
      session.video = null;
    }
    if (resumePlayer) resumePlayerAfterVideo(session);
  }

  function beginVideoSession(owner, openToken, frameToken) {
    if (videoSession) endVideoSession(videoSession, true);
    const session = {
      videoToken: videoGeneration.next(),
      owner,
      openToken,
      frameToken,
      photo: null,
      frame: null,
      fit: null,
      portrait: false,
      posterUrl: null,
      posterRequest: null,
      video: null,
      canPlay: false,
      playAttempt: false,
      playing: false,
      playerPaused: false,
      limitTimer: null,
      limitStartedAt: 0,
      limitRemaining: VIDEO_MAX_SECONDS * 1000,
    };
    videoSession = session;
    // webOS may pause the lofi Audio outside JavaScript when this video enters
    // the media pipeline. Suspend it explicitly so the state and indicator
    // remain deterministic; resume only when a non-video frame commits.
    window.Music.suspend();
    if (!slideshowPaused) {
      session.playerPaused = owner.togglePause();
      armVideoLimit(session);
    } else {
      // The player is already paused because the user paused the slideshow
      // before this video arrived. It is still our pause to release when the
      // user resumes before the video ends.
      session.playerPaused = true;
    }
    return session;
  }

  function prepareFrame(frame, fit, portrait) {
    frame.className = "kiosk-frame";
    frame.classList.add("fit-" + fit);
    frame.classList.toggle("portrait", portrait);
    const photo = frame.querySelector(".kiosk-photo");
    clearKenBurns(photo);
    photo.style.backgroundImage = "";
    frame.querySelector(".kiosk-backdrop").style.backgroundImage = "";
  }

  function commitFrame(frame, photo, url, fit, portrait) {
    prepareFrame(frame, fit, portrait);
    frame.querySelector(".kiosk-photo").style.backgroundImage = cssUrl(url);
    frame.querySelector(".kiosk-backdrop").style.backgroundImage =
      fit === "ambient" ? cssUrl(url) : "";
    restartKenBurns(frame, fit);
    frame.classList.add("visible");
    if (front && front !== frame) front.classList.remove("visible");
    front = frame;
    $("kiosk-loading").hidden = true;
    setPhotoInfo(photo);
  }

  function showVideoFrame(session) {
    if (!sessionIsCurrent(session) || !session.video) return;
    const frame = session.frame;
    session.video.classList.add("ready");
    frame.classList.add("visible");
    if (front && front !== frame) front.classList.remove("visible");
    front = frame;
    $("kiosk-loading").hidden = true;
    setPhotoInfo(session.photo);
  }

  function advanceVideo(session) {
    if (!sessionIsCurrent(session)) return;
    endVideoSession(session, true);
    if (player === session.owner && session.openToken.isCurrent()) {
      session.owner.next();
    }
  }

  function fallbackVideo(session) {
    if (!sessionIsCurrent(session)) return;
    const frame = session.frame;
    const photo = session.photo;
    const posterUrl = session.posterUrl;
    endVideoSession(session, true);
    // The poster now occupies the complete slide for the ordinary configured
    // duration. A decoder error is a capability mismatch, not a slideshow
    // server failure, so do not report it to Player.
    commitFrame(frame, photo, posterUrl, session.fit, session.portrait);
    window.Music.resume();
  }

  function startVideoPlayback(session) {
    if (!sessionIsCurrent(session) || !session.video || !session.canPlay) return;
    if (slideshowPaused || session.playing || session.playAttempt) {
      if (slideshowPaused) showVideoFrame(session);
      return;
    }
    session.playAttempt = true;
    let result;
    try {
      result = session.video.play();
    } catch (e) {
      session.playAttempt = false;
      if (slideshowPaused) {
        showVideoFrame(session);
      } else {
        fallbackVideo(session);
      }
      return;
    }
    Promise.resolve(result).then(() => {
      if (!sessionIsCurrent(session)) return;
      session.playAttempt = false;
      if (slideshowPaused) {
        showVideoFrame(session);
        return;
      }
      session.playing = true;
      armVideoLimit(session);
      showVideoFrame(session);
    }).catch(() => {
      if (!sessionIsCurrent(session)) return;
      session.playAttempt = false;
      if (slideshowPaused) {
        showVideoFrame(session);
      } else {
        fallbackVideo(session);
      }
    });
  }

  function mountVideo(session, posterUrl) {
    if (!sessionIsCurrent(session)) return;
    const frame = session.frame;
    const slot = frame.querySelector(".kiosk-video-slot");
    if (!slot) return fallbackVideo(session);
    // Defensive cleanup: a stale callback must never leave two decoder
    // elements in the staging slot before the new session is mounted.
    const existing = slot.querySelector("video");
    if (existing) window.Media.releaseVideo(existing);

    prepareFrame(frame, session.fit, session.portrait);
    frame.querySelector(".kiosk-photo").style.backgroundImage = cssUrl(posterUrl);
    frame.querySelector(".kiosk-backdrop").style.backgroundImage =
      session.fit === "ambient" ? cssUrl(posterUrl) : "";

    // Sound stays on: webOS revokes the lofi Audio's focus for any <video>
    // in the pipeline, muted or not, so muting would silence the video's own
    // audio without buying anything back. Lofi resumes on the next photo.
    const video = document.createElement("video");
    video.className = "kiosk-video";
    video.loop = false;
    video.controls = false;
    video.preload = "auto";
    // Soften the jump from the 0.32-volume lofi bed to full video audio.
    video.volume = 0.6;
    video.playsInline = true;
    video.setAttribute("playsinline", "");
    video.poster = posterUrl;
    slot.appendChild(video);
    session.video = video;

    const fail = () => {
      if (sessionIsCurrent(session)) fallbackVideo(session);
    };
    const ready = () => {
      if (!sessionIsCurrent(session)) return;
      session.canPlay = true;
      if (slideshowPaused) showVideoFrame(session);
      else startVideoPlayback(session);
    };
    video.oncanplay = ready;
    video.onloadeddata = ready;
    video.onerror = fail;
    video.onended = () => {
      if (sessionIsCurrent(session)) advanceVideo(session);
    };

    const src = videoUrl(session.photo);
    if (!src) return fail();
    video.src = src;
    try { video.load(); } catch (e) { /* error event handles failure */ }
  }

  function crossfadeVideo(photo, url, openToken, owner, frameToken) {
    const a = $("kiosk-a");
    const b = $("kiosk-b");
    const next = front === a ? b : a;
    const fit = window.Store.get("fitMode") || "ambient";
    const portrait = photo.height > photo.width;
    const session = beginVideoSession(owner, openToken, frameToken);
    session.photo = photo;
    session.frame = next;
    session.fit = fit;
    session.portrait = portrait;

    const request = window.ImageLoader.load(previewCandidates(photo, url));
    session.posterRequest = request;
    pendingFrameRequest = request;
    request.promise.then((result) => {
      if (!sessionIsCurrent(session)) return;
      if (pendingFrameRequest === request) pendingFrameRequest = null;
      session.posterRequest = null;
      session.posterUrl = result.url;
      mountVideo(session, result.url);
    }).catch((error) => {
      if (pendingFrameRequest === request) pendingFrameRequest = null;
      if (
        (error && error.code === "CANCELLED") ||
        !sessionIsCurrent(session)
      ) return;
      endVideoSession(session, true);
      owner.reportImageError(error);
    });
  }

  function crossfade(photo, url, openToken, owner) {
    const a = $("kiosk-a");
    const b = $("kiosk-b");
    const next = front === a ? b : a;
    const fit = window.Store.get("fitMode") || "ambient";
    const portrait = photo.height > photo.width;
    const frameToken = frameGeneration.next();
    if (pendingFrameRequest) pendingFrameRequest.cancel();

    if (photo.isVideo) {
      return crossfadeVideo(photo, url, openToken, owner, frameToken);
    }
    if (videoSession) endVideoSession(videoSession, true);

    // The player has already resolved a candidate while preloading. Keep it
    // first, but retain the complete chain in case the file disappears before
    // the CSS background is installed.
    const request = window.ImageLoader.load(previewCandidates(photo, url));
    pendingFrameRequest = request;
    request.promise.then((result) => {
      if (
        !openToken.isCurrent() ||
        player !== owner ||
        !frameToken.isCurrent()
      ) return;

      const loadedUrl = result.url;
      prepareFrame(next, fit, portrait);
      next.querySelector(".kiosk-photo").style.backgroundImage = cssUrl(loadedUrl);
      next.querySelector(".kiosk-backdrop").style.backgroundImage =
        fit === "ambient" ? cssUrl(loadedUrl) : "";
      restartKenBurns(next, fit);
      next.classList.add("visible");
      if (front) front.classList.remove("visible");
      front = next;
      $("kiosk-loading").hidden = true;
      setPhotoInfo(photo);
      window.Music.resume();
      if (pendingFrameRequest === request) pendingFrameRequest = null;
    }).catch((error) => {
      if (pendingFrameRequest === request) pendingFrameRequest = null;
      if (
        (error && error.code === "CANCELLED") ||
        !openToken.isCurrent() ||
        player !== owner ||
        !frameToken.isCurrent()
      ) return;

      // Do not expose the staging frame and do not touch the current frame.
      // The player advances and counts this as an image failure.
      resetFrame(next);
      owner.reportImageError(error);
    });
  }

  function clearMusicIndicator() {
    clearTimeout(musicTimer);
    const el = $("kiosk-music");
    el.hidden = true;
    el.classList.remove("fade");
  }

  function fadeMusicIndicator() {
    $("kiosk-music").classList.add("fade");
    musicTimer = setTimeout(clearMusicIndicator, 700);
  }

  function renderMusicIndicator(state) {
    if (!state) {
      clearMusicIndicator();
      return;
    }
    const equalizer = $("kiosk-equalizer");
    if (equalizer) {
      equalizer.style.color = MUSIC_COLORS_HEX[state.color];
      equalizer.classList.toggle("paused", !state.playing && !state.loading);
      // Radio streams connect for a few seconds before audio starts; show a
      // pulsing "connecting" state instead of a dead equalizer.
      equalizer.classList.toggle("loading", !!state.loading);
    }
    const box = $("kiosk-music");
    box.classList.toggle("loading", !!state.loading);
    $("kiosk-music-name").textContent = state.track.name + " · " + (state.index + 1) + "/" + state.total;
    box.classList.remove("fade");
    box.hidden = false;
    clearTimeout(musicTimer);
    // Keep the indicator up for the whole connection: a slow stream must not
    // fade the indicator out while it is still loading.
    if (!state.loading) {
      musicTimer = setTimeout(fadeMusicIndicator, state.playing ? 10000 : 4000);
    }
  }

  function applyMusicState(state, announce) {
    renderMusicIndicator(state);
    if (announce && state && state.playing) window.App.toast(state.track.name);
  }

  // Music advances itself when an Audio element emits `ended`. Subscribe to
  // those transitions so the floating indicator follows automatic track and
  // color changes instead of remaining stuck on the manually selected song.
  window.Music.subscribe((state) => {
    if (window.Keys.current() === "kiosk") renderMusicIndicator(state);
  });

  async function toggleMusic(color) {
    const state = await window.Music.toggle(color);
    if (state.stale) return;
    if (state.error && !state.retryScheduled) {
      clearMusicIndicator();
      return window.App.toast(window.I18N.t("kiosk.musicFailed"));
    }
    if (state.retryScheduled) return;
    if (!state.playing) {
      clearMusicIndicator();
      return window.App.toast(window.I18N.t("kiosk.musicOff", { name: state.track.name }));
    }
    applyMusicState(state, true);
  }

  // Up/Down step through the active color's playlist. No-op when music is off.
  async function stepMusic(delta) {
    const state = await (delta > 0 ? window.Music.next() : window.Music.prev());
    if (!state) return;
    if (state.stale) return;
    if (state.error && !state.retryScheduled) {
      clearMusicIndicator();
      return window.App.toast(window.I18N.t("kiosk.musicFailed"));
    }
    if (state.retryScheduled) return;
    if (!state.playing) return;
    applyMusicState(state, true);
  }

  function startAutoMusic(nextPlayer, openToken) {
    if (window.Store.get("autoLofi") === false) return;
    window.Music.autoStart().then((state) => {
      if (!openToken.isCurrent() || player !== nextPlayer || !state || state.stale) return;
      if (state.error && !state.retryScheduled) {
        clearMusicIndicator();
        window.App.toast(window.I18N.t("kiosk.musicFailed"));
      }
    }).catch(() => {
      if (!openToken.isCurrent() || player !== nextPlayer) return;
      clearMusicIndicator();
      window.App.toast(window.I18N.t("kiosk.musicFailed"));
    });
  }

  function toggleVideoPause() {
    const session = videoSession;
    if (!session) return false;
    const paused = setSlideshowPaused(!slideshowPaused);
    if (paused) {
      pauseVideoLimit(session);
      if (session.video) {
        try { session.video.pause(); } catch (e) { /* ignore */ }
      }
      session.playing = false;
    } else if (session.canPlay) {
      startVideoPlayback(session);
    }
    return paused;
  }

  function navigate(delta) {
    if (!player) return;
    if (videoSession) endVideoSession(videoSession, true);
    if (delta > 0) player.next();
    else player.prev();
  }

  function leave() {
    openGeneration.cancel();
    infoGeneration.cancel();
    cancelPendingFrame();
    if (videoSession) endVideoSession(videoSession, false);
    if (player) player.stop();
    player = null;
    window.Music.stop();
    clearMusicIndicator();
    hideHint();
    clearTimeout(infoTimer);
    clearInterval(clockTimer);
    setSlideshowPaused(false);
    window.WebOSPlatform.allowScreenSaver();
    window.Navigation.pop();
  }

  window.KioskScreen = {
    /**
     * @param source        source object
     * @param collectionIds [id, ...]
     * @param opts          {start: {collectionId, index}}
     *
     * lastSource/lastCollection memory is written by Playback, not here, so
     * this function only owns the slideshow lifecycle. Counts are fetched
     * from collections() up front and passed into the player so buildOrder
     * does not fan out N ensureScene calls before the first photo.
     */
    async open(source, collectionIds, opts) {
      opts = opts || {};
      const openToken = openGeneration.next();
      infoGeneration.cancel();
      clearPhotoInfo();
      cancelPendingFrame();
      if (videoSession) endVideoSession(videoSession, false);
      window.Navigation.push("kiosk");
      client = window.Sources.client(source);
      const names = {};
      collectionNames = names;
      setSlideshowPaused(false);

      if (player) player.stop();
      player = null; // cleared during the async counts fetch so onKey no-ops
      window.Music.stop();
      clearMusicIndicator();
      window.WebOSPlatform.inhibitScreenSaver();
      resetFrame($("kiosk-a"));
      resetFrame($("kiosk-b"));
      front = null;
      $("kiosk-loading").hidden = false;
      updateClock();
      clearInterval(clockTimer);
      clockTimer = setInterval(updateClock, 60000);
      showInformation(false);
      showHint();

      // Fetch counts (indexed_count) up front so the player can build its
      // order without per-collection ensureScene. Scene creation is deferred
      // to the first photoAt touch, which lets a 38-album source start
      // playing after the first album's scene is ready instead of all 38.
      let countsMap = {};
      try {
        const cols = await client.collections();
        for (const c of cols) {
          names[c.id] = c.name;
          countsMap[c.id] = c.count;
        }
      } catch (e) {
        if (!openToken.isCurrent()) return;
        $("kiosk-loading").hidden = true;
        window.Music.stop();
        clearMusicIndicator();
        window.WebOSPlatform.allowScreenSaver();
        window.App.toast(window.I18N.t("app.cannotConnect", { name: source.name }), 6000, "error");
        window.App.back();
        return;
      }
      if (!openToken.isCurrent()) return;

      const counts = collectionIds.map((id) => countsMap[id] || 0);
      const nextPlayer = window.Player.create({
        client,
        collections: collectionIds,
        counts,
        shuffle: window.Store.get("playOrder") !== "sequential",
        start: opts.start,
        duration: window.Store.get("duration"),
        photosOnly: window.Store.get("mediaScope") !== "all",
        onPhoto(photo, url) {
          if (!openToken.isCurrent() || player !== nextPlayer) return;
          crossfade(photo, url, openToken, nextPlayer);
        },
        onNavigate() {
          if (openToken.isCurrent() && player === nextPlayer) {
            if (videoSession) endVideoSession(videoSession, true);
            cancelPendingFrame();
          }
        },
        onError(e) {
          if (!openToken.isCurrent() || player !== nextPlayer) return;
          if (e && e.code === "STOPPED") {
            cancelPendingFrame();
            if (videoSession) endVideoSession(videoSession, false);
            $("kiosk-loading").hidden = true;
            window.Music.stop();
            clearMusicIndicator();
            player = null;
            window.WebOSPlatform.allowScreenSaver();
            window.App.toast(e.message || window.I18N.t("kiosk.stopped"), 6000, "error");
            window.App.back();
          } else {
            window.App.toast(window.I18N.t("kiosk.serverRetry"));
          }
        },
      });
      if (!openToken.isCurrent()) {
        nextPlayer.stop();
        return;
      }
      player = nextPlayer;
      startAutoMusic(nextPlayer, openToken);
      nextPlayer.start.catch((e) => {
        if (!openToken.isCurrent() || player !== nextPlayer) return;
        $("kiosk-loading").hidden = true;
        window.Music.stop();
        clearMusicIndicator();
        if (videoSession) endVideoSession(videoSession, false);
        player = null;
        window.WebOSPlatform.allowScreenSaver();
        window.App.toast(window.I18N.t("kiosk.playFailed", { msg: e.message }), 6000, "error");
        window.App.back();
      });
    },

    onKey({ key }) {
      if (!player) return;
      showInformation(true);
      if (MUSIC_COLORS.includes(key)) {
        toggleMusic(key);
      } else if (key === "ok" || key === "play" || key === "pause") {
        if (videoSession) {
          toggleVideoPause();
        } else {
          const paused = player.togglePause();
          setSlideshowPaused(paused);
        }
      } else if (key === "right" || key === "fastforward") {
        navigate(1);
      } else if (key === "left" || key === "rewind") {
        navigate(-1);
      } else if (key === "up") {
        stepMusic(-1);
      } else if (key === "down") {
        stepMusic(1);
      } else if (key === "stop" || key === "back") {
        leave();
      }
    },

    isPlaying: () => !!player,
  };
})();
