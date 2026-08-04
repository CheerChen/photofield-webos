// Media: candidate-chain assembly, video URL fallback, css escaping, and
// decoder teardown semantics.
import assert from "node:assert/strict";

globalThis.window = {};
await import("../js/core/media.js");
const Media = globalThis.window.Media;

const client = {
  previewCandidates: (photo, width) => ["a.jpg", "b.jpg"],
  previewUrl: (photo, width) => "a.jpg",
  videoUrl: (photo) => "video-src.mp4",
  originalUrl: (photo) => "original.jpg",
};

// previewCandidates: no preferred keeps the client order.
assert.deepEqual(Media.previewCandidates(client, {}), ["a.jpg", "b.jpg"]);

// A preferred URL moves to the front and is de-duplicated from the chain.
assert.deepEqual(
  Media.previewCandidates(client, {}, "b.jpg"),
  ["b.jpg", "a.jpg"]
);

// A preferred URL not in the chain is simply prepended.
assert.deepEqual(
  Media.previewCandidates(client, {}, "resolved.jpg"),
  ["resolved.jpg", "a.jpg", "b.jpg"]
);

// Non-array candidate lists are wrapped; falsy entries are dropped.
const looseClient = { previewCandidates: () => ["only.jpg", null, ""] };
assert.deepEqual(Media.previewCandidates(looseClient, {}), ["only.jpg"]);

// Falls back to the single previewUrl helper when candidates are absent.
const legacyClient = { previewUrl: () => "legacy.jpg" };
assert.deepEqual(Media.previewCandidates(legacyClient, {}), ["legacy.jpg"]);

// videoUrl prefers the client's video URL, then the original.
assert.equal(Media.videoUrl(client, {}), "video-src.mp4");
assert.equal(Media.videoUrl({ originalUrl: () => "orig.jpg" }, {}), "orig.jpg");
assert.equal(Media.videoUrl({}, {}), null);

// cssUrl escapes double quotes so URLs survive url("...").
assert.equal(Media.cssUrl('http://x/a"b.jpg'), 'url("http://x/a%22b.jpg")');

// releaseVideo clears handlers, autoplay, src, and detaches the element.
let loaded = 0;
let removedFrom = null;
const parent = {
  removeChild(child) { removedFrom = parent; child.parentNode = null; },
};
const video = {
  parentNode: parent,
  autoplay: true,
  src: "clip.mp4",
  oncanplay: () => {},
  onloadeddata: () => {},
  onerror: () => {},
  onended: () => {},
  pause() { this.paused = true; },
  load() { loaded += 1; },
};
Media.releaseVideo(video);
assert.equal(video.oncanplay, null);
assert.equal(video.onloadeddata, null);
assert.equal(video.onerror, null);
assert.equal(video.onended, null);
assert.equal(video.autoplay, false);
assert.equal(video.paused, true);
assert.equal(video.src, "");
assert.equal(loaded, 1);
assert.equal(video.parentNode, null);
assert.equal(removedFrom, parent);

// releaseVideo(null) is a safe no-op.
Media.releaseVideo(null);

console.log("media.test.mjs OK");
