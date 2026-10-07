import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
const browser = await chromium.launch({
  channel: "chromium",
  args: ["--use-angle=metal"],
});
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  hasTouch: true,
});
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const diagnostics = () =>
  page.evaluate(() => window.__STARLIGHT__.diagnostics());
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const goal = (kind) => page.locator(`.adventure-goal[data-kind="${kind}"]`);
try {
  await page.goto(process.env.TEST_URL || "http://127.0.0.1:4173/");
  await page.waitForFunction(() => window.__STARLIGHT__?.diagnostics());
  await page.locator('[data-action="equip"][data-id="dress-1"]').click();
  await page.locator('[data-action="nav"][data-id="map"]').first().click();
  await page.locator('[data-action="start"][data-id="0"]').click();
  await page.waitForTimeout(400);
  const start = await diagnostics();
  await page.keyboard.down("ArrowUp");
  await page.waitForTimeout(450);
  const walking = await diagnostics();
  assert.ok(
    walking.position.z < start.position.z - 0.6,
    "up goes toward the top of the screen",
  );
  assert.ok(
    walking.camera[2] < start.camera[2] - 0.4,
    "camera follows the princess",
  );
  assert.ok(
    walking.walk.weight > 0.8 &&
      walking.walk.leftKnee > 0.1 &&
      walking.walk.rightKnee > 0.1,
    "actual skeleton walks",
  );
  const phase = walking.walk.phase;
  await page.waitForTimeout(180);
  assert.ok(
    Math.abs((await diagnostics()).walk.phase - phase) > 0.05,
    "gait advances with movement",
  );
  await page.keyboard.up("ArrowUp");
  const released = await diagnostics();
  await page.waitForTimeout(750);
  const stopped = await diagnostics();
  assert.ok(
    distance(released.position, stopped.position) < 0.02,
    "release never walks back toward the old target",
  );
  assert.equal(stopped.walk.weight, 0, "feet settle after stopping");
  await page.keyboard.down("ArrowRight");
  await page.waitForTimeout(300);
  await page.screenshot({ path: "test-results/adventure-walk-side.png" });
  await page.keyboard.up("ArrowRight");
  await page.waitForTimeout(500);
  // A direct click on the floating crystal must pick its world location,
  // rather than the floor behind it.
  const gem = await page.evaluate(() =>
    window.__STARLIGHT__
      .diagnostics()
      .points.find(
        (p) =>
          p.kind === "gem" &&
          p.visible &&
          document.elementFromPoint(p.visualX, p.visualY)?.tagName === "CANVAS",
      ),
  );
  assert.ok(gem, "an actual crystal is clickable");
  await page.mouse.click(gem.visualX, gem.visualY);
  await page.waitForFunction(
    (i) => window.__STARLIGHT__.getRun().gems.includes(i),
    gem.index,
    { timeout: 12000 },
  );
  await goal("fairy").click();
  await page.waitForTimeout(250);
  await page.locator('[aria-label="冒险帮助"]').click();
  const paused = (await diagnostics()).position;
  await page.waitForTimeout(300);
  assert.ok(distance(paused, (await diagnostics()).position) < 0.01);
  await page.locator('#modal [data-action="close"]').first().click();
  await page.waitForTimeout(400);
  assert.ok(
    distance(paused, (await diagnostics()).position) < 0.01,
    "closing a modal never resumes an old route",
  );
  await goal("fairy").click();
  await page
    .locator('[data-action="interact"][data-kind="fairy"]')
    .waitFor({ timeout: 12000 });
  await page.locator('[data-action="interact"][data-kind="fairy"]').click();
  await page.locator('[data-action="friend"][data-id="share"]').click();
  assert.ok(await page.evaluate(() => window.__STARLIGHT__.getRun().friend));
  await goal("rune").click();
  await page
    .locator('[data-action="interact"][data-kind="rune"]')
    .waitFor({ timeout: 12000 });
  await page.waitForTimeout(250);
  await page.screenshot({ path: "test-results/adventure-desktop-final.png" });
  for (const size of [
    { width: 1365, height: 700 },
    { width: 390, height: 844 },
    { width: 320, height: 740 },
    { width: 844, height: 390 },
  ]) {
    await page.setViewportSize(size);
    await page.waitForTimeout(400);
    const layout = await page.evaluate(() => {
      const rect = (e) => {
        const r = e.getBoundingClientRect();
        return {
          left: r.left,
          right: r.right,
          top: r.top,
          bottom: r.bottom,
          width: r.width,
          height: r.height,
        };
      };
      const controls = [
        ...document.querySelectorAll(
          ".adventure-goal,.dpad button,.interact-button",
        ),
      ].map(rect);
      const labels = [
        ...document.querySelectorAll(".world-label:not([hidden])"),
      ].map(rect);
      return {
        overflow:
          document.documentElement.scrollWidth > innerWidth ||
          document.documentElement.scrollHeight > innerHeight,
        controls,
        labels,
        goals: rect(document.querySelector(".adventure-goals")),
        pad: rect(document.querySelector(".adventure-controls")),
      };
    });
    assert.equal(layout.overflow, false, `${size.width}: no page scroll`);
    for (const r of layout.controls)
      assert.ok(
        r.left >= 0 &&
          r.right <= size.width &&
          r.top >= 0 &&
          r.bottom <= size.height,
        "all controls fit the viewport",
      );
    for (const r of layout.labels)
      assert.ok(
        r.top >= layout.goals.bottom && r.bottom <= layout.pad.top,
        "labels avoid the HUD",
      );
    const d = await diagnostics();
    assert.ok(
      d.avatarScreen.feetY - d.avatarScreen.headY >=
        (size.height > 500 ? 105 : 45),
      "princess remains readable",
    );
    await page.screenshot({
      path: `test-results/adventure-${size.width}-final.png`,
    });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(350);
  // Two real touch contacts: releasing one direction retains the other.
  const cdp = await context.newCDPSession(page);
  const center = async (selector) => {
    const r = await page.locator(selector).boundingBox();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  };
  const up = { ...(await center('[data-move="0,-1"]')), id: 1 };
  const right = { ...(await center('[data-move="1,0"]')), id: 2 };
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [up],
  });
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [up, right],
  });
  await page.waitForTimeout(250);
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [up],
  });
  const diagonal = (await diagnostics()).position;
  await page.waitForTimeout(300);
  const horizontal = (await diagnostics()).position;
  assert.ok(horizontal.x > diagonal.x + 0.4, "second finger retains control");
  assert.ok(
    Math.abs(horizontal.z - diagonal.z) < 0.03,
    "released finger no longer moves up",
  );
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  const ended = (await diagnostics()).position;
  await page.waitForTimeout(500);
  assert.ok(
    distance(ended, (await diagnostics()).position) < 0.02,
    "touch release stops exactly",
  );
  // Mobile walking view faces the player; no toast covers the controls.
  const down = await center('[data-move="0,1"]');
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ ...down, id: 3 }],
  });
  await page.waitForTimeout(400);
  await page.screenshot({
    path: "test-results/adventure-mobile-walk-final.png",
  });
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.keyboard.down("ArrowLeft");
  await page.waitForTimeout(300);
  assert.ok(
    (await diagnostics()).walk.weight > 0.7,
    "reduced decorative motion retains essential walking feedback",
  );
  await page.keyboard.up("ArrowLeft");
  assert.deepEqual(errors, []);
  console.log(
    "Adventure controls: keyboard release, following camera, walking/idle blend, direct crystal pick, guided interaction, pause, four viewport layouts, multi-touch release and reduced motion passed.",
  );
} finally {
  await browser.close();
}
