// 04 — viewer: OK opens the fullscreen viewer, arrows step, back closes.
import { test, expect } from "@playwright/test";
import { bootAtGrid } from "../helpers/nav.mjs";
import { press, pressOk, pressBack } from "../helpers/keys.mjs";

test("OK opens the viewer with date/filename/position meta", async ({ page }) => {
  const state = await bootAtGrid(page);
  await pressOk(page); // grid -> viewer

  await expect(page.locator("#screen-viewer")).toBeVisible();
  await expect(page.locator("#viewer-stage img")).toBeVisible();
  await expect(page.locator("#viewer-meta")).toHaveText("2024-01-01  col-alpha-1.jpg  ·  1 / 5");

  expect(state.errors).toEqual([]);
});

test("left/right step through photos and keep the counter in sync", async ({ page }) => {
  const state = await bootAtGrid(page);
  await pressOk(page);
  await expect(page.locator("#viewer-meta")).toHaveText("2024-01-01  col-alpha-1.jpg  ·  1 / 5");

  await press(page, "ArrowRight");
  await expect(page.locator("#viewer-meta")).toHaveText("2024-01-02  col-alpha-2.jpg  ·  2 / 5");

  await press(page, "ArrowLeft");
  await expect(page.locator("#viewer-meta")).toHaveText("2024-01-01  col-alpha-1.jpg  ·  1 / 5");

  expect(state.errors).toEqual([]);
});

test("back closes the viewer and restores grid focus", async ({ page }) => {
  const state = await bootAtGrid(page);
  await pressOk(page);
  await expect(page.locator("#screen-viewer")).toBeVisible();

  await pressBack(page);
  await expect(page.locator("#screen-viewer")).toBeHidden();
  await expect(page.locator("#screen-grid")).toBeVisible();
  await expect(page.locator("#grid-canvas .grid-cell.focused")).toHaveCount(1);
  await expect(page.locator("#grid-status")).toHaveText("Alpha · 1 / 5");

  expect(state.errors).toEqual([]);
});
