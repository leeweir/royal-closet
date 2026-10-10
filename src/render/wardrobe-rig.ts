import * as T from "three";
import type { VRM } from "@pixiv/three-vrm";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { wandGripMatrix } from "./wand-grip";

// All clothing uses one bind pose in character coordinates. Re-equipping
// while the avatar is turned or waving must never redefine that bind pose.
export const WARDROBE_BONES = [
  "hips",
  "spine",
  "chest",
  "upperChest",
  "neck",
  "head",
  "leftUpperArm",
  "rightUpperArm",
  "leftLowerArm",
  "rightLowerArm",
  "leftHand",
  "rightHand",
  "leftUpperLeg",
  "rightUpperLeg",
  "leftLowerLeg",
  "rightLowerLeg",
  "leftFoot",
  "rightFoot",
] as const;
export type WardrobeBone = (typeof WARDROBE_BONES)[number];
export type WardrobeRig = ReturnType<typeof createWardrobeRig>;
export function createWardrobeRig(vrm: VRM) {
  const bones = WARDROBE_BONES.map(
    (name) => vrm.humanoid.getNormalizedBoneNode(name)! as T.Bone,
  );
  const positions = Object.fromEntries(
    bones.map((bone, i) => [
      WARDROBE_BONES[i],
      bone.getWorldPosition(new T.Vector3()),
    ]),
  ) as Record<WardrobeBone, T.Vector3>;
  const skeleton = new T.Skeleton(
    bones,
    bones.map((bone) => bone.matrixWorld.clone().invert()),
  );
  const wandGrip = wandGripMatrix(
    vrm.humanoid.getNormalizedBoneNode("leftHand")!,
  );
  return { skeleton, positions, wandGrip };
}
export type GarmentBinding =
  | "dress"
  | "skin"
  | "hair"
  | "crown"
  | "wings"
  | "shoes"
  | "wand";

export function garmentWeights(
  p: T.Vector3,
  binding: GarmentBinding,
  sleeve = "",
  rig?: { positions: Record<WardrobeBone, T.Vector3> },
): [WardrobeBone, number][] {
  if ((sleeve === "arm-left" || sleeve === "arm-right") && rig) {
    // A full sleeve follows the arm: the upper arm carries it to the elbow,
    // the forearm from there to the wrist, blended across the joint.
    const side = sleeve === "arm-left" ? "right" : "left";
    const shoulder = rig.positions[`${side}UpperArm`];
    const elbow = rig.positions[`${side}LowerArm`];
    const axis = elbow.clone().sub(shoulder);
    const t = p.clone().sub(shoulder).dot(axis) / axis.lengthSq();
    const fore = T.MathUtils.smoothstep(t, 0.88, 1.08);
    const torso = 1 - T.MathUtils.smoothstep(t, -0.05, 0.12);
    return [
      ["upperChest", torso],
      [`${side}UpperArm` as WardrobeBone, (1 - torso) * (1 - fore)],
      [`${side}LowerArm` as WardrobeBone, (1 - torso) * fore],
    ];
  }
  if (binding === "hair" || binding === "crown") return [["head", 1]];
  if (binding === "wings") return [["upperChest", 1]];
  if (binding === "wand") return [["leftHand", 1]];
  if (binding === "shoes") {
    const leg = T.MathUtils.smoothstep(p.y, 0.22, 0.38);
    return [
      [p.x > 0 ? "leftFoot" : "rightFoot", 1 - leg],
      [p.x > 0 ? "leftLowerLeg" : "rightLowerLeg", leg],
    ];
  }
  if (sleeve === "trouser-left" || sleeve === "trouser-right") {
    // Trouser legs follow the thigh and shin like the skin underneath:
    // hips at the yoke, upper leg down to the knee, lower leg below it.
    const side = sleeve === "trouser-left" ? "left" : "right";
    const thigh = T.MathUtils.smoothstep(p.y, 1.62, 1.82);
    const knee = T.MathUtils.smoothstep(p.y, 0.98, 1.12);
    return [
      ["hips", thigh],
      [`${side}UpperLeg` as WardrobeBone, (1 - thigh) * knee],
      [`${side}LowerLeg` as WardrobeBone, (1 - thigh) * (1 - knee)],
    ];
  }
  if (sleeve)
    return [[sleeve === "sleeve-left" ? "rightUpperArm" : "leftUpperArm", 1]];
  if (binding === "skin" && p.y > 2.63) {
    const neck = T.MathUtils.smoothstep(p.y, 2.63, 2.74);
    return [
      ["upperChest", 1 - neck],
      ["neck", neck],
    ];
  }
  const upper = T.MathUtils.smoothstep(p.y, 1.94, 2.48);
  // Shoulder fabric and skin share the arm's joint, so raised arms do not
  // slide through stationary shoulder straps or leave an open arm socket.
  const arm =
    T.MathUtils.smoothstep(Math.abs(p.x), 0.21, 0.31) *
    T.MathUtils.smoothstep(p.y, 2.39, 2.56);
  return [
    ["hips", (1 - upper) * (1 - arm)],
    ["upperChest", upper * (1 - arm)],
    [p.x > 0 ? "leftUpperArm" : "rightUpperArm", arm],
  ];
}

/** Bake authored transforms and bind the entire garment, including ornaments. */
export function bindGarment(
  source: T.Group,
  rig: WardrobeRig,
  binding: GarmentBinding,
) {
  source.updateMatrixWorld(true);
  const result = new T.Group();
  result.name = source.name || binding;
  result.userData = { ...source.userData, binding };
  const originals = new Set<T.BufferGeometry>();
  const indices = Object.fromEntries(
    WARDROBE_BONES.map((name, index) => [name, index]),
  );
  source.traverse((object) => {
    if (!(object instanceof T.Mesh)) return;
    let parent: T.Object3D | null = object;
    let sleeve = "";
    while (parent && parent !== source) {
      if (
        parent.name.startsWith("sleeve-") ||
        parent.name.startsWith("trouser-") ||
        parent.name.startsWith("arm-")
      )
        sleeve = parent.name;
      parent = parent.parent;
    }
    originals.add(object.geometry);
    let geometry: T.BufferGeometry;
    if (object instanceof T.InstancedMesh) {
      const geometries: T.BufferGeometry[] = [];
      const matrix = new T.Matrix4();
      for (let i = 0; i < object.count; i++) {
        object.getMatrixAt(i, matrix);
        matrix.premultiply(object.matrixWorld);
        geometries.push(object.geometry.clone().applyMatrix4(matrix));
      }
      geometry = mergeGeometries(geometries, false)!;
      geometries.forEach((g) => g.dispose());
      object.dispose();
    } else geometry = object.geometry.clone().applyMatrix4(object.matrixWorld);

    const position = geometry.getAttribute("position");
    const skinIndices: number[] = [],
      skinWeights: number[] = [];
    const p = new T.Vector3();
    for (let i = 0; i < position.count; i++) {
      p.fromBufferAttribute(position, i);
      if (sleeve.startsWith("sleeve-")) {
        const side = sleeve === "sleeve-left" ? -1 : 1;
        const anchor =
          rig.positions[side < 0 ? "rightUpperArm" : "leftUpperArm"];
        p.add(new T.Vector3(anchor.x - side * 0.34, anchor.y - 2.53, anchor.z));
        position.setXYZ(i, p.x, p.y, p.z);
      }
      const weights = garmentWeights(p, binding, sleeve, rig);
      for (let j = 0; j < 4; j++) {
        skinIndices.push(indices[weights[j]?.[0] ?? "hips"]);
        skinWeights.push(weights[j]?.[1] ?? 0);
      }
    }
    geometry.setAttribute(
      "skinIndex",
      new T.Uint16BufferAttribute(skinIndices, 4),
    );
    geometry.setAttribute(
      "skinWeight",
      new T.Float32BufferAttribute(skinWeights, 4),
    );
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    const mesh = new T.SkinnedMesh(geometry, object.material);
    mesh.name = sleeve || object.name;
    mesh.castShadow = object.castShadow;
    mesh.receiveShadow = object.receiveShadow;
    mesh.renderOrder = object.renderOrder;
    mesh.frustumCulled = false;
    mesh.bind(rig.skeleton, new T.Matrix4());
    result.add(mesh);
  });
  originals.forEach((g) => g.dispose());
  return result;
}
