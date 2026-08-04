// tests/e2e/helpers/nav.mjs — composite navigation used by several specs.
// Each helper boots fresh, drives the remote, and waits for the target screen
// to settle so assertions start from a stable state.
import { bootToSources } from "./harness.mjs";
import { pressOk, pressRemote } from "./keys.mjs";

export async function bootAtSources(page) {
  return bootToSources(page);
}

export async function bootAtCollections(page) {
  const state = await bootToSources(page);
  await pressOk(page); // source -> collections
  await page.waitForSelector("#screen-collections:not([hidden]) #collection-list .collection-card.focused");
  await page.waitForTimeout(100);
  return state;
}

export async function bootAtGrid(page) {
  const state = await bootAtCollections(page);
  await pressOk(page); // collection -> grid
  await page.waitForSelector("#screen-grid:not([hidden]) .grid-cell.focused");
  await page.waitForTimeout(100);
  return state;
}

// Enters the kiosk for the focused collection via the Play media key.
export async function bootAtKiosk(page) {
  const state = await bootAtCollections(page);
  await pressRemote(page, "play"); // collections play -> kiosk
  await page.waitForSelector("#screen-kiosk:not([hidden])");
  await page.waitForSelector(".kiosk-frame.visible .kiosk-photo");
  await page.waitForTimeout(150);
  return state;
}
