/* Source selection screen: one card per source. OK browses, long-OK / green
 * plays the whole source as a kiosk slideshow. */
(function () {
  const $ = (id) => document.getElementById(id);
  let focusIdx = 0;
  let counts = {}; // sourceId -> total photo count

  function render() {
    const row = $("source-row");
    row.innerHTML = "";
    window.Sources.all().forEach((s, i) => {
      const card = document.createElement("div");
      card.className = "source-card" + (i === focusIdx ? " focused" : "");
      const count = counts[s.id];
      card.innerHTML =
        '<div class="source-card-name">' + s.name +
        (s.locked ? ' <span class="source-card-lock">' + window.Icons.lock + "</span>" : "") +
        "</div>" +
        '<div class="source-card-count">' +
        (count === undefined ? "…" : count === -1 ? "连接失败" : count.toLocaleString() + " 张") +
        "</div>" +
        '<div class="source-card-play">' + window.Icons.play + " 播放</div>";
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
    window.Pin.gate(source, async () => {
      window.Store.set("lastSource", source.id);
      window.Store.set("lastCollection", null);
      try {
        const cols = await window.Sources.client(source).collections();
        window.KioskScreen.open(source, cols.map((c) => c.id));
      } catch (e) {
        window.App.toast("无法连接 " + source.name);
      }
    });
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
