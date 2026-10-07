import * as T from "three";

/** Measurements against the real skinned avatar, not the old procedural body. */
export function checkFit(root: T.Group, category: "hair" | "shoes") {
  root.updateMatrixWorld(true);
  const rig = root.userData.rig;
  const skin: T.Mesh[] = [];
  rig.vrm.scene.traverse((mesh: T.Object3D) => {
    if (!(mesh instanceof T.Mesh)) return;
    const materials = Array.isArray(mesh.material)
      ? mesh.material
      : [mesh.material];
    if (materials.some((m) => m.name === "Body_00_SKIN")) skin.push(mesh);
  });
  root.traverse((o) => {
    if (o instanceof T.SkinnedMesh) {
      o.skeleton.update();
      // SkinnedMesh raycasting caches its bound; the pose has changed since
      // the previous capture, so the ray must use the current deformed bound.
      o.computeBoundingSphere();
    }
  });
  const ray = new T.Raycaster();
  if (category === "hair") {
    const hair =
      rig.keys.hair === "hair-0" ? rig.nativeHair : rig.parts.hair.children;
    const failures: { azimuth: number; elevation: number; gap: number }[] = [];
    let samples = 0;
    for (const elevation of [0, 25, 50, 70])
      for (const azimuth of [95, 120, 150, 180, 210, 240, 265]) {
        const a = (azimuth * Math.PI) / 180,
          e = (elevation * Math.PI) / 180;
        const direction = new T.Vector3(
          Math.sin(a) * Math.cos(e),
          Math.sin(e),
          Math.cos(a) * Math.cos(e),
        );
        ray.set(new T.Vector3(0, 3.0, -0.055), direction);
        const skinHit = ray
          .intersectObjects(skin, false)
          .find((hit) => hit.distance > 0.01);
        const hairHits = ray.intersectObjects(hair, false);
        if (!skinHit) continue;
        samples++;
        const cover = Math.max(0, ...hairHits.map((hit) => hit.distance));
        if (cover < skinHit.distance - 0.004)
          failures.push({ azimuth, elevation, gap: skinHit.distance - cover });
      }
    return { samples, failures };
  }
  let samples = 0;
  const failures: { point: number[]; gap: number }[] = [];
  const point = new T.Vector3();
  for (const mesh of skin) {
    const positions = mesh.geometry.getAttribute("position");
    const referenced = new Set(mesh.geometry.index!.array);
    for (const i of referenced) {
      // Forefoot skin must be enclosed by every shoe, including during a step.
      // Identify the region in bind coordinates so motion cannot hide samples.
      if (positions.getY(i) * 2.04 > 0.16 || positions.getZ(i) * 2.04 < 0.1)
        continue;
      mesh.getVertexPosition(i, point).applyMatrix4(mesh.matrixWorld);
      ray.set(
        new T.Vector3(point.x, point.y - 0.25, point.z),
        new T.Vector3(0, 1, 0),
      );
      ray.far = 0.5;
      const hits = ray.intersectObjects(rig.parts.shoes.children, false);
      const top = Math.max(-Infinity, ...hits.map((hit) => hit.point.y));
      samples++;
      if (top < point.y - 0.003)
        failures.push({ point: point.toArray(), gap: point.y - top });
    }
  }
  return { samples, failures };
}
