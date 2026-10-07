import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
const b = await chromium.launch({
  channel: "chromium",
  headless: true,
  args: ["--use-angle=metal"],
});
try {
  const p = await b.newPage({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 2,
  });
  await p.goto(process.env.TEST_URL || "http://127.0.0.1:4173/", {
    waitUntil: "domcontentloaded",
  });
  await p.waitForFunction(() => window.__STARLIGHT__?.diagnostics());
  await p.locator('[data-action="equip"][data-id="dress-1"]').tap();
  assert.equal(
    await p.evaluate(() => window.__STARLIGHT__.getState().outfit.dress),
    "dress-1",
  );
  await p.evaluate(() => window.scrollTo(0, 500));
  await p.locator('[data-action="nav"][data-id="map"]').first().tap();
  assert.equal(await p.evaluate(() => scrollY), 0);
  await p.locator('[data-action="start"][data-id="0"]').tap();
  await p.waitForTimeout(400);
  const point = await p.evaluate(() =>
    window.__STARLIGHT__.diagnostics().points.find((p) => p.kind === "gem"),
  );
  await p.touchscreen.tap(point.x, point.y);
  await p.waitForFunction(() => window.__STARLIGHT__.getRun().gems.includes(0));
  const canvas = await p.locator("#world canvas").boundingBox();
  assert.ok(canvas.width <= 390);
  await p.screenshot({ path: "test-results/touch-mobile.png", fullPage: true });
  console.log(
    "Mobile touch: tap to dress, enter adventure, walk and collect a crystal passed",
  );
} finally {
  await b.close();
}
