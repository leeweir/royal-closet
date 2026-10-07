import test from "node:test";
import assert from "node:assert/strict";
import { FittingRoom } from "../src/simulation/fitting";
import { freshSave } from "../src/simulation/game";

test("trying unowned sets, owned items and dye leaves the entire save untouched", () => {
  const saved = freshSave();
  saved.dye = "#83bfe0";
  saved.slots[0] = { ...saved.outfit };
  saved.slotDyes[0] = saved.dye;
  const original = structuredClone(saved);
  Object.freeze(saved.outfit);
  Object.freeze(saved);
  const room = new FittingRoom();
  assert.equal(room.tryCollection(saved, 5), true);
  assert.ok(
    Object.values(room.appearance(saved).outfit).every((id) =>
      id.endsWith("-5"),
    ),
  );
  assert.equal(room.appearance(saved).dye, null);
  room.tryItem(saved, "hair-1");
  room.dye(saved, "#eeb1c5");
  assert.equal(room.appearance(saved).outfit.hair, "hair-1");
  assert.equal(room.appearance(saved).dye, "#eeb1c5");
  assert.deepEqual(saved, original);
  room.tryItem(saved, "dress-2");
  assert.equal(room.appearance(saved).dye, null);
  assert.deepEqual(saved, original);
});

test("ending a fitting restores the latest saved appearance, not an old snapshot", () => {
  const saved = freshSave(),
    room = new FittingRoom();
  room.begin(saved);
  room.tryItem(saved, "dress-4");
  room.begin(saved); // Re-entering must not reset the ongoing preview.
  assert.equal(room.appearance(saved).outfit.dress, "dress-4");
  const snapshot = room.appearance(saved);
  snapshot.outfit.dress = "dress-3";
  assert.equal(room.appearance(saved).outfit.dress, "dress-4");
  saved.outfit.dress = "dress-1"; // A different tab updates the real save.
  saved.dye = "#83bfe0";
  room.end();
  assert.equal(room.active, false);
  assert.deepEqual(room.appearance(saved), {
    outfit: saved.outfit,
    dye: saved.dye,
  });
  room.appearance(saved).outfit.dress = "dress-5";
  assert.equal(saved.outfit.dress, "dress-1");
});

test("invalid preview choices never start or damage a fitting", () => {
  const saved = freshSave(),
    room = new FittingRoom();
  assert.equal(room.tryItem(saved, "missing-item"), false);
  assert.equal(room.tryCollection(saved, -1), false);
  assert.equal(room.tryCollection(saved, 6), false);
  assert.equal(room.dye(saved, "invalid"), false);
  assert.equal(room.active, false);
  room.tryCollection(saved, 3);
  const original = room.appearance(saved);
  assert.equal(room.tryItem(saved, "dress-99"), false);
  assert.equal(room.dye(saved, "#fff"), false);
  assert.deepEqual(room.appearance(saved), original);
});
