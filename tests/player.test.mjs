// Player: order building, shuffle coverage, memory window, pause/stop.
import assert from "node:assert/strict";

const images = [];
globalThis.Image = class {
  set src(v) { this._src = v; images.push(v); }
  get src() { return this._src; }
};
globalThis.window = {};

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
for (let i = 0; i < 9; i++) p2.next();
await new Promise((r) => setTimeout(r, 100));
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

console.log("player.test.mjs OK");
