import test from "node:test";
import assert from "node:assert/strict";
import * as T from "three";
import { ITEM, SET_COUNT } from "../src/simulation/data";
import { createHair } from "../src/render/hair";
import { disposeGroup } from "../src/render/character";

test("every hairstyle covers the rear scalp continuously from side and back views", () => {
  for (let style = 0; style < SET_COUNT; style++) {
    const hair = createHair(ITEM[`hair-${style}`]);
    hair.updateMatrixWorld(true);
    for (const y of [0.12, 0, -0.14])
      for (const degrees of [91, 120, 150, 180, 210, 240, 269]) {
        const a = (degrees * Math.PI) / 180,
          origin = new T.Vector3(Math.sin(a) * 0.9, y, Math.cos(a) * 0.9);
        const ray = new T.Raycaster(
          origin,
          new T.Vector3(-origin.x, 0, -origin.z).normalize(),
        );
        const hit = ray.intersectObject(hair, true)[0];
        assert.ok(
          hit && hit.distance < 0.65,
          `hair-${style}: exposed scalp at ${degrees} degrees / y=${y}`,
        );
      }
    hair.traverse((o) => {
      if (o instanceof T.Mesh)
        for (const key of ["position", "normal"])
          assert.ok(
            Array.from(o.geometry.getAttribute(key).array).every(
              Number.isFinite,
            ),
          );
    });
    disposeGroup(hair);
  }
});
