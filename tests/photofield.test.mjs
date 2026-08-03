// Photofield candidate ordering, original admission, and URL encoding.
import assert from "node:assert/strict";

globalThis.window = {};
await import("../js/clients/photofield.js");
const client = globalThis.window.PhotofieldClient.create({ baseUrl: "http://photos" });
const photo = {
  id: 7,
  filename: "folder/photo one.jpg",
  width: 1364,
  height: 2048,
  isVideo: false,
  thumbnails: [
    { name: "djpeg48", filename: "djpeg48.jpg", width: 682 },
    { name: "djpeg78", filename: "djpeg78.jpg", width: 1193 },
    { name: "djpeg88", filename: "djpeg88.jpg", width: 1364 },
    { name: "ffmpeg-1280x1280-in", filename: "ffmpeg.jpg", width: 853 },
    { name: "ffmpeg-4096x4096-in", filename: "ffmpeg-large.jpg", width: 2728 },
    { name: "sqlite", filename: "sqlite.jpg", width: 171 },
    { name: "thumb-640x640-B", filename: "sidecar.jpg", width: 640 },
    { name: "original", filename: "raw.jpg", width: 1364 },
  ],
};

assert.deepEqual(client.thumbCandidates(photo, 512), [
  "http://photos/api/files/7/original/folder%2Fphoto%20one.jpg",
  "http://photos/api/files/7/variants/sqlite/sqlite.jpg",
  "http://photos/api/files/7/variants/thumb-640x640-B/sidecar.jpg",
  "http://photos/api/files/7/variants/djpeg48/djpeg48.jpg",
  "http://photos/api/files/7/variants/ffmpeg-1280x1280-in/ffmpeg.jpg",
  "http://photos/api/files/7/variants/djpeg78/djpeg78.jpg",
  "http://photos/api/files/7/variants/djpeg88/djpeg88.jpg",
  "http://photos/api/files/7/variants/ffmpeg-4096x4096-in/ffmpeg-large.jpg",
  "http://photos/api/files/7/previews/folder%2Fphoto%20one.jpg?w=512",
]);

assert.deepEqual(client.previewCandidates(photo, 1920), [
  "http://photos/api/files/7/original/folder%2Fphoto%20one.jpg",
  "http://photos/api/files/7/variants/djpeg88/djpeg88.jpg",
  "http://photos/api/files/7/variants/djpeg78/djpeg78.jpg",
  "http://photos/api/files/7/variants/ffmpeg-4096x4096-in/ffmpeg-large.jpg",
  "http://photos/api/files/7/variants/ffmpeg-1280x1280-in/ffmpeg.jpg",
  "http://photos/api/files/7/variants/djpeg48/djpeg48.jpg",
  "http://photos/api/files/7/previews/folder%2Fphoto%20one.jpg?w=1920",
]);

assert.equal(
  client.originalUrl(photo),
  "http://photos/api/files/7/original/folder%2Fphoto%20one.jpg"
);
assert.equal(
  client.videoUrl(photo),
  "http://photos/api/files/7/original/folder%2Fphoto%20one.jpg"
);
assert.equal(client.previewUrl(photo, 1920), client.previewCandidates(photo, 1920)[0]);

const large = { ...photo, width: 5000, height: 3000 };
assert.equal(
  client.thumbCandidates(large, 512)[0],
  "http://photos/api/files/7/variants/djpeg48/djpeg48.jpg"
);
assert.equal(
  client.previewCandidates(large, 1920)[0],
  "http://photos/api/files/7/variants/djpeg88/djpeg88.jpg"
);

const heic = { ...photo, filename: "folder/photo one.HEIC" };
assert.equal(
  client.previewCandidates(heic, 1920)[0],
  "http://photos/api/files/7/variants/djpeg88/djpeg88.jpg"
);

const video = { ...photo, filename: "folder/video.mp4", isVideo: true };
assert.equal(
  client.previewCandidates(video, 1920)[0],
  "http://photos/api/files/7/variants/djpeg88/djpeg88.jpg"
);
assert.equal(
  client.thumbCandidates(video, 512)[0],
  "http://photos/api/files/7/variants/sqlite/sqlite.jpg"
);

const gif = { ...photo, filename: "folder/animated.gif" };
assert.equal(
  client.previewCandidates(gif, 1920)[0],
  "http://photos/api/files/7/variants/djpeg88/djpeg88.jpg"
);
assert.equal(
  client.thumbCandidates(gif, 512)[0],
  "http://photos/api/files/7/variants/sqlite/sqlite.jpg"
);

const atThumbCap = { ...photo, width: 2048, height: 1024 };
assert.equal(
  client.thumbCandidates(atThumbCap, 512)[0],
  "http://photos/api/files/7/original/folder%2Fphoto%20one.jpg"
);

const overThumbCap = { ...photo, width: 2049, height: 1024 };
assert.equal(
  client.thumbCandidates(overThumbCap, 512)[0],
  "http://photos/api/files/7/variants/djpeg48/djpeg48.jpg"
);

assert.deepEqual(client.thumbCandidates({ id: 8, filename: "x.jpg" }, 512), [
  "http://photos/api/files/8/previews/x.jpg?w=512",
]);
assert.deepEqual(client.previewCandidates({
  id: 9,
  filename: "x.jpg",
  width: 1920,
  height: 1080,
  isVideo: false,
  thumbnails: [],
}, 1920), [
  "http://photos/api/files/9/original/x.jpg",
  "http://photos/api/files/9/previews/x.jpg?w=1920",
]);

// A freshly indexed Photofield instance can report indexed_count: 0 while
// its scene already contains the real files. collections() falls back to the
// settled scene count, including a genuinely empty collection.
const realFetch = globalThis.fetch;
const sceneCounts = new Map([
  ["fresh", 12],
  ["empty", 0],
]);
let sceneReads = 0;
let collectionReads = 0;
globalThis.fetch = async (url, opts = {}) => {
  const parsed = new URL(url);
  const path = parsed.pathname;
  const json = (data, status = 200) => new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
  if (path === "/api/collections") {
    collectionReads++;
    return json({ items: [
      { id: "fresh", name: "Fresh", indexed_count: 0 },
      { id: "existing", name: "Existing", indexed_count: 7 },
      { id: "empty", name: "Empty", indexed_count: 0 },
    ] });
  }
  if (path === "/api/scenes" && opts.method === "POST") {
    const id = JSON.parse(opts.body).collection_id;
    return json({ id: "scene-" + id }, 202);
  }
  if (path === "/api/scenes" && opts.method !== "POST") {
    return json({ items: [] });
  }
  if (path.startsWith("/api/scenes/scene-")) {
    sceneReads++;
    const id = path.slice("/api/scenes/scene-".length);
    return json({
      id: "scene-" + id,
      loading: false,
      stale: false,
      file_count: sceneCounts.get(id),
      bounds: { h: 100 },
    });
  }
  throw new Error("unexpected fetch " + url);
};

const countClient = window.PhotofieldClient.create({ baseUrl: "http://counts" });
const [resolvedCounts, sharedCounts] = await Promise.all([
  countClient.collections(),
  countClient.collections(),
]);
assert.deepEqual(resolvedCounts, [
  { id: "empty", name: "Empty", count: 0 },
  { id: "existing", name: "Existing", count: 7 },
  { id: "fresh", name: "Fresh", count: 12 },
]);
assert.deepEqual(sharedCounts, resolvedCounts);
assert.equal(collectionReads, 1, "concurrent count refreshes share one request");
assert.equal(sceneReads, 2, "only zero counts use the scene fallback");
globalThis.fetch = realFetch;

console.log("photofield.test.mjs OK");
