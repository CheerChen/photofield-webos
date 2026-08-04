import assert from "node:assert/strict";

globalThis.window = {};
await import("../js/core/lru.js");

const realFetch = globalThis.fetch;
let calls = 0;
globalThis.fetch = async (url) => {
  calls++;
  assert.match(String(url), /latitude=35\.6457972/);
  assert.match(String(url), /longitude=140\.036025/);
  assert.match(String(url), /localityLanguage=zh-Hans/);
  return new Response(JSON.stringify({
    countryName: "日本",
    principalSubdivision: "千叶县",
    city: "千叶市",
    locality: "美滨区",
  }), { status: 200, headers: { "Content-Type": "application/json" } });
};

await import("../js/core/geocode.js");
const Geocode = window.Geocode;
const coordinates = { lat: 35.6457972, lng: 140.036025 };
assert.equal(await Geocode.reverse(coordinates), "千叶市美滨区");
assert.equal(
  await Geocode.reverse({ lat: 35.64579721, lng: 140.03602501 }),
  "千叶市美滨区"
);
assert.equal(calls, 1, "near-identical EXIF coordinates share the session cache");
assert.equal(await Geocode.reverse({ lat: 91, lng: 0 }), null);
assert.equal(await Geocode.reverse(null), null);

globalThis.fetch = realFetch;
console.log("geocode.test.mjs OK");
