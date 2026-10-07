/** A stance foot travels backwards on the ground; the returning foot lifts. */
export function walkFoot(phase: number, stride: number) {
  const t = ((phase % 1) + 1) % 1;
  if (t < 0.5) return { z: stride * (1 - 4 * t), lift: 0, pitch: 0 };
  const swing = (t - 0.5) * 2;
  const ease = swing * swing * (3 - 2 * swing);
  return {
    z: stride * (ease * 2 - 1),
    lift: Math.sin(swing * Math.PI) * 0.17,
    pitch: -Math.sin(swing * Math.PI * 2) * 0.1,
  };
}
/** Sagittal two-bone IK keeps the planted sole level instead of bobbing the root. */
export function solveWalkingLeg(
  upper: number,
  lower: number,
  z: number,
  lift: number,
  drop: number,
  pitch = 0,
) {
  const down = upper + lower - drop - lift;
  const distance = Math.min(upper + lower - 0.0001, Math.hypot(down, z));
  const knee = Math.acos(
    Math.max(
      -1,
      Math.min(
        1,
        (distance * distance - upper * upper - lower * lower) /
          (2 * upper * lower),
      ),
    ),
  );
  const thigh =
    Math.atan2(-z, down) -
    Math.atan2(lower * Math.sin(knee), upper + lower * Math.cos(knee));
  return { thigh, knee, ankle: -thigh - knee + pitch };
}
