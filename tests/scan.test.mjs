// Scan orchestration: red-key trigger, passive busy detection, attribution,
// idempotency, and network-error retry.
import assert from "node:assert/strict";

// Fast timers so the 2s poll loop does not stall the test. Resolves the
// poll promise on the next microtask, just like a real timer would.
const realSetTimeout = globalThis.setTimeout;
globalThis.setTimeout = (fn) => realSetTimeout(fn, 0);

const busyMap = new Map();
const busyUpdates = [];
const toasts = [];
let renders = 0;
let refreshes = 0;
let resetCalls = 0;

function makeClient({ collections, tasks, indexThrows, indexResponse }) {
  const calls = { createIndexFiles: 0, tasks: 0 };
  return {
    calls,
    async collections() {
      return collections;
    },
    async createIndexFiles() {
      calls.createIndexFiles++;
      if (indexThrows) throw indexThrows;
      return indexResponse || [];
    },
    async tasks() {
      calls.tasks++;
      const t = tasks;
      if (typeof t === "function") return t();
      return t;
    },
    reset() {
      resetCalls++;
    },
  };
}

globalThis.window = {};
window.Keys = { current: () => "sources" };
window.App = { toast: (msg, ms, kind) => toasts.push({ msg, kind }) };
window.SourcesScreen = {
  render: () => renders++,
  refresh: () => refreshes++,
};
window.Sources = {
  client: () => null, // set per-test
  busy: (id) => busyMap.get(id) || null,
  setBusy: (id, info) => {
    busyUpdates.push(info);
    busyMap.set(id, info);
  },
  clearBusy: (id) => busyMap.delete(id),
};

await import("../js/core/i18n.js");
await import("../js/core/scan.js");
const Scan = window.Scan;
const source = { id: "port-8001", name: "X" };

function setup(client) {
  window.Sources.client = () => client;
  busyMap.clear();
  busyUpdates.length = 0;
  toasts.length = 0;
  renders = 0;
  refreshes = 0;
  resetCalls = 0;
}

// --- passive sync: attributed task greys the source -------------------
{
  const client = makeClient({
    collections: [{ id: "c1" }, { id: "c2" }],
    tasks: [{ collection_id: "c1", type: "INDEX_FILES" }],
  });
  setup(client);
  await Scan.sync(source, [{ id: "c1" }, { id: "c2" }]);
  assert.equal(window.Sources.busy(source.id).status, "scanning");
  assert.equal(renders, 1);
}

// --- passive sync: unrelated collection_id does not grey --------------
{
  const client = makeClient({
    collections: [{ id: "c1" }],
    tasks: [{ collection_id: "other", type: "INDEX_FILES" }],
  });
  setup(client);
  window.Sources.setBusy(source.id, { status: "scanning" });
  await Scan.sync(source, [{ id: "c1" }]);
  assert.equal(window.Sources.busy(source.id), null); // cleared
}

// --- passive sync: task without collection_id is not attributed -------
{
  // v0.22 global metadata task: no collection_id -> not our source.
  const client = makeClient({
    collections: [{ id: "c1" }],
    tasks: [{ type: "INDEX_METADATA" }],
  });
  setup(client);
  await Scan.sync(source, [{ id: "c1" }]);
  assert.equal(window.Sources.busy(source.id), null);
}

// --- passive sync: non-indexing task type is ignored -------------------
{
  const client = makeClient({
    collections: [{ id: "c1" }],
    tasks: [{ collection_id: "c1", type: "SOMETHING_ELSE" }],
  });
  setup(client);
  await Scan.sync(source, [{ id: "c1" }]);
  assert.equal(window.Sources.busy(source.id), null);
}

// --- active start: task done counter is exposed as UI progress --------
{
  let taskState = [{
    id: "index-files-c1",
    collection_id: "c1",
    type: "INDEX_FILES",
    done: 23,
  }];
  const client = makeClient({
    collections: [{ id: "c1" }],
    tasks: () => taskState,
    indexResponse: taskState,
  });
  setup(client);
  const p = Scan.start(source);
  await new Promise((r) => realSetTimeout(r, 5));
  taskState = [];
  await p;
  assert.ok(busyUpdates.some(
    (info) => info.taskType === "INDEX_FILES" && info.done === 23
  ));
  assert.ok(renders > 0, "progress updates re-render the source card");
}

// --- active start: triggers INDEX_FILES, polls, resets, clears -------
{
  let taskState = [{ collection_id: "c1", type: "INDEX_FILES" }];
  const client = makeClient({
    collections: [{ id: "c1" }, { id: "c2" }],
    tasks: () => taskState,
  });
  setup(client);
  const p = Scan.start(source);
  assert.equal(window.Sources.busy(source.id).status, "scanning");
  // Let the poll tick see the running task, then clear it.
  await new Promise((r) => realSetTimeout(r, 5));
  taskState = [];
  await p;
  assert.equal(client.calls.createIndexFiles, 2); // one per collection
  assert.equal(resetCalls, 1);
  assert.equal(window.Sources.busy(source.id), null);
  assert.equal(refreshes, 1);
  assert.ok(toasts.some((t) => t.msg === window.I18N.t("scan.done", { name: source.name })));
}

// --- active start: idempotent (second press is a no-op) ---------------
{
  let taskState = [{ collection_id: "c1", type: "INDEX_FILES" }];
  const client = makeClient({
    collections: [{ id: "c1" }],
    tasks: () => taskState,
  });
  setup(client);
  const first = Scan.start(source);
  const second = Scan.start(source); // no-op
  await new Promise((r) => realSetTimeout(r, 5));
  taskState = [];
  await first;
  assert.equal(client.calls.createIndexFiles, 1); // not doubled
}

// --- active start: createIndexFiles failure does not abort the scan --
{
  let taskState = [];
  const client = makeClient({
    collections: [{ id: "c1" }],
    tasks: () => taskState,
    indexThrows: Object.assign(new Error("photofield 409"), { status: 409 }),
  });
  setup(client);
  await Scan.start(source);
  assert.equal(client.calls.createIndexFiles, 1);
  assert.equal(resetCalls, 1);
  assert.equal(window.Sources.busy(source.id), null);
}

// --- active start: transient tasks() errors are retried --------------
{
  let throws = 0;
  let taskState = [];
  const client = makeClient({
    collections: [{ id: "c1" }],
    tasks: () => {
      if (throws++ < 3) throw new Error("transient");
      return taskState;
    },
  });
  setup(client);
  await Scan.start(source);
  assert.equal(window.Sources.busy(source.id), null);
  assert.ok(toasts.some((t) => t.msg === window.I18N.t("scan.done", { name: source.name })));
}

// --- active start: persistent errors surface an error toast ----------
{
  const client = makeClient({
    collections: [{ id: "c1" }],
    tasks: () => {
      throw new Error("server down");
    },
  });
  setup(client);
  await Scan.start(source);
  assert.equal(window.Sources.busy(source.id).status, "error");
  assert.ok(toasts.some((t) => t.kind === "error" && t.msg === window.I18N.t("scan.failed", { msg: "server down" })));
}

globalThis.setTimeout = realSetTimeout;
console.log("scan.test.mjs OK");
