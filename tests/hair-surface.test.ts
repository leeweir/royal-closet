import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as T from "three";
import { refineHairSurface } from "../src/render/hair-surface";

// Use the shipped VRM, including the original joint weights and UV topology.
const file = readFileSync(
  new URL("../public/models/princess-base.vrm", import.meta.url),
);
const jsonSize = file.readUInt32LE(12);
const gltf = JSON.parse(file.subarray(20, 20 + jsonSize).toString());
const binary = file.subarray(28 + jsonSize);
const primitive = gltf.meshes.find(
  (mesh: { name: string }) => mesh.name === "Hair",
).primitives[0];
const source = new T.BufferGeometry();
function attribute(id: number) {
  const a = gltf.accessors[id],
    view = gltf.bufferViews[a.bufferView];
  const size = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[
    a.type as "SCALAR" | "VEC2" | "VEC3" | "VEC4"
  ];
  const Type =
    a.componentType === 5126
      ? Float32Array
      : a.componentType === 5125
        ? Uint32Array
        : Uint16Array;
  const start = (view.byteOffset ?? 0) + (a.byteOffset ?? 0);
  const bytes = binary.subarray(
    start,
    start + a.count * size * Type.BYTES_PER_ELEMENT,
  );
  return new T.BufferAttribute(
    new Type(
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    ),
    size,
  );
}
for (const [key, name] of Object.entries({
  POSITION: "position",
  TEXCOORD_0: "uv",
  JOINTS_0: "skinIndex",
  WEIGHTS_0: "skinWeight",
}))
  source.setAttribute(name, attribute(primitive.attributes[key]));
source.setIndex(attribute(primitive.indices));

test("long VRM locks have continuous tangents across the former chest cutoff", () => {
  const result = refineHairSurface(source, 0, 2.04);
  const p = result.getAttribute("position"),
    uv = result.getAttribute("uv");
  const center = (i: number) =>
    new T.Vector3()
      .fromBufferAttribute(p, i)
      .add(new T.Vector3().fromBufferAttribute(p, i + 8))
      .multiplyScalar(1.02);
  let samples = 0,
    maximum = 0;
  for (let i = 9; i + 17 < p.count; i += 9) {
    // Each strip has nine columns; a UV reset starts the next strand.
    if (uv.getY(i - 9) >= uv.getY(i) || uv.getY(i) >= uv.getY(i + 9)) continue;
    const point = center(i);
    if (point.y < 2.4 || point.y > 2.85 || point.z < 0.075) continue;
    const before = point.clone().sub(center(i - 9));
    const after = center(i + 9).sub(point);
    maximum = Math.max(maximum, T.MathUtils.radToDeg(before.angleTo(after)));
    samples++;
  }
  assert.ok(
    samples > 100,
    "measure the actual front locks, not just the fringe",
  );
  assert.ok(
    maximum < 8,
    `visible corner in a front lock: ${maximum.toFixed(2)} degrees`,
  );
  result.dispose();
});

test("short styles trim long strands at the jaw and keep finite geometry and skin weights", () => {
  const original = Array.from(source.getAttribute("position").array);
  for (const style of [1, 2, 4]) {
    const result = refineHairSurface(source, style, 2.04);
    assert.ok(result.userData.trimmedStrands > 20);
    const p = result.getAttribute("position"),
      w = result.getAttribute("skinWeight");
    for (const name of ["position", "normal", "uv", "skinWeight"])
      assert.ok(
        Array.from(result.getAttribute(name).array).every(Number.isFinite),
      );
    for (let i = 0; i < p.count; i++) {
      assert.ok(
        p.getY(i) * 2.04 > (style === 4 ? 2.7 : 2.77),
        "a compressed long tail remains below the haircut",
      );
      const sum = w.getX(i) + w.getY(i) + w.getZ(i) + w.getW(i);
      assert.ok(
        Math.abs(sum - 1) < 1e-5,
        "spring-bone weights lost during resampling",
      );
    }
    result.dispose();
  }
  assert.deepEqual(Array.from(source.getAttribute("position").array), original);
});
