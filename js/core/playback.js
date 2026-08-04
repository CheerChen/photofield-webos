/* Playback entry point: the single place that gates a source with PIN,
 * writes the lastSource/lastCollection memory, and opens the kiosk.
 *
 * Before this module, five call sites (sources/collections/grid/viewer/app
 * boot) each assembled KioskScreen.open themselves and decided independently
 * whether to write lastCollection — adding an entry meant another place to
 * forget. Now every entry goes through Playback.start / playSource / resume.
 */
(function () {
  window.Playback = {
    /* Start playback of specific collection ids.
     *   opts.start              {collectionId, index} to start from
     *   opts.rememberCollection id to write to lastCollection, or null for
     *                          whole-source play. Omit to leave it unchanged
     *                          (used by resume). */
    start(source, collectionIds, opts) {
      opts = opts || {};
      window.Pin.gate(source, () => {
        window.Store.set("lastSource", source.id);
        if ("rememberCollection" in opts) {
          window.Store.set("lastCollection", opts.rememberCollection);
        }
        window.KioskScreen.open(source, collectionIds, { start: opts.start });
      });
    },

    /* Play the whole source: fetches all collection ids first, then start. */
    async playSource(source, opts) {
      opts = opts || {};
      try {
        const cols = window.Sources.sortCollections(
          await window.Sources.client(source).collections()
        );
        this.start(
          source,
          cols.map((c) => c.id),
          Object.assign({ rememberCollection: null }, opts)
        );
      } catch (e) {
        window.App.toast("无法连接 " + source.name);
      }
    },

    /* Cold-start resume: pick lastCollection when still valid, else the whole
     * source. Does not rewrite lastCollection (it is already the value being
     * resumed). Collections are fetched before the PIN gate so an unreachable
     * source fails fast without prompting for a PIN. */
    async resume(source, opts) {
      opts = opts || {};
      try {
        const client = window.Sources.client(source);
        const cols = window.Sources.sortCollections(await client.collections());
        const lastCol = window.Store.get("lastCollection");
        const ids =
          lastCol && cols.some((c) => c.id === lastCol)
            ? [lastCol]
            : cols.map((c) => c.id);
        window.Pin.gate(source, () => {
          window.Store.set("lastSource", source.id);
          window.KioskScreen.open(source, ids, opts);
        });
      } catch (e) {
        if (opts.onError) opts.onError(e);
        else window.App.toast("无法连接 " + source.name);
      }
    },
  };
})();
