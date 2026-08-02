/* Settings overlay: startup behavior, kiosk interval, PIN management. */
(function () {
  const $ = (id) => document.getElementById(id);
  const DURATIONS = [5, 8, 12, 20, 30];
  const STARTUPS = [
    { id: "sources", label: "源选择页" },
    { id: "kiosk", label: "直接播放上次源" },
  ];
  const FIT_MODES = [
    { id: "ambient", label: "氛围填充" },
    { id: "contain", label: "完整显示" },
    { id: "cover", label: "裁切填满" },
  ];
  const PLAY_ORDERS = [
    { id: "shuffle", label: "随机播放" },
    { id: "sequential", label: "顺序播放" },
  ];
  const LOFI_AUTOPLAY = [
    { id: true, label: "开启" },
    { id: false, label: "关闭" },
  ];
  let focusIdx = 0;
  let returnTo = "sources";

  function current(options, key) {
    return options.find((option) => option.id === window.Store.get(key)) || options[0];
  }

  function rows() {
    return [
      { key: "startup", label: "启动行为", value: current(STARTUPS, "startup").label },
      { key: "duration", label: "播放间隔", value: window.Store.get("duration") + " 秒" },
      { key: "fitMode", label: "相片填充", value: current(FIT_MODES, "fitMode").label },
      { key: "playOrder", label: "播放顺序", value: current(PLAY_ORDERS, "playOrder").label },
      { key: "autoLofi", label: "自动播放 Lofi", value: current(LOFI_AUTOPLAY, "autoLofi").label },
      { key: "host", label: "服务器地址", value: window.Store.get("photofield.host") || "192.168.0.110" },
      { key: "rescan", label: "重新扫描实例", value: "" },
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

  function cycle(key, options, dir) {
    const cur = Math.max(0, options.findIndex((option) => option.id === window.Store.get(key)));
    window.Store.set(key, options[(cur + dir + options.length) % options.length].id);
  }

  function adjust(dir) {
    const row = rows()[focusIdx];
    if (row.key === "startup") {
      cycle("startup", STARTUPS, dir);
    } else if (row.key === "duration") {
      const cur = Math.max(0, DURATIONS.indexOf(window.Store.get("duration")));
      window.Store.set("duration", DURATIONS[(cur + dir + DURATIONS.length) % DURATIONS.length]);
    } else if (row.key === "fitMode") {
      cycle("fitMode", FIT_MODES, dir);
    } else if (row.key === "playOrder") {
      cycle("playOrder", PLAY_ORDERS, dir);
    } else if (row.key === "autoLofi") {
      cycle("autoLofi", LOFI_AUTOPLAY, dir);
    } else if (row.key === "host") {
      // Host editing is handled by OK (opens the full IP input overlay);
      // left/right do nothing here. The old +-1 last-octet cycle made
      // cross-subnet edits impossible.
      return;
    } else if (row.key === "rescan") {
      // OK on the rescan row triggers a scan; left/right do nothing.
      return;
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
      else if (key === "ok") {
        const row = rows()[focusIdx];
        if (row.key === "rescan") {
          window.App.toast("扫描中…");
          window.Sources.discover().then(() => {
            window.App.toast("扫描完成");
            if (window.Keys.current() === "sources") window.SourcesScreen.refresh();
          });
          return;
        }
        if (row.key === "host") {
          const cur = window.Store.get("photofield.host") || "192.168.0.110";
          $("settings-overlay").hidden = true;
          window.IpInput.open(cur, {
            onConfirm: (host) => {
              window.Store.set("photofield.host", host);
              // Re-show settings overlay and refresh the row value.
              $("settings-overlay").hidden = false;
              window.Keys.activate("settings");
              render();
              window.App.toast("地址已更新，重新扫描生效");
            },
            onCancel: () => {
              $("settings-overlay").hidden = false;
              window.Keys.activate("settings");
            },
          });
          return;
        }
        return;
      } else if (key === "back") {
        $("settings-overlay").hidden = true;
        window.Keys.activate(returnTo);
        return;
      } else return;
      render();
    },
  };
})();
