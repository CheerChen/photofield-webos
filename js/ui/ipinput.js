/* Full IP address input using the same 3x4 digit grid as the PIN pad.
 *
 * The settings screen previously only cycled the last octet +-1, making
 * cross-subnet edits impossible (e.g. 192.168.0.x -> 10.0.0.x). This module
 * reuses the pin-pad interaction (arrows to move, OK to enter, red to
 * delete) but shows four octet segments instead of four PIN dots. Each
 * segment accepts up to 3 digits (0-255); OK advances to the next segment
 * and, on the last one, confirms. */
(function () {
  const pad = [1, 2, 3, 4, 5, 6, 7, 8, 9, null, 0, null];
  const $ = (id) => document.getElementById(id);

  let octets = ["", "", "", ""];
  let segIdx = 0;
  let focusIdx = 0; // pad grid cursor
  let onConfirm = null;
  let onCancel = null;
  let returnTo = "settings";

  function renderPad() {
    const padEl = $("ipinput-pad");
    padEl.innerHTML = "";
    pad.forEach((d, i) => {
      const key = document.createElement("div");
      key.className = "pin-key" + (i === focusIdx ? " focused" : "");
      key.textContent = d === null ? "" : d;
      padEl.appendChild(key);
    });
  }

  function renderDisplay() {
    const segs = $("ipinput-display").querySelectorAll(".ipinput-seg");
    segs.forEach((el, i) => {
      el.textContent = octets[i] === "" ? "0" : octets[i];
      el.classList.toggle("focused", i === segIdx);
      el.classList.toggle("empty", octets[i] === "");
    });
  }

  function render() {
    renderDisplay();
    renderPad();
  }

  // Same 3x4 grid navigation as pin.js, skipping the blank cells.
  function move(dx, dy) {
    const cols = 3;
    let next = focusIdx;
    for (let step = 0; step < pad.length; step++) {
      const col = next % cols;
      if (dx === 1 && col === cols - 1) break;
      if (dx === -1 && col === 0) break;
      next += dx + dy * cols;
      if (next < 0 || next >= pad.length) break;
      if (pad[next] !== null) {
        focusIdx = next;
        break;
      }
    }
    renderPad();
  }

  function close() {
    $("ipinput-overlay").hidden = true;
    onConfirm = null;
    onCancel = null;
  }

  function typeDigit(d) {
    const seg = octets[segIdx];
    // Reject a 4th digit or a value that would exceed 255.
    if (seg.length >= 3) return;
    const next = seg + d;
    if (parseInt(next, 10) > 255) return;
    // Leading zeros are normalized: "0" then "1" becomes "1", not "01".
    octets[segIdx] = String(parseInt(next, 10));
    // Auto-advance when the segment is full (3 digits) so the user does
    // not have to press OK between every octet.
    if (octets[segIdx].length >= 3) advance();
    renderDisplay();
  }

  function backspace() {
    if (octets[segIdx].length > 0) {
      octets[segIdx] = octets[segIdx].slice(0, -1);
      renderDisplay();
    } else if (segIdx > 0) {
      // Empty segment + red: step back to edit the previous octet.
      segIdx--;
      octets[segIdx] = octets[segIdx].slice(0, -1);
      renderDisplay();
    }
  }

  function advance() {
    if (segIdx < 3) {
      segIdx++;
      renderDisplay();
    } else {
      confirm();
    }
  }

  function confirm() {
    // Fill any blank segment with 0 before submitting.
    const filled = octets.map((o) => (o === "" ? "0" : o));
    const host = filled.join(".");
    const cb = onConfirm;
    close();
    if (cb) cb(host);
  }

  function cancel() {
    const cb = onCancel;
    close();
    if (cb) cb();
  }

  window.IpInput = {
    /* Open the IP editor. `initial` is the current host string. */
    open(initial, opts) {
      opts = opts || {};
      onConfirm = opts.onConfirm;
      onCancel = opts.onCancel;
      returnTo = window.Keys.current() || "settings";
      const parts = String(initial || "").split(".");
      octets = [0, 1, 2, 3].map((i) => {
        const p = parts[i];
        if (p && /^\d+$/.test(p)) return String(Math.min(255, parseInt(p, 10)));
        return "";
      });
      segIdx = 0;
      focusIdx = 0;
      $("ipinput-overlay").hidden = false;
      window.Keys.activate("ipinput");
      render();
    },

    onKey({ key }) {
      if (key === "left") move(-1, 0);
      else if (key === "right") move(1, 0);
      else if (key === "up") move(0, -1);
      else if (key === "down") move(0, 1);
      else if (key === "red") backspace();
      else if (key === "green") advance();
      else if (key === "ok") {
        if (pad[focusIdx] !== null) typeDigit(String(pad[focusIdx]));
      } else if (key === "back") {
        cancel();
      }
    },

    returnTo: () => returnTo,
  };
})();
