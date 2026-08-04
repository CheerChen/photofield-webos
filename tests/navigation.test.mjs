import assert from "node:assert/strict";

const ids = [
  "screen-sources", "screen-collections", "screen-grid", "screen-viewer",
  "screen-kiosk", "settings-overlay", "pin-overlay", "ipinput-overlay",
];
const nodes = new Map(ids.map((id) => [id, { hidden: true }]));
let active = null;
globalThis.document = { getElementById: (id) => nodes.get(id) || null };
globalThis.window = {
  Keys: { activate: (name) => { active = name; } },
  SourcesScreen: { refresh: () => {} },
};
await import("../js/core/navigation.js");
const Navigation = window.Navigation;

Navigation.reset("sources");
assert.deepEqual(Navigation.snapshot(), ["sources"]);
assert.equal(nodes.get("screen-sources").hidden, false);
assert.equal(active, "sources");

Navigation.push("collections");
assert.equal(nodes.get("screen-sources").hidden, true);
assert.equal(nodes.get("screen-collections").hidden, false);
Navigation.push("grid");
Navigation.push("viewer");
assert.deepEqual(Navigation.snapshot(), ["sources", "collections", "grid", "viewer"]);
assert.equal(nodes.get("screen-grid").hidden, false, "overlay keeps its base screen visible");
assert.equal(nodes.get("screen-viewer").hidden, false);
assert.equal(active, "viewer");

Navigation.push("settings");
assert.equal(nodes.get("screen-grid").hidden, false);
assert.equal(nodes.get("screen-viewer").hidden, false);
assert.equal(nodes.get("settings-overlay").hidden, false);
Navigation.pop();
assert.equal(nodes.get("settings-overlay").hidden, true);
assert.equal(active, "viewer");
Navigation.pop();
assert.equal(nodes.get("screen-viewer").hidden, true);
assert.equal(active, "grid");

Navigation.push("kiosk");
assert.equal(nodes.get("screen-grid").hidden, true);
assert.equal(nodes.get("screen-kiosk").hidden, false);
Navigation.pop();
assert.equal(nodes.get("screen-grid").hidden, false);
assert.equal(active, "grid");

console.log("navigation.test.mjs OK");
