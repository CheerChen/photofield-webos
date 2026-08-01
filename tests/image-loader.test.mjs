// Shared ordered image fallback loader: one Image instance, first success wins.
import assert from "node:assert/strict";

const instances = [];
class MockImage {
  constructor() {
    this.sources = [];
    instances.push(this);
  }
  set src(value) {
    this._src = value;
    if (value) this.sources.push(value);
  }
  get src() { return this._src; }
}

globalThis.Image = MockImage;
globalThis.window = {};
await import("../js/core/image-loader.js");
const { load, uniqueCandidates } = globalThis.window.ImageLoader;

assert.deepEqual(uniqueCandidates(["a", "", "a", null, "b"]), ["a", "b"]);

const first = load(["bad", "good", "last"]);
assert.equal(instances.length, 1);
assert.deepEqual(instances[0].sources, ["bad"]);
instances[0].onerror(new Error("404"));
assert.deepEqual(instances[0].sources, ["bad", "good"]);
instances[0].onload();
const result = await first.promise;
assert.equal(result.url, "good");
assert.equal(result.image, instances[0]);

const failed = load(["one", "two"]);
failed.image.onerror(new Error("404"));
failed.image.onerror(new Error("404"));
await assert.rejects(failed.promise, (error) => {
  assert.deepEqual(error.urls, ["one", "two"]);
  return true;
});

const cancelled = load(["never"]);
cancelled.cancel();
await assert.rejects(cancelled.promise, (error) => error.code === "CANCELLED");

console.log("image-loader.test.mjs OK");
