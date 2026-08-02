/* Fullscreen single-photo viewer overlay, entered from the grid. Videos use
 * the untouched source for sound-on playback; their already-loaded poster is
 * kept as the explicit fallback when the webOS decoder rejects the file. */
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
  let activeVideo = null;

  function fmtDate(iso) {
    if (!iso) return "";
    return iso.slice(0, 10);
  }

  // webOS has one hardware media pipeline. Always clear the source and force
  // a load before removing a video so a later screen cannot inherit it.
  function releaseVideo(video) {
    if (!video) return;
    video.oncanplay = null;
    video.onloadeddata = null;
    video.onerror = null;
    video.onended = null;
    video.autoplay = false;
    try { video.pause(); } catch (e) { /* ignore */ }
    try {
      video.src = "";
      video.load();
    } catch (e) { /* ignore */ }
    if (video.parentNode) video.parentNode.removeChild(video);
  }

  function cancelLoad() {
    loadGeneration++;
    if (pendingRequest) pendingRequest.cancel();
    pendingRequest = null;
    if (activeVideo) releaseVideo(activeVideo);
    activeVideo = null;
    loading = false;
  }

  function invalidate() {
    viewerGeneration++;
    cancelLoad();
  }

  function current(gen, token, at) {
    return (
      gen === viewerGeneration &&
      token === loadGeneration &&
      index === at
    );
  }

  function meta(photo, at) {
    $("viewer-meta").textContent =
      fmtDate(photo.takenAt) + "  " + photo.filename +
      "  ·  " + (at + 1) + " / " + count.toLocaleString();
  }

  function previewCandidates(photo) {
    const candidates = client.previewCandidates
      ? client.previewCandidates(photo, 1920)
      : [client.previewUrl(photo, 1920)];
    return Array.isArray(candidates) ? candidates.filter(Boolean) : [candidates];
  }

  function videoUrl(photo) {
    if (client.videoUrl) return client.videoUrl(photo);
    if (client.originalUrl) return client.originalUrl(photo);
    return null;
  }

  async function showImage(photo, gen, token, at) {
    const img = document.createElement("img");
    const request = window.ImageLoader.load(previewCandidates(photo), img);
    pendingRequest = request;
    const result = await request.promise;
    if (!current(gen, token, at)) return;
    pendingRequest = null;

    // Keep the current image visible until the complete candidate chain has
    // loaded. A key press cancels this request and destroys any old video.
    const stage = $("viewer-stage");
    stage.innerHTML = "";
    stage.appendChild(result.image);
    meta(photo, at);
  }

  async function showVideo(photo, gen, token, at) {
    // Load the poster through the same candidate chain as still images. This
    // makes sqlite/dynamic/previews fallback work even though the video URL is
    // always the original source file.
    const request = window.ImageLoader.load(previewCandidates(photo));
    pendingRequest = request;
    const poster = await request.promise;
    if (!current(gen, token, at)) return;
    pendingRequest = null;

    poster.image.onload = null;
    poster.image.onerror = null;
    const video = document.createElement("video");
    video.className = "viewer-video";
    video.autoplay = true;
    video.loop = false;
    video.controls = false;
    video.preload = "auto";
    video.playsInline = true;
    video.setAttribute("autoplay", "");
    video.setAttribute("playsinline", "");
    // Viewer playback is intentionally sound-on. Kiosk is the only surface
    // that forces muted playback.
    video.muted = false;
    video.defaultMuted = false;
    video.poster = poster.url;

    const stage = $("viewer-stage");
    stage.innerHTML = "";
    stage.appendChild(video);
    activeVideo = video;
    meta(photo, at);

    let failed = false;
    let playAttempted = false;
    const valid = () => current(gen, token, at) && activeVideo === video;

    function fallback() {
      if (failed || !valid()) return;
      failed = true;
      activeVideo = null;
      releaseVideo(video);
      stage.innerHTML = "";
      stage.appendChild(poster.image);
      window.App.toast("视频无法播放，显示海报");
    }

    function start() {
      if (!valid() || failed || playAttempted) return;
      playAttempted = true;
      let result;
      try {
        result = video.play();
      } catch (e) {
        fallback();
        return;
      }
      if (result && typeof result.catch === "function") result.catch(fallback);
    }

    video.onerror = fallback;
    video.oncanplay = start;
    video.onloadeddata = start;
    // No ended handler is needed: loop=false leaves the element on its final
    // decoded frame until the user changes index or leaves the viewer.

    const src = videoUrl(photo);
    if (!src) {
      fallback();
      return;
    }
    video.src = src;
    try { video.load(); } catch (e) { /* error event handles the failure */ }
  }

  async function show(gen) {
    if (gen !== viewerGeneration || loading) return;
    loading = true;
    const token = ++loadGeneration;
    const at = index;
    try {
      const photo = await client.photoAt(collection.id, at);
      if (!current(gen, token, at)) return;
      if (!photo) return;
      if (photo.isVideo) await showVideo(photo, gen, token, at);
      else await showImage(photo, gen, token, at);
    } catch (e) {
      if (current(gen, token, at)) window.App.toast("加载失败");
    } finally {
      if (pendingRequest && token === loadGeneration) pendingRequest = null;
      if (gen !== viewerGeneration || token !== loadGeneration) return;
      loading = false;
      if (index !== at) show(gen);
    }
  }

  function move(delta) {
    const next = index + delta;
    if (next < 0 || next >= count) return;
    index = next;
    // Navigation must release a playing video immediately rather than waiting
    // for the poster/image request to finish.
    cancelLoad();
    show(viewerGeneration);
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
      if (key === "left") {
        move(-1);
      } else if (key === "right") {
        move(1);
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
