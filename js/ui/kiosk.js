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

    next.classList.remove("fit-ambient", "fit-contain", "fit-cover", "portrait");
    next.classList.add("fit-" + fit);
    next.classList.toggle("portrait", portrait);
    next.querySelector(".kiosk-photo").style.backgroundImage = 'url("' + url + '")';
    next.querySelector(".kiosk-backdrop").style.backgroundImage =
      'url("' + client.previewUrl(photo, 640) + '")';
    next.classList.add("visible");
    if (front) front.classList.remove("visible");
    front = next;
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
    window.Screensaver.allow();
    window.App.show(returnTo === "grid" ? "grid" : returnTo);
  }

  window.KioskScreen = {
    /**
     * @param source   source object
     * @param collectionIds [id, ...]
     * @param opts     {start: {collectionId, index}}
     */
    open(source, collectionIds, opts) {
      opts = opts || {};
      returnTo = window.Keys.current() || "sources";
      if (returnTo === "kiosk") returnTo = "sources";
      window.App.show("kiosk");
      window.Store.set("lastSource", source.id);
      client = window.Sources.client(source);
      const names = {};
      collectionNames = names;
      client.collections().then((cols) => {
        for (const c of cols) names[c.id] = c.name;
      }).catch(() => {});

      if (player) player.stop();
      window.Music.stop();
      clearMusicIndicator();
      window.Screensaver.inhibit();
      resetFrame($("kiosk-a"));
      resetFrame($("kiosk-b"));
      front = null;
      $("kiosk-paused").hidden = true;
      $("kiosk-loading").hidden = false;

      const nextPlayer = window.Player.create({
        client,
        collections: collectionIds,
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
          if (e && e.message && e.message.includes("已停止")) {
            $("kiosk-loading").hidden = true;
            window.Music.stop();
            clearMusicIndicator();
            player = null;
            window.Screensaver.allow();
            window.App.toast("服务器连续错误，已停止播放");
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
        window.App.toast("播放失败：" + e.message);
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
