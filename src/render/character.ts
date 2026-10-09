import * as T from "three";
import type { VRM } from "@pixiv/three-vrm";
import { ITEM } from "../simulation/data";
import { walkFoot, solveWalkingLeg } from "./walk-cycle";
import type { Save } from "../simulation/game";
import {
  captureHairTemplate,
  createVrmHair,
  type HairTemplate,
} from "./vrm-hair";
import { createCouture } from "./couture";
import {
  createCrown,
  createWings,
  createWand,
  createShoes,
} from "./accessories";
import { loadVrmBase } from "./vrm-princess";
import { poseWandHand } from "./wand-grip";
import {
  bindGarment,
  createWardrobeRig,
  type WardrobeRig,
  type WardrobeBone,
} from "./wardrobe-rig";
import { disposeGroup } from "./dispose";
export { disposeGroup } from "./dispose";
export { material, mesh, orb } from "./modeling";

const PARTS = ["couture", "hair", "crown", "wings", "shoes", "wand"] as const;
type Part = (typeof PARTS)[number];
export const EXPRESSIONS = [
  "neutral",
  "happy",
  "relaxed",
  "surprised",
  "wink",
] as const;
export type PrincessExpression = (typeof EXPRESSIONS)[number];
interface Rig {
  vrm: VRM;
  wardrobe: WardrobeRig;
  nativeHair: T.Mesh[];
  hairTemplate: HairTemplate;
  head: T.Object3D;
  left: T.Object3D;
  parts: Partial<Record<Part, T.Group>>;
  keys: Partial<Record<Part, string>>;
  lastTime: number;
  walkPhase: number;
  walkWeight: number;
  hipRest: T.Vector3;
  legLengths: { upper: number; lower: number };
  emotion: PrincessExpression;
  bone: (name: WardrobeBone) => T.Object3D;
}

export async function createCharacter(s: Save) {
  const { root, vrm, nativeHair, skinSource } = await loadVrmBase();
  const wardrobe = createWardrobeRig(vrm);
  root.add(bindGarment(skinSource, wardrobe, "skin"));
  const bone = (name: WardrobeBone) =>
    vrm.humanoid.getNormalizedBoneNode(name)!;
  const rig: Rig = {
    vrm,
    wardrobe,
    nativeHair,
    hairTemplate: captureHairTemplate(nativeHair),
    head: bone("head"),
    left: bone("rightUpperArm"),
    parts: {},
    keys: {},
    lastTime: 0,
    walkPhase: 0,
    walkWeight: 0,
    hipRest: bone("hips").position.clone(),
    legLengths: {
      upper: wardrobe.positions.leftUpperLeg.distanceTo(
        wardrobe.positions.leftLowerLeg,
      ),
      lower: wardrobe.positions.leftLowerLeg.distanceTo(
        wardrobe.positions.leftFoot,
      ),
    },
    emotion: "neutral",
    bone,
  };
  root.userData.rig = rig;
  root.userData.vrm = vrm;
  root.userData.bones = Object.fromEntries(
    Object.entries(wardrobe.positions).map(([name, p]) => [name, p.toArray()]),
  );
  updateCharacter(root, s);
  return root;
}

function partKey(s: Save, part: Part) {
  return part === "couture"
    ? `${s.outfit.dress}|${s.dye ?? ""}`
    : s.outfit[part];
}
function buildPart(rig: Rig, part: Part, s: Save) {
  if (part === "couture") {
    const source = createCouture(
      ITEM[s.outfit.dress],
      s.dye ?? ITEM[s.outfit.dress].color,
    );
    return bindGarment(source, rig.wardrobe, "dress");
  }
  if (part === "hair") {
    const native = s.outfit.hair === "hair-0";
    rig.nativeHair.forEach((hair) => {
      hair.visible = native;
    });
    if (native) return new T.Group();
    const hair = createVrmHair(rig.hairTemplate, ITEM[s.outfit.hair]);
    return bindGarment(hair, rig.wardrobe, "hair");
  }
  if (part === "crown") {
    const crown = createCrown(ITEM[s.outfit.crown]);
    crown.scale.setScalar(0.72);
    crown.position.set(0, 3.19, -0.035);
    return bindGarment(crown, rig.wardrobe, "crown");
  }
  if (part === "wings") {
    const wings = createWings(ITEM[s.outfit.wings]);
    wings.scale.setScalar(0.88);
    wings.position.set(0, 2.3, -0.21);
    return bindGarment(wings, rig.wardrobe, "wings");
  }
  if (part === "shoes")
    return bindGarment(
      createShoes(ITEM[s.outfit.shoes], rig.wardrobe.positions),
      rig.wardrobe,
      "shoes",
    );
  const wand = createWand(ITEM[s.outfit.wand]);
  wand.applyMatrix4(rig.wardrobe.wandGrip);
  return bindGarment(wand, rig.wardrobe, "wand");
}

/** Only changed garments are rebuilt. The VRM, its bones and textures stay resident. */
export function updateCharacter(root: T.Group, s: Save) {
  const rig = root.userData.rig as Rig;
  for (const part of PARTS) {
    const key = partKey(s, part);
    if (rig.keys[part] === key) continue;
    const next = buildPart(rig, part, s);
    const old = rig.parts[part];
    if (old) {
      old.removeFromParent();
      disposeGroup(old);
    }
    root.add(next);
    rig.parts[part] = next;
    rig.keys[part] = key;
  }
  root.userData.design = {
    dress: rig.parts.couture!.userData.silhouette,
    hair: ITEM[s.outfit.hair].shape,
    crown: ITEM[s.outfit.crown].shape,
    wings: ITEM[s.outfit.wings].shape,
    wand: ITEM[s.outfit.wand].shape,
  };
}

export function animateCharacter(
  root: T.Group,
  time: number,
  moving: boolean,
  pose: number,
  lookX: number,
  lookY: number,
  happy: boolean,
  reduced = false,
  expression: PrincessExpression = "neutral",
  travelDistance?: number,
) {
  const rig = root.userData.rig as Rig;
  if (!rig) return;
  const { vrm, bone } = rig;
  if (time < rig.lastTime) {
    rig.walkPhase = 0;
    rig.walkWeight = 0;
  }
  const delta = Math.min(0.05, Math.max(0, time - rig.lastTime));
  rig.lastTime = time;
  const t = reduced ? 0 : time;
  const sway = Math.sin(t * 1.8);
  rig.walkWeight = T.MathUtils.damp(rig.walkWeight, moving ? 1 : 0, 14, delta);
  if (rig.walkWeight < 0.001) rig.walkWeight = 0;
  // Phase follows distance, so pauses and blocked input never keep marching.
  rig.walkPhase =
    (rig.walkPhase + (travelDistance ?? (moving ? delta * 2.6 : 0)) / 1.5) % 1;
  const walking = rig.walkWeight;
  const strideWave = Math.sin(rig.walkPhase * Math.PI * 2);
  const hipDrop =
    (0.1 + 0.022 * Math.cos(rig.walkPhase * Math.PI * 4)) * walking;
  bone("hips").position.copy(rig.hipRest);
  bone("hips").position.y -= hipDrop / vrm.scene.scale.y;
  bone("hips").rotation.set(
    0,
    strideWave * 0.025 * walking,
    strideWave * 0.018 * walking + (reduced ? 0 : sway * 0.008 * (1 - walking)),
  );
  bone("upperChest").rotation.set(
    0,
    -strideWave * 0.04 * walking + Math.sin(t * 0.9) * 0.009 * (1 - walking),
    0,
  );
  bone("head").rotation.set(
    lookY * -0.04,
    lookX * 0.085,
    Math.sin(t * 0.8) * 0.018,
  );
  // Normalized arms point out along X in the bind T-pose.
  bone("leftUpperArm").rotation.set(
    Math.cos(rig.walkPhase * Math.PI * 2) * 0.14 * walking,
    0,
    -1.31 + sway * 0.012,
  );
  bone("rightUpperArm").rotation.set(
    -Math.cos(rig.walkPhase * Math.PI * 2) * 0.38 * walking,
    0,
    1.31 - sway * 0.012,
  );
  bone("leftLowerArm").rotation.set(0, -0.1, 0);
  bone("rightLowerArm").rotation.set(0, 0.1, 0);
  bone("leftHand").rotation.set(0, -0.12, 0);
  bone("rightHand").rotation.set(0, 0.12, 0);
  poseWandHand(vrm);
  if (pose === 1 && !moving) {
    bone("rightUpperArm").rotation.set(0, -0.15, 0.35);
    bone("rightLowerArm").rotation.set(0, 0, -1.6 + Math.sin(t * 4) * 0.12);
    bone("head").rotation.z = -0.045;
    happy = true;
  } else if (pose === 2 && !moving) {
    bone("rightUpperArm").rotation.z = 0.97;
    bone("leftUpperArm").rotation.z = -0.97;
    bone("hips").rotation.y = Math.sin(t * 1.6) * 0.035;
  }
  const dress = Number(rig.keys.couture?.match(/dress-(\d+)/)?.[1] ?? 0);
  const stride = [
    0.32, 0.52, 0.48, 0.26, 0.52, 0.32, 0.3, 0.32, 0.44, 0.44, 0.3, 0.56, 0.36,
    0.26, 0.36,
  ][dress];
  for (const [i, side] of (["left", "right"] as const).entries()) {
    const foot = walkFoot(rig.walkPhase + i * 0.5, stride);
    const leg =
      walking > 0
        ? solveWalkingLeg(
            rig.legLengths.upper,
            rig.legLengths.lower,
            foot.z * walking,
            foot.lift * walking,
            hipDrop,
            foot.pitch * walking,
          )
        : { thigh: 0, knee: 0, ankle: 0 };
    bone(`${side}UpperLeg`).rotation.x = leg.thigh;
    bone(`${side}LowerLeg`).rotation.x = leg.knee;
    bone(`${side}Foot`).rotation.x = leg.ankle;
  }
  if (vrm.lookAt) {
    vrm.lookAt.autoUpdate = false;
    vrm.lookAt.yaw = lookX * 9;
    vrm.lookAt.pitch = -lookY * 6;
  }
  const manager = vrm.expressionManager!;
  const emotion = happy ? "happy" : expression;
  rig.emotion = emotion;
  const amount = reduced ? 1 : 1 - Math.exp(-delta * 10);
  const blink = reduced
    ? 0
    : Math.pow(Math.max(0, Math.cos(t * 1.1 + 1.1)), 38);
  for (const name of [
    "happy",
    "relaxed",
    "surprised",
    "blinkLeft",
    "aa",
  ] as const) {
    const target =
      name === "blinkLeft"
        ? emotion === "wink"
          ? 1
          : 0
        : name === "aa"
          ? emotion === "surprised"
            ? 0.16
            : 0
          : emotion === name
            ? name === "happy"
              ? 0.7
              : name === "relaxed"
                ? 0.8
                : 0.65
            : emotion === "wink" && name === "happy"
              ? 0.25
              : 0;
    manager.setValue(
      name,
      T.MathUtils.lerp(manager.getValue(name) ?? 0, target, amount),
    );
  }
  manager.setValue("blink", blink);
  vrm.update(reduced ? 0 : delta);
}

/** Re-seed spring tails after stage teleports or changes of avatar scale. */
export function resetCharacterMotion(root: T.Group) {
  const rig = root.userData.rig as Rig;
  rig.walkPhase = 0;
  rig.walkWeight = 0;
  rig.bone("hips").position.copy(rig.hipRest);
  rig.bone("hips").rotation.set(0, 0, 0);
  for (const side of ["left", "right"] as const)
    for (const joint of ["UpperLeg", "LowerLeg", "Foot"] as const)
      rig.bone(`${side}${joint}`).rotation.set(0, 0, 0);
  rig.vrm.update(0);
  root.updateMatrixWorld(true);
  rig.vrm.springBoneManager?.reset();
}

export function characterDiagnostics(root: T.Group) {
  const rig = root.userData.rig as Rig;
  const manager = rig.vrm.expressionManager!;
  return {
    model: "VRM 1.0",
    expression: rig.emotion,
    expressions: Object.fromEntries(
      ["happy", "relaxed", "surprised", "blink", "blinkLeft", "aa"].map(
        (name) => [name, manager.getValue(name)],
      ),
    ),
    wardrobeMeshes: Object.fromEntries(
      PARTS.map((part) => [part, rig.parts[part]?.children.length ?? 0]),
    ),
    walk: {
      phase: rig.walkPhase,
      weight: rig.walkWeight,
      leftThigh: rig.bone("leftUpperLeg").rotation.x,
      rightThigh: rig.bone("rightUpperLeg").rotation.x,
      leftKnee: rig.bone("leftLowerLeg").rotation.x,
      rightKnee: rig.bone("rightLowerLeg").rotation.x,
    },
    headRotation: rig.head.rotation.toArray(),
    leftArmRotation: rig.left.rotation.toArray(),
  };
}
