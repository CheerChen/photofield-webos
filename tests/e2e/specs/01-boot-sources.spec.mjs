// 01 — boot: cached source renders immediately with a live photo count.
import { test, expect } from "@playwright/test";
import { bootToSources } from "../helpers/harness.mjs";

test("boots to the source screen with the cached source and live count", async ({ page }) => {
  const state = await bootToSources(page);

  await expect(page.locator("#screen-sources")).toBeVisible();
  await expect(page.locator("#source-empty")).toBeHidden();

  const card = page.locator("#source-row .source-card");
  await expect(card).toHaveCount(1);
  await expect(card.locator(".source-card-name")).toHaveText("Photos");
  await expect(card.locator(".source-card-count")).toHaveText("8 张");
  await expect(card).toHaveClass(/focused/);

  expect(state.errors).toEqual([]);
});
