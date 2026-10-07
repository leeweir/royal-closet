import * as T from "three";

// Shared by the torso skin and clothes; changing a neckline cannot silently
// introduce a different body radius underneath it.
export const TORSO_PROFILE = [
  [1.7, 0.22, 0.14],
  [1.9, 0.22, 0.15],
  [2.12, 0.24, 0.17],
  [2.38, 0.276, 0.18],
  [2.5, 0.28, 0.16],
  [2.58, 0.27, 0.13],
  [2.61, 0.23, 0.115, -0.01],
  [2.645, 0.14, 0.09, -0.018],
  [2.68, 0.065, 0.06, -0.036],
  [2.76, 0.06, 0.053, -0.035],
];

export function torsoSurface(y: number, angle: number, ease = 0) {
  const next = TORSO_PROFILE.findIndex((row) => row[0] >= y);
  const i = next < 0 ? TORSO_PROFILE.length - 2 : Math.max(0, next - 1);
  const a = TORSO_PROFILE[i],
    b = TORSO_PROFILE[i + 1];
  const t = T.MathUtils.clamp((y - a[0]) / (b[0] - a[0]), 0, 1);
  return new T.Vector3(
    Math.sin(angle) * (T.MathUtils.lerp(a[1], b[1], t) + ease),
    y,
    Math.cos(angle) * (T.MathUtils.lerp(a[2], b[2], t) + ease) +
      T.MathUtils.lerp(a[3] ?? 0, b[3] ?? 0, t),
  );
}
