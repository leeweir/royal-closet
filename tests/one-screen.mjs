import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
const b = await chromium.launch({
  channel: "chromium",
  headless: true,
  args: ["--use-angle=metal"],
});
try {
  const p = await b.newPage();
  await p.goto(process.env.TEST_URL || "http://127.0.0.1:4173/");
  await p.waitForFunction(() => window.__STARLIGHT__?.diagnostics());
  const click = async (a, id) =>
    p.locator(`[data-action="${a}"][data-id="${id}"]:visible`).first().click();
  for (const size of [
    { width: 1440, height: 900 },
    { width: 1365, height: 700 },
    { width: 390, height: 844 },
    { width: 320, height: 740 },
    { width: 844, height: 390 },
  ]) {
    await p.setViewportSize(size);
    for (const screen of ["closet", "craft", "contest", "journal", "map"]) {
      await click("nav", screen);
      await p.waitForTimeout(250);
      const geometry = await p.evaluate(() => {
        const all = [
          ...document.querySelectorAll(
            ".sidebar button, .topbar button, #content button, .scene-tools button",
          ),
        ].filter(
          (e) =>
            e.getClientRects().length &&
            getComputedStyle(e).visibility !== "hidden",
        );
        return {
          w: document.documentElement.scrollWidth,
          h: document.documentElement.scrollHeight,
          clipped: all
            .filter((e) => {
              const r = e.getBoundingClientRect();
              return (
                r.left < -0.5 ||
                r.top < -0.5 ||
                r.right > innerWidth + 0.5 ||
                r.bottom > innerHeight + 0.5
              );
            })
            .map((e) => ({
              action: e.dataset.action,
              id: e.dataset.id,
              rect: e.getBoundingClientRect().toJSON(),
            })),
        };
      });
      assert.ok(
        geometry.w <= size.width && geometry.h <= size.height,
        `${screen} at ${size.width} global scroll ${JSON.stringify(geometry)}`,
      );
      assert.deepEqual(
        geometry.clipped,
        [],
        `${screen} at ${size.width} controls clipped`,
      );
      await p.screenshot({
        path: `test-results/screen-${screen}-${size.width}.png`,
      });
    }
    await click("nav", "craft");
    const initial = await p.locator(".craft-card h3").first().textContent();
    await p.locator(".page-controls button").last().click();
    assert.notEqual(
      await p.locator(".craft-card h3").first().textContent(),
      initial,
    );
    await click("nav", "journal");
    await click("journal-tab", "achievements");
    await click("journal-page", "1");
    assert.equal(await p.locator(".page-controls span").textContent(), "2 / 2");
    console.log(
      `All five screens fit ${size.width}×${size.height}; workshop and journal pages accessible`,
    );
  }
} finally {
  await b.close();
}
