// Ad-hoc radio-source sanity check (not part of the suite yet).
import assert from "node:assert/strict";

const calls = [];
const RADIO_CONNECT_AND_RETRY_MS = 6300 + 1600; // watchdog + retry delay
class MockAudio {
  static rejectNext = false;
  static rejectAll = false;
  static defer = false;
  static pending = [];
  static lastInstance = null;
  constructor() {
    this.src = "";
    this.currentTime = 0;
    this._listeners = {};
    MockAudio.lastInstance = this;
  }
  addEventListener(type, fn) {
    (this._listeners[type] = this._listeners[type] || []).push(fn);
  }
  emit(type) { for (const fn of this._listeners[type] || []) fn(); }
  play() {
    if (MockAudio.rejectAll || MockAudio.rejectNext) {
      MockAudio.rejectNext = false;
      return Promise.reject(new Error("stream open failed"));
    }
    if (!MockAudio.defer) {
      // Decoded audio is flowing: real elements emit timeupdate, which
      // stands the connect watchdog down.
      this.emit("timeupdate");
      return Promise.resolve();
    }
    return new Promise((resolve) => MockAudio.pending.push(() => {
      this.emit("timeupdate");
      resolve();
    }));
  }
  pause() { calls.push(["pause"]); }
}

Math.random = () => 0;
globalThis.window = { Audio: MockAudio };
await import("../js/core/generation.js");
await import("../js/core/music.js");
const Music = globalThis.window.Music;

// Default source is local even without Store.
assert.equal(Music.source(), "local");

// Switch to radio: pools map onto the same four colors.
Music.setSource("radio");
assert.equal(Music.source(), "radio");
const tracks = Music.tracks();
assert.deepEqual(Object.keys(tracks), ["red", "green", "yellow", "blue"]);
assert.equal(tracks.red.length, 3);
assert.equal(tracks.green.length, 3);
assert.equal(tracks.yellow.length, 4);
assert.equal(tracks.blue.length, 3);
assert.ok(tracks.red[0].src.startsWith("https://"));

// Toggle plays a station and reports the radio pool size. The loading state
// is notified immediately (before play() settles) and cleared on success.
const observedStates = [];
const unsub = Music.subscribe((s) => observedStates.push(s));
let state = await Music.toggle("red");
assert.equal(state.playing, true);
assert.equal(state.loading, false);
assert.equal(state.total, 3);
assert.ok(observedStates.some((s) => s && s.loading), "connection notifies a loading state");
assert.equal(observedStates.at(-1).loading, false, "success clears loading");
unsub();

// Radio fade-in: the fresh element starts silent and reaches the target
// volume (no rAF in node, so the ramp sets the final value directly).
const liveEl = MockAudio.lastInstance;
assert.equal(liveEl.volume, 0.32);

// A failed open keeps the color and schedules an advance.
MockAudio.rejectNext = true;
state = await Music.next();
assert.equal(state.playing, false);
assert.ok(state.retryScheduled);
assert.equal(Music.active().color, "red");
await new Promise((r) => setTimeout(r, 1600)); // RADIO_RETRY_MS
state = Music.active();
assert.equal(state.playing, true);
assert.equal(state.color, "red");
assert.equal(state.index, 2); // stepped forward from 1

// A mid-play element error also auto-advances.
MockAudio.lastInstance.emit("error");
await new Promise((r) => setTimeout(r, 1600));
state = Music.active();
assert.equal(state.playing, true);
assert.equal(state.index, 0); // wrapped within the color

// A hung stream — play() never settles, no error event — is advanced by
// the connect watchdog instead of waiting for the server to give up.
Music.stop();
MockAudio.defer = true;
const hung = Music.toggle("red"); // index 0, play() pending forever
await new Promise((r) => setTimeout(r, RADIO_CONNECT_AND_RETRY_MS));
state = Music.active();
assert.equal(state.color, "red");
assert.equal(state.index, 1, "watchdog advanced to the next station");
assert.equal(state.playing, false);
assert.equal(state.loading, true, "still connecting after the watchdog swap");
// Releasing the pending play() must not revive the demoted station.
MockAudio.pending.shift()();
MockAudio.defer = false;
await new Promise((r) => setTimeout(r, 0));
assert.equal(Music.active().index, 1);
Music.stop();

// Resume on radio rejoins live edge: no seek to the suspend offset.
state = await Music.toggle("blue");
MockAudio.lastInstance.currentTime = 42;
Music.suspend();
state = await Music.resume();
assert.equal(state.playing, true);
assert.equal(MockAudio.lastInstance.currentTime, 0, "radio resume must not seek");

// Exhausting the pool gives up instead of looping forever.
Music.stop();
MockAudio.rejectAll = true;
state = await Music.toggle("green");
assert.equal(state.playing, false);
assert.ok(state.retryScheduled);
// green pool = 3 stations: after two retries the pool is exhausted and the
// controller gives up (failures counter >= pool size).
await new Promise((r) => setTimeout(r, 1700));
// second failure
await new Promise((r) => setTimeout(r, 1700));
// third failure
await new Promise((r) => setTimeout(r, 1700));
await new Promise((r) => setTimeout(r, 1700));
assert.equal(Music.active(), null, "pool exhausted stops playback");
MockAudio.rejectAll = false;

// Back to local: library restores, playback works, loading stays false.
Music.setSource("local");
assert.equal(Music.tracks().red.length, 7);
state = await Music.toggle("red");
assert.equal(state.playing, true);
assert.equal(state.loading, false);
assert.ok(state.track.src.startsWith("assets/audio/"));
// Local files do not ramp: the element starts at full target volume.
assert.equal(MockAudio.lastInstance.volume, 0.32);

console.log("radio sanity OK");
