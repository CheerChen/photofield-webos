/* Source-level Photofield scan orchestration.
 *
 * Two entry points share one piece of in-memory state (Sources.busy):
 *
 *   Scan.start(source)  — red-key trigger. POSTs INDEX_FILES for every
 *                        collection in the source, then polls /api/tasks
 *                        until the source is idle, resets the client cache
 *                        (file order may have changed) and refreshes counts.
 *
 *   Scan.sync(source, collections) — passive busy detection. Reads
 *                        /api/tasks and greys the source card if any of its
 *                        collections has an in-flight indexing task, e.g. a
 *                        scan started from the Photofield web UI. Never
 *                        triggers work and never clears busy for a source
 *                        with an in-flight start() (the active scan owns the
 *                        clear, so a refresh mid-scan cannot un-grey early).
 *
 * Task attribution is by collection_id: a task counts toward a source only
 * when its collection_id is one of that source's collection ids. On Photofield
 * v0.23+ every indexing task carries collection_id, so we wait for the full
 * INDEX_FILES -> METADATA -> CONTENTS -> FACES chain. On v0.22 the metadata /
 * contents / faces tasks are global (no collection_id) and are therefore not
 * attributed to any source; only INDEX_FILES (which has collection_id) is
 * waited for, which matches the "accept that post-processing may still be
 * running" trade-off from the investigation.
 */
(function () {
  const TASK_POLL_MS = 1000;
  const TASK_TYPES = [
    "INDEX_FILES",
    "INDEX_METADATA",
    "INDEX_CONTENTS",
    "INDEX_FACES",
  ];
  // A wedged task should not spin the poller forever, but transient pi
  // errors are common during a scan, so allow a few failed polls before
  // surfacing an error.
  const MAX_NET_ERRORS = 5;
  // active scan ownership: sourceId -> gen symbol. Presence also means
  // "an active start() owns this source's busy clear".
  const active = new Map();

  function attributedTasks(tasks, colIds) {
    return tasks.filter(
      (t) =>
        t.collection_id != null &&
        colIds.includes(t.collection_id) &&
        TASK_TYPES.includes(t.type)
    );
  }

  function attributed(tasks, colIds) {
    return attributedTasks(tasks, colIds).length > 0;
  }

  function updateProgress(source, tasks, colIds) {
    const relevant = attributedTasks(tasks, colIds);
    if (!relevant.length) return false;
    // The API normally returns the active task first. Prefer a task whose
    // done counter has moved when queued zero-progress tasks precede it.
    const task = relevant.find((t) => Number(t.done) > 0) || relevant[0];
    const done = Number(task.done);
    window.Sources.setBusy(source.id, {
      status: "scanning",
      taskType: task.type,
      done: Number.isFinite(done) && done >= 0 ? done : null,
    });
    if (window.Keys.current() === "sources") window.SourcesScreen.render();
    return true;
  }

  window.Scan = {
    isBusy(sourceId) {
      return active.has(sourceId);
    },

    /* Passive: grey the source if any of its collections is being indexed.
     * `collections` is the array already fetched by the caller (loadCounts)
     * so this costs only the single /api/tasks request. */
    async sync(source, collections) {
      if (active.has(source.id)) return; // active scan owns the state
      try {
        const client = window.Sources.client(source);
        const tasks = await client.tasks();
        const colIds = collections.map((c) => c.id);
        if (attributed(tasks, colIds)) {
          window.Sources.setBusy(source.id, { status: "scanning" });
        } else {
          window.Sources.clearBusy(source.id);
        }
        if (window.Keys.current() === "sources") window.SourcesScreen.render();
      } catch (e) {
        /* tasks endpoint unreachable: leave busy state untouched; the
         * count loader reports connection failures separately. */
      }
    },

    /* Active: trigger a filesystem rescan of the whole source and wait it
     * out. Idempotent — a second press while a scan is in flight is a no-op. */
    async start(source) {
      if (active.has(source.id)) return;
      const gen = Symbol();
      active.set(source.id, gen);
      window.Sources.setBusy(source.id, { status: "scanning" });
      window.App.toast("正在扫描 " + source.name + "…");
      try {
        const client = window.Sources.client(source);
        const cols = await client.collections();
        const colIds = cols.map((c) => c.id);

        // Kick off INDEX_FILES for every collection. 202 / 409 are both
        // fine; a per-collection failure (e.g. that collection is mid-scan
        // on another client) does not abort the rest.
        for (const cid of colIds) {
          try {
            const tasks = await client.createIndexFiles(cid);
            updateProgress(source, tasks || [], colIds);
          } catch (e) {
            /* keep going — the poll loop still picks up running tasks */
          }
        }

        // Poll until no attributed task remains. Fetching all tasks once
        // per tick (rather than per collection) keeps the request count
        // flat regardless of how many collections the source has.
        let netErrors = 0;
        while (active.get(source.id) === gen) {
          let busy = false;
          try {
            const tasks = await client.tasks();
            busy = attributed(tasks, colIds);
            if (busy) updateProgress(source, tasks, colIds);
            netErrors = 0;
          } catch (e) {
            if (++netErrors >= MAX_NET_ERRORS) throw e;
            busy = true; // assume still scanning and retry next tick
          }
          if (!busy) break;
          await new Promise((r) => setTimeout(r, TASK_POLL_MS));
        }
        if (active.get(source.id) !== gen) return; // superseded by a newer start

        client.reset();
        window.Sources.clearBusy(source.id);
        active.delete(source.id);
        window.App.toast(source.name + " 扫描完成");
        if (window.Keys.current() === "sources") window.SourcesScreen.refresh();
      } catch (e) {
        if (active.get(source.id) === gen) {
          active.delete(source.id);
          window.Sources.setBusy(source.id, { status: "error" });
        }
        window.App.toast(
          "扫描失败：" + (e.message || source.name),
          6000,
          "error"
        );
      }
    },
  };
})();
