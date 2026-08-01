/* Fullscreen single-photo viewer overlay, entered from the grid. */
(function () {
  const $ = (id) => document.getElementById(id);
  let source = null;
  let collection = null;
  let client = null;
  let index = 0;
  let count = 0;
  let loading = false;
  let viewerGeneration = 0;
  let loadGeneration = 0;
  let pendingRequest = null;

  function fmtDate(iso) {
    if (!iso) return "";
    return iso.slice(0, 10);
  }

  function invalidate() {
    viewerGeneration++;
    loadGeneration++;
    if (pendingRequest) pendingRequest.cancel();
    pendingRequest = null;
    loading = false;
  }

  async function show(gen) {
    if (gen !== viewerGeneration || loading) return;
    loading = true;
    const token = ++loadGeneration;
    const at = index;
    try {
      const photo = await client.photoAt(collection.id, at);
      if (gen !== viewerGeneration || token !== loadGeneration) return;
      if (!photo) return;
      const candidates = client.previewCandidates
        ? client.previewCandidates(photo, 1920)
        : [client.previewUrl(photo, 1920)];
      const img = document.createElement("img");
      const request = window.ImageLoader.load(candidates, img);
      pendingRequest = request;
      await request.promise;
      if (
        gen !== viewerGeneration ||
        token !== loadGeneration ||
        index !== at
      ) return;
      // Keep the current image visible until the complete candidate chain has
      // loaded. A key press during the load is handled by the follow-up call
      // below instead of replacing the stage with a stale photo.
      const stage = $("viewer-stage");
      stage.innerHTML = "";
      stage.appendChild(img);
      // Meta uses `at` (the index actually loaded) so the counter always
      // matches the displayed photo, never the latest key press.
      $("viewer-meta").textContent =
        fmtDate(photo.takenAt) + "  " + photo.filename +
        "  ·  " + (at + 1) + " / " + count.toLocaleString();
    } catch (e) {
      if (gen === viewerGeneration && token === loadGeneration) {
        window.App.toast("加载失败");
      }
    } finally {
      if (pendingRequest && token === loadGeneration) pendingRequest = null;
      if (gen !== viewerGeneration || token !== loadGeneration) return;
      loading = false;
      if (index !== at) show(gen);
    }
  }

  window.ViewerScreen = {
    async open(src, col, startIndex) {
      invalidate();
      const gen = viewerGeneration;
      source = src;
      collection = col;
      client = window.Sources.client(src);
      index = startIndex;
      try {
        count = await client.photoCount(col.id);
      } catch (e) {
        if (gen !== viewerGeneration) return;
        window.App.toast("加载失败");
        return;
      }
      if (gen !== viewerGeneration) return;
      $("screen-viewer").hidden = false;
      window.Keys.activate("viewer");
      show(gen);
    },

    onKey({ key }) {
      if (key === "left" && index > 0) {
        index--;
        show(viewerGeneration);
      } else if (key === "right" && index < count - 1) {
        index++;
        show(viewerGeneration);
      } else if (key === "play" || key === "green") {
        $("screen-viewer").hidden = true;
        invalidate();
        window.Playback.start(source, [collection.id], {
          start: { collectionId: collection.id, index },
          rememberCollection: collection.id,
        });
      } else if (key === "back" || key === "ok") {
        $("screen-viewer").hidden = true;
        invalidate();
        window.Keys.activate("grid");
      }
    },
  };
})();
