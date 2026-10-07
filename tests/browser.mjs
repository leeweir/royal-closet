import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
const base = process.env.TEST_URL || "http://127.0.0.1:4173/";
const browser = await chromium.launch({
  channel: "chromium",
  headless: true,
  args: ["--use-angle=metal"],
});
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 950 },
    deviceScaleFactor: 1,
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(base, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => window.__STARLIGHT__?.diagnostics());
  await page.waitForTimeout(600);
  const state = () => page.evaluate(() => window.__STARLIGHT__.getState());
  const run = () => page.evaluate(() => window.__STARLIGHT__.getRun());
  async function click(action, id) {
    await page
      .locator(
        `[data-action="${action}"]${id !== undefined ? `[data-id="${id}"]` : ""}:visible`,
      )
      .first()
      .click();
  }
  async function screenshot(name) {
    await page.screenshot({ path: `test-results/${name}.png`, fullPage: true });
  }
  await screenshot("closet-desktop");
  console.log("Screenshot closet done");
  await click("equip", "dress-1");
  assert.equal((await state()).outfit.dress, "dress-1");
  await click("category", "hair");
  await click("equip", "hair-1");
  await click("dye", "#83bfe0");
  assert.equal((await state()).dye, "#83bfe0");
  await click("slots");
  await click("slot-save", "0");
  await click("close");
  await click("dye", "#eeb1c5");
  await click("slots");
  await click("slot-load", "0");
  assert.equal((await state()).dye, "#83bfe0");
  await click("nav", "contest");
  await click("theme", "1");
  await click("contest");
  await page.locator("#modal[open] .contest-grade").waitFor({ timeout: 16000 });
  assert.ok((await state()).coins > 360);
  await click("close");
  await click("login");
  assert.equal((await state()).streak, 1);
  await click("close");
  await click("nav", "map");
  await page.evaluate(async () => {
    const background = getComputedStyle(
      document.querySelector(".kingdom-map"),
    ).backgroundImage;
    const match = background.match(/url\(["']?(.*?)["']?\)/);
    if (!match) throw new Error("Kingdom illustration missing");
    const image = new Image();
    image.src = match[1];
    await image.decode();
  });
  await page.waitForTimeout(220);
  await screenshot("map-desktop");
  await click("start", "0");
  await page.waitForTimeout(750);
  await screenshot("adventure-desktop");
  async function walk(kind, index = 0) {
    const before = (await run()).gems.length;
    await page.locator(`.adventure-goal[data-kind="${kind}"]`).click();
    if (kind === "gem")
      await page.waitForFunction(
        (n) => window.__STARLIGHT__.getRun().gems.length > n,
        before,
        { timeout: 12000 },
      );
    else
      await page
        .locator(`[data-action="interact"][data-kind="${kind}"]`)
        .waitFor({ state: "visible", timeout: 15000 });
  }
  for (let i = 0; i < 5; i++) await walk("gem", i);
  console.log("Collected all five crystals using visible adventure targets");
  await walk("rune");
  await click("interact");
  await page.waitForTimeout(2600);
  for (const i of [1, 3, 2]) await click("rune", String(i));
  await page.waitForFunction(() => window.__STARLIGHT__.getRun().puzzle);
  await page.waitForTimeout(1000);
  await walk("fairy");
  await click("interact");
  await click("friend", "share");
  assert.equal((await run()).friend, true);
  await walk("portal");
  await click("interact");
  await page
    .locator("#modal-title")
    .filter({ hasText: "又一段童话" })
    .waitFor();
  assert.deepEqual((await state()).completed, [0]);
  await screenshot("adventure-reward");
  await click("finish");
  await click("nav", "journal");
  await click("journal-tab", "achievements");
  await click("claim", "first");
  assert.ok((await state()).claims.includes("first"));
  const prior = await state();
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => window.__STARLIGHT__);
  assert.deepEqual((await state()).completed, prior.completed);
  assert.equal((await state()).coins, prior.coins);
  console.log(
    "Desktop full adventure, reward, daily gift, contest, outfit, achievement, and reload passed",
  );
  // Inspect the workshop and responsive controls using the earned save.
  await click("nav", "craft");
  await screenshot("craft-desktop");
  for (const size of [
    { width: 390, height: 844 },
    { width: 320, height: 740 },
    { width: 844, height: 390 },
  ]) {
    await page.setViewportSize(size);
    await click("nav", "closet");
    await page.waitForTimeout(350);
    assert.equal(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth <= innerWidth &&
          document.documentElement.scrollHeight <= innerHeight,
      ),
      true,
    );
    await screenshot(`closet-${size.width}`);
    await click("nav", "map");
    await page.waitForTimeout(200);
    assert.equal(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth <= innerWidth &&
          document.documentElement.scrollHeight <= innerHeight,
      ),
      true,
    );
    await click("start", "1");
    await page.waitForTimeout(600);
    await screenshot(`adventure-${size.width}`);
    assert.equal(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth <= innerWidth &&
          document.documentElement.scrollHeight <= innerHeight,
      ),
      true,
    );
    const before = await page.evaluate(
      () => window.__STARLIGHT__.diagnostics().position,
    );
    const b = page.locator('[data-move="1,0"]');
    const rect = await b.boundingBox();
    assert.ok(
      rect.y >= 0 && rect.y + rect.height <= size.height,
      "direction controls remain inside viewport",
    );
    await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(500);
    await page.mouse.up();
    const after = await page.evaluate(
      () => window.__STARLIGHT__.diagnostics().position,
    );
    assert.ok(after.x > before.x + 0.4, "direction control moves character");
    await click("nav", "map");
    await click("leave", "map");
  }
  assert.deepEqual(errors, []);
  console.log(
    "Responsive checks passed: 390×844, 320×740, 844×390; no page errors.",
  );
} finally {
  await browser.close();
}
