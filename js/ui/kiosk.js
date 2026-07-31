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

  function crossfade(photo, url) {
    const a = $("kiosk-a");
    const b = $("kiosk-b");
    const next = front === a ? b : a;
    const fit = window.Store.get("fitMode") || "ambient";
    const portrait = photo.height > photo.width;
    const backdropUrl = client.previewUrl(photo, 640);
    // The blurred backdrop is only displayed for ambient portrait photos,
    // so only wait on it in that case; otherwise preloading it is wasted.
    const needBackdrop = portrait && fit === "ambient";

    next.classList.remove("fit-ambient", "fit-contain", "fit-cover", "portrait");
    next.classList.add("fit-" + fit);
    next.classList.toggle("portrait", portrait);
    // Set the background images now, but gate the opacity transition on the
    // images being decoded: without this, a slow network fades in a black
    // frame that pops to the photo mid-transition, breaking the crossfade.
    next.querySelector(".kiosk-photo").style.backgroundImage = 'url("' + url + '")';
    next.querySelector(".kiosk-backdrop").style.backgroundImage = 'url("' + backdropUrl + '")';

    let loaded = 0;
    const total = needBackdrop ? 2 : 1;
    function done() {
      loaded++;
      if (loaded < total) return;
      next.classList.add("visible");
      if (front) front.classList.remove("visible");
      front = next;
    }
    const main = new Image();
    main.onload = done;
    main.onerror = done; // don't strand the frame on a failed load
    main.src = url;
    if (needBackdrop) {
      const back = new Image();
      back.onload = done;
      back.onerror = done;
      back.src = backdropUrl;
    }
  }

  function clearMusicIndicator() {
    $("kiosk-music").hidden = true;
  }

  function applyMusicState(state) {
    if (!state || !state.playing) return;
    $("kiosk-music-dot").style.background = MUSIC_DOTS[state.color];
    $("kiosk-music-name").textContent = state.track.name + " · " + (state.index + 1) + "/" + state.total;
    $("kiosk-music").hidden = false;
    window.App.toast(state.track.name);
  }

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
    applyMusicState(state);
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
    applyMusicState(state);
  }

  function leave() {
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
        $("kiosk-loading").hidden = true;
        window.App.toast("无法连接 " + source.name, 6000, "error");
        window.App.back();
        return;
      }

      const counts = collectionIds.map((id) => countsMap[id] || 0);
      const nextPlayer = window.Player.create({
        client,
        collections: collectionIds,
        counts,
        shuffle: window.Store.get("playOrder") !== "sequential",
        start: opts.start,
        duration: window.Store.get("duration"),
        onPhoto(photo, url, pos, totalCount) {
          $("kiosk-loading").hidden = true;
          crossfade(photo, url);
          $("kiosk-date").textContent = fmtDate(photo.takenAt);
          $("kiosk-name").textContent = photo.filename;
        },
        onError(e) {
          if (e && e.code === "STOPPED") {
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
      player = nextPlayer;
      nextPlayer.start.catch((e) => {
        if (player !== nextPlayer) return;
        $("kiosk-loading").hidden = true;
        window.Music.stop();
        clearMusicIndicator();
        player = null;
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
