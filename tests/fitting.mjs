import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const base = process.env.TEST_URL || "http://127.0.0.1:4173/";
const key = "starlight-atelier-save-v1";
const browser = await chromium.launch({
  channel: "chromium",
  args: ["--use-angle=metal"],
});
const errors = [];
const click = (p, action, id) =>
  p
    .locator(
      `[data-action="${action}"]${id === undefined ? "" : `[data-id="${id}"]`}:visible`,
    )
    .first()
    .click();
const state = (p) => p.evaluate(() => window.__STARLIGHT__.getState());
const fitting = (p) => p.evaluate(() => window.__STARLIGHT__.getFitting());
const diagnostics = (p) => p.evaluate(() => window.__STARLIGHT__.diagnostics());
const stored = (p) => p.evaluate((key) => localStorage.getItem(key), key);
const ready = (p) =>
  p.waitForFunction(
    () => window.__STARLIGHT__?.modelStatus() === "ready",
    null,
    { timeout: 60000 },
  );

try {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  const p = await context.newPage();
  p.on("pageerror", (e) => errors.push(e.message));
  await p.goto(base);
  await ready(p);
  await click(p, "equip", "dress-1");
  await click(p, "dye", "#83bfe0");
  await click(p, "slots");
  await click(p, "slot-save", "0");
  await click(p, "close");
  let baseline = await state(p),
    raw = await stored(p);
  const formalAbilities = (await diagnostics(p)).abilities;

  await click(p, "equip", "dress-4");
  assert.equal(
    await p.locator("#toast").evaluate((e) => e.classList.contains("show")),
    false,
  );
  assert.equal((await fitting(p)).outfit.dress, "dress-4");
  assert.equal((await diagnostics(p)).design.dress, "witch-pleats-and-tails");
  assert.equal(await p.locator('[data-action="slots"]').isDisabled(), true);
  assert.equal(
    await p.locator('[data-action="fitting"]').getAttribute("aria-pressed"),
    "true",
  );
  assert.deepEqual(await state(p), baseline);
  assert.equal(await stored(p), raw);

  await click(p, "sets");
  await click(p, "equip-set", "5");
  assert.ok(
    Object.values((await fitting(p)).outfit).every((id) => id.endsWith("-5")),
  );
  assert.equal(
    (await diagnostics(p)).design.dress,
    "royal-open-robe-and-train",
  );
  await click(p, "rotate");
  await p.waitForTimeout(400);
  await p.screenshot({ path: "test-results/fitting-set-front.png" });
  const canvas = await p.locator("#world canvas").boundingBox();
  await p.mouse.move(
    canvas.x + canvas.width * 0.5,
    canvas.y + canvas.height * 0.48,
  );
  await p.mouse.down();
  await p.mouse.move(
    canvas.x + canvas.width * 0.5 + 85,
    canvas.y + canvas.height * 0.48,
    { steps: 12 },
  );
  await p.mouse.up();
  await p.waitForTimeout(350);
  await p.screenshot({ path: "test-results/fitting-set-angle.png" });
  await click(p, "category", "hair");
  await click(p, "equip", "hair-1");
  await click(p, "dye", "#eeb1c5");
  assert.equal((await fitting(p)).outfit.hair, "hair-1");
  assert.equal((await fitting(p)).dye, "#eeb1c5");
  assert.deepEqual(await state(p), baseline);
  assert.equal(await stored(p), raw);

  // An unrelated autosave or backup must contain the real outfit only.
  await click(p, "settings");
  await click(p, "sound");
  baseline.sound = true;
  assert.deepEqual(await state(p), baseline);
  assert.deepEqual(JSON.parse(await stored(p)), baseline);
  const download = p.waitForEvent("download");
  await click(p, "export");
  assert.deepEqual(
    JSON.parse(await readFile(await (await download).path(), "utf8")),
    baseline,
  );
  await click(p, "close");
  await click(p, "fitting");
  assert.equal(await fitting(p), null);
  assert.equal((await diagnostics(p)).design.dress, "rose-lolita");
  assert.equal(
    await p.locator('.swatch[aria-pressed="true"]').getAttribute("data-id"),
    "#83bfe0",
  );
  assert.equal(await p.locator('[data-action="slots"]').isEnabled(), true);

  // Explicit fitting also keeps owned clothing out of the save.
  await click(p, "fitting");
  await click(p, "category", "dress");
  await click(p, "equip", "dress-0");
  assert.equal((await fitting(p)).outfit.dress, "dress-0");
  assert.deepEqual(await state(p), baseline);
  await click(p, "nav", "contest");
  assert.equal(await fitting(p), null);
  assert.equal((await diagnostics(p)).design.dress, "rose-lolita");
  assert.equal(await p.locator("#save-status").textContent(), "已恢复正式搭配");
  await click(p, "contest");
  assert.equal((await diagnostics(p)).mode, "runway");
  assert.equal((await diagnostics(p)).design.dress, "rose-lolita");
  await click(p, "runway-exit");
  assert.deepEqual(await state(p), baseline);

  await click(p, "nav", "closet");
  await click(p, "sets");
  await click(p, "equip-set", "5");
  await click(p, "nav", "map");
  await click(p, "start", "0");
  assert.equal(await fitting(p), null);
  assert.equal((await diagnostics(p)).design.dress, "rose-lolita");
  assert.deepEqual((await diagnostics(p)).abilities, formalAbilities);
  await click(p, "nav", "closet");
  await click(p, "leave", "closet");

  // A second tab may legitimately change the saved outfit during preview.
  await click(p, "equip-set", "4");
  const other = await context.newPage();
  await other.route("**/fitting-storage-fixture", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<title>Storage fixture</title>",
    }),
  );
  await other.goto(new URL("fitting-storage-fixture", base).href);
  baseline.outfit.hair = "hair-1";
  baseline.dye = "#8abdab";
  await other.evaluate(
    ({ key, saved }) => localStorage.setItem(key, JSON.stringify(saved)),
    { key, saved: baseline },
  );
  await p.waitForFunction(
    () => window.__STARLIGHT__.getState().dye === "#8abdab",
  );
  assert.equal((await fitting(p)).outfit.dress, "dress-4");
  assert.equal((await diagnostics(p)).design.dress, "witch-pleats-and-tails");
  await other.close();
  await p.bringToFront();
  await click(p, "fitting");
  assert.deepEqual(await state(p), baseline);
  assert.equal((await diagnostics(p)).design.dress, "rose-lolita");
  await click(p, "equip-set", "3");
  await p.reload();
  await ready(p);
  assert.equal(await fitting(p), null);
  assert.deepEqual(await state(p), baseline);
  assert.equal((await diagnostics(p)).design.dress, "rose-lolita");
  console.log(
    "Single items, sets, dye, autosave/export, collection lock, exit/navigation, runway/adventure, cross-tab and reload passed.",
  );

  await click(p, "sets");
  await click(p, "equip-set", "2");
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 1365, height: 700 },
    { width: 390, height: 844 },
    { width: 320, height: 740 },
    { width: 844, height: 390 },
  ]) {
    await p.setViewportSize(viewport);
    for (const action of ["sets", "category"]) {
      await click(p, action, action === "category" ? "dress" : undefined);
      await p.waitForTimeout(200);
      const layout = await p.evaluate(() => ({
        overflow:
          document.documentElement.scrollWidth > innerWidth ||
          document.documentElement.scrollHeight > innerHeight,
        clipped: [
          ...document.querySelectorAll("#content button, .scene-tools button"),
        ]
          .filter((e) => e.getClientRects().length)
          .filter((e) => {
            const r = e.getBoundingClientRect();
            return (
              r.left < 0 ||
              r.top < 0 ||
              r.right > innerWidth + 0.5 ||
              r.bottom > innerHeight + 0.5
            );
          })
          .map((e) => e.dataset.action),
        headerOverlap:
          document.querySelector(".wardrobe-header h2").getBoundingClientRect()
            .right >
          document.querySelector(".wardrobe-actions").getBoundingClientRect()
            .left,
      }));
      assert.deepEqual(
        layout,
        { overflow: false, clipped: [], headerOverlap: false },
        `${action} at ${JSON.stringify(viewport)}`,
      );
      await p.screenshot({
        path: `test-results/fitting-${action}-${viewport.width}.png`,
      });
    }
  }
  await context.close();
  console.log(
    "Both fitting tabs fit desktop, compact desktop, phone, narrow phone and short landscape.",
  );

  // A selection made before the VRM finishes loading must win at model ready.
  const loading = await browser.newPage({
    viewport: { width: 1280, height: 900 },
  });
  loading.on("pageerror", (e) => errors.push(e.message));
  let release;
  const gate = new Promise((resolve) => (release = resolve));
  await loading.route("**/princess-base.vrm", async (route) => {
    await gate;
    await route.continue();
  });
  await loading.goto(base, { waitUntil: "domcontentloaded" });
  await click(loading, "sets");
  await click(loading, "equip-set", "3");
  assert.equal(
    await loading.evaluate(() => window.__STARLIGHT__.modelStatus()),
    "loading",
  );
  release();
  await ready(loading);
  assert.equal((await diagnostics(loading)).design.dress, "ice-mermaid");
  assert.equal((await state(loading)).outfit.dress, "dress-0");
  assert.equal(await stored(loading), null);
  await click(loading, "fitting");
  assert.equal((await diagnostics(loading)).design.dress, "moonlight-a-line");
  await loading.close();
  assert.deepEqual(errors, []);
  console.log("Loading-time fitting passed; no browser errors.");
} finally {
  await browser.close();
}
