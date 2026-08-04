import assert from "node:assert/strict";

globalThis.window = {};
await import("../js/core/generation.js");

const generation = window.Generation.create();
const first = generation.next();
let cancelled = 0;
const remove = first.onCancel(() => { cancelled++; });
assert.equal(first.isCurrent(), true);
assert.equal(first.cancelled, false);

const second = generation.next();
assert.equal(cancelled, 1);
assert.equal(first.isCurrent(), false);
assert.equal(first.cancelled, true);
assert.equal(second.isCurrent(), true);

let removedCallback = false;
const third = generation.next();
const unregister = third.onCancel(() => { removedCallback = true; });
unregister();
generation.cancel();
assert.equal(removedCallback, false);
assert.equal(third.isCurrent(), false);
assert.equal(generation.current(), null);

let immediate = 0;
first.onCancel(() => { immediate++; });
assert.equal(immediate, 1, "late cancellation observers run immediately");
remove();
first.cancel();
assert.equal(cancelled, 1, "cancellation is idempotent");

console.log("generation.test.mjs OK");
