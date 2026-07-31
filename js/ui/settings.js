/* Settings overlay: startup behavior, kiosk interval, PIN management. */
(function () {
  const $ = (id) => document.getElementById(id);
  const DURATIONS = [5, 8, 12, 20, 30];
  const STARTUPS = [
    { id: "sources", label: "源选择页" },
    { id: "kiosk", label: "直接播放上次源" },
  ];
  let focusIdx = 0;
  let returnTo = "sources";

  function rows() {
    const startup = STARTUPS.find((s) => s.id === window.Store.get("startup"));
    return [
      { key: "startup", label: "启动行为", value: startup.label },
      { key: "duration", label: "播放间隔", value: window.Store.get("duration") + " 秒" },
      // PIN row hidden: no source is currently locked. Re-add when a locked
      // source comes back (see js/clients/source.js "locked").
    ];
  }

  function render() {
    const list = $("settings-list");
    list.innerHTML = "";
    rows().forEach((r, i) => {
      const row = document.createElement("div");
      row.className = "settings-row" + (i === focusIdx ? " focused" : "");
      row.innerHTML = "<span>" + r.label + '</span><span class="value">' + r.value + "</span>";
      list.appendChild(row);
    });
  }

  function adjust(dir) {
    const row = rows()[focusIdx];
    if (row.key === "startup") {
      const cur = STARTUPS.findIndex((s) => s.id === window.Store.get("startup"));
      window.Store.set("startup", STARTUPS[(cur + dir + STARTUPS.length) % STARTUPS.length].id);
    } else if (row.key === "duration") {
      const cur = DURATIONS.indexOf(window.Store.get("duration"));
      const next = DURATIONS[(cur + dir + DURATIONS.length) % DURATIONS.length];
      window.Store.set("duration", next);
    }
    render();
  }

  window.SettingsScreen = {
    open() {
      returnTo = window.Keys.current() || "sources";
      focusIdx = 0;
      $("settings-overlay").hidden = false;
      window.Keys.activate("settings");
      render();
    },

    onKey({ key }) {
      if (key === "up") focusIdx = (focusIdx + rows().length - 1) % rows().length;
      else if (key === "down") focusIdx = (focusIdx + 1) % rows().length;
      else if (key === "left") adjust(-1);
      else if (key === "right") adjust(1);
      else if (key === "back") {
        $("settings-overlay").hidden = true;
        window.Keys.activate(returnTo);
        return;
      } else return;
      render();
    },
  };
})();
