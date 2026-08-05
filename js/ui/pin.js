/* 4-digit PIN pad overlay. Soft lock against the living-room scenario only. */
(function () {
  const pad = [1, 2, 3, 4, 5, 6, 7, 8, 9, null, 0, null];
  let entered = "";
  let focusIdx = 0;
  let state = null; // {mode: "verify"|"create"|"confirm", first, onPass, onCancel}

  const unlocked = new Set(); // session-unlocked source ids

  const $ = (id) => document.getElementById(id);

  function render() {
    const dots = $("pin-display").children;
    for (let i = 0; i < dots.length; i++) {
      dots[i].classList.toggle("filled", i < entered.length);
    }
    const padEl = $("pin-pad");
    padEl.innerHTML = "";
    pad.forEach((d, i) => {
      const key = document.createElement("div");
      key.className = "pin-key" + (i === focusIdx ? " focused" : "");
      key.textContent = d === null ? "" : d;
      padEl.appendChild(key);
    });
  }

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
    render();
  }

  function close() {
    $("pin-overlay").hidden = true;
    state = null;
    window.Navigation.pop();
  }

  function submit(digit) {
    entered += digit;
    if (entered.length < 4) return render();
    const pin = entered;
    entered = "";
    if (state.mode === "create") {
      state.mode = "confirm";
      state.first = pin;
      $("pin-title").textContent = window.I18N.t("pin.confirmAgain");
      return render();
    }
    if (state.mode === "confirm") {
      if (pin === state.first) {
        window.Store.setPin(pin);
        const cb = state.onPass;
        close();
        window.App.toast(window.I18N.t("pin.set"));
        cb && cb();
      } else {
        state.mode = "create";
        state.first = null;
        $("pin-title").textContent = window.I18N.t("pin.mismatch");
        render();
      }
      return;
    }
    // verify
    if (window.Store.verifyPin(pin)) {
      unlocked.add(state.sourceId);
      const cb = state.onPass;
      close();
      cb && cb();
    } else {
      $("pin-title").textContent = window.I18N.t("pin.wrong");
      render();
    }
  }

  window.Pin = {
    isUnlocked: (sourceId) => unlocked.has(sourceId),

    /* Gate a locked source. Passes through immediately when unlocked. */
    gate(source, onPass) {
      if (!source.locked || unlocked.has(source.id)) return onPass();
      if (!window.Store.hasPin()) {
        // No PIN configured yet: entering a locked source creates one.
        state = { mode: "create", sourceId: source.id, first: null, onPass };
        $("pin-title").textContent = window.I18N.t("pin.createFor", { name: source.name });
      } else {
        state = { mode: "verify", sourceId: source.id, onPass };
        $("pin-title").textContent = window.I18N.t("pin.enterFor", { name: source.name });
      }
      entered = "";
      focusIdx = 0;
      window.Navigation.push("pin");
      render();
    },

    /* Standalone create/change flow from settings. */
    setup(onDone) {
      state = { mode: "create", sourceId: null, first: null, onPass: onDone };
      entered = "";
      focusIdx = 0;
      $("pin-title").textContent = window.I18N.t(window.Store.hasPin() ? "pin.change" : "pin.create");
      window.Navigation.push("pin");
      render();
    },

    onKey({ key }) {
      if (!state) return;
      if (key === "left") move(-1, 0);
      else if (key === "right") move(1, 0);
      else if (key === "up") move(0, -1);
      else if (key === "down") move(0, 1);
      else if (key === "red") {
        entered = entered.slice(0, -1);
        render();
      } else if (key === "ok") {
        if (pad[focusIdx] !== null) submit(String(pad[focusIdx]));
      } else if (key === "back") {
        const cb = state.onCancel;
        close();
        cb && cb();
      }
    },
  };
})();
