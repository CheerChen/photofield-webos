// 02 — source -> album list: OK on a source opens its collections.
import { test, expect } from "@playwright/test";
import { bootToSources } from "../helpers/harness.mjs";
import { pressOk } from "../helpers/keys.mjs";

test("OK on a source opens its album list with names and counts", async ({ page }) => {
  const state = await bootToSources(page);
  await pressOk(page);

  await expect(page.locator("#screen-collections")).toBeVisible();
  await expect(page.locator("#screen-sources")).toBeHidden();
  await expect(page.locator("#collections-source-name")).toHaveText("Photos");

  const cards = page.locator("#collection-list .collection-card");
  await expect(cards).toHaveCount(2);
  await expect(cards.nth(0)).toHaveClass(/focused/);

  await expect(cards.nth(0).locator(".collection-caption .name")).toHaveText("Alpha");
  await expect(cards.nth(0).locator(".collection-caption .count")).toHaveText("5");
  await expect(cards.nth(1).locator(".collection-caption .name")).toHaveText("Beta");
  await expect(cards.nth(1).locator(".collection-caption .count")).toHaveText("3");

  // Covers load sequentially from photoAt(..., 0); both slots fill with imgs.
  await expect(page.locator('#collection-list [data-cover="col-alpha"] img')).toBeVisible({ timeout: 10000 });
  await expect(page.locator('#collection-list [data-cover="col-beta"] img')).toBeVisible({ timeout: 10000 });

  expect(state.errors).toEqual([]);
});
