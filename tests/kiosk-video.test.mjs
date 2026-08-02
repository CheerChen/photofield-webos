// Kiosk video behavior: one sound-on element, Player timer suspension, and
// ended-driven advancement with explicit decoder cleanup.
import assert from "node:assert/strict";

class ClassList {
  constructor(owner) { this.owner = owner; }
  add(...names) {
    for (const name of names) this.owner._classes.add(name);
    this.sync();
  }
  remove(...names) {
    for (const name of names) this.owner._classes.delete(name);
    this.sync();
  }
  toggle(name, force) {
    const next = force === undefined ? !this.owner._classes.has(name) : force;
    if (next) this.owner._classes.add(name);
    else this.owner._classes.delete(name);
    this.sync();
    return next;
  }
  sync() { this.owner._className = [...this.owner._classes].join(" "); }
}

class Element {
  constructor(tag) {
    this.tagName = tag.toUpperCase();
    if (this.tagName === "VIDEO") this.autoplay = false;
    this.children = [];
    this.parentNode = null;
    this.style = {};
    this.hidden = false;
    this.textContent = "";
    this._src = "";
    this._className = "";
    this._classes = new Set();
    this.classList = new ClassList(this);
  }
  set className(value) {
    this._className = value;
    this._classes = new Set(String(value).split(/\s+/).filter(Boolean));
  }
  get className() { return this._className; }
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
      queueMicrotask(() => this.onload && this.onload());
    }
  }
  get src() { return this._src; }
  setAttribute() {}
  load() {}
  pause() { this.paused = true; }
  play() { this.playCalls = (this.playCalls || 0) + 1; return Promise.resolve(); }
  querySelector(selector) {
    if (selector === "video") {
      return this.children.find((child) => child.tagName === "VIDEO") || null;
    }
    if (selector.startsWith(".")) {
      const name = selector.slice(1);
      return this.children.find((child) => child._classes.has(name)) || null;
    }
    return null;
  }
}

class MockImage extends Element {
  constructor() { super("img"); }
}
globalThis.Image = MockImage;

autoSetup();
function autoSetup() {
  const ids = [
    "kiosk-hint", "kiosk-loading", "kiosk-paused", "kiosk-music",
    "kiosk-music-dot", "kiosk-music-name", "kiosk-date", "kiosk-name",
  ];
  const nodes = new Map(ids.map((id) => [id, new Element("div")]));
  for (const id of ["kiosk-a", "kiosk-b"]) {
    const frame = new Element("div");
    frame.id = id;
    const backdrop = new Element("div");
    backdrop.className = "kiosk-backdrop";
    const photo = new Element("div");
    photo.className = "kiosk-photo";
    const slot = new Element("div");
    slot.className = "kiosk-video-slot";
    frame.appendChild(backdrop);
    frame.appendChild(photo);
    frame.appendChild(slot);
    nodes.set(id, frame);
  }
  globalThis.document = {
    getElementById: (id) => nodes.get(id),
    createElement: (tag) => new Element(tag),
  };
}

globalThis.window = {};
await import("../js/core/image-loader.js");

let captured;
let toggleCalls = 0;
let nextCalls = 0;
let paused = false;
let musicSuspends = 0;
let musicResumes = 0;
const source = { id: "source", name: "Source" };
const client = {
  collections: async () => [{ id: "c", name: "Collection", count: 1 }],
  previewCandidates: () => ["poster.jpg"],
  videoUrl: () => "clip.mp4",
};
window.Sources = { client: () => client };
window.Store = {
  get(key) {
    return {
      fitMode: "ambient",
      playOrder: "sequential",
      duration: 12,
      autoLofi: false,
    }[key];
  },
};
window.Keys = { current: () => "grid", activate: () => {} };
window.App = { show: () => {}, toast: () => {}, back: () => {} };
window.WebOSPlatform = { inhibitScreenSaver: () => {}, allowScreenSaver: () => {} };
window.Music = {
  subscribe: () => () => {},
  suspend: () => { musicSuspends++; },
  resume: () => { musicResumes++; },
  stop: () => {},
  autoStart: async () => null,
};
window.Player = {
  create(opts) {
    captured = opts;
    return {
      start: Promise.resolve(),
      togglePause() {
        paused = !paused;
        toggleCalls++;
        return paused;
      },
      next() {
        nextCalls++;
        if (opts.onNavigate) opts.onNavigate();
      },
      prev() {},
      stop() {},
      reportImageError() {},
    };
  },
};
await import("../js/ui/kiosk.js");

await window.KioskScreen.open(source, ["c"], {});
captured.onPhoto({
  id: 1,
  width: 1280,
  height: 720,
  isVideo: true,
  filename: "clip.mp4",
  takenAt: "2024-01-01T00:00:00Z",
}, "poster.jpg", 0, 1);
await new Promise((resolve) => setTimeout(resolve, 0));

const slotA = document.getElementById("kiosk-a").querySelector(".kiosk-video-slot");
const slotB = document.getElementById("kiosk-b").querySelector(".kiosk-video-slot");
const video = slotA.querySelector("video") || slotB.querySelector("video");
assert.ok(video, "video is mounted in a staging slot");
// Sound-on by design: muting cannot keep lofi alive (webOS revokes its audio
// focus for any pipeline video), so the video keeps its own audio instead.
assert.notEqual(video.muted, true);
assert.equal(video.volume, 0.6, "video audio is softened toward the lofi bed");
assert.equal(video.autoplay, false, "Kiosk starts video only through explicit play()");
assert.equal(musicSuspends, 1);
assert.equal(toggleCalls, 1);
assert.equal(paused, true, "Player timer is paused for video");

video.onloadeddata();
await new Promise((resolve) => setTimeout(resolve, 0));
assert.equal(video.playCalls, 1);

// Replacing a video with another video must not resume lofi between them.
captured.onPhoto({
  id: 2,
  width: 720,
  height: 1280,
  isVideo: true,
  filename: "clip-2.mp4",
  takenAt: "2024-01-02T00:00:00Z",
}, "poster-2.jpg", 0, 1);
await new Promise((resolve) => setTimeout(resolve, 0));
assert.equal(video.src, "");
const second = slotA.querySelector("video") || slotB.querySelector("video");
assert.ok(second);
assert.equal(musicSuspends, 2);
assert.equal(musicResumes, 0);
second.onloadeddata();
await new Promise((resolve) => setTimeout(resolve, 0));
second.onended();
assert.equal(nextCalls, 1);
assert.equal(second.src, "");
assert.equal(second.parentNode, null);
assert.equal(musicResumes, 0);
assert.equal(paused, false, "Player timer resumes before next slide");
window.KioskScreen.onKey({ key: "back" });

// A decoder error keeps the already-loaded poster as an ordinary slide
// instead of reporting a server failure to Player.
await window.KioskScreen.open(source, ["c"], {});
captured.onPhoto({
  id: 2,
  width: 1280,
  height: 720,
  isVideo: true,
  filename: "broken.mp4",
  takenAt: "2024-01-02T00:00:00Z",
}, "poster.jpg", 0, 1);
await new Promise((resolve) => setTimeout(resolve, 0));
const fallbackSlotA = document.getElementById("kiosk-a").querySelector(".kiosk-video-slot");
const fallbackSlotB = document.getElementById("kiosk-b").querySelector(".kiosk-video-slot");
const broken = fallbackSlotA.querySelector("video") || fallbackSlotB.querySelector("video");
broken.onerror();
assert.equal(broken.parentNode, null);
assert.equal(nextCalls, 1, "decoder fallback does not advance immediately");
assert.equal(musicResumes, 1, "poster fallback resumes lofi");
assert.match(
  document.getElementById("kiosk-a").querySelector(".kiosk-photo").style.backgroundImage +
    document.getElementById("kiosk-b").querySelector(".kiosk-photo").style.backgroundImage,
  /poster\.jpg/
);

captured.onPhoto({
  id: 3,
  width: 1280,
  height: 720,
  isVideo: false,
  filename: "photo.jpg",
  takenAt: "2024-01-03T00:00:00Z",
}, "photo-poster.jpg", 0, 1);
await new Promise((resolve) => setTimeout(resolve, 0));
assert.equal(musicResumes, 2, "photo commit resumes lofi");
window.KioskScreen.onKey({ key: "back" });

console.log("kiosk-video.test.mjs OK");
