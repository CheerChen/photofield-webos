// 06 — back stack: every level returns to its parent; overlays close in place.
import { test, expect } from "@playwright/test";
import { bootAtGrid, bootAtSources } from "../helpers/nav.mjs";
import { pressOk, pressBack, pressRemote } from "../helpers/keys.mjs";

test("viewer -> grid -> collections -> sources back chain", async ({ page }) => {
  const state = await bootAtGrid(page);

  await pressOk(page); // grid -> viewer
  await expect(page.locator("#screen-viewer")).toBeVisible();

  await pressBack(page); // viewer -> grid
  await expect(page.locator("#screen-viewer")).toBeHidden();
  await expect(page.locator("#screen-grid")).toBeVisible();

  await pressBack(page); // grid -> collections
  await expect(page.locator("#screen-grid")).toBeHidden();
  await expect(page.locator("#screen-collections")).toBeVisible();

  await pressBack(page); // collections -> sources
  await expect(page.locator("#screen-collections")).toBeHidden();
  await expect(page.locator("#screen-sources")).toBeVisible();
  await expect(page.locator("#source-row .source-card.focused")).toHaveCount(1);

  expect(state.errors).toEqual([]);
});

test("blue opens settings from sources and back closes it", async ({ page }) => {
  const state = await bootAtSources(page);

  await pressRemote(page, "blue");
  await expect(page.locator("#settings-overlay")).toBeVisible();
  await expect(page.locator("#settings-list .settings-row.focused")).toHaveCount(1);

  await pressBack(page);
  await expect(page.locator("#settings-overlay")).toBeHidden();
  // Key handling is back on the sources screen: focus still works.
  await expect(page.locator("#source-row .source-card.focused")).toHaveCount(1);

  expect(state.errors).toEqual([]);
});
