// Store: defaults, persistence, PIN hash/verify.
import assert from "node:assert/strict";

const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
};
globalThis.window = {};

await import("../js/core/store.js");
const Store = globalThis.window.Store;

assert.equal(Store.get("duration"), 12);
assert.equal(Store.get("startup"), "sources");
assert.equal(Store.hasPin(), false);

Store.set("duration", 20);
assert.equal(Store.get("duration"), 20);

Store.setPin("1234");
assert.equal(Store.hasPin(), true);
assert.equal(Store.verifyPin("1234"), true);
assert.equal(Store.verifyPin("0000"), false);
assert.notEqual(Store.get("pinHash"), "1234");

console.log("store.test.mjs OK");
