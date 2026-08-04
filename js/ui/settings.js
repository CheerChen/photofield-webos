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
  const INFO_DISPLAYS = [
    { id: "all", label: "全部显示" },
    { id: "details", label: "仅详情" },
    { id: "clock", label: "仅时钟" },
    { id: "hidden", label: "全部隐藏" },
  ];
  const ALBUM_SORTS = [
    { id: "nameAsc", label: "按文件名升序" },
    { id: "nameDesc", label: "按文件名降序" },
  ];
  const MEDIA_SCOPES = [
    { id: "photos", label: "仅图片" },
    { id: "all", label: "图片和视频" },
  ];
  let focusIdx = 0;

  function current(options, key) {
    return options.find((option) => option.id === window.Store.get(key)) || options[0];
  }

  function rows() {
    return [
      { group: "播放" },
      { key: "duration", label: "播放间隔", value: window.Store.get("duration") + " 秒", type: "cycler", hint: "每张照片在屏幕上停留的时间" },
      { key: "playOrder", label: "播放顺序", value: current(PLAY_ORDERS, "playOrder").label, type: "cycler", hint: "随机播放或按相册中的顺序播放" },
      { key: "fitMode", label: "相片填充", value: current(FIT_MODES, "fitMode").label, type: "cycler", hint: "氛围填充会模糊放大背景，保留照片完整居中" },
      { key: "startup", label: "启动行为", value: current(STARTUPS, "startup").label, type: "cycler", hint: "开机后直接恢复上次播放的源" },
      { key: "infoDisplay", label: "信息显示", value: current(INFO_DISPLAYS, "infoDisplay").label, type: "cycler", hint: "播放时默认显示的信息；按方向键可临时唤出完整信息" },
      { group: "相册" },
      { key: "albumSort", label: "相册排序", value: current(ALBUM_SORTS, "albumSort").label, type: "cycler", hint: "相册列表与整源顺序播放的排列顺序" },
      { key: "mediaScope", label: "相册可见范围", value: current(MEDIA_SCOPES, "mediaScope").label, type: "cycler", hint: "仅图片时，相册内翻页与幻灯片播放会跳过视频" },
      { group: "音乐" },
      { key: "autoLofi", label: "自动播放 Lofi", value: current(LOFI_AUTOPLAY, "autoLofi").label, type: "cycler", hint: "进入幻灯片时随机开始一组 Lofi 音乐" },
      { group: "服务器" },
      { key: "host", label: "服务器地址", value: window.Store.get("photofield.host") || "192.168.0.110", type: "navigate", hint: "修改 Photofield 服务所在设备的地址" },
      { key: "rescan", label: "重新扫描实例", value: "", type: "action", hint: "重新查找此地址上可用的 Photofield 实例" },
      // PIN row hidden: no source is currently locked. Re-add when a locked
      // source comes back (see js/clients/source.js "locked").
    ];
  }

  function render() {
    const list = $("settings-list");
    list.innerHTML = "";
    // Build the row set once: filter() keeps object identity, so indexOf
    // below can map a row back to its selectable position. Two rows() calls
    // would produce distinct objects and indexOf would never match.
    const all = rows();
    const selectable = all.filter((r) => r.key);
    all.forEach((r) => {
      if (!r.key) {
        const heading = document.createElement("div");
        heading.className = "settings-group";
        heading.textContent = r.group;
        list.appendChild(heading);
        return;
      }
      const i = selectable.indexOf(r);
      const row = document.createElement("div");
      row.className = "settings-row settings-" + r.type + (i === focusIdx ? " focused" : "");
      row.innerHTML = "<span>" + r.label + '</span><span class="value">' + (r.type === "cycler" ? "‹ " : "") + r.value + (r.type === "cycler" ? " ›" : r.type === "navigate" ? " ›" : "") + "</span>";
      list.appendChild(row);
    });
    $("settings-hint").textContent = selectable[focusIdx].hint + " · ←→ 调整 · 返回关闭";
  }

  function cycle(key, options, dir) {
    const cur = Math.max(0, options.findIndex((option) => option.id === window.Store.get(key)));
    window.Store.set(key, options[(cur + dir + options.length) % options.length].id);
  }

  function adjust(dir) {
    const row = rows().filter((r) => r.key)[focusIdx];
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
    } else if (row.key === "infoDisplay") {
      cycle("infoDisplay", INFO_DISPLAYS, dir);
    } else if (row.key === "albumSort") {
      cycle("albumSort", ALBUM_SORTS, dir);
    } else if (row.key === "mediaScope") {
      cycle("mediaScope", MEDIA_SCOPES, dir);
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
      focusIdx = 0;
      window.Navigation.push("settings");
      render();
    },

    onKey({ key }) {
      const selectable = rows().filter((r) => r.key);
      if (key === "up") focusIdx = (focusIdx + selectable.length - 1) % selectable.length;
      else if (key === "down") focusIdx = (focusIdx + 1) % selectable.length;
      else if (key === "left") adjust(-1);
      else if (key === "right") adjust(1);
      else if (key === "ok") {
        const row = selectable[focusIdx];
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
          window.IpInput.open(cur, {
            onConfirm: (host) => {
              window.Store.set("photofield.host", host);
              render();
              window.App.toast("地址已更新，重新扫描生效");
            },
          });
          return;
        }
        return;
      } else if (key === "back") {
        window.Navigation.pop();
        return;
      } else return;
      render();
    },
  };
})();
