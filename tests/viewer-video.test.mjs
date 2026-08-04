// Viewer video behavior: sound-on playback, final-frame retention, and
// immediate teardown when the remote changes the current item.
import assert from "node:assert/strict";

class Element {
  constructor(tag) {
    this.tagName = tag.toUpperCase();
    this.children = [];
    this.parentNode = null;
    this.style = {};
    this.hidden = false;
    this._src = "";
    this.className = "";
    this.attributes = {};
  }

  appendChild(child) {
    child.parentNode = this;
    this.children.push(child);
    return child;
  }

  removeChild(child) {
    const at = this.children.indexOf(child);
    if (at >= 0) this.children.splice(at, 1);
    child.parentNode = null;
    return child;
  }

  set innerHTML(value) {
    if (value === "") {
      for (const child of this.children) child.parentNode = null;
      this.children = [];
    }
  }

  get innerHTML() { return ""; }

  set src(value) {
    this._src = value;
    if (this.tagName === "IMG" && value) {
      queueMicrotask(() => {
        if (this.onload) this.onload();
      });
    }
  }

  get src() { return this._src; }

  setAttribute(name, value) { this.attributes[name] = String(value); }
  load() {}
  pause() { this.paused = true; }
  play() {
    this.played = true;
    return Promise.resolve();
  }
}

globalThis.Image = class extends Element {
  constructor() { super("img"); }
};

const nodes = new Map([
  ["viewer-stage", new Element("div")],
  ["viewer-meta", new Element("div")],
  ["screen-viewer", new Element("section")],
]);
globalThis.document = {
  getElementById: (id) => nodes.get(id),
  createElement: (tag) => new Element(tag),
};
globalThis.window = {};
await import("../js/core/media.js");
await import("../js/core/generation.js");
await import("../js/core/image-loader.js");

const photos = [
  {
    id: 1,
    width: 1280,
    height: 720,
    isVideo: true,
    filename: "clip.mp4",
    takenAt: "2024-01-01T00:00:00Z",
  },
  {
    id: 2,
    width: 1280,
    height: 720,
    isVideo: false,
    filename: "photo.jpg",
    takenAt: "2024-01-02T00:00:00Z",
  },
];
const client = {
  photoCount: async () => photos.length,
  photoAt: async (_collection, index) => photos[index],
  previewCandidates: () => ["poster.jpg"],
  videoUrl: () => "clip.mp4",
};
window.Sources = { client: () => client };
window.Keys = { activate: () => {} };
window.Navigation = { push: () => {}, pop: () => {} };
window.App = { toast: () => {} };
window.Playback = { start: () => {} };
await import("../js/ui/viewer.js");

const viewer = window.ViewerScreen;
await viewer.open({ id: "source" }, { id: "collection" }, 0);
await new Promise((resolve) => setTimeout(resolve, 0));

const stage = nodes.get("viewer-stage");
const video = stage.children[0];
assert.equal(video.tagName, "VIDEO");
assert.equal(video.autoplay, true);
assert.equal(video.muted, false);
assert.equal(video.loop, false);
assert.equal(video.src, "clip.mp4");
video.oncanplay();
await new Promise((resolve) => setTimeout(resolve, 0));
assert.equal(video.played, true);

// The ended event is intentionally not wired to navigation, so the browser
// keeps the final decoded frame on screen.
assert.equal(video.onended, undefined);

viewer.onKey({ key: "right" });
assert.equal(video.src, "");
assert.equal(video.parentNode, null);
await new Promise((resolve) => setTimeout(resolve, 0));
assert.equal(stage.children[0].tagName, "IMG");

console.log("viewer-video.test.mjs OK");
