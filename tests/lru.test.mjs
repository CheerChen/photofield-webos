// LRU: recency refresh on get, oldest-first eviction, clear.
import assert from "node:assert/strict";

globalThis.window = {};
await import("../js/core/lru.js");
const LRU = globalThis.window.LRU;

const lru = LRU.create(3);
assert.equal(lru.get("missing"), undefined);
assert.equal(lru.size, 0);

lru.set("a", 1);
lru.set("b", 2);
lru.set("c", 3);
assert.equal(lru.size, 3);

// get() refreshes recency: "a" becomes most-recent, so "b" is the oldest.
assert.equal(lru.get("a"), 1);
lru.set("d", 4); // evicts "b"
assert.equal(lru.get("b"), undefined);
assert.equal(lru.get("a"), 1);
assert.equal(lru.get("c"), 3);
assert.equal(lru.get("d"), 4);
assert.equal(lru.size, 3);

// set() on an existing key updates in place without growing.
lru.set("a", 10);
assert.equal(lru.get("a"), 10);
assert.equal(lru.size, 3);

// Stored null is a hit, distinct from a miss.
lru.set("hole", null);
assert.equal(lru.has("hole"), true);
assert.equal(lru.get("hole"), null);

lru.delete("a");
assert.equal(lru.has("a"), false);

lru.clear();
assert.equal(lru.size, 0);
assert.equal(lru.get("c"), undefined);

console.log("lru.test.mjs OK");
