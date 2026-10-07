// Actual VRM close-ups: head coverage and shoe fit, including a moving pose.
import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
const browser = await chromium.launch({
  channel: "chromium",
  args: ["--use-angle=metal"],
});
try {
  const page = await browser.newPage({ viewport: { width: 900, height: 900 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  await page.goto(
    new URL(
      "princess-preview.html?dress=1",
      process.env.TEST_URL || "http://127.0.0.1:4173/",
    ).href,
  );
  await page.waitForFunction(() => window.__PRINCESS_PREVIEW__?.root, null, {
    timeout: 60000,
  });
  await page.evaluate(async () => {
    window.__FIT_CHECK__ = (await import("/tests/vrm-fit-checks.ts")).checkFit;
  });
  for (const category of ["hair", "shoes"]) {
    await page.evaluate(
      (category) =>
        window.__PRINCESS_PREVIEW__.setFrame(
          category === "hair" ? "head" : "feet",
        ),
      category,
    );
    for (let i = 0; i < 6; i++) {
      await page.evaluate(
        ({ category, i }) => {
          const p = window.__PRINCESS_PREVIEW__;
          p.pose(false, 0);
          p.equip(category, i);
        },
        { category, i },
      );
      const fit = await page.evaluate((category) => {
        const p = window.__PRINCESS_PREVIEW__;
        p.setAngle(0);
        return window.__FIT_CHECK__(p.root, category);
      }, category);
      assert.ok(
        fit.samples >= 20,
        `${category}-${i}: insufficient fit samples`,
      );
      assert.deepEqual(
        fit.failures,
        [],
        `${category}-${i}: skin protrudes beyond the fitted surface`,
      );
      for (const [view, angle] of [
        ["front", 0],
        ["side", 0.85],
        ["back", Math.PI],
      ]) {
        await page.evaluate(
          (angle) => window.__PRINCESS_PREVIEW__.setAngle(angle),
          angle,
        );
        await page.screenshot({
          path: `test-results/fit-${category}-${i}-${view}.png`,
        });
      }
      if (category === "shoes") {
        await page.evaluate(() => {
          const p = window.__PRINCESS_PREVIEW__;
          p.setAngle(0.85);
          p.pose(true, 0.17);
        });
        await page.screenshot({ path: `test-results/fit-shoes-${i}-step.png` });
        const movingFit = await page.evaluate(() => {
          const p = window.__PRINCESS_PREVIEW__;
          p.setAngle(0);
          return window.__FIT_CHECK__(p.root, "shoes");
        });
        assert.deepEqual(
          movingFit.failures,
          [],
          `shoes-${i}: foot protrudes while stepping`,
        );
      }
    }
  }
  // Replacing hair must not dispose textures still used by the native VRM.
  const stable = await page.evaluate(() => {
    const p = window.__PRINCESS_PREVIEW__;
    p.pose(false, 0);
    p.equip("hair", 1);
    return p.diagnostics();
  });
  for (let i = 0; i < 18; i++)
    await page.evaluate(
      (i) => window.__PRINCESS_PREVIEW__.equip("hair", i % 6),
      i,
    );
  await page.evaluate(() => window.__PRINCESS_PREVIEW__.equip("hair", 1));
  const end = await page.evaluate(() =>
    window.__PRINCESS_PREVIEW__.diagnostics(),
  );
  assert.ok(
    end.geometries <= stable.geometries + 1,
    "hair geometry grows after swapping",
  );
  assert.ok(
    end.textures <= stable.textures + 1,
    "hair textures grow after swapping",
  );
  // A single contact sheet is rendered by the browser from the unedited captures.
  const sheet = await browser.newPage({
    viewport: { width: 1500, height: 660 },
  });
  const cards = [];
  for (const category of ["hair", "shoes"])
    for (let i = 0; i < 6; i++) {
      const path = `fit-${category}-${i}-side.png`;
      const data = (await fs.readFile(`test-results/${path}`)).toString(
        "base64",
      );
      cards.push(
        `<figure><img src="data:image/png;base64,${data}"><figcaption>${category === "hair" ? "发型" : "鞋子"} ${i + 1}</figcaption></figure>`,
      );
    }
  await sheet.setContent(
    `<html lang="zh-CN"><meta charset="UTF-8"><style>body{margin:0;background:#f4eff8;color:#504265;font-family:system-ui}h1{font-size:24px;padding:18px 24px;margin:0}main{display:grid;grid-template-columns:repeat(6,1fr);gap:8px;padding:0 16px}figure{margin:0;background:#fff;border-radius:8px;overflow:hidden}img{display:block;width:100%}figcaption{text-align:center;padding:10px;font-size:16px}</style><h1>头发与鞋子适配 · 浏览器近景检查</h1><main>${cards.join("")}</main></html>`,
  );
  await sheet.screenshot({
    path: "test-results/fit-contact-sheet.png",
    fullPage: true,
  });
  assert.deepEqual(errors, []);
  console.log(
    "Six hairstyles and six shoe styles: front, side, back, step-pose captures and repeated hair swaps passed.",
  );
} finally {
  await browser.close();
}
