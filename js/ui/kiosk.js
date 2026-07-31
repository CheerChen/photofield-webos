/* Kiosk slideshow: two stacked frames crossfading (immich-kiosk style:
 * contain fit, fade transition, date/name overlay, timed advance). */
(function () {
  const $ = (id) => document.getElementById(id);
  let player = null;
  let front = null; // element currently visible
  let metaVisible = true;
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

  function crossfade(url) {
    const a = $("kiosk-a");
    const b = $("kiosk-b");
    const next = front === a ? b : a;
    next.style.backgroundImage = 'url("' + url + '")';
    next.classList.add("visible");
    if (front) front.classList.remove("visible");
    front = next;
  }

  window.KioskScreen = {
    /**
     * @param source   source object
     * @param collectionIds [id, ...]
     * @param opts     {shuffle, start: {collectionId, index}}
     */
    open(source, collectionIds, opts) {
      opts = opts || {};
      returnTo = window.Keys.current() || "sources";
      if (returnTo === "kiosk") returnTo = "sources";
      window.App.show("kiosk");
      window.Store.set("lastSource", source.id);
      const client = window.Sources.client(source);
      const names = {};
      collectionNames = names;
      client.collections().then((cols) => {
        for (const c of cols) names[c.id] = c.name;
      }).catch(() => {});

      if (player) player.stop();
      $("kiosk-a").classList.remove("visible");
      $("kiosk-b").classList.remove("visible");
      front = null;
      $("kiosk-paused").hidden = true;

      player = window.Player.create({
        client,
        collections: collectionIds,
        shuffle: opts.shuffle !== false && !opts.start,
        start: opts.start,
        duration: window.Store.get("duration"),
        onPhoto(photo, url, pos, totalCount) {
          crossfade(url);
          $("kiosk-date").textContent = fmtDate(photo.takenAt);
          $("kiosk-name").textContent = photo.filename;
        },
        onError() {},
      });
      player.start.catch((e) => {
        window.App.toast("播放失败：" + e.message);
        window.App.back();
      });
    },

    onKey({ key }) {
      if (!player) return;
      if (key === "ok") {
        const paused = player.togglePause();
        $("kiosk-paused").hidden = !paused;
      } else if (key === "right") {
        player.next();
      } else if (key === "left") {
        player.prev();
      } else if (key === "red") {
        metaVisible = !metaVisible;
        $("kiosk-meta").style.opacity = metaVisible ? "1" : "0";
      } else if (key === "back") {
        player.stop();
        player = null;
        window.App.show(returnTo === "grid" ? "grid" : returnTo);
      }
    },

    isPlaying: () => !!player,
  };
})();
