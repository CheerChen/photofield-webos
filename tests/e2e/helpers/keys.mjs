// tests/e2e/helpers/keys.mjs — remote-control key helpers.
//
// keys.js maps keyCodes, so arrows/Enter/Escape come from the real keyboard
// (37-40, 13, 27) while the remote-only keys (color, media) are dispatched
// as synthetic keydown events with their webOS keyCodes.

export const REMOTE_KEY_CODES = {
  red: 403,
  green: 404,
  yellow: 405,
  blue: 406,
  rewind: 412,
  stop: 413,
  play: 415,
  fastforward: 417,
  pause: 19,
};

export async function press(page, key) {
  await page.keyboard.press(key);
  await page.waitForTimeout(80); // let the app apply focus/DOM changes
}

export async function pressOk(page) {
  return press(page, "Enter");
}

// Back = Escape (keyCode 27). Give screens a little more time because back
// transitions tear down async work (scene fetches, image loads).
export async function pressBack(page) {
  await page.keyboard.press("Escape");
  await page.waitForTimeout(250);
}

// Color and media keys have no keyboard equivalent; dispatch their keyCode.
export async function pressRemote(page, name) {
  const keyCode = REMOTE_KEY_CODES[name];
  if (!keyCode) throw new Error("unknown remote key: " + name);
  await page.evaluate((kc) => {
    const e = new KeyboardEvent("keydown", { bubbles: true, cancelable: true });
    Object.defineProperty(e, "keyCode", { get: () => kc });
    window.dispatchEvent(e);
  }, keyCode);
  await page.waitForTimeout(80);
}
