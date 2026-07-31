/* Inline SVG icons — the WAM webview font lacks emoji/unicode symbols
 * (⏵ ❚❚ 🔒 render as tofu), so all glyphs are SVG with fill=currentColor. */
(function () {
  const svg = (path) =>
    '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="' + path + '"/></svg>';

  window.Icons = {
    play: svg("M8 5v14l11-7z"),
    pause: svg("M6 5h4v14H6zM14 5h4v14h-4z"),
    stop: svg("M6 6h12v12H6z"),
    lock: svg("M12 2a5 5 0 0 0-5 5v3H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2h-1V7a5 5 0 0 0-5-5zm-3 8V7a3 3 0 1 1 6 0v3H9z"),
    photo: svg("M21 19V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2zM8.5 11l2.5 3.01L14.5 10l4.5 6H5l3.5-5z"),
  };
})();
