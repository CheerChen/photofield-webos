// Photofield candidate ordering and URL encoding.
import assert from "node:assert/strict";

globalThis.window = {};
await import("../js/clients/photofield.js");
const client = globalThis.window.PhotofieldClient.create({ baseUrl: "http://photos" });
const photo = {
  id: 7,
  filename: "folder/photo one.jpg",
  thumbnails: [
    { name: "djpeg68", filename: "small.jpg", width: 400 },
    { name: "ffmpeg", filename: "large.jpg", width: 1280 },
    { name: "mid", filename: "medium.jpg", width: 800 },
    { name: "mid", filename: "medium.jpg", width: 800 },
  ],
};

assert.deepEqual(client.previewCandidates(photo, 1920), [
  "http://photos/api/files/7/variants/ffmpeg/large.jpg",
  "http://photos/api/files/7/variants/mid/medium.jpg",
  "http://photos/api/files/7/variants/djpeg68/small.jpg",
  "http://photos/api/files/7/previews/folder%2Fphoto%20one.jpg?width=1920",
]);
assert.deepEqual(client.thumbCandidates(photo, 512), [
  "http://photos/api/files/7/variants/mid/medium.jpg",
  "http://photos/api/files/7/variants/djpeg68/small.jpg",
  "http://photos/api/files/7/variants/ffmpeg/large.jpg",
  "http://photos/api/files/7/previews/folder%2Fphoto%20one.jpg?width=512",
]);
assert.equal(client.previewUrl(photo, 1920), client.previewCandidates(photo, 1920)[0]);
assert.deepEqual(client.thumbCandidates({ id: 8, filename: "x.jpg" }, 512), [
  "http://photos/api/files/8/previews/x.jpg?width=512",
]);

console.log("photofield.test.mjs OK");
