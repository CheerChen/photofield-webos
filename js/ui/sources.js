/* Source selection screen: one card per source. OK browses, long-OK / green
 * plays the whole source as a kiosk slideshow. */
(function () {
  const $ = (id) => document.getElementById(id);
  let focusIdx = 0;
  let counts = {}; // sourceId -> total photo count

  function render() {
    const row = $("source-row");
    row.innerHTML = "";
    const list = window.Sources.all();
    $("source-empty").hidden = list.length > 0;
    list.forEach((s, i) => {
      const busyInfo = window.Sources.busy(s.id);
      const card = document.createElement("div");
      card.className =
        "source-card" +
        (i === focusIdx ? " focused" : "") +
        (busyInfo ? " busy" : "");

      const name = document.createElement("div");
      name.className = "source-card-name";
      name.textContent = s.name;
      if (s.locked) {
        name.appendChild(document.createTextNode(" "));
        const lock = document.createElement("span");
        lock.className = "source-card-lock";
        lock.innerHTML = window.Icons.lock;
        name.appendChild(lock);
      }

      const countEl = document.createElement("div");
      countEl.className = "source-card-count";
      if (busyInfo) {
        // Scanning greys the card and replaces the count with a status line;
        // the count is stale until the scan finishes and counts are reloaded.
        countEl.textContent =
          busyInfo.status === "error" ? "扫描失败" : "扫描中…";
      } else {
        const count = counts[s.id];
        countEl.textContent =
          count === undefined ? "…" : count === -1 ? "连接失败" : count.toLocaleString() + " 张";
      }

      const play = document.createElement("div");
      play.className = "source-card-play";
      // Hide the play affordance while scanning so the card reads as inert.
      if (!busyInfo) {
        play.innerHTML = window.Icons.play;
        play.appendChild(document.createTextNode(" 播放"));
      }

      card.appendChild(name);
      card.appendChild(countEl);
      card.appendChild(play);
      row.appendChild(card);
    });
  }

  async function loadCounts() {
    for (const s of window.Sources.all()) {
      try {
        const cols = await window.Sources.client(s).collections();
        counts[s.id] = cols.reduce((n, c) => n + c.count, 0);
        // Passive busy detection: an externally-started scan (e.g. from the
        // Photofield web UI) greys the card even though we did not trigger
        // it. Fire-and-forget; sync re-renders on its own when it changes
        // state, and never clears a source with an active red-key scan.
        window.Scan.sync(s, cols);
      } catch (e) {
        counts[s.id] = -1; // -1 = error, rendered as "连接失败"
      }
      if (window.Keys.current() === "sources") render();
    }
  }

  function enter(source) {
    window.Pin.gate(source, () => {
      window.Store.set("lastSource", source.id);
      window.CollectionsScreen.open(source);
    });
  }

  function play(source) {
    window.Playback.playSource(source);
  }

  window.SourcesScreen = {
    open() {
      window.App.show("sources");
      focusIdx = 0;
      render();
    },

    render,

    refresh: loadCounts,

    onKey({ key }) {
      const n = window.Sources.all().length;
      // No sources (server down / not configured): only settings and exit
      // are meaningful. Any other key would index into an empty list and
      // crash (NaN focus, enter(undefined)).
      if (n === 0) {
        if (key === "blue") return window.SettingsScreen.open();
        if (key === "back") return window.App.exit();
        return;
      }
      const source = window.Sources.all()[focusIdx];
      const busyInfo = window.Sources.busy(source.id);
      if (key === "left") focusIdx = (focusIdx - 1 + n) % n;
      else if (key === "right") focusIdx = (focusIdx + 1) % n;
      else if (key === "ok") {
        // A scanning source is inert: keep the card in place but refuse to
        // enter, so the user can still arrow to a different source.
        if (busyInfo) {
          window.App.toast("扫描中，请稍候");
          return;
        }
        enter(source);
      } else if (key === "play" || key === "green") {
        if (busyInfo) {
          window.App.toast("扫描中，请稍候");
          return;
        }
        play(source);
      } else if (key === "red") {
        // Red-key scan: trigger a filesystem rescan of the focused source.
        // Pressing red again while already scanning is a no-op (Scan.start
        // is idempotent); the busy card stays grey until the scan finishes.
        if (busyInfo) {
          window.App.toast("正在扫描中…");
          return;
        }
        window.Scan.start(source);
        render();
        return;
      } else if (key === "blue") return window.SettingsScreen.open();
      else if (key === "back") return window.App.exit();
      else return;
      render();
    },
  };
})();
