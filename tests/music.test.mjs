// Music: per-color playlists, color switching/toggle, up/down stepping, and
// cleanup. One looping Audio element is reused across switches.
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
  play() {
    calls.push(["play", this.src]);
    if (!MockAudio.defer) return Promise.resolve();
    return new Promise((resolve) => MockAudio.pending.push(resolve));
  }
  pause() {
    calls.push(["pause", this.src]);
  }
}

globalThis.window = { Audio: MockAudio };
await import("../js/core/music.js");
const Music = globalThis.window.Music;

const redTracks = Music.tracks().red;
assert.ok(redTracks.length >= 3, "red playlist has multiple tracks");

let state = await Music.toggle("red");
assert.equal(state.playing, true);
assert.equal(state.index, 0);
assert.equal(state.total, redTracks.length);
assert.equal(Music.active().color, "red");
assert.equal(Music.active().track.src, redTracks[0].src);

// Up steps forward through the red playlist.
state = await Music.next();
assert.equal(state.playing, true);
assert.equal(state.index, 1);
assert.equal(Music.active().track.src, redTracks[1].src);

// Down steps back.
state = await Music.prev();
assert.equal(state.index, 0);
assert.equal(Music.active().track.src, redTracks[0].src);

// Down wraps to the last track.
state = await Music.prev();
assert.equal(state.index, redTracks.length - 1);
assert.equal(Music.active().track.src, redTracks[redTracks.length - 1].src);

// Up wraps back to the first track.
state = await Music.next();
assert.equal(state.index, 0);

// Switching color preserves the cursor when returning.
state = await Music.toggle("green");
assert.equal(state.playing, true);
assert.equal(state.index, 0);
state = await Music.toggle("red");
assert.equal(state.index, 0);

// Toggling the active color off pauses it.
state = await Music.toggle("red");
assert.equal(state.playing, false);
assert.equal(Music.active(), null);

// Up/Down are no-ops while music is off.
assert.equal(await Music.next(), null);
assert.equal(await Music.prev(), null);

state = await Music.toggle("blue");
assert.equal(state.playing, true);
Music.stop();
assert.equal(Music.active(), null);

// 'ended' event auto-advances to the next track in the playlist.
state = await Music.toggle("red");
assert.equal(state.index, 0);
const inst = MockAudio.lastInstance;
(inst._listeners.ended || []).forEach((fn) => fn());
await new Promise((r) => setTimeout(r, 0));
assert.equal(Music.active().index, 1, "ended advances to next track");
Music.stop();

// A second press while play() is still pending must toggle the track off;
// the late completion of the first request cannot turn it back on.
MockAudio.defer = true;
const opening = Music.toggle("yellow");
const closed = await Music.toggle("yellow");
assert.equal(closed.playing, false);
MockAudio.pending.shift()();
assert.equal((await opening).stale, true);
assert.equal(Music.active(), null);

console.log("music.test.mjs OK");
