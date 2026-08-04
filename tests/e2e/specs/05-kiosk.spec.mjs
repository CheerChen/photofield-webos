// 05 — kiosk: entry, first frame commit, timed advance, pause, manual nav, exit.
import { test, expect } from "@playwright/test";
import { bootAtKiosk } from "../helpers/nav.mjs";
import { press, pressOk, pressBack } from "../helpers/keys.mjs";

test("kiosk commits the first frame with album and date info", async ({ page }) => {
  const state = await bootAtKiosk(page);

  await expect(page.locator("#screen-kiosk")).toBeVisible();
  await expect(page.locator("#kiosk-loading")).toBeHidden();
  await expect(page.locator("#kiosk-a")).toHaveClass(/visible/);
  // The committed frame carries the photo as a CSS background.
  const bg = await page.locator("#kiosk-a .kiosk-photo").evaluate((el) => el.style.backgroundImage);
  expect(bg).toContain("/api/files/");
  await expect(page.locator("#kiosk-album")).toHaveText("Alpha");
  await expect(page.locator("#kiosk-date")).toHaveText(/^\d{4}年\d{1,2}月\d{1,2}日$/);
  await expect(page.locator("#kiosk-hint")).toBeVisible();

  expect(state.errors).toEqual([]);
});

test("the slideshow advances on its own after the configured duration", async ({ page }) => {
  const state = await bootAtKiosk(page);

  // duration is seeded to 1s: the second frame (kiosk-b) must commit soon.
  await page.waitForFunction(
    () => document.getElementById("kiosk-b").classList.contains("visible"),
    null,
    { timeout: 8000 }
  );
  await expect(page.locator("#kiosk-a")).not.toHaveClass(/visible/);
  await expect(page.locator("#kiosk-date")).toHaveText(/^\d{4}年\d{1,2}月\d{1,2}日$/);

  expect(state.errors).toEqual([]);
});

test("OK pauses and resumes the slideshow", async ({ page }) => {
  const state = await bootAtKiosk(page);

  await pressOk(page);
  await expect(page.locator("#kiosk-paused")).toBeVisible();
  await expect(page.locator("#screen-kiosk")).toHaveClass(/kiosk-slideshow-paused/);

  await pressOk(page);
  await expect(page.locator("#kiosk-paused")).toBeHidden();

  expect(state.errors).toEqual([]);
});

test("right arrow manually advances to the next photo", async ({ page }) => {
  const state = await bootAtKiosk(page);

  await press(page, "ArrowRight");
  await page.waitForFunction(
    () => document.getElementById("kiosk-b").classList.contains("visible"),
    null,
    { timeout: 8000 }
  );

  expect(state.errors).toEqual([]);
});

test("back leaves the kiosk and returns to the album list", async ({ page }) => {
  const state = await bootAtKiosk(page);
  await pressBack(page);

  await expect(page.locator("#screen-kiosk")).toBeHidden();
  await expect(page.locator("#screen-collections")).toBeVisible();
  await expect(page.locator("#kiosk-music")).toBeHidden();

  expect(state.errors).toEqual([]);
});
