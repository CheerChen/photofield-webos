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
  let moveDir = 0; // direction of the last move(); 0 = opened directly
  let loading = false;
  const viewerGeneration = window.Generation.create();
  let pendingRequest = null;
  let activeVideo = null;

  function fmtDate(iso) {
    if (!iso) return "";
    return iso.slice(0, 10);
  }

  function cancelLoad() {
    viewerGeneration.cancel();
    if (pendingRequest) pendingRequest.cancel();
    pendingRequest = null;
    if (activeVideo) window.Media.releaseVideo(activeVideo);
    activeVideo = null;
    loading = false;
  }

  function invalidate() {
    cancelLoad();
  }

  function current(token, at) {
    return token.isCurrent() && index === at;
  }

  function meta(photo, at) {
    $("viewer-meta").textContent =
      fmtDate(photo.takenAt) + "  " + photo.filename +
      "  ·  " + (at + 1) + " / " + count.toLocaleString();
  }

  function previewCandidates(photo) {
    return window.Media.previewCandidates(client, photo);
  }

  function videoUrl(photo) {
    return window.Media.videoUrl(client, photo);
  }

  async function showImage(photo, token, at) {
    const img = document.createElement("img");
    const request = window.ImageLoader.load(previewCandidates(photo), img);
    pendingRequest = request;
    const result = await request.promise;
    if (!current(token, at)) return;
    pendingRequest = null;

    // Keep the current image visible until the complete candidate chain has
    // loaded. A key press cancels this request and destroys any old video.
    const stage = $("viewer-stage");
    stage.innerHTML = "";
    stage.appendChild(result.image);
    meta(photo, at);
  }

  async function showVideo(photo, token, at) {
    // Load the poster through the same candidate chain as still images. This
    // makes sqlite/dynamic/previews fallback work even though the video URL is
    // always the original source file.
    const request = window.ImageLoader.load(previewCandidates(photo));
    pendingRequest = request;
    const poster = await request.promise;
    if (!current(token, at)) return;
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
    const valid = () => current(token, at) && activeVideo === video;

    function fallback() {
      if (failed || !valid()) return;
      failed = true;
      activeVideo = null;
      window.Media.releaseVideo(video);
      stage.innerHTML = "";
      stage.appendChild(poster.image);
      window.App.toast(window.I18N.t("viewer.videoPoster"));
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

  async function show(token) {
    if (!token.isCurrent() || loading) return;
    loading = true;
    const at = index;
    try {
      const photo = await client.photoAt(collection.id, at);
      if (!current(token, at)) return;
      if (!photo) return;
      // Media scope: while navigating, step over videos in the same
      // direction (the finally block chains show() when index moved).
      // A video opened directly from the grid still plays — that is an
      // explicit choice, not a passive switch.
      if (photo.isVideo && moveDir && window.Store.get("mediaScope") !== "all") {
        const next = at + moveDir;
        if (next >= 0 && next < count) index = next;
        return;
      }
      if (photo.isVideo) await showVideo(photo, token, at);
      else await showImage(photo, token, at);
    } catch (e) {
      if (current(token, at)) window.App.toast(window.I18N.t("app.loadFailed"));
    } finally {
      if (token.isCurrent()) pendingRequest = null;
      if (!token.isCurrent()) return;
      loading = false;
      if (index !== at) show(viewerGeneration.next());
    }
  }

  function move(delta) {
    const next = index + delta;
    if (next < 0 || next >= count) return;
    index = next;
    moveDir = delta;
    // Navigation must release a playing video immediately rather than waiting
    // for the poster/image request to finish.
    cancelLoad();
    show(viewerGeneration.next());
  }

  window.ViewerScreen = {
    async open(src, col, startIndex) {
      invalidate();
      const token = viewerGeneration.next();
      source = src;
      collection = col;
      client = window.Sources.client(src);
      index = startIndex;
      moveDir = 0;
      $("viewer-stage").innerHTML = "";
      window.Navigation.push("viewer");
      try {
        const loadedCount = await client.photoCount(col.id);
        if (!token.isCurrent()) return;
        count = loadedCount;
      } catch (e) {
        if (!token.isCurrent()) return;
        window.App.toast(window.I18N.t("app.loadFailed"));
        invalidate();
        window.Navigation.pop();
        return;
      }
      if (!token.isCurrent()) return;
      show(token);
    },

    onKey({ key }) {
      if (key === "left") {
        move(-1);
      } else if (key === "right") {
        move(1);
      } else if (key === "play" || key === "green") {
        invalidate();
        window.Navigation.pop();
        window.Playback.start(source, [collection.id], {
          start: { collectionId: collection.id, index },
          rememberCollection: collection.id,
        });
      } else if (key === "back" || key === "ok") {
        invalidate();
        window.Navigation.pop();
      }
    },
  };
})();
