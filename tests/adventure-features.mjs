import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { freshSave, STORAGE_KEY } from "../src/simulation/game.ts";
import { ITEMS } from "../src/simulation/data.ts";
import { REGION_STORIES } from "../src/simulation/adventure.ts";
const browser = await chromium.launch({
  channel: "chromium",
  args: ["--use-angle=metal"],
});
const base = process.env.TEST_URL || "http://127.0.0.1:4173/";
const errors = [];
const createPage = async () => {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
  });
  page.on("pageerror", (e) => errors.push(e.message));
  return page;
};
const click = (p, action, id) =>
  p
    .locator(
      `[data-action="${action}"]${id !== undefined ? `[data-id="${id}"]` : ""}:visible`,
    )
    .first()
    .click();
const ready = (p) =>
  p.waitForFunction(() => window.__STARLIGHT__?.diagnostics());
const state = (p) => p.evaluate(() => window.__STARLIGHT__.getState());
const diag = (p) => p.evaluate(() => window.__STARLIGHT__.diagnostics());
try {
  const p = await createPage();
  await p.goto(base);
  await ready(p);
  await click(p, "sets");
  await click(p, "equip-set", "1");
  assert.ok(
    Object.values((await state(p)).outfit).every((id) => id.endsWith("-1")),
  );
  const worn = (await state(p)).outfit;
  await click(p, "equip-set", "2");
  assert.equal(
    await p.evaluate(() => window.__STARLIGHT__.getFitting().outfit.dress),
    "dress-2",
  );
  assert.deepEqual((await state(p)).outfit, worn);
  assert.equal(await p.locator('[data-action="slots"]').isDisabled(), true);
  await click(p, "fitting");
  await p.screenshot({ path: "test-results/collections-desktop.png" });
  for (const size of [
    { width: 390, height: 844 },
    { width: 320, height: 740 },
    { width: 844, height: 390 },
  ]) {
    await p.setViewportSize(size);
    await p.waitForTimeout(250);
    const fits = await p.evaluate(() => ({
      scroll:
        document.documentElement.scrollHeight > innerHeight ||
        document.documentElement.scrollWidth > innerWidth,
      clipped: [...document.querySelectorAll(".collection-card")].some((e) => {
        const r = e.getBoundingClientRect();
        return r.bottom > innerHeight || r.right > innerWidth || r.height < 50;
      }),
    }));
    assert.deepEqual(fits, { scroll: false, clipped: false });
    await p.screenshot({ path: `test-results/collections-${size.width}.png` });
  }
  await p.setViewportSize({ width: 1440, height: 900 });
  await click(p, "nav", "contest");
  await click(p, "theme", "1");
  const before = (await state(p)).coins;
  await click(p, "contest");
  assert.equal((await diag(p)).mode, "runway");
  await p.waitForFunction(
    () => window.__STARLIGHT__.diagnostics().runwayTime > 1.3,
  );
  await p.screenshot({ path: "test-results/runway-entrance.png" });
  await p.waitForFunction(
    () => window.__STARLIGHT__.diagnostics().runwayTime > 3.2,
  );
  await p.screenshot({ path: "test-results/runway-turn.png" });
  await p.locator("#modal[open] .contest-grade").waitFor({ timeout: 16000 });
  assert.equal((await state(p)).coins - before, 144);
  assert.equal((await diag(p)).mode, "closet");
  await click(p, "close");
  const rewarded = (await state(p)).coins;
  await click(p, "contest");
  await click(p, "runway-skip");
  await p.locator("#modal[open]").waitFor();
  assert.equal((await state(p)).coins, rewarded, "replay never pays twice");
  await click(p, "close");
  await click(p, "theme", "2");
  await click(p, "contest");
  await p.waitForTimeout(350);
  await click(p, "runway-exit");
  assert.equal(
    (await state(p)).coins,
    rewarded,
    "cancelled runway does not settle a reward",
  );
  await p.setViewportSize({ width: 390, height: 844 });
  await click(p, "contest");
  await p.waitForTimeout(1300);
  await p.screenshot({ path: "test-results/runway-mobile.png" });
  assert.equal(
    await p.evaluate(() => document.documentElement.scrollHeight > innerHeight),
    false,
  );
  await click(p, "runway-exit");
  await p.reload();
  await ready(p);
  assert.deepEqual((await state(p)).outfit, worn);
  await p.close();
  console.log(
    "Complete/locked set selection, three responsive layouts, saved outfit, full runway, replay, skip, cancel and mobile stage passed.",
  );
  // A completed campaign fixture is confined to this browser context.
  const q = await createPage();
  const fixture = freshSave();
  fixture.completed = Array.from({ length: 20 }, (_, i) => i);
  fixture.owned = ITEMS.map((i) => i.id);
  await q.addInitScript(
    ({ key, save }) => localStorage.setItem(key, JSON.stringify(save)),
    { key: STORAGE_KEY, save: fixture },
  );
  await q.goto(base);
  await ready(q);
  await click(q, "sets");
  await click(q, "equip-set", "2");
  const layouts = [];
  for (let region = 0; region < 5; region++) {
    await click(q, "nav", "map");
    await click(q, "region", String(region));
    await click(q, "start", String(region * 4));
    await q.waitForTimeout(350);
    const d = await diag(q);
    assert.equal(d.companion, REGION_STORIES[region].npc.name);
    layouts.push(
      d.points.filter((p) => p.kind === "gem").map((p) => [p.worldX, p.worldZ]),
    );
    await q.screenshot({ path: `test-results/region-${region}-layout.png` });
    await q.locator('.adventure-goal[data-kind="fairy"]').click();
    await q
      .locator('[data-action="interact"][data-kind="fairy"]')
      .waitFor({ timeout: 12000 });
    await q.waitForTimeout(500);
    await q.screenshot({ path: `test-results/region-${region}-companion.png` });
    await click(q, "interact");
    assert.ok(
      (await q.locator("#modal-content").textContent()).includes(
        REGION_STORIES[region].npc.story,
      ),
    );
    await click(q, "friend", "share");
    await click(q, "nav", "map");
    await click(q, "leave", "map");
  }
  assert.equal(new Set(layouts.map((l) => JSON.stringify(l))).size, 5);
  // Walk towards a crystal, release outside passive pickup range, then cast.
  await click(q, "region", "0");
  await click(q, "start", "0");
  assert.ok((await diag(q)).abilities.resonance);
  await q.locator('.adventure-goal[data-kind="gem"]').click();
  await q.waitForFunction(() => {
    const d = window.__STARLIGHT__.diagnostics();
    return d.points.some(
      (p) =>
        p.kind === "gem" &&
        !window.__STARLIGHT__.getRun().gems.includes(p.index) &&
        Math.hypot(p.worldX - d.position.x, p.worldZ - d.position.z) <
          d.abilities.spellRadius - 0.25,
    );
  });
  await q.keyboard.down("ArrowUp");
  await q.keyboard.up("ArrowUp");
  const gems = await q.evaluate(
    () => window.__STARLIGHT__.getRun().gems.length,
  );
  await click(q, "magic");
  assert.ok(
    (await q.evaluate(() => window.__STARLIGHT__.getRun().gems.length)) > gems,
    "wand collects crystals outside the passive pickup radius",
  );
  assert.ok((await diag(q)).magicCooldown > 0);
  assert.ok(await q.locator('[data-action="magic"]').isDisabled());
  await q.screenshot({ path: "test-results/adventure-magic.png" });
  await click(q, "nav", "map");
  await click(q, "leave", "map");
  assert.deepEqual(errors, []);
  console.log(
    "Five chapter routes, five rendered NPCs and dialogues, dress resonance, active magic collection and cooldown passed.",
  );
} finally {
  await browser.close();
}
