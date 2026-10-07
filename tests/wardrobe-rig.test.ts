import { test } from "node:test";
import assert from "node:assert/strict";
import * as T from "three";
import type { VRM } from "@pixiv/three-vrm";
import {
  bindGarment,
  createWardrobeRig,
  WARDROBE_BONES,
} from "../src/render/wardrobe-rig";

test("equipping a garment while the avatar is turned and posed preserves its fit", () => {
  const avatar = new T.Group();
  const humanoid = new T.Group();
  humanoid.scale.setScalar(2.04);
  avatar.add(humanoid);
  const bones = new Map(
    WARDROBE_BONES.map((name) => {
      const bone = new T.Bone();
      bone.position.set(
        name === "leftHand" ? 0.22 : 0,
        name === "head" ? 1.4 : 0.86,
        0,
      );
      humanoid.add(bone);
      return [name, bone];
    }),
  );
  avatar.updateMatrixWorld(true);
  const rig = createWardrobeRig({
    humanoid: {
      getNormalizedBoneNode: (name: (typeof WARDROBE_BONES)[number]) =>
        bones.get(name),
    },
  } as unknown as VRM);
  const makeWand = () => {
    const group = new T.Group();
    group.position.copy(rig.positions.leftHand);
    const ornaments = new T.InstancedMesh(
      new T.BoxGeometry(0.04, 0.04, 0.04),
      new T.MeshBasicMaterial(),
      3,
    );
    for (let i = 0; i < 3; i++)
      ornaments.setMatrixAt(i, new T.Matrix4().makeTranslation(0, i * 0.1, 0));
    group.add(ornaments);
    return group;
  };
  const worn = bindGarment(makeWand(), rig, "wand");
  avatar.add(worn);
  bones.get("leftHand")!.rotation.set(0.2, -0.4, 1.1);
  avatar.rotation.y = 0.65;
  avatar.position.set(-3, 0.2, 4);
  avatar.updateMatrixWorld(true);
  const swapped = bindGarment(makeWand(), rig, "wand");
  avatar.add(swapped);
  const vertices = (group: T.Group) => {
    avatar.updateMatrixWorld(true);
    rig.skeleton.update();
    const mesh = group.children[0] as T.SkinnedMesh;
    const attribute = mesh.geometry.getAttribute("position");
    return Array.from({ length: attribute.count }, (_, i) =>
      mesh
        .applyBoneTransform(
          i,
          new T.Vector3().fromBufferAttribute(attribute, i),
        )
        .applyMatrix4(mesh.matrixWorld),
    );
  };
  const compare = () => {
    const before = vertices(worn),
      after = vertices(swapped);
    assert.equal(
      after.length,
      24 * 3,
      "all three instanced ornaments are retained",
    );
    after.forEach((vertex, i) =>
      assert.ok(
        vertex.distanceTo(before[i]) < 1e-6,
        "replacement stays aligned with the posed hand",
      ),
    );
  };
  compare();
  bones.get("leftHand")!.rotation.set(0, 0, 0);
  avatar.rotation.y = 0;
  avatar.position.set(0, 0, 0);
  compare();
  rig.skeleton.dispose();
  for (const group of [worn, swapped])
    for (const child of group.children as T.SkinnedMesh[]) {
      child.geometry.dispose();
      (child.material as T.Material).dispose();
    }
});
