// Browser evidence for the same VRM character used in the game.
// Run after starting Vite: node tests/princess-preview.mjs
import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
const browser = await chromium.launch({
  channel: "chromium",
  args: ["--use-angle=metal"],
});
try {
  const page = await browser.newPage({
    viewport: { width: 1200, height: 1200 },
    deviceScaleFactor: 1,
  });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.goto(
    new URL(
      "princess-preview.html",
      process.env.TEST_URL || "http://127.0.0.1:4173/",
    ).href,
  );
  await page.waitForFunction(() => window.__PRINCESS_PREVIEW__?.ready, null, {
    timeout: 60000,
  });
  console.log(
    "VRM appearance loaded",
    await page.evaluate(() => window.__PRINCESS_PREVIEW__.diagnostics()),
  );
  await page.screenshot({ path: "test-results/princess-vrm-front.png" });
  await page.getByRole("button", { name: "斜侧面", exact: true }).click();
  assert.equal(
    await page.evaluate(() => window.__PRINCESS_PREVIEW__.diagnostics().angle),
    0.65,
  );
  await page.screenshot({
    path: "test-results/princess-vrm-three-quarter.png",
  });
  assert.deepEqual(errors, []);
  console.log(
    "Front and three-quarter screenshots captured; no browser errors.",
  );
} finally {
  await browser.close();
}
