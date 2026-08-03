/* Source selection is a compact gallery foyer: each server is represented by
 * a sampled photo mosaic, while scan polling only updates its live text. */
(function () {
  const $ = (id) => document.getElementById(id);
  let focusIdx = 0;
  let counts = {};
  let coverGeneration = 0;
  let covers = {};
  let atmospheres = {};
  let atmosphereTimer = 0;
  let shownAtmosphere = null;
  let atmosphereScratch = null;

  // Focus movement never redraws the ambience directly: the layer fades out
  // immediately (compositor-only) and the redraw commits once the focus has
  // rested for the dwell delay.
  const ATMOSPHERE_DWELL_MS = 400;

  // The ambience "blur" is a 192x108 canvas the GPU stretches to full
  // screen: two resampling passes through a 48x27 scratch approximate a
  // large-radius gaussian without any CSS filter, whose cost scales with
  // the full-screen output area and stalls TV GPUs for ~200ms per repaint.
  function drawAtmosphere(image) {
    const canvas = $("source-atmosphere-canvas");
    const ctx = canvas.getContext("2d");
    if (!image) { ctx.clearRect(0, 0, canvas.width, canvas.height); return; }
    if (!atmosphereScratch) {
      atmosphereScratch = document.createElement("canvas");
      atmosphereScratch.width = 48;
      atmosphereScratch.height = 27;
    }
    const scratch = atmosphereScratch.getContext("2d");
    // Cover-crop the source into the scratch so the stretched result keeps
    // the photo's center composition.
    const scale = Math.max(atmosphereScratch.width / image.width, atmosphereScratch.height / image.height);
    const w = atmosphereScratch.width / scale;
    const h = atmosphereScratch.height / scale;
    scratch.drawImage(image, (image.width - w) / 2, (image.height - h) / 2, w, h, 0, 0, atmosphereScratch.width, atmosphereScratch.height);
    ctx.drawImage(atmosphereScratch, 0, 0, canvas.width, canvas.height);
    // Bake in the darkening that used to come from the brightness() filter.
    ctx.fillStyle = "rgba(14,15,18,0.48)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  const SCAN_PHASES = {
    INDEX_FILES: "扫描文件", INDEX_METADATA: "读取照片信息",
    INDEX_CONTENTS: "生成缩略图", INDEX_FACES: "识别人脸",
  };

  function scanStatus(info) {
    if (info.status === "error") return "扫描失败";
    const phase = SCAN_PHASES[info.taskType] || "扫描中";
    return Number.isFinite(info.done) ? phase + " " + info.done.toLocaleString() + " 张…" : phase + "…";
  }

  function countText(source) {
    const busy = window.Sources.busy(source.id);
    if (busy) return scanStatus(busy);
    const count = counts[source.id];
    return count === undefined ? "正在读取…" : count === -1 ? "连接失败" : count.toLocaleString() + " 张";
  }

  function mosaic(source) {
    const urls = covers[source.id] || [];
    const mosaic = document.createElement("div");
    mosaic.className = "source-card-mosaic";
    for (let i = 0; i < 3; i++) {
      const tile = document.createElement("span");
      if (urls[i]) tile.style.backgroundImage = 'url("' + urls[i].replace(/"/g, "%22") + '")';
      mosaic.appendChild(tile);
    }
    return mosaic;
  }

  function buildCards() {
    const row = $("source-row");
    row.innerHTML = "";
    window.Sources.all().forEach((source) => {
      const card = document.createElement("div");
      card.className = "source-card";
      card.dataset.sourceId = source.id;
      card.appendChild(mosaic(source));
      const scrim = document.createElement("div");
      scrim.className = "source-card-scrim";
      const name = document.createElement("div");
      name.className = "source-card-name";
      name.textContent = source.name;
      if (source.locked) name.insertAdjacentHTML("beforeend", ' <span class="source-card-lock">' + window.Icons.lock + "</span>");
      const count = document.createElement("div");
      count.className = "source-card-count";
      const play = document.createElement("div");
      play.className = "source-card-play";
      play.innerHTML = window.Icons.play + " 播放";
      scrim.append(name, count, play);
      card.append(scrim);
      row.appendChild(card);
    });
  }

  function updateCards() {
    const list = window.Sources.all();
    if ($("source-row").children.length !== list.length) buildCards();
    list.forEach((source, i) => {
      const card = $("source-row").children[i];
      const busy = window.Sources.busy(source.id);
      card.classList.toggle("focused", i === focusIdx);
      card.classList.toggle("busy", !!busy);
      // Write only on change: replacing the text node invalidates the
      // card's compositor layer even when the string is identical.
      const count = card.querySelector(".source-card-count");
      const text = countText(source);
      if (count.textContent !== text) count.textContent = text;
      card.querySelector(".source-card-play").hidden = !!busy;
    });
    const offset = Math.max(0, focusIdx - 2) * 540;
    $("source-row").style.transform = "translateX(-" + offset + "px)";
    scheduleAtmosphere();
  }

  function scheduleAtmosphere() {
    const source = window.Sources.all()[focusIdx];
    const image = (source && atmospheres[source.id]) || null;
    clearTimeout(atmosphereTimer);
    const el = $("source-atmosphere");
    if (image === shownAtmosphere) {
      el.classList.toggle("visible", !!image);
      return;
    }
    el.classList.remove("visible");
    atmosphereTimer = setTimeout(() => {
      shownAtmosphere = image;
      drawAtmosphere(image);
      // Commit the class one frame after the draw so the opacity fade-in
      // starts from a canvas that already shows the new photo.
      if (image) requestAnimationFrame(() => el.classList.add("visible"));
    }, ATMOSPHERE_DWELL_MS);
  }

  function render() {
    const list = window.Sources.all();
    $("source-empty").hidden = list.length > 0;
    updateCards();
  }

  async function loadSourceCovers(generation) {
    for (const source of window.Sources.all()) {
      if (generation !== coverGeneration) return;
      try {
        const client = window.Sources.client(source);
        const cols = await client.collections();
        const picks = cols.filter((c) => c.count > 0).slice(0, 3);
        const urls = [];
        let ambiencePhoto = null;
        for (const col of picks) {
          const photo = await client.photoAt(col.id, 0);
          if (!photo) continue;
          if (!ambiencePhoto) ambiencePhoto = photo;
          const candidates = client.thumbCandidates ? client.thumbCandidates(photo, 640) : [client.thumbUrl(photo, 640)];
          const result = await window.ImageLoader.load(candidates).promise;
          urls.push(result.url);
        }
        if (ambiencePhoto && client.ambienceCandidates) {
          try {
            // Keep the decoded Image itself: the ambience is drawn onto a
            // canvas, not set as a background URL. Cross-origin pixels are
            // fine because the canvas is display-only, never read back.
            const ambience = await window.ImageLoader.load(client.ambienceCandidates(ambiencePhoto, 256)).promise;
            atmospheres[source.id] = ambience.image;
          } catch (e) { /* ambience stays dark; the mosaic is unaffected */ }
        }
        if (generation !== coverGeneration) return;
        covers[source.id] = urls;
        buildCards();
        updateCards();
      } catch (e) { /* a text-only card remains usable when a cover fails */ }
    }
  }

  async function loadCounts() {
    for (const source of window.Sources.all()) {
      try {
        const cols = await window.Sources.client(source).collections();
        counts[source.id] = cols.reduce((n, c) => n + c.count, 0);
        window.Scan.sync(source, cols);
      } catch (e) { counts[source.id] = -1; }
      if (window.Keys.current() === "sources") updateCards();
    }
  }

  function enter(source) { window.Pin.gate(source, () => { window.Store.set("lastSource", source.id); window.CollectionsScreen.open(source); }); }
  function play(source) { window.Playback.playSource(source); }

  window.SourcesScreen = {
    open() {
      window.App.show("sources");
      focusIdx = 0;
      render();
      const generation = ++coverGeneration;
      loadSourceCovers(generation);
    },
    render,
    refresh: loadCounts,
    onKey({ key }) {
      const n = window.Sources.all().length;
      if (n === 0) { if (key === "blue") return window.SettingsScreen.open(); if (key === "back") return window.App.exit(); return; }
      const source = window.Sources.all()[focusIdx];
      const busy = window.Sources.busy(source.id);
      if (key === "left") focusIdx = (focusIdx - 1 + n) % n;
      else if (key === "right") focusIdx = (focusIdx + 1) % n;
      else if (key === "ok") { if (busy) return window.App.toast("扫描中，请稍候"); enter(source); return; }
      else if (key === "play" || key === "green") { if (busy) return window.App.toast("扫描中，请稍候"); play(source); return; }
      else if (key === "red") { if (busy) return window.App.toast("正在扫描中…"); window.Scan.start(source); }
      else if (key === "blue") return window.SettingsScreen.open();
      else if (key === "back") return window.App.exit();
      else return;
      updateCards();
    },
  };
})();
