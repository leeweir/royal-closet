import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import {
  freshSave,
  createRun,
  collect,
  finishRun,
  STORAGE_KEY,
} from "../src/simulation/game.ts";
import { solveLights, createLights } from "../src/simulation/puzzles.ts";
const fixture = freshSave();
for (let stage = 0; stage < 20; stage++) {
  const r = createRun(fixture, stage);
  for (let i = 0; i < 5; i++) collect(r, i);
  r.friend = true;
  r.puzzle = true;
  finishRun(fixture, r);
}
const b = await chromium.launch({
  channel: "chromium",
  headless: true,
  args: ["--use-angle=metal"],
});
try {
  const context = await b.newContext({
    viewport: { width: 1280, height: 900 },
  });
  const p = await context.newPage();
  const errors = [];
  p.on("pageerror", (e) => errors.push(e.message));
  await p.addInitScript(
    ({ key, save }) => {
      if (!localStorage.getItem(key))
        localStorage.setItem(key, JSON.stringify(save));
    },
    { key: STORAGE_KEY, save: fixture },
  );
  await p.goto(process.env.TEST_URL || "http://127.0.0.1:4173/", {
    waitUntil: "domcontentloaded",
  });
  await p.waitForFunction(() => window.__STARLIGHT__?.diagnostics());
  const click = async (a, id) =>
    p
      .locator(
        `[data-action="${a}"]${id !== undefined ? `[data-id="${id}"]` : ""}`,
      )
      .first()
      .click();
  const get = () => p.evaluate(() => window.__STARLIGHT__.getState());
  await click("nav", "craft");
  const before = await get();
  await click("craft", "dress-2");
  assert.ok((await get()).owned.includes("dress-2"));
  assert.equal((await get()).coins, before.coins - 370);
  await click("nav", "closet");
  await click("equip", "dress-2");
  assert.equal((await get()).outfit.dress, "dress-2");
  await click("settings");
  const down = p.waitForEvent("download");
  await click("export");
  const dl = await down;
  await dl.saveAs("test-results/exported-save.json");
  await click("close");
  async function start(stage) {
    await click("nav", "map");
    await click("region", String(Math.floor(stage / 4)));
    await click("start", String(stage));
    await p.waitForTimeout(300);
    const point = await p.evaluate(() =>
      window.__STARLIGHT__.diagnostics().points.find((p) => p.kind === "rune"),
    );
    await p.mouse.click(point.x, point.y);
    await p
      .locator('[data-action="interact"][data-kind="rune"]')
      .waitFor({ state: "visible" });
    await click("interact");
  }
  await start(1);
  for (const i of solveLights(createLights(1))) await click("light", String(i));
  await p.waitForFunction(() => window.__STARLIGHT__.getRun().puzzle);
  await p.waitForTimeout(1200);
  await click("nav", "map");
  await click("leave", "map");
  console.log("Lights puzzle completed using visible buttons");
  await start(2);
  for (let i = 0; i < 3; i++) {
    await p.waitForFunction(() => {
      const x = parseFloat(document.querySelector("#timing-star").style.left);
      return x > 43 && x < 57;
    });
    await click("timing");
    await p.waitForTimeout(650);
  }
  await p.waitForFunction(() => window.__STARLIGHT__.getRun().puzzle);
  await p.waitForTimeout(1200);
  await click("nav", "map");
  await click("leave", "map");
  console.log("Timing puzzle completed using visible star position");
  await click("region", "3");
  await click("start", "12");
  await p.waitForTimeout(450);
  await p.screenshot({
    path: "test-results/snowfield-desktop.png",
    fullPage: true,
  });
  await click("nav", "map");
  await click("leave", "map");
  await click("region", "4");
  await click("start", "16");
  await p.waitForTimeout(450);
  await p.screenshot({
    path: "test-results/castle-desktop.png",
    fullPage: true,
  });
  await click("nav", "map");
  await click("leave", "map");
  await click("settings");
  await p
    .locator("#import-input")
    .setInputFiles({
      name: "bad.json",
      mimeType: "application/json",
      buffer: Buffer.from('{"version":1,"coins":-99}'),
    });
  await p.waitForTimeout(100);
  assert.equal((await get()).coins, before.coins - 370);
  await p
    .locator("#import-input")
    .setInputFiles("test-results/exported-save.json");
  await p.locator("#confirm-import").click();
  assert.equal((await get()).outfit.dress, "dress-2");
  await p.reload({ waitUntil: "domcontentloaded" });
  await p.waitForFunction(() => window.__STARLIGHT__);
  assert.equal((await get()).outfit.dress, "dress-2");
  assert.deepEqual(errors, []);
  console.log(
    "Craft/equip, export, rejected malformed import, confirmed valid import, reload, and later regions passed",
  );
} finally {
  await b.close();
}
