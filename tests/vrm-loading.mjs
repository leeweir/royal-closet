import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
const browser = await chromium.launch({
  channel: "chromium",
  args: ["--use-angle=metal"],
});
try {
  const page = await browser.newPage({
    viewport: { width: 1280, height: 900 },
  });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  let attempts = 0,
    release;
  const blocked = new Promise((resolve) => (release = resolve));
  await page.route("**/princess-base.vrm", async (route) => {
    attempts++;
    if (attempts === 1)
      await route.fulfill({ status: 503, body: "Simulated loading failure" });
    else {
      await blocked;
      await route.continue();
    }
  });
  await page.goto(process.env.TEST_URL || "http://127.0.0.1:4173/");
  await page.waitForFunction(
    () => window.__STARLIGHT__?.modelStatus() === "error",
  );
  assert.equal(
    await page.locator('[data-action="expression"]').isDisabled(),
    true,
  );
  await page.locator('[data-action="retry-model"]').click();
  await page.waitForFunction(
    () => window.__STARLIGHT__.modelStatus() === "loading",
  );
  await page.locator('[data-action="equip"][data-id="dress-1"]').click();
  await page
    .locator('[data-action="nav"][data-id="map"]:visible')
    .first()
    .click();
  await page.locator('[data-action="start"][data-id="0"]').click();
  assert.equal(await page.evaluate(() => window.__STARLIGHT__.getRun()), null);
  release();
  await page.waitForFunction(
    () => window.__STARLIGHT__.modelStatus() === "ready",
    null,
    { timeout: 60000 },
  );
  await page
    .locator('[data-action="nav"][data-id="closet"]:visible')
    .first()
    .click();
  assert.equal(
    await page.evaluate(() => window.__STARLIGHT__.getState().outfit.dress),
    "dress-1",
  );
  assert.equal(
    await page.evaluate(() => window.__STARLIGHT__.diagnostics().design.dress),
    "rose-lolita",
  );
  assert.equal(await page.locator("#world canvas").count(), 1);
  assert.equal(
    await page.locator('[data-action="expression"]').isEnabled(),
    true,
  );
  assert.equal(await page.locator("#world").getAttribute("aria-busy"), "false");
  assert.equal(attempts, 2);
  assert.deepEqual(errors, []);
  console.log("Model failure/retry, loading-time equip and navigation passed.");
} finally {
  await browser.close();
}
