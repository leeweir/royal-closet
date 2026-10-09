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
      "princess-preview.html?hair=4",
      process.env.TEST_URL || "http://127.0.0.1:4173/",
    ).href,
  );
  await page.waitForFunction(() => window.__PRINCESS_PREVIEW__?.root, null, {
    timeout: 60000,
  });
  await page.evaluate(async () => {
    window.fit = await import("/tests/wardrobe-fit-checks.ts");
  });
  for (let i = 0; i < 15; i++) {
    const result = await page.evaluate((i) => {
      const v = window.__PRINCESS_PREVIEW__;
      v.setAngle(0);
      v.pose(false, 0);
      v.equip("dress", i);
      v.setFrame("full");
      return window.fit.checkBodiceFit(v.root);
    }, i);
    assert.equal(result.samples, 64);
    assert.deepEqual(result.failures, [], `dress-${i}: body clearance`);
    for (const [view, angle] of [
      ["front", 0],
      ["side", 0.65],
      ["back", Math.PI],
    ]) {
      await page.evaluate(
        (a) => window.__PRINCESS_PREVIEW__.setAngle(a),
        angle,
      );
      await page.screenshot({
        path: `test-results/anime-dress-${i}-${view}.png`,
      });
    }
    await page.evaluate(() => {
      const v = window.__PRINCESS_PREVIEW__;
      v.setAngle(0.35);
      v.pose(false, 0, 0, 1);
    });
    await page.screenshot({ path: `test-results/anime-dress-${i}-wave.png` });
  }
  for (let i = 0; i < 15; i++) {
    await page.evaluate((i) => {
      const v = window.__PRINCESS_PREVIEW__;
      v.pose(false, 0);
      v.equip("dress", 0);
      v.equip("wand", i);
      v.setFrame("wand");
    }, i);
    for (const [view, angle] of [
      ["front", 0],
      ["side", -0.6],
    ]) {
      await page.evaluate(
        (a) => window.__PRINCESS_PREVIEW__.setAngle(a),
        angle,
      );
      assert.deepEqual(
        await page.evaluate(() =>
          window.fit.checkWandGrip(window.__PRINCESS_PREVIEW__.root),
        ),
        { centered: true, handleHit: true },
        `wand-${i}: detached grip`,
      );
      await page.screenshot({
        path: `test-results/anime-wand-${i}-${view}.png`,
      });
    }
    for (const gesture of [1, 2]) {
      const result = await page.evaluate(
        ({ i, gesture }) => {
          const v = window.__PRINCESS_PREVIEW__;
          v.pose(false, 0, 0, gesture);
          // Equipping while posed must retain the same palm anchor.
          v.equip("wand", (i + 1) % 6);
          v.equip("wand", i);
          return window.fit.checkWandGrip(v.root);
        },
        { i, gesture },
      );
      assert.deepEqual(
        result,
        { centered: true, handleHit: true },
        `wand-${i}: posed swap`,
      );
    }
  }
  const sheet = await browser.newPage({
    viewport: { width: 1320, height: 1000 },
  });
  for (const [category, title, names] of [
    [
      "dress",
      "二次元公主裙装 · 实际浏览器截图",
      [
        "月光序曲",
        "蔷薇来信",
        "森之精灵",
        "冰湖圆舞曲",
        "星夜咏叹",
        "晨曦加冕",
      ],
    ],
    [
      "wand",
      "六款魔杖 · 实际握持近景",
      ["星愿魔杖", "玫瑰手杖", "森林枝语", "冰晶法杖", "月轮之杖", "太阳权杖"],
    ],
  ]) {
    const cards = [];
    for (let i = 0; i < 15; i++) {
      const data = (
        await fs.readFile(`test-results/anime-${category}-${i}-front.png`)
      ).toString("base64");
      cards.push(
        `<figure><img src="data:image/png;base64,${data}"><figcaption>${names[i]}</figcaption></figure>`,
      );
    }
    await sheet.setContent(
      `<html lang="zh-CN"><meta charset="UTF-8"><style>body{margin:0;background:#f5eff9;color:#504265;font-family:system-ui}h1{font-size:24px;padding:18px 24px;margin:0}main{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;padding:0 16px 16px}figure{margin:0;background:#fff;border-radius:8px;overflow:hidden}img{display:block;width:100%}figcaption{text-align:center;padding:8px;font-size:17px}</style><h1>${title}</h1><main>${cards.join("")}</main></html>`,
    );
    await sheet.screenshot({
      path: `test-results/anime-${category}-sheet.png`,
      fullPage: true,
    });
  }
  assert.deepEqual(errors, []);
  console.log(
    "Six bodices: 384 skin-clearance samples passed. Six wands: front/side grip checks and posed swaps passed. Browser screenshots saved.",
  );
} finally {
  await browser.close();
}
