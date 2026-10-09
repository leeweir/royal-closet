import test from "node:test";
import assert from "node:assert/strict";
import {
  freshSave,
  createRun,
  collect,
  finishRun,
  nextStage,
  regionUnlocked,
  craft,
  equip,
  contest,
  styleScore,
  claim,
  login,
  refreshDay,
  validateSave,
  exchange,
} from "../src/simulation/game.ts";
import { ITEMS, SET_COUNT, categories } from "../src/simulation/data.ts";
function completedRun(s: ReturnType<typeof freshSave>, stage = 0) {
  const run = createRun(s, stage)!;
  assert.ok(run);
  for (let i = 0; i < 5; i++) collect(run, i);
  run.puzzle = true;
  run.friend = true;
  run.choice = "share";
  return run;
}
test("starter wardrobe has 12 valid items and all six equipped categories", () => {
  const s = freshSave();
  assert.equal(s.owned.length, 12);
  assert.equal(Object.keys(s.outfit).length, 6);
  assert.ok(Object.values(s.outfit).every((id) => s.owned.includes(id)));
  assert.equal(ITEMS.length, categories.length * SET_COUNT);
});
test("locked items cannot be equipped or crafted early", () => {
  const s = freshSave();
  s.coins = 10000;
  s.thread = 1000;
  assert.equal(equip(s, "dress-5"), false);
  assert.equal(craft(s, "dress-5"), false);
  assert.equal(createRun(s, 1), null);
  assert.equal(createRun(s, -1), null);
  assert.equal(createRun(s, 0.5), null);
});
test("all adventure objectives are required before settlement", () => {
  const s = freshSave(),
    run = createRun(s, 0)!;
  const before = structuredClone(s);
  for (let i = 0; i < 5; i++) collect(run, i);
  assert.equal(finishRun(s, run), null);
  run.puzzle = true;
  assert.equal(finishRun(s, run), null);
  assert.deepEqual(s, before);
});
test("collection and settlement are idempotent", () => {
  const s = freshSave(),
    run = completedRun(s);
  assert.equal(collect(run, 0), false);
  assert.equal(collect(run, 5), false);
  const reward = finishRun(s, run)!;
  assert.equal(reward.coins, 200);
  assert.equal(reward.thread, 6);
  const after = structuredClone(s);
  assert.equal(finishRun(s, run), null);
  assert.equal(collect(run, 0), false);
  assert.deepEqual(s, after);
});
test("campaign unlocks sequentially through all 20 stages and opens endless replay", () => {
  const s = freshSave();
  for (let stage = 0; stage < 20; stage++) {
    assert.equal(nextStage(s), stage);
    assert.ok(finishRun(s, completedRun(s, stage)));
  }
  assert.equal(nextStage(s), 20);
  assert.equal(s.completed.length, 20);
  assert.equal(regionUnlocked(s), 4);
  assert.ok(finishRun(s, completedRun(s, 20)));
  assert.equal(s.completed.length, 20);
  assert.equal(s.totalExplores, 21);
});
test("replaying a stage yields materials without duplicating first-clear bonuses", () => {
  const s = freshSave();
  const first = finishRun(s, completedRun(s))!;
  const repeat = finishRun(s, completedRun(s))!;
  assert.equal(first.coins - repeat.coins, 100);
  assert.equal(first.gems - repeat.gems, 12);
  assert.equal(s.completed.length, 1);
  assert.equal(s.totalExplores, 2);
});
test("crafting deducts exact costs once and new items can be equipped", () => {
  const s = freshSave();
  for (let i = 0; i < 4; i++) finishRun(s, completedRun(s, i));
  const item = ITEMS.find((i) => i.id === "dress-2")!;
  const coins = s.coins,
    thread = s.thread;
  assert.equal(craft(s, item.id), true);
  assert.equal(s.coins, coins - item.cost);
  assert.equal(s.thread, thread - item.material);
  assert.equal(craft(s, item.id), false);
  assert.equal(equip(s, item.id), true);
  assert.equal(s.outfit.dress, item.id);
});
test("every item can be crafted after progression without negative resources", () => {
  const s = freshSave();
  s.coins = 100000;
  s.thread = 10000;
  for (let i = 0; i < 20; i++) finishRun(s, completedRun(s, i));
  for (const item of ITEMS)
    if (!s.owned.includes(item.id)) assert.equal(craft(s, item.id), true);
  assert.equal(s.owned.length, ITEMS.length);
  assert.ok(s.coins >= 0 && s.thread >= 0);
});
test("insufficient materials never partially debit currencies", () => {
  const s = freshSave();
  s.completed = [0, 1, 2, 3];
  s.thread = 0;
  const before = structuredClone(s);
  assert.equal(craft(s, "dress-2"), false);
  assert.deepEqual(s, before);
});
test("style match increases score, each daily theme pays once", () => {
  const s = freshSave();
  assert.ok(styleScore(s, "梦幻") > styleScore(s, "自然"));
  const first = contest(s, 3, "梦幻");
  assert.equal(first.first, true);
  assert.equal(first.score, 96);
  const coins = s.coins;
  assert.equal(contest(s, 3, "梦幻").first, false);
  assert.equal(s.coins, coins);
  assert.equal(contest(s, 1, "甜美").first, true);
});
test("daily and achievement claims only pay once after completion", () => {
  const s = freshSave();
  assert.equal(claim(s, "explore", true), false);
  finishRun(s, completedRun(s));
  finishRun(s, completedRun(s));
  assert.equal(claim(s, "explore", true), true);
  const coins = s.coins;
  assert.equal(claim(s, "explore", true), false);
  assert.equal(s.coins, coins);
  assert.equal(claim(s, "first", false), true);
  assert.equal(claim(s, "first", false), false);
});
test("login streak handles repeats, rollover, and missed dates", () => {
  const s = freshSave();
  assert.equal(login(s, "2026-10-07"), true);
  const coins = s.coins;
  assert.equal(login(s, "2026-10-07"), false);
  assert.equal(s.coins, coins);
  login(s, "2026-10-08");
  assert.equal(s.streak, 2);
  login(s, "2026-10-10");
  assert.equal(s.streak, 1);
  for (let d = 11; d <= 17; d++) login(s, `2026-10-${d}`);
  assert.equal(s.streak, 1);
});
test("daily refresh does not clear lifetime progression", () => {
  const s = freshSave();
  s.totalExplores = 10;
  s.daily.explores = 2;
  s.daily.claimed = ["explore"];
  refreshDay(s, "2030-01-01");
  assert.equal(s.daily.explores, 0);
  assert.equal(s.daily.claimed.length, 0);
  assert.equal(s.totalExplores, 10);
});
test("save roundtrip preserves progress; invalid imports reject before mutation", () => {
  const s = freshSave();
  finishRun(s, completedRun(s));
  assert.deepEqual(validateSave(JSON.parse(JSON.stringify(s))), s);
  for (const patch of [
    { coins: -5 },
    { xp: Infinity },
    { owned: ["bad"] },
    { outfit: { dress: "dress-5" } },
    { slots: [{}, null, null] },
    { dye: "<script>" },
    { daily: null },
    { completed: [20] },
  ])
    assert.throws(() => validateSave({ ...s, ...patch }));
  assert.equal(s.coins, 560);
});
test("star crystal exchange uses earned currency and is atomic", () => {
  const s = freshSave();
  assert.equal(exchange(s), true);
  assert.equal(s.gems, 10);
  assert.equal(s.thread, 16);
  const before = structuredClone(s);
  assert.equal(exchange(s), false);
  assert.deepEqual(s, before);
});
import {
  createLights,
  solveLights,
  toggleLights,
  memorySequence,
  puzzleKind,
} from "../src/simulation/puzzles.ts";
test("each chapter light puzzle has a verifiable solution and memory challenges vary", () => {
  for (let stage = 0; stage <= 20; stage++) {
    let lights = createLights(stage);
    assert.equal(lights.every(Boolean), false);
    const moves = solveLights(lights);
    assert.ok(moves.length);
    for (const m of moves) lights = toggleLights(lights, m);
    assert.ok(lights.every(Boolean));
    const memory = memorySequence(stage);
    assert.ok(memory.length >= 3 && memory.length <= 5);
    assert.ok(memory.every((n) => n >= 0 && n < 4));
  }
  assert.equal(puzzleKind(1), "lights");
  assert.equal(puzzleKind(2), "timing");
  assert.notDeepEqual(memorySequence(0), memorySequence(3));
});
import { adventureBonus } from "../src/simulation/game.ts";
test("regional outfit affinity adds earned adventure coins and thread", () => {
  const s = freshSave();
  assert.deepEqual(adventureBonus(s, 0), { matches: 0, coins: 0, thread: 0 });
  assert.deepEqual(adventureBonus(s, 3), { matches: 6, coins: 48, thread: 3 });
  s.completed = Array.from({ length: 12 }, (_, i) => i);
  const r = finishRun(s, completedRun(s, 12));
  assert.equal(r.bonus.coins, 48);
  assert.equal(r.coins, 338);
  assert.equal(r.thread, 12);
});
import { repairSave } from "../src/simulation/game.ts";
test("stored saves are repaired instead of discarded when items change", () => {
  const s = freshSave();
  s.coins = 999;
  s.completed = [0, 1];
  const raw = JSON.parse(JSON.stringify(s));
  raw.owned.push("dress-retired");
  raw.outfit.hair = "hair-retired";
  raw.slots[1] = { ...s.outfit, wand: "wand-retired" };
  raw.slotDyes = ["#ffffff", "#000000", null];
  raw.completed.push(99);
  raw.daily = null;
  const fixed = repairSave(raw);
  assert.equal(fixed.coins, 999);
  assert.deepEqual(fixed.completed, [0, 1]);
  assert.equal(fixed.outfit.hair, "hair-0");
  assert.ok(!fixed.owned.includes("dress-retired"));
  assert.equal(fixed.slots[1], null);
  assert.deepEqual(fixed.slotDyes, [null, null, null]);
  assert.equal(typeof fixed.daily.date, "string");
  assert.throws(() => repairSave({ ...raw, version: 99 }));
  assert.throws(() => repairSave("not a save"));
});
