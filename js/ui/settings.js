/* Settings overlay: kiosk interval, playback options, PIN management. */
(function () {
  const $ = (id) => document.getElementById(id);
  const t = (key, vars) => window.I18N.t(key, vars);
  const DURATIONS = [5, 8, 12, 20, 30];
  // Option labels are i18n keys, resolved at render time so the open
  // settings panel follows a language switch without special-casing.
  const FIT_MODES = [
    { id: "ambient", label: "fit.ambient" },
    { id: "contain", label: "fit.contain" },
    { id: "cover", label: "fit.cover" },
  ];
  const PLAY_ORDERS = [
    { id: "shuffle", label: "order.shuffle" },
    { id: "sequential", label: "order.sequential" },
  ];
  const LOFI_AUTOPLAY = [
    { id: true, label: "common.on" },
    { id: false, label: "common.off" },
  ];
  const LOFI_SOURCES = [
    { id: "local", label: "settings.lofiSource.local" },
    { id: "radio", label: "settings.lofiSource.radio" },
  ];
  const INFO_DISPLAYS = [
    { id: "all", label: "info.all" },
    { id: "details", label: "info.details" },
    { id: "clock", label: "info.clock" },
    { id: "hidden", label: "info.hidden" },
  ];
  const ALBUM_SORTS = [
    { id: "nameAsc", label: "sort.nameAsc" },
    { id: "nameDesc", label: "sort.nameDesc" },
  ];
  const MEDIA_SCOPES = [
    { id: "photos", label: "scope.photos" },
    { id: "all", label: "scope.all" },
  ];
  let focusIdx = 0;

  function current(options, key) {
    return options.find((option) => option.id === window.Store.get(key)) || options[0];
  }

  function rows() {
    return [
      { group: t("settings.group.playback") },
      { key: "duration", label: t("settings.duration"), value: t("settings.seconds", { n: window.Store.get("duration") }), type: "cycler", hint: t("settings.duration.hint") },
      { key: "playOrder", label: t("settings.playOrder"), value: t(current(PLAY_ORDERS, "playOrder").label), type: "cycler", hint: t("settings.playOrder.hint") },
      { key: "fitMode", label: t("settings.fitMode"), value: t(current(FIT_MODES, "fitMode").label), type: "cycler", hint: t("settings.fitMode.hint") },
      { key: "infoDisplay", label: t("settings.infoDisplay"), value: t(current(INFO_DISPLAYS, "infoDisplay").label), type: "cycler", hint: t("settings.infoDisplay.hint") },
      { group: t("settings.group.music") },
      { key: "autoLofi", label: t("settings.autoLofi"), value: t(current(LOFI_AUTOPLAY, "autoLofi").label), type: "cycler", hint: t("settings.autoLofi.hint") },
      { key: "lofiSource", label: t("settings.lofiSource"), value: t(current(LOFI_SOURCES, "lofiSource").label), type: "cycler", hint: t("settings.lofiSource.hint") },
      { group: t("settings.group.album") },
      { key: "albumSort", label: t("settings.albumSort"), value: t(current(ALBUM_SORTS, "albumSort").label), type: "cycler", hint: t("settings.albumSort.hint") },
      { key: "mediaScope", label: t("settings.mediaScope"), value: t(current(MEDIA_SCOPES, "mediaScope").label), type: "cycler", hint: t("settings.mediaScope.hint") },
      { group: t("settings.group.server") },
      { key: "host", label: t("settings.host"), value: window.Store.get("photofield.host") || "192.168.0.110", type: "navigate", hint: t("settings.host.hint") },
      { key: "rescan", label: t("settings.rescan"), value: "", type: "action", hint: t("settings.rescan.hint") },
      { group: t("settings.group.general") },
      { key: "language", label: t("settings.language"), value: t("lang.self"), type: "cycler", hint: t("settings.language.hint") },
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
    $("settings-hint").textContent = selectable[focusIdx].hint + t("settings.hintSuffix");
  }

  function cycle(key, options, dir) {
    const cur = Math.max(0, options.findIndex((option) => option.id === window.Store.get(key)));
    window.Store.set(key, options[(cur + dir + options.length) % options.length].id);
  }

  function adjust(dir) {
    const row = rows().filter((r) => r.key)[focusIdx];
    if (row.key === "duration") {
      const cur = Math.max(0, DURATIONS.indexOf(window.Store.get("duration")));
      window.Store.set("duration", DURATIONS[(cur + dir + DURATIONS.length) % DURATIONS.length]);
    } else if (row.key === "fitMode") {
      cycle("fitMode", FIT_MODES, dir);
    } else if (row.key === "playOrder") {
      cycle("playOrder", PLAY_ORDERS, dir);
    } else if (row.key === "autoLofi") {
      cycle("autoLofi", LOFI_AUTOPLAY, dir);
    } else if (row.key === "lofiSource") {
      cycle("lofiSource", LOFI_SOURCES, dir);
      // Switching the library stops any playback under the old source; the
      // kiosk restarts music on its next color key or auto-start.
      window.Music.setSource(window.Store.get("lofiSource"));
    } else if (row.key === "infoDisplay") {
      cycle("infoDisplay", INFO_DISPLAYS, dir);
    } else if (row.key === "albumSort") {
      cycle("albumSort", ALBUM_SORTS, dir);
    } else if (row.key === "mediaScope") {
      cycle("mediaScope", MEDIA_SCOPES, dir);
    } else if (row.key === "language") {
      window.I18N.cycleLang();
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
          window.App.toast(t("settings.scanning"));
          window.Sources.discover().then(() => {
            window.App.toast(t("settings.scanDone"));
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
              window.App.toast(t("settings.hostUpdated"));
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
