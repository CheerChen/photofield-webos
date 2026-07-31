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
      const card = document.createElement("div");
      card.className = "source-card" + (i === focusIdx ? " focused" : "");

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
      const count = counts[s.id];
      countEl.textContent =
        count === undefined ? "…" : count === -1 ? "连接失败" : count.toLocaleString() + " 张";

      const play = document.createElement("div");
      play.className = "source-card-play";
      play.innerHTML = window.Icons.play;
      play.appendChild(document.createTextNode(" 播放"));

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
      if (key === "left") focusIdx = (focusIdx - 1 + n) % n;
      else if (key === "right") focusIdx = (focusIdx + 1) % n;
      else if (key === "ok") enter(window.Sources.all()[focusIdx]);
      else if (key === "play" || key === "green") play(window.Sources.all()[focusIdx]);
      else if (key === "blue") return window.SettingsScreen.open();
      else if (key === "back") return window.App.exit();
      else return;
      render();
    },
  };
})();
