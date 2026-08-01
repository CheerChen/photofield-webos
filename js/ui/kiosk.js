/* Kiosk slideshow: two stacked frames crossfading (immich-kiosk style),
 * optional portrait ambience, and color-key lofi playback. */
(function () {
  const $ = (id) => document.getElementById(id);
  const MUSIC_COLORS = ["red", "green", "yellow", "blue"];
  const MUSIC_DOTS = {
    red: "#e5484d",
    green: "#46a758",
    yellow: "#f5d90a",
    blue: "#4c9aff",
  };
  let player = null;
  let client = null;
  let front = null; // frame currently visible
  let returnTo = "sources";
  let collectionNames = {};
  let hintTimer = null;
  let openGeneration = 0;
  let frameGeneration = 0;
  let pendingFrameRequest = null;

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
    const p = (n) => String(n).padStart(2, "0");
    return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()) +
      " " + p(d.getHours()) + ":" + p(d.getMinutes());
  }

  function resetFrame(frame) {
    frame.className = "kiosk-frame";
    frame.querySelector(".kiosk-photo").style.backgroundImage = "";
    frame.querySelector(".kiosk-backdrop").style.backgroundImage = "";
  }

  function cancelPendingFrame() {
    frameGeneration++;
    if (pendingFrameRequest) pendingFrameRequest.cancel();
    pendingFrameRequest = null;
  }

  function previewCandidates(photo, preferred) {
    const listed = client.previewCandidates
      ? client.previewCandidates(photo, 1920)
      : [client.previewUrl(photo, 1920)];
    const candidates = Array.isArray(listed) ? listed.filter(Boolean) : [listed];
    return preferred
      ? [preferred, ...candidates.filter((url) => url !== preferred)]
      : candidates;
  }

  function cssUrl(url) {
    return 'url("' + String(url).replace(/"/g, "%22") + '")';
  }

  function crossfade(photo, url, openId, owner) {
    const a = $("kiosk-a");
    const b = $("kiosk-b");
    const next = front === a ? b : a;
    const fit = window.Store.get("fitMode") || "ambient";
    const portrait = photo.height > photo.width;
    const needBackdrop = portrait && fit === "ambient";
    const frameId = ++frameGeneration;
    if (pendingFrameRequest) pendingFrameRequest.cancel();

    // The player has already resolved a candidate while preloading. Keep it
    // first, but retain the complete chain in case the file disappears before
    // the CSS background is installed.
    const request = window.ImageLoader.load(previewCandidates(photo, url));
    pendingFrameRequest = request;
    request.promise.then((result) => {
      if (
        openGeneration !== openId ||
        player !== owner ||
        frameGeneration !== frameId
      ) return;

      const loadedUrl = result.url;
      next.classList.remove("fit-ambient", "fit-contain", "fit-cover", "portrait");
      next.classList.add("fit-" + fit);
      next.classList.toggle("portrait", portrait);
      // Use the URL that actually loaded. Using the first candidate here
      // would make a successful fallback render as a broken black frame.
      next.querySelector(".kiosk-photo").style.backgroundImage = cssUrl(loadedUrl);
      next.querySelector(".kiosk-backdrop").style.backgroundImage = needBackdrop
        ? cssUrl(loadedUrl)
        : "";
      next.classList.add("visible");
      if (front) front.classList.remove("visible");
      front = next;
      $("kiosk-loading").hidden = true;
      $("kiosk-date").textContent = fmtDate(photo.takenAt);
      $("kiosk-name").textContent = photo.filename;
      if (pendingFrameRequest === request) pendingFrameRequest = null;
    }).catch((error) => {
      if (pendingFrameRequest === request) pendingFrameRequest = null;
      if (
        (error && error.code === "CANCELLED") ||
        openGeneration !== openId ||
        player !== owner ||
        frameGeneration !== frameId
      ) return;

      // Do not expose the staging frame and do not touch the current frame.
      // The player advances and counts this as an image failure.
      resetFrame(next);
      owner.reportImageError(error);
    });
  }

  function clearMusicIndicator() {
    $("kiosk-music").hidden = true;
  }

  function renderMusicIndicator(state) {
    if (!state || !state.playing) {
      clearMusicIndicator();
      return;
    }
    $("kiosk-music-dot").style.background = MUSIC_DOTS[state.color];
    $("kiosk-music-name").textContent = state.track.name + " · " + (state.index + 1) + "/" + state.total;
    $("kiosk-music").hidden = false;
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
    if (state.error) {
      clearMusicIndicator();
      return window.App.toast("音乐播放失败");
    }
    if (!state.playing) {
      clearMusicIndicator();
      return window.App.toast(state.track.name + " · 已关闭");
    }
    applyMusicState(state, true);
  }

  // Up/Down step through the active color's playlist. No-op when music is off.
  async function stepMusic(delta) {
    const state = await (delta > 0 ? window.Music.next() : window.Music.prev());
    if (!state) return;
    if (state.stale) return;
    if (state.error) {
      clearMusicIndicator();
      return window.App.toast("音乐播放失败");
    }
    if (!state.playing) return;
    applyMusicState(state, true);
  }

  function startAutoMusic(nextPlayer, openId) {
    if (window.Store.get("autoLofi") === false) return;
    window.Music.autoStart().then((state) => {
      if (openGeneration !== openId || player !== nextPlayer || !state || state.stale) return;
      if (state.error) {
        clearMusicIndicator();
        window.App.toast("音乐播放失败");
      }
    }).catch(() => {
      if (openGeneration !== openId || player !== nextPlayer) return;
      clearMusicIndicator();
      window.App.toast("音乐播放失败");
    });
  }

  function leave() {
    openGeneration++;
    cancelPendingFrame();
    if (player) player.stop();
    player = null;
    window.Music.stop();
    clearMusicIndicator();
    hideHint();
    window.Screensaver.allow();
    window.App.show(returnTo === "grid" ? "grid" : returnTo);
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
      const openId = ++openGeneration;
      cancelPendingFrame();
      returnTo = window.Keys.current() || "sources";
      if (returnTo === "kiosk") returnTo = "sources";
      window.App.show("kiosk");
      client = window.Sources.client(source);
      const names = {};
      collectionNames = names;

      if (player) player.stop();
      player = null; // cleared during the async counts fetch so onKey no-ops
      window.Music.stop();
      clearMusicIndicator();
      window.Screensaver.inhibit();
      resetFrame($("kiosk-a"));
      resetFrame($("kiosk-b"));
      front = null;
      $("kiosk-paused").hidden = true;
      $("kiosk-loading").hidden = false;
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
        if (openId !== openGeneration) return;
        $("kiosk-loading").hidden = true;
        window.Music.stop();
        clearMusicIndicator();
        window.Screensaver.allow();
        window.App.toast("无法连接 " + source.name, 6000, "error");
        window.App.back();
        return;
      }
      if (openId !== openGeneration) return;

      const counts = collectionIds.map((id) => countsMap[id] || 0);
      const nextPlayer = window.Player.create({
        client,
        collections: collectionIds,
        counts,
        shuffle: window.Store.get("playOrder") !== "sequential",
        start: opts.start,
        duration: window.Store.get("duration"),
        onPhoto(photo, url, pos, totalCount) {
          if (openId !== openGeneration || player !== nextPlayer) return;
          crossfade(photo, url, openId, nextPlayer);
        },
        onNavigate() {
          if (openId === openGeneration && player === nextPlayer) cancelPendingFrame();
        },
        onError(e) {
          if (openId !== openGeneration || player !== nextPlayer) return;
          if (e && e.code === "STOPPED") {
            cancelPendingFrame();
            $("kiosk-loading").hidden = true;
            window.Music.stop();
            clearMusicIndicator();
            player = null;
            window.Screensaver.allow();
            window.App.toast("服务器连续错误，已停止播放", 6000, "error");
            window.App.back();
          } else {
            window.App.toast("服务器错误，正在重试…");
          }
        },
      });
      if (openId !== openGeneration) {
        nextPlayer.stop();
        return;
      }
      player = nextPlayer;
      startAutoMusic(nextPlayer, openId);
      nextPlayer.start.catch((e) => {
        if (openId !== openGeneration || player !== nextPlayer) return;
        $("kiosk-loading").hidden = true;
        window.Music.stop();
        clearMusicIndicator();
        player = null;
        window.Screensaver.allow();
        window.App.toast("播放失败：" + e.message, 6000, "error");
        window.App.back();
      });
    },

    onKey({ key }) {
      if (!player) return;
      if (MUSIC_COLORS.includes(key)) {
        toggleMusic(key);
      } else if (key === "ok" || key === "play" || key === "pause") {
        const paused = player.togglePause();
        $("kiosk-paused").hidden = !paused;
      } else if (key === "right" || key === "fastforward") {
        player.next();
      } else if (key === "left" || key === "rewind") {
        player.prev();
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
