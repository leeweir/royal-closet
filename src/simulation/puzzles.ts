export function toggleLights(lights: boolean[], index: number) {
  return lights.map((on, i) =>
    i === index || i === index - 1 || i === index + 1 ? !on : on,
  );
}
export function createLights(stage: number) {
  let lights = [true, true, true, true, true];
  for (const i of [stage % 5, (stage + 2) % 5, (stage + 4) % 5])
    lights = toggleLights(lights, i);
  return lights;
}
export function solveLights(lights: boolean[]) {
  for (let mask = 0; mask < 32; mask++) {
    let attempt = [...lights];
    const moves: number[] = [];
    for (let i = 0; i < 5; i++)
      if (mask & (1 << i)) {
        attempt = toggleLights(attempt, i);
        moves.push(i);
      }
    if (attempt.every(Boolean)) return moves;
  }
  return [];
}
export function memorySequence(stage: number) {
  return Array.from(
    { length: 3 + Math.floor(Math.min(stage, 19) / 8) },
    (_, i) => ([1, 3, 2, 0, 3][i] + stage) % 4,
  );
}
export function puzzleKind(stage: number) {
  return stage % 4 === 1 ? "lights" : stage % 4 === 2 ? "timing" : "memory";
}
