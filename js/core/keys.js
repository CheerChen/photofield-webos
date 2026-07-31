/* Remote key dispatch: per-screen handlers.
 *
 * webOS keyCodes: arrows 37-40, OK 13, Back 461, Red 403, Green 404,
 * Yellow 405, Blue 406, Rewind 412, Stop 413, Play 415, FF 417, Pause 19.
 * Note: long-press OK is unreliable on the real remote (repeat events get
 * swallowed by WAM), so kiosk play is bound to the media keys instead. */
(function () {
  const handlers = {}; // screenName -> fn(evt)
  let active = null;

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
    412: "rewind",
    413: "stop",
    415: "play",
    417: "fastforward",
    19: "pause",
  };

  window.addEventListener("keydown", (e) => {
    const name = KEY_NAMES[e.keyCode];
    if (!name || e.repeat) return;
    e.preventDefault();
    if (active && handlers[active]) handlers[active]({ key: name });
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
