/* Source registry + client contract.
 *
 * A "source" is one upstream server. The app never mixes sources: the
 * current source is top-level state and switching means going back to the
 * source screen.
 *
 * Client contract (implemented per upstream, see photofield.js):
 *   collections()            -> Promise<[{id, name, count}]>
 *   photoCount(collectionId) -> Promise<number>
 *   photoAt(collectionId, i) -> Promise<Photo|null>   (null = hole, skip it)
 *   slice(collectionId, y, h)-> Promise<[{i, x, y, w, h, photo}]>  grid rows
 *   thumbUrl(photo)          -> small grid thumbnail (~256px)
 *   previewUrl(photo, width) -> fullscreen-size image
 *   originalUrl(photo)       -> untouched file bytes
 *
 * Photo = {id, width, height, takenAt, isVideo, filename}
 */
(function () {
  const SOURCES = [
    {
      id: "dcim",
      name: "DCIM",
      baseUrl: "http://192.168.0.110:8000",
      locked: false,
    },
    {
      id: "x",
      name: "X",
      baseUrl: "http://192.168.0.110:8001",
      locked: true,
    },
    {
      id: "wallpaper",
      name: "Wallpaper",
      baseUrl: "http://192.168.0.110:8002",
      locked: false,
    },
  ];

  const clientCache = new Map();

  window.Sources = {
    all: () => SOURCES,
    byId: (id) => SOURCES.find((s) => s.id === id),
    client(source) {
      if (!clientCache.has(source.id)) {
        clientCache.set(source.id, window.PhotofieldClient.create(source));
      }
      return clientCache.get(source.id);
    },
  };
})();
