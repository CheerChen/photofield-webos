// Music: random color cycles, shuffled per-color playlists, key stepping,
// automatic state notifications, and stale async play protection.
import assert from "node:assert/strict";

const calls = [];
class MockAudio {
  static defer = false;
  static pending = [];
  static lastInstance = null;

  constructor() {
    this.src = "";
    this.currentTime = 0;
    this.loop = false;
    this.volume = 1;
    this.preload = "";
    this._listeners = {};
    MockAudio.lastInstance = this;
  }
  addEventListener(type, fn) {
    (this._listeners[type] = this._listeners[type] || []).push(fn);
  }
  emit(type) {
    for (const fn of this._listeners[type] || []) fn();
  }
  play() {
    calls.push(["play", this.src]);
    if (!MockAudio.defer) return Promise.resolve();
    return new Promise((resolve) => MockAudio.pending.push(resolve));
  }
  pause() {
    calls.push(["pause", this.src]);
  }
}

const originalRandom = Math.random;
Math.random = () => 0;
globalThis.window = { Audio: MockAudio };
await import("../js/core/music.js");
const Music = globalThis.window.Music;
const colors = Music.colors();
const redTracks = Music.tracks().red;
for (const color of colors) {
  assert.equal(Music.tracks()[color].length, 7, color + " playlist has seven tracks");
}
assert.equal(redTracks.length, 7);

let state = await Music.toggle("red");
assert.equal(state.playing, true);
assert.equal(state.color, "red");
assert.equal(state.index, 0);
assert.equal(state.total, redTracks.length);
assert.ok(redTracks.some((track) => track.src === state.track.src));
assert.equal(Music.active().color, "red");

// Up steps forward through the current shuffled red playlist.
const firstRedTrack = state.track.src;
state = await Music.next();
assert.equal(state.playing, true);
assert.equal(state.index, 1);
assert.notEqual(state.track.src, firstRedTrack);

// Down steps back, and wraps within the current color.
state = await Music.prev();
assert.equal(state.index, 0);
state = await Music.prev();
assert.equal(state.index, redTracks.length - 1);
state = await Music.next();
assert.equal(state.index, 0);

// Selecting another color starts a fresh random cycle at that color. A
// delayed ended event from the replaced Audio object must be ignored.
const staleAudio = MockAudio.lastInstance;
state = await Music.toggle("green");
assert.equal(state.color, "green");
assert.equal(state.index, 0);
staleAudio.emit("ended");
await new Promise((resolve) => setTimeout(resolve, 0));
assert.equal(Music.active().color, "green");
assert.equal(Music.active().index, 0);
state = await Music.toggle("red");
assert.equal(state.color, "red");
assert.equal(state.index, 0);

// Toggling the active color off pauses it.
state = await Music.toggle("red");
assert.equal(state.playing, false);
assert.equal(Music.active(), null);

// Up/Down are no-ops while music is off.
assert.equal(await Music.next(), null);
assert.equal(await Music.prev(), null);

// Automatic start chooses a color at random and notifies the Kiosk observer.
const observed = [];
const unsubscribe = Music.subscribe((next) => observed.push(next));
state = await Music.autoStart();
assert.equal(state.color, "red", "random 0 selects the first color");
const firstCycle = [state.track.src];
for (let i = 1; i < redTracks.length; i++) {
  MockAudio.lastInstance.emit("ended");
  await new Promise((resolve) => setTimeout(resolve, 0));
  state = Music.active();
  assert.equal(state.color, "red");
  assert.equal(state.index, i);
  firstCycle.push(state.track.src);
}
assert.equal(new Set(firstCycle).size, redTracks.length, "one color cycle covers each track once");

// Only after the whole red cycle does playback choose a different color.
MockAudio.lastInstance.emit("ended");
await new Promise((resolve) => setTimeout(resolve, 0));
state = Music.active();
assert.ok(colors.includes(state.color));
assert.notEqual(state.color, "red");
assert.equal(state.index, 0);
assert.equal(observed.at(-1).track.src, state.track.src, "indicator observer follows automatic changes");

// Auto-start can choose any color; a high random value selects the last one.
Music.stop();
Math.random = () => 0.999;
state = await Music.autoStart();
assert.equal(state.color, "blue");

// A second press while play() is still pending must toggle the track off;
// the late completion of the first request cannot turn it back on.
Music.stop();
MockAudio.defer = true;
const opening = Music.toggle("yellow");
const closed = await Music.toggle("yellow");
assert.equal(closed.playing, false);
assert.equal(Music.active(), null);
MockAudio.pending.shift()();
assert.equal((await opening).stale, true);
MockAudio.defer = false;
unsubscribe();
Math.random = originalRandom;

console.log("music.test.mjs OK");
