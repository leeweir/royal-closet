import test from "node:test";
import assert from "node:assert/strict";
import * as T from "three";
import { MToonMaterial } from "@pixiv/three-vrm";
import { ITEM } from "../src/simulation/data";
import { createWand } from "../src/render/accessories";
import { disposeGroup } from "../src/render/dispose";
import { WAND_PALM, wandGripMatrix } from "../src/render/wand-grip";

test("all six wands put the solid grip at the same origin", () => {
  for (let i = 0; i < 6; i++) {
    const wand = createWand(ITEM[`wand-${i}`]);
    wand.updateMatrixWorld(true);
    const ray = new T.Raycaster(
      new T.Vector3(0.05, 0, 0),
      new T.Vector3(-1, 0, 0),
    );
    const hits = ray.intersectObject(wand, true);
    assert.ok(
      hits.some((hit) => hit.distance > 0.025 && hit.distance < 0.05),
      "grip is displaced from its anchor",
    );
    wand.traverse((o) => {
      if (!(o instanceof T.Mesh)) return;
      assert.ok(o.material instanceof MToonMaterial);
      assert.equal(
        o.material.transparent,
        false,
        "crystal must not disappear or sort behind its frame",
      );
    });
    disposeGroup(wand);
  }
});

test("wand emblems face forward independently of the hand roll", () => {
  const hand = new T.Object3D();
  hand.position.set(0.42, 2, 0.4);
  hand.scale.setScalar(2.04);
  hand.rotation.set(-1.2, -0.4, -0.6);
  hand.updateMatrixWorld(true);
  const matrix = wandGripMatrix(hand);
  assert.ok(
    new T.Vector3()
      .setFromMatrixPosition(matrix)
      .distanceTo(hand.localToWorld(WAND_PALM.clone())) < 1e-6,
  );
  const forward = new T.Vector3(0, 0, 1).transformDirection(matrix);
  assert.ok(forward.z > 0.8, "ornament becomes edge-on in the front view");
  const up = new T.Vector3(0, 1, 0).transformDirection(matrix);
  assert.ok(
    up.distanceTo(new T.Vector3(0, 0, 1).transformDirection(hand.matrixWorld)) <
      1e-6,
  );
});
