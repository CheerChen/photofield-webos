// 03 — grid: renders the wall layout, spatial focus navigation, status line.
import { test, expect } from "@playwright/test";
import { bootAtGrid } from "../helpers/nav.mjs";
import { press, pressBack } from "../helpers/keys.mjs";

test("grid shows the collection layout with focus and positional status", async ({ page }) => {
  const state = await bootAtGrid(page);

  await expect(page.locator("#screen-grid")).toBeVisible();
  await expect(page.locator("#grid-canvas .grid-cell")).toHaveCount(5);
  await expect(page.locator("#grid-canvas")).toHaveCSS("height", "840px");
  await expect(page.locator("#grid-status")).toHaveText("Alpha · 1 / 5");

  expect(state.errors).toEqual([]);
});

test("arrow keys move focus spatially and update the status line", async ({ page }) => {
  const state = await bootAtGrid(page);

  await press(page, "ArrowRight");
  await expect(page.locator("#grid-status")).toHaveText("Alpha · 2 / 5");

  // From (480,0) the only cell below is the single photo at (0,420).
  await press(page, "ArrowDown");
  await expect(page.locator("#grid-status")).toHaveText("Alpha · 5 / 5");

  await press(page, "ArrowUp");
  await expect(page.locator("#grid-status")).toHaveText("Alpha · 1 / 5");

  expect(state.errors).toEqual([]);
});

test("back returns to the album list", async ({ page }) => {
  const state = await bootAtGrid(page);
  await pressBack(page);

  await expect(page.locator("#screen-grid")).toBeHidden();
  await expect(page.locator("#screen-collections")).toBeVisible();

  expect(state.errors).toEqual([]);
});

test("grid scene requests suppress FLEX date/location headers", async ({ page }) => {
  // FLEX otherwise injects text-only "Aux" header cells the TV client cannot
  // render, leaving empty gaps that indent the first photo of each section.
  // Both the create body and the reuse lookup must carry the nogeo tweak so a
  // header-laden web-UI scene is neither created nor adopted.
  const state = await bootAtGrid(page);

  expect(state.sceneCreateBodies.length).toBeGreaterThan(0);
  for (const body of state.sceneCreateBodies) {
    expect(body.layout).toBe("FLEX");
    expect(String(body.tweaks || "")).toContain("nogeo");
  }
  expect(state.sceneReuseQueries.length).toBeGreaterThan(0);
  for (const search of state.sceneReuseQueries) {
    expect(new URLSearchParams(search).get("tweaks")).toContain("nogeo");
  }

  expect(state.errors).toEqual([]);
});
