import * as T from "three";
import { WAND_PALM } from "../src/render/wand-grip";

export function checkWandGrip(root: T.Group) {
  root.updateMatrixWorld(true);
  const rig = root.userData.rig;
  const hand = rig.vrm.humanoid.getNormalizedBoneNode("leftHand")!;
  const center = hand.localToWorld(WAND_PALM.clone());
  const across = new T.Vector3(0, 1, 0).transformDirection(hand.matrixWorld);
  rig.parts.wand.traverse((o: T.Object3D) => {
    if (o instanceof T.SkinnedMesh) {
      o.skeleton.update();
      o.computeBoundingSphere();
    }
  });
  const ray = new T.Raycaster(
    center.clone().addScaledVector(across, 0.06),
    across.negate(),
    0,
    0.12,
  );
  const hits = ray.intersectObject(rig.parts.wand, true);
  const handBox = new T.Box3();
  for (const name of [
    "leftIndexProximal",
    "leftIndexIntermediate",
    "leftMiddleIntermediate",
    "leftLittleIntermediate",
    "leftThumbDistal",
  ])
    handBox.expandByPoint(
      rig.vrm.humanoid
        .getNormalizedBoneNode(name)
        .getWorldPosition(new T.Vector3()),
    );
  return {
    centered: handBox.expandByScalar(0.035).containsPoint(center),
    handleHit: hits.some((hit) => hit.distance > 0.025 && hit.distance < 0.09),
  };
}

export function checkBodiceFit(root: T.Group) {
  root.updateMatrixWorld(true);
  root.traverse((o) => {
    if (o instanceof T.SkinnedMesh) {
      o.skeleton.update();
      o.computeBoundingSphere();
    }
  });
  const bodice = root.getObjectByName("fitted-bodice")!;
  const skin = root.getObjectByName("fitted-body")!;
  const failures: unknown[] = [];
  let samples = 0;
  for (const y of [2.02, 2.15, 2.3, 2.42])
    for (let i = 0; i < 16; i++) {
      const a = ((i + 0.17) / 16) * Math.PI * 2;
      const direction = new T.Vector3(Math.sin(a), 0, Math.cos(a));
      const ray = new T.Raycaster(
        direction.clone().multiplyScalar(0.6).setY(y),
        direction.negate(),
      );
      const bodyHit = ray.intersectObject(skin, true)[0];
      const clothHit = ray.intersectObject(bodice, true)[0];
      samples++;
      if (
        !bodyHit ||
        !clothHit ||
        bodyHit.distance < clothHit.distance + 0.004 ||
        bodyHit.distance > clothHit.distance + 0.035
      )
        failures.push({
          y,
          angle: i,
          body: bodyHit?.distance,
          cloth: clothHit?.distance,
        });
    }
  return { samples, failures };
}
