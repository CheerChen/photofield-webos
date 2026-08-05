// Player: order building, shuffle coverage, memory window, pause/stop.
import assert from "node:assert/strict";

const images = [];
class MockImage {
  static fail = new Set();

  set src(v) {
    this._src = v;
    if (!v) return;
    images.push(v);
    queueMicrotask(() => {
      if (MockImage.fail.has(v)) {
        if (this.onerror) this.onerror(new Error("missing " + v));
      } else if (this.onload) {
        this.onload();
      }
    });
  }
  get src() { return this._src; }
}
globalThis.Image = MockImage;
globalThis.window = {};

await import("../js/core/i18n.js");
await import("../js/core/lru.js");
await import("../js/core/media.js");
await import("../js/core/generation.js");
await import("../js/core/image-loader.js");
await import("../js/core/player.js");
const Player = globalThis.window.Player;

const photos = Array.from({ length: 10 }, (_, i) => ({
  id: i + 1,
  width: 100,
  height: 100,
  takenAt: "2024-01-01T00:00:00+09:00",
  isVideo: false,
  filename: `f${i}.jpg`,
}));
const client = {
  photoCount: async () => photos.length,
  photoAt: async (c, i) => photos[i] || null,
  previewUrl: (p) => `http://x/${p.id}`,
};

const shown = [];
const player = Player.create({
  client,
  collections: ["c1"],
  shuffle: false,
  duration: 9999,
  onPhoto: (photo, url) => shown.push(url),
});
await player.start;
assert.deepEqual(shown, ["http://x/1"]);

player.next();
await new Promise((r) => setTimeout(r, 20));
assert.deepEqual(shown, ["http://x/1", "http://x/2"]);

player.prev();
await new Promise((r) => setTimeout(r, 20));
assert.equal(shown.at(-1), "http://x/1");

// wrap-around
for (let i = 0; i < 10; i++) player.next();
await new Promise((r) => setTimeout(r, 50));
assert.equal(shown.at(-1), "http://x/1");

// pause suppresses the timer; stop clears everything
assert.equal(player.togglePause(), true);
player.stop();

// shuffle covers the full range exactly once
const shuffled = [];
const p2 = Player.create({
  client,
  collections: ["c1"],
  shuffle: true,
  duration: 9999,
  onPhoto: (photo) => shuffled.push(photo.id),
});
await p2.start;
for (let i = 0; i < 9; i++) {
  p2.next();
  await new Promise((r) => setTimeout(r, 10));
}
assert.equal(new Set(shuffled).size, 10);
p2.stop();

// A selected start photo remains first in either configured order.
for (const shuffle of [false, true]) {
  const started = [];
  const p = Player.create({
    client,
    collections: ["c1"],
    shuffle,
    start: { collectionId: "c1", index: 4 },
    duration: 9999,
    onPhoto: (photo) => started.push(photo.id),
  });
  await p.start;
  assert.equal(started[0], 5);
  p.stop();
}

// A missing preferred variant falls through to the next candidate, and the
// player reports the URL that actually loaded.
MockImage.fail.add("bad-preview");
const fallbackPhoto = { id: 99, width: 100, height: 100, filename: "fallback.jpg" };
const fallbackShown = [];
const fallbackPlayer = Player.create({
  client: {
    photoCount: async () => 1,
    photoAt: async () => fallbackPhoto,
    previewCandidates: () => ["bad-preview", "good-preview"],
  },
  collections: ["fallback"],
  shuffle: false,
  duration: 9999,
  onPhoto: (photo, url) => fallbackShown.push(url),
});
await fallbackPlayer.start;
assert.deepEqual(fallbackShown, ["good-preview"]);
fallbackPlayer.stop();
MockImage.fail.clear();

// Once a fallback succeeds, revisiting the same collection/index tries that
// resolved URL first instead of repeating the known-bad preferred variant.
MockImage.fail.add("bad-resolved");
const resolvedStart = images.length;
const resolvedPhotos = [0, 1, 2].map((id) => ({
  id: 200 + id,
  width: 100,
  height: 100,
  filename: "resolved-" + id + ".jpg",
}));
const resolvedPlayer = Player.create({
  client: {
    photoCount: async () => resolvedPhotos.length,
    photoAt: async (c, i) => resolvedPhotos[i],
    previewCandidates: (photo) => ["bad-resolved", "good-resolved-" + photo.id],
  },
  collections: ["resolved"],
  shuffle: false,
  duration: 9999,
  onPhoto: () => {},
});
await resolvedPlayer.start;
for (let i = 0; i < 3; i++) {
  resolvedPlayer.next();
  await new Promise((r) => setTimeout(r, 10));
}
const resolvedLoads = images.slice(resolvedStart);
assert.equal(resolvedLoads.filter((url) => url === "bad-resolved").length, 3);
assert.equal(resolvedLoads.filter((url) => url === "good-resolved-200").length, 2);
resolvedPlayer.stop();
MockImage.fail.clear();

// Exhausting every candidate counts as a slideshow error and eventually
// trips the circuit breaker instead of spinning forever.
MockImage.fail.add("server-down");
const failures = [];
const brokenPlayer = Player.create({
  client: {
    photoCount: async () => 1,
    photoAt: async () => fallbackPhoto,
    previewCandidates: () => ["server-down"],
  },
  collections: ["broken"],
  shuffle: false,
  duration: 9999,
  onPhoto: () => {},
  onError: (error) => failures.push(error),
});
await brokenPlayer.start;
await new Promise((r) => setTimeout(r, 30));
assert.equal(failures.filter((error) => error.code !== "STOPPED").length, 5);
assert.equal(failures.at(-1).code, "STOPPED");
brokenPlayer.stop();
MockImage.fail.clear();

console.log("player.test.mjs OK");
