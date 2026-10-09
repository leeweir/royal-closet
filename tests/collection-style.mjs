// Six complete looks plus a sustained spring-bone check, in the real renderer.
import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
const browser = await chromium.launch({
  channel: "chromium",
  args: ["--use-angle=metal"],
});
try {
  const page = await browser.newPage({
    viewport: { width: 900, height: 1000 },
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(
    new URL(
      "princess-preview.html",
      process.env.TEST_URL || "http://127.0.0.1:4173/",
    ).href,
  );
  await page.waitForFunction(() => window.__PRINCESS_PREVIEW__?.root);
  const physics = await page.evaluate(async () => {
    const T = await import("/node_modules/three/build/three.module.js");
    const { animateCharacter } = await import("/src/render/character.ts");
    const root = window.__PRINCESS_PREVIEW__.root;
    const rig = root.userData.rig;
    const hairBounds = () => {
      root.updateMatrixWorld(true);
      const inverse = root.matrixWorld.clone().invert();
      const box = new T.Box3();
      const vertex = new T.Vector3();
      for (const hair of rig.nativeHair) {
        hair.skeleton?.update();
        const positions = hair.geometry.attributes.position;
        for (let i = 0; i < positions.count; i++) {
          vertex.fromBufferAttribute(positions, i);
          hair.applyBoneTransform?.(i, vertex);
          vertex.applyMatrix4(hair.matrixWorld).applyMatrix4(inverse);
          box.expandByPoint(vertex);
        }
      }
      return { min: box.min.toArray(), max: box.max.toArray() };
    };
    const initial = hairBounds();
    let peak = initial.max[1],
      lowest = initial.min[1];
    for (let frame = 1; frame <= 720; frame++) {
      const time = frame / 60;
      const moving = frame > 360;
      if (moving) {
        root.rotation.y = Math.sin((time - 6) * 0.5) * 0.4;
        root.position.x = Math.sin((time - 6) * 0.5) * 0.2;
      }
      animateCharacter(root, time, moving, 0, Math.sin(time) * 0.2, 0, false);
      if (frame % 30 === 0) {
        const box = hairBounds();
        peak = Math.max(peak, box.max[1]);
        lowest = Math.min(lowest, box.min[1]);
        if (!box.min.every(Number.isFinite) || !box.max.every(Number.isFinite))
          throw Error("Non-finite animated hair");
      }
    }
    root.position.set(0, 0, 0);
    root.rotation.set(0, 0, 0);
    root.updateMatrixWorld(true);
    rig.vrm.springBoneManager.reset();
    window.__PRINCESS_PREVIEW__.pose(false, 0);
    return { initial, peak, lowest };
  });
  assert.ok(
    physics.peak < physics.initial.max[1] + 0.12,
    `Hair lifted above scalp: ${JSON.stringify(physics)}`,
  );
  assert.ok(
    physics.lowest > physics.initial.min[1] - 0.2,
    `Hair stretched: ${JSON.stringify(physics)}`,
  );
  console.log(
    "720 animated frames, idle and turning: hair remains below the crown",
    physics,
  );
  for (let style = 0; style < 15; style++) {
    const materialTypes = await page.evaluate((style) => {
      const p = window.__PRINCESS_PREVIEW__;
      for (const category of [
        "dress",
        "hair",
        "crown",
        "wings",
        "shoes",
        "wand",
      ])
        p.equip(category, style);
      p.pose(false, 0);
      const types = [];
      for (const [part, group] of Object.entries(p.root.userData.rig.parts)) {
        group.traverse((o) => {
          if (o.isMesh)
            for (const m of Array.isArray(o.material)
              ? o.material
              : [o.material])
              types.push({ part, toon: !!m.isMToonMaterial });
        });
      }
      return types;
    }, style);
    assert.ok(materialTypes.length > 20);
    assert.deepEqual(
      materialTypes.filter((m) => !m.toon),
      [],
      `Collection ${style}: reflective surface remained`,
    );
    for (const [view, angle] of [
      ["front", 0],
      ["side", 0.7],
    ]) {
      await page.evaluate(
        (angle) => window.__PRINCESS_PREVIEW__.setAngle(angle),
        angle,
      );
      await page.screenshot({
        path: `test-results/collection-${style}-${view}.png`,
      });
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => {
    const p = window.__PRINCESS_PREVIEW__;
    for (const category of ["dress", "hair", "crown", "wings", "shoes", "wand"])
      p.equip(category, 0);
    p.setAngle(0);
    p.setFrame("full");
  });
  const header = await page.locator("header").boundingBox();
  const controls = await page.locator("nav").boundingBox();
  assert.ok(
    controls.y >= header.y + header.height + 8,
    "Mobile preview controls overlap the title",
  );
  await page.screenshot({ path: "test-results/preview-mobile-front.png" });
  await page.locator("nav button").last().click();
  assert.equal(
    await page.evaluate(() => window.__PRINCESS_PREVIEW__.diagnostics().angle),
    0.65,
  );
  await page.screenshot({ path: "test-results/preview-mobile-side.png" });
  assert.deepEqual(errors, []);
  console.log(
    "All 90 items across fifteen complete collections use toon materials; front/side screenshots saved.",
  );
} finally {
  await browser.close();
}
