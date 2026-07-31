/* Fullscreen single-photo viewer overlay, entered from the grid. */
(function () {
  const $ = (id) => document.getElementById(id);
  let source = null;
  let collection = null;
  let client = null;
  let index = 0;
  let count = 0;
  let loading = false;

  function fmtDate(iso) {
    if (!iso) return "";
    return iso.slice(0, 10);
  }

  async function show() {
    if (loading) return;
    loading = true;
    const at = index;
    try {
      const photo = await client.photoAt(collection.id, at);
      if (!photo) { loading = false; return; }
      const stage = $("viewer-stage");
      stage.innerHTML = "";
      const img = document.createElement("img");
      img.src = client.previewUrl(photo, 1920);
      stage.appendChild(img);
      // Meta uses `at` (the index actually loaded) so the counter always
      // matches the displayed photo, never the latest key press.
      $("viewer-meta").textContent =
        fmtDate(photo.takenAt) + "  " + photo.filename +
        "  ·  " + (at + 1) + " / " + count.toLocaleString();
    } catch (e) {
      window.App.toast("加载失败");
    }
    loading = false;
    // A key press during the await updated index; reload so the last
    // requested photo is shown instead of leaving the viewer stuck on a
    // stale frame with a mismatched counter.
    if (index !== at) show();
  }

  window.ViewerScreen = {
    async open(src, col, startIndex) {
      source = src;
      collection = col;
      client = window.Sources.client(src);
      index = startIndex;
      count = await client.photoCount(col.id);
      $("screen-viewer").hidden = false;
      window.Keys.activate("viewer");
      show();
    },

    onKey({ key }) {
      if (key === "left" && index > 0) {
        index--;
        show();
      } else if (key === "right" && index < count - 1) {
        index++;
        show();
      } else if (key === "play" || key === "green") {
        $("screen-viewer").hidden = true;
        window.Playback.start(source, [collection.id], {
          start: { collectionId: collection.id, index },
          rememberCollection: collection.id,
        });
      } else if (key === "back" || key === "ok") {
        $("screen-viewer").hidden = true;
        window.Keys.activate("grid");
      }
    },
  };
})();
