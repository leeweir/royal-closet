import * as T from "three";
import type { VRM, VRMHumanBoneName } from "@pixiv/three-vrm";

/** A relaxed bent elbow brings the prop in front of the skirt and wing. */
export function poseWandHand(vrm: VRM) {
  const rotate = (name: VRMHumanBoneName, x: number, y: number, z: number) =>
    vrm.humanoid.getNormalizedBoneNode(name)?.rotation.set(x, y, z);
  rotate("leftLowerArm", 0, -1.05, 0);
  rotate("leftHand", -0.5, -0.4, 0);
  for (const finger of ["Index", "Middle", "Ring", "Little"])
    for (const [joint, curl] of [
      ["Proximal", -1.05],
      ["Intermediate", -1.35],
      ["Distal", -0.6],
    ] as const)
      rotate(`left${finger}${joint}` as VRMHumanBoneName, 0, 0, curl);
  rotate("leftThumbMetacarpal", 0.3, 0.4, -0.2);
  rotate("leftThumbProximal", 0, 0.65, -0.25);
  rotate("leftThumbDistal", 0, 0.55, 0);
}

// Coordinates in the normalized hand frame (VRM units), inside the curled palm.
export const WAND_PALM = new T.Vector3(0.075, -0.024, 0.002);

export function wandGripMatrix(hand: T.Object3D) {
  const position = hand.localToWorld(WAND_PALM.clone());
  const up = new T.Vector3(0, 0, 1).transformDirection(hand.matrixWorld);
  // Grip along the palm's opening, with the emblem facing the avatar's front.
  // Carrying the hand's roll into the ornament left stars and crescents edge-on.
  const right = new T.Vector3()
    .crossVectors(
      up,
      Math.abs(up.z) > 0.99 ? new T.Vector3(0, 1, 0) : new T.Vector3(0, 0, 1),
    )
    .normalize();
  const front = new T.Vector3().crossVectors(right, up).normalize();
  const orientation = new T.Quaternion().setFromRotationMatrix(
    new T.Matrix4().makeBasis(right, up, front),
  );
  return new T.Matrix4().compose(position, orientation, new T.Vector3(1, 1, 1));
}
