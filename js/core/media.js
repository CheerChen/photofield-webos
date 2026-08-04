/* Shared media lifecycle helpers. The viewer, the kiosk, and the slideshow
 * player all resolve the same fullscreen candidate chain, release the single
 * hardware video decoder the same way, and build CSS url() values the same
 * way. Centralizing them means the platform detail "clearing src is what
 * actually frees the webOS decoder" lives in exactly one place. */
(function () {
  /* Ordered fullscreen-image candidate chain for a photo. Prefers the client's
   * candidate list; when a previously resolved URL is supplied it is moved to
   * the front (de-duplicated) so a known-good file is retried first. */
  function previewCandidates(client, photo, preferred) {
    const listed = client.previewCandidates
      ? client.previewCandidates(photo, 1920)
      : [client.previewUrl(photo, 1920)];
    const candidates = Array.isArray(listed) ? listed.filter(Boolean) : [listed];
    return preferred
      ? [preferred, ...candidates.filter((url) => url !== preferred)]
      : candidates;
  }

  /* The untouched source file for sound-on video playback. */
  function videoUrl(client, photo) {
    if (client.videoUrl) return client.videoUrl(photo);
    if (client.originalUrl) return client.originalUrl(photo);
    return null;
  }

  /* Stop, detach, and force-load an empty source. Clearing only src is not
   * enough on webOS: the decoder can otherwise remain pinned between slides,
   * so the handlers are dropped, autoplay is cleared, and the element is
   * removed from the DOM. Safe to call with null. */
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

  /* Escape a URL for use inside a CSS url("...") value. */
  function cssUrl(url) {
    return 'url("' + String(url).replace(/"/g, "%22") + '")';
  }

  window.Media = { previewCandidates, videoUrl, releaseVideo, cssUrl };
})();
