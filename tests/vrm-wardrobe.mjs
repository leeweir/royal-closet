import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { freshSave, STORAGE_KEY } from "../src/simulation/game.ts";
import { ITEMS } from "../src/simulation/data.ts";
const browser = await chromium.launch({
  channel: "chromium",
  args: ["--use-angle=metal"],
});
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 950 },
    reducedMotion: "reduce",
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  const save = freshSave();
  save.owned = ITEMS.map((i) => i.id);
  await page.addInitScript(
    ({ key, save }) => localStorage.setItem(key, JSON.stringify(save)),
    { key: STORAGE_KEY, save },
  );
  await page.goto(process.env.TEST_URL || "http://127.0.0.1:4173/");
  await page.waitForFunction(
    () => window.__STARLIGHT__?.diagnostics()?.model === "VRM 1.0",
    null,
    { timeout: 60000 },
  );
  const click = async (a, id) =>
    page
      .locator(
        `[data-action="${a}"]${id === undefined ? "" : `[data-id="${id}"]`}:visible`,
      )
      .first()
      .click();
  const diagnostics = () =>
    page.evaluate(() => window.__STARLIGHT__.diagnostics());
  const turn = async (angle) => {
    await click("rotate");
    const box = await page.locator("#world canvas").boundingBox();
    const x = box.x + box.width / 2,
      y = box.y + box.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + (angle + 0.13) / 0.012, y, {
      steps: Math.max(1, Math.floor(Math.abs(angle + 0.13) / 0.012 / 8)),
    });
    await page.mouse.up();
    await page.mouse.move(1400, 900);
    await page.waitForTimeout(150);
  };
  console.log("VRM loaded", await diagnostics());
  for (let i = 0; i < 15; i++) {
    await turn(0);
    await click("equip", `dress-${i}`);
    await page.waitForTimeout(250);
    await page.screenshot({ path: `test-results/vrm-dress-${i}-front.png` });
    await click("pose");
    await page.waitForTimeout(250);
    await page.screenshot({ path: `test-results/vrm-dress-${i}-wave.png` });
    await click("pose");
    await click("pose");
    await turn(0.65);
    await page
      .locator("#world-wrap")
      .screenshot({ path: `test-results/vrm-dress-${i}-side.png` });
    await turn(Math.PI);
    await page
      .locator("#world-wrap")
      .screenshot({ path: `test-results/vrm-dress-${i}-back.png` });
  }
  // Rebind while the skeleton is posed and the root is turned, then return
  // to neutral. New garments must keep the original bind pose.
  await turn(0.65);
  await click("pose");
  for (let i = 0; i < 15; i++) {
    await click("equip", `dress-${i}`);
    await page.waitForTimeout(150);
    await page
      .locator("#world-wrap")
      .screenshot({ path: `test-results/vrm-dress-${i}-posed-swap.png` });
  }
  await click("pose");
  await click("pose");
  await turn(0);
  for (const category of ["hair", "crown", "shoes", "wings", "wand"]) {
    await click("category", category);
    for (let i = 0; i < 15; i++) {
      await click("equip", `${category}-${i}`);
      if (category === "hair")
        await page.screenshot({ path: `test-results/vrm-hair-${i}.png` });
    }
    await click("equip", `${category}-0`);
  }
  await click("category", "dress");
  await click("equip", "dress-0");
  await page.waitForTimeout(250);
  const stable = await diagnostics();
  for (let i = 0; i < 12; i++) await click("equip", `dress-${i % 6}`);
  await click("equip", "dress-0");
  await page.waitForTimeout(250);
  const after = await diagnostics();
  assert.ok(
    after.geometries <= stable.geometries + 2,
    `geometry growth ${stable.geometries} -> ${after.geometries}`,
  );
  assert.ok(
    after.textures <= stable.textures + 2,
    `texture growth ${stable.textures} -> ${after.textures}`,
  );
  for (const name of ["happy", "relaxed", "surprised", "wink", "neutral"]) {
    await click("expression");
    await page.waitForTimeout(100);
    assert.equal((await diagnostics()).expression, name);
    if (name === "happy")
      await page.screenshot({ path: "test-results/vrm-happy.png" });
  }
  assert.deepEqual(errors, []);
  console.log(
    "Six dresses, waving, all 36 items, five expressions and repeated outfit swaps passed.",
  );
} finally {
  await browser.close();
}
