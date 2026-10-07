/** Ground movement is independent of the render graph and frame rate. */
export const WALK_SPEED = 2.6;
export const WALK_RADIUS = 7.8;
export type GroundPoint = { x: number; z: number };
export function clampGround(point: GroundPoint): GroundPoint {
  const length = Math.hypot(point.x, point.z);
  const scale = length > WALK_RADIUS ? WALK_RADIUS / length : 1;
  return { x: point.x * scale, z: point.z * scale };
}
export function advanceGround(
  position: GroundPoint,
  target: GroundPoint,
  axis: GroundPoint,
  dt: number,
  speed = WALK_SPEED,
) {
  const manual = Math.hypot(axis.x, axis.z) > 0;
  const direction = manual
    ? axis
    : { x: target.x - position.x, z: target.z - position.z };
  const length = Math.hypot(direction.x, direction.z);
  const distance = Math.min(
    speed * Math.max(0, dt),
    manual ? Infinity : length,
  );
  const next =
    length > 0.015
      ? clampGround({
          x: position.x + (direction.x / length) * distance,
          z: position.z + (direction.z / length) * distance,
        })
      : { ...position };
  const traveled = Math.hypot(next.x - position.x, next.z - position.z);
  return {
    position: next,
    // Manual input owns its endpoint, including the last frame before release.
    target: manual ? { ...next } : target,
    distance: traveled,
    heading:
      traveled > 0.0001
        ? Math.atan2(next.x - position.x, next.z - position.z)
        : null,
  };
}
