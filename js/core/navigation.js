/* Stack-based navigation for full screens and overlays. Rendering derives from
 * the stack: the last full screen is visible together with any overlays above
 * it, and key dispatch always follows the top entry. */
(function () {
  const entries = {
    sources: { id: "screen-sources", overlay: false },
    collections: { id: "screen-collections", overlay: false },
    grid: { id: "screen-grid", overlay: false },
    viewer: { id: "screen-viewer", overlay: true },
    kiosk: { id: "screen-kiosk", overlay: false },
    settings: { id: "settings-overlay", overlay: true },
    pin: { id: "pin-overlay", overlay: true },
    ipinput: { id: "ipinput-overlay", overlay: true },
  };
  let stack = [];

  function requireEntry(name) {
    const entry = entries[name];
    if (!entry) throw new Error("unknown navigation target: " + name);
    return entry;
  }

  function render() {
    for (const name of Object.keys(entries)) {
      const entry = entries[name];
      const el = document.getElementById(entry.id);
      if (el) el.hidden = true;
    }

    let base = -1;
    for (let i = stack.length - 1; i >= 0; i--) {
      if (!requireEntry(stack[i]).overlay) {
        base = i;
        break;
      }
    }
    for (let i = Math.max(0, base); i < stack.length; i++) {
      const entry = requireEntry(stack[i]);
      const el = document.getElementById(entry.id);
      if (el) el.hidden = false;
    }

    const current = stack[stack.length - 1] || null;
    window.Keys.activate(current);
    if (current === "sources" && window.SourcesScreen) {
      window.SourcesScreen.refresh();
    }
    return current;
  }

  window.Navigation = {
    reset(name) {
      requireEntry(name);
      stack = [name];
      return render();
    },
    push(name) {
      requireEntry(name);
      if (stack[stack.length - 1] !== name) stack.push(name);
      return render();
    },
    pop() {
      if (stack.length > 1) stack.pop();
      return render();
    },
    current() {
      return stack[stack.length - 1] || null;
    },
    snapshot() {
      return stack.slice();
    },
  };
})();
