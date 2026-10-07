import { test } from "node:test";
import assert from "node:assert/strict";
import {
  COLLECTIONS,
  REGION_STORIES,
  equipCollection,
  stageLayout,
  adventureAbilities,
} from "../src/simulation/adventure";
import { freshSave, contest } from "../src/simulation/game";
import { advanceGround, WALK_RADIUS } from "../src/simulation/locomotion";

test("all twenty layouts are distinct, reachable, and keep objectives separated", () => {
  const signatures = new Set<string>();
  for (let stage = 0; stage < 20; stage++) {
    const l = stageLayout(stage);
    const points = [l.spawn, ...l.gems, l.npc, l.rune, l.portal];
    for (const p of points) assert.ok(Math.hypot(p.x, p.z) < WALK_RADIUS);
    for (let a = 0; a < points.length; a++)
      for (let b = a + 1; b < points.length; b++)
        assert.ok(
          Math.hypot(points[a].x - points[b].x, points[a].z - points[b].z) >
            1.6,
          `stage ${stage}, ${a}/${b} overlaps`,
        );
    signatures.add(JSON.stringify(l.gems));
  }
  assert.equal(signatures.size, 20);
  assert.equal(new Set(REGION_STORIES.map((s) => s.npc.kind)).size, 5);
  assert.equal(new Set(REGION_STORIES.flatMap((s) => s.stages)).size, 20);
});
test("a collection equips all six pieces atomically and preserves locked items", () => {
  const save = freshSave();
  save.dye = "#abcdef";
  assert.ok(equipCollection(save, 1));
  assert.deepEqual(
    Object.values(save.outfit).sort(),
    [...COLLECTIONS[1].items].sort(),
  );
  assert.equal(save.dye, null);
  const before = structuredClone(save);
  assert.equal(equipCollection(save, 2), false);
  assert.equal(equipCollection(save, -1), false);
  assert.deepEqual(save, before);
  save.owned.push(...COLLECTIONS[2].items);
  assert.ok(equipCollection(save, 2));
});
test("equipped shoes and wings change real traversal and collection values", () => {
  const save = freshSave();
  const initial = adventureAbilities(save.outfit, 0);
  save.outfit.shoes = "shoes-4";
  save.outfit.wings = "wings-4";
  const stronger = adventureAbilities(save.outfit, 0);
  assert.ok(stronger.pickupRadius > initial.pickupRadius);
  const walk = (speed: number) =>
    advanceGround({ x: 0, z: 0 }, { x: 0, z: 0 }, { x: 1, z: 0 }, 0.5, speed);
  assert.ok(walk(stronger.speed).distance > walk(initial.speed).distance * 1.2);
});
test("dress resonance changes magic range and cooldown only in matching regions", () => {
  const save = freshSave();
  save.outfit.dress = "dress-2";
  const forest = adventureAbilities(save.outfit, 0),
    garden = adventureAbilities(save.outfit, 1);
  assert.ok(forest.resonance);
  assert.equal(garden.resonance, false);
  assert.ok(Math.abs(forest.spellRadius - garden.spellRadius - 0.6) < 1e-8);
  assert.equal(garden.cooldown - forest.cooldown, 2);
});
test("runway judges the presented outfit and does not pay twice for replay", () => {
  const save = freshSave();
  const worn = { ...save.outfit };
  equipCollection(save, 1);
  const initial = save.coins;
  const result = contest(save, 0, "梦幻", worn);
  assert.ok(result.score >= 85);
  assert.equal(save.coins - initial, Math.floor(result.score * 1.5));
  const rewarded = save.coins;
  assert.equal(contest(save, 0, "梦幻", worn).first, false);
  assert.equal(save.coins, rewarded);
});
