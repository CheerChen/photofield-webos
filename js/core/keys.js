/* Remote key dispatch: per-screen handlers, OK long-press, color keys.
 *
 * webOS keyCodes: arrows 37-40, OK 13, Back 461, Red 403, Green 404,
 * Yellow 405, Blue 406. */
(function () {
  const LONG_PRESS_MS = 500;
  const handlers = {}; // screenName -> fn(evt)
  let active = null;
  let okTimer = null;
  let okLongFired = false;

  const KEY_NAMES = {
    37: "left",
    38: "up",
    39: "right",
    40: "down",
    13: "ok",
    461: "back",
    27: "back",
    403: "red",
    404: "green",
    405: "yellow",
    406: "blue",
  };

  function dispatch(name) {
    if (active && handlers[active]) {
      handlers[active]({ key: name });
      return true;
    }
    return false;
  }

  window.addEventListener("keydown", (e) => {
    const name = KEY_NAMES[e.keyCode];
    if (!name) return;
    e.preventDefault();
    if (name === "ok" && !e.repeat) {
      okLongFired = false;
      okTimer = setTimeout(() => {
        okLongFired = true;
        dispatch("longok");
      }, LONG_PRESS_MS);
      return;
    }
    if (name === "ok" && e.repeat) return;
    dispatch(name);
  });

  window.addEventListener("keyup", (e) => {
    if (e.keyCode !== 13) return;
    e.preventDefault();
    if (okTimer) {
      clearTimeout(okTimer);
      okTimer = null;
    }
    if (!okLongFired) dispatch("ok");
  });

  window.Keys = {
    bind(screen, fn) {
      handlers[screen] = fn;
    },
    activate(screen) {
      active = screen;
    },
    current: () => active,
  };
})();
