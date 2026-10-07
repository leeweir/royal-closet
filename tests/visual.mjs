import { chromium } from "@playwright/test";
import { freshSave, STORAGE_KEY } from "../src/simulation/game.ts";
import { ITEMS } from "../src/simulation/data.ts";
import assert from "node:assert/strict";
const browser = await chromium.launch({
  channel: "chromium",
  headless: true,
  args: ["--use-angle=metal"],
});
try {
  const p = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  p.on("pageerror", (e) => errors.push(e.message));
  const save = freshSave();
  save.owned = ITEMS.map((i) => i.id);
  await p.addInitScript(
    ({ key, save }) => {
      if (!localStorage.getItem(key))
        localStorage.setItem(key, JSON.stringify(save));
    },
    { key: STORAGE_KEY, save },
  );
  await p.goto(process.env.TEST_URL || "http://127.0.0.1:4173/");
  await p.waitForFunction(() => window.__STARLIGHT__?.diagnostics());
  const click = async (a, id) =>
    p
      .locator(
        `[data-action="${a}"]${id !== undefined ? `[data-id="${id}"]` : ""}:visible`,
      )
      .first()
      .click();
  for (let i = 0; i < 6; i++) {
    for (const cat of ["dress", "hair", "crown", "shoes", "wings", "wand"])
      save.outfit[cat] = `${cat}-${i}`;
    await p.evaluate(
      ({ key, save }) => localStorage.setItem(key, JSON.stringify(save)),
      { key: STORAGE_KEY, save },
    );
    await p.reload();
    await p.waitForFunction(() => window.__STARLIGHT__?.diagnostics());
    await click("category", "dress");
    await p.waitForTimeout(400);
    await p.screenshot({ path: `test-results/couture-${i}.png` });
    console.log(i, await p.evaluate(() => window.__STARLIGHT__.diagnostics()));
  }
  await click("pose");
  await p.waitForTimeout(350);
  assert.equal(
    await p.evaluate(() => window.__STARLIGHT__.diagnostics().pose),
    1,
  );
  await p.screenshot({ path: "test-results/greeting.png" });
  const start = await p.evaluate(() => window.__STARLIGHT__.diagnostics());
  for (let j = 0; j < 12; j++) await click("equip", `dress-${j % 6}`);
  await p.waitForTimeout(300);
  const end = await p.evaluate(() => window.__STARLIGHT__.diagnostics());
  assert.ok(
    end.textures <= start.textures + 2,
    `textures leaked ${start.textures} -> ${end.textures}`,
  );
  assert.ok(end.geometries <= start.geometries + 5);
  assert.deepEqual(errors, []);
  console.log("Visual variants, greeting, resource disposal passed");
} finally {
  await browser.close();
}
