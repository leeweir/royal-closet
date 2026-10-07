import { test } from "node:test";
import assert from "node:assert/strict";
import {
  advanceGround,
  WALK_RADIUS,
  WALK_SPEED,
} from "../src/simulation/locomotion";
import { walkFoot, solveWalkingLeg } from "../src/render/walk-cycle";

test("manual release stays at its last endpoint without a backward step", () => {
  const movement = advanceGround(
    { x: 0, z: 6 },
    { x: 0, z: 6 },
    { x: 0, z: -1 },
    0.1,
  );
  const stopped = advanceGround(
    movement.position,
    movement.target,
    { x: 0, z: 0 },
    0.1,
  );
  assert.deepEqual(stopped.position, movement.position);
  assert.equal(stopped.distance, 0);
});
test("diagonal input, tap arrival and frame rates use the same ground speed", () => {
  const step = advanceGround(
    { x: 0, z: 0 },
    { x: 0, z: 0 },
    { x: 1, z: 1 },
    0.1,
  );
  assert.ok(Math.abs(step.distance - WALK_SPEED * 0.1) < 1e-8);
  assert.deepEqual(
    advanceGround({ x: 0, z: 0 }, { x: 0.02, z: 0 }, { x: 0, z: 0 }, 0.1)
      .position,
    { x: 0.02, z: 0 },
  );
  for (const fps of [30, 60, 120]) {
    let p = { x: 0, z: 0 };
    for (let i = 0; i < fps; i++)
      p = advanceGround(p, { x: 0, z: 6 }, { x: 0, z: 0 }, 1 / fps).position;
    assert.ok(Math.abs(p.z - WALK_SPEED) < 1e-8);
  }
});
test("the circular playfield contains corners and stops motion at the edge", () => {
  const p = advanceGround({ x: 5, z: 5 }, { x: 0, z: 0 }, { x: 1, z: 1 }, 1);
  assert.ok(Math.hypot(p.position.x, p.position.z) <= WALK_RADIUS + 1e-8);
  const stopped = advanceGround(p.position, p.target, { x: 1, z: 1 }, 0.1);
  assert.ok(stopped.distance < 1e-8);
});
test("alternating planted feet stay level and lifted feet bend at the knee", () => {
  for (let i = 0; i < 32; i++) {
    const phase = i / 32;
    const left = walkFoot(phase, 0.52),
      right = walkFoot(phase + 0.5, 0.52);
    assert.ok(left.lift < 1e-8 || right.lift < 1e-8);
    for (const foot of [left, right]) {
      const leg = solveWalkingLeg(
        0.86,
        0.83,
        foot.z,
        foot.lift,
        0.12,
        foot.pitch,
      );
      const y =
        -0.86 * Math.cos(leg.thigh) - 0.83 * Math.cos(leg.thigh + leg.knee);
      const z =
        -0.86 * Math.sin(leg.thigh) - 0.83 * Math.sin(leg.thigh + leg.knee);
      assert.ok(Math.abs(y - (-1.69 + 0.12 + foot.lift)) < 1e-6);
      assert.ok(Math.abs(z - foot.z) < 1e-6);
      assert.ok(Math.abs(leg.thigh + leg.knee + leg.ankle - foot.pitch) < 1e-8);
    }
  }
});
