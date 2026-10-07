import * as T from "three";
import { mesh, batchGroup } from "./modeling";
import { toon } from "./toon";
import { REGION_STORIES, type GroundPoint } from "../simulation/adventure";

/** Small storybook companions with different silhouettes, faces and props. */
export function createCompanion(region: number) {
  const story = REGION_STORIES[region];
  const root = new T.Group();
  root.name = `companion-${story.npc.kind}`;
  const colors = new Map<string, T.Material>();
  const mat = (color: string) => {
    let m = colors.get(color);
    if (!m) {
      m = toon(color, "companion");
      colors.set(color, m);
    }
    return m;
  };
  const ball = (
    color: string,
    x: number,
    y: number,
    z: number,
    sx: number,
    sy = sx,
    sz = sx,
  ) => {
    const m = mesh(new T.SphereGeometry(1, 20, 14), mat(color), root, x, y, z);
    m.scale.set(sx, sy, sz);
    return m;
  };
  const white = "#fff3e1",
    dark = "#4b4263",
    pink = "#eeadc1",
    accent = story.npc.color;
  if (region === 0) {
    ball(white, 0, 0.82, 0, 0.25);
    ball(accent, 0, 0.41, 0, 0.22, 0.3, 0.18);
    for (const s of [-1, 1]) {
      const wing = ball("#e8c7f1", s * 0.4, 0.55, -0.1, 0.35, 0.19, 0.06);
      wing.rotation.z = s * 0.45;
      ball(white, s * 0.23, 0.36, 0.08, 0.07, 0.18, 0.07);
    }
    mesh(new T.ConeGeometry(0.27, 0.24, 5), mat("#b7d399"), root, 0, 1.1, 0);
  } else if (region === 1) {
    ball(white, 0, 0.74, 0, 0.3);
    ball(accent, 0, 0.3, 0, 0.25, 0.32, 0.2);
    for (const s of [-1, 1]) {
      const ear = ball(white, s * 0.14, 1.14, 0, 0.09, 0.34, 0.08);
      ear.rotation.z = -s * 0.16;
      ball(pink, s * 0.14, 1.14, 0.07, 0.045, 0.24, 0.02);
      ball(white, s * 0.17, 0.08, 0.12, 0.15, 0.09, 0.2);
    }
    mesh(
      new T.BoxGeometry(0.34, 0.09, 0.07),
      mat("#b87593"),
      root,
      0,
      0.49,
      0.23,
    );
    ball("#fff9ef", 0.33, 0.4, 0.18, 0.12, 0.12, 0.12);
  } else if (region === 2) {
    ball("#bbddf0", 0, 0.05, 0, 0.7, 0.14, 0.45);
    ball("#fff4da", 0, 0.18, 0.03, 0.14);
    ball("#8fc8c4", 0, 0.36, 0, 0.22, 0.36, 0.2);
    ball(white, 0, 0.85, 0, 0.25);
    ball(accent, 0, 0.98, -0.07, 0.29, 0.24, 0.23);
    for (const s of [-1, 1]) {
      const fin = ball("#8fd8cf", s * 0.22, 0.05, 0.08, 0.26, 0.07, 0.15);
      fin.rotation.z = s * 0.28;
      ball(white, s * 0.24, 0.6, 0.04, 0.07, 0.16, 0.07);
    }
    ball("#fff0c4", -0.22, 1.06, 0.12, 0.08);
  } else if (region === 3) {
    ball(white, 0, 0.68, 0, 0.3, 0.27, 0.24);
    ball("#e4e5fb", 0, 0.27, -0.03, 0.24, 0.27, 0.23);
    for (const s of [-1, 1]) {
      const ear = mesh(
        new T.ConeGeometry(0.14, 0.34, 3),
        mat(white),
        root,
        s * 0.19,
        1,
        0,
      );
      ear.rotation.z = -s * 0.22;
      ball(white, s * 0.17, 0.05, 0.09, 0.12, 0.08, 0.17);
    }
    const tail = ball(white, 0.35, 0.26, -0.11, 0.23, 0.37, 0.2);
    tail.rotation.z = -0.5;
    mesh(new T.BoxGeometry(0.43, 0.1, 0.35), mat(accent), root, 0, 0.47, 0);
    ball("#ffe3a0", -0.4, 0.24, 0.22, 0.11, 0.17, 0.1);
  } else {
    ball("#b19167", 0, 0.4, 0, 0.36, 0.44, 0.26);
    ball(white, 0, 0.37, 0.21, 0.24, 0.3, 0.08);
    for (const s of [-1, 1]) {
      ball("#fff7dc", s * 0.14, 0.68, 0.19, 0.18, 0.2, 0.08);
      const wing = ball(accent, s * 0.35, 0.38, 0, 0.12, 0.3, 0.14);
      wing.rotation.z = s * 0.25;
      ball("#d3a35c", s * 0.16, 0.02, 0.12, 0.13, 0.05, 0.13);
    }
    mesh(new T.ConeGeometry(0.21, 0.21, 5), mat("#e5bf73"), root, 0, 0.96, 0);
    mesh(
      new T.BoxGeometry(0.25, 0.1, 0.25),
      mat("#927cae"),
      root,
      0.3,
      0.22,
      0.26,
    );
  }
  const faceY =
    region === 0
      ? 0.84
      : region === 1
        ? 0.77
        : region === 2
          ? 0.86
          : region === 3
            ? 0.7
            : 0.69;
  const faceZ = region === 1 ? 0.295 : region === 4 ? 0.278 : 0.235;
  for (const s of [-1, 1]) {
    ball(dark, s * 0.1, faceY, faceZ, 0.033, 0.045, 0.026);
    ball("#ffffff", s * 0.1 - 0.009, faceY + 0.016, faceZ + 0.021, 0.009);
    if (region !== 4)
      ball(pink, s * 0.17, faceY - 0.08, faceZ - 0.005, 0.043, 0.02, 0.018);
  }
  if (region === 4)
    mesh(
      new T.ConeGeometry(0.065, 0.13, 3),
      mat("#e6b765"),
      root,
      0,
      0.57,
      0.29,
    ).rotation.x = Math.PI / 2;
  else ball(pink, 0, faceY - 0.09, faceZ + 0.015, 0.025, 0.015, 0.016);
  batchGroup(root);
  return root;
}

/** Paths and landmarks are low decoration; tall props sit outside the walk area. */
export function addRegionScenery(
  parent: T.Group,
  region: number,
  path: GroundPoint[],
  angle: number,
) {
  const colors = new Map<string, T.Material>();
  const mat = (color: string) => {
    let m = colors.get(color);
    if (!m) {
      m = new T.MeshStandardMaterial({ color, roughness: 0.85 });
      colors.set(color, m);
    }
    return m;
  };
  for (let segment = 1; segment < path.length; segment++) {
    const a = path[segment - 1],
      b = path[segment],
      length = Math.hypot(a.x - b.x, a.z - b.z),
      steps = Math.ceil(length / 0.75);
    for (let j = 0; j < steps; j++) {
      const f = j / steps,
        x = T.MathUtils.lerp(a.x, b.x, f),
        z = T.MathUtils.lerp(a.z, b.z, f);
      const tile = mesh(
        region === 4
          ? new T.BoxGeometry(0.85, 0.035, 0.7)
          : new T.CylinderGeometry(0.48, 0.5, 0.025, region === 2 ? 12 : 7),
        mat(region === 3 ? "#f7faff" : region === 2 ? "#f6ebd5" : "#f5e9df"),
        parent,
        x,
        0.022,
        z,
      );
      tile.rotation.y = angle + (region === 4 ? 0 : j * 0.61);
    }
  }
  const decor = new T.Group();
  decor.rotation.y = -angle;
  parent.add(decor);
  if (region === 0) {
    for (let i = 0; i < 13; i++) {
      const a = (i / 13) * Math.PI * 2;
      const x = Math.sin(a) * 8.1,
        z = Math.cos(a) * 8.1;
      mesh(
        new T.CylinderGeometry(0.07, 0.1, 0.45, 8),
        mat("#f4e7ce"),
        decor,
        x,
        0.24,
        z,
      );
      const cap = mesh(
        new T.SphereGeometry(0.33, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2),
        mat(i % 2 ? "#dab6d8" : "#dc97b2"),
        decor,
        x,
        0.48,
        z,
      );
      cap.scale.y = 0.7;
    }
  } else if (region === 1) {
    for (const x of [-7.8, 7.8]) {
      const arch = mesh(
        new T.TorusGeometry(1.4, 0.1, 8, 40, Math.PI),
        mat("#f9e8d0"),
        decor,
        x,
        1.3,
        0,
      );
      arch.rotation.z = 0;
      for (const s of [-1, 1])
        mesh(
          new T.CylinderGeometry(0.1, 0.15, 1.35, 10),
          mat("#f9e8d0"),
          decor,
          x + s * 1.4,
          0.65,
          0,
        );
      for (let j = 0; j < 9; j++) {
        const a = (j / 8) * Math.PI;
        mesh(
          new T.SphereGeometry(0.23, 12, 10),
          mat(j % 2 ? "#cd84a5" : "#eab3c1"),
          decor,
          x + Math.cos(a) * 1.4,
          1.3 + Math.sin(a) * 1.4,
          0,
        );
      }
    }
    const medallion = mesh(
      new T.RingGeometry(1.1, 1.7, 48),
      mat("#deaac2"),
      decor,
      0,
      0.035,
      0,
    );
    medallion.rotation.x = -Math.PI / 2;
  } else if (region === 2) {
    for (let i = 0; i < 7; i++) {
      const water = mesh(
        new T.CircleGeometry(1.4, 40),
        mat(i % 2 ? "#9bcdd9" : "#b5dce0"),
        decor,
        7.8,
        0.028,
        5 - i * 1.7,
      );
      water.rotation.x = -Math.PI / 2;
      water.scale.x = 0.7;
    }
    for (let i = 0; i < 8; i++) {
      const shell = mesh(
        new T.SphereGeometry(0.38, 12, 8, 0, Math.PI),
        mat(i % 2 ? "#f9d4c8" : "#fff1d6"),
        decor,
        -7.8,
        0.12,
        5 - i * 1.45,
      );
      shell.rotation.x = -Math.PI / 2;
      shell.scale.z = 0.3;
    }
  } else if (region === 3) {
    for (const s of [-1, 1])
      for (let i = 0; i < 5; i++) {
        const ice = mesh(
          new T.OctahedronGeometry(0.5, 0),
          mat(i % 2 ? "#aed4ed" : "#cec9ef"),
          decor,
          s * (7.6 + Math.sin(i) * 0.3),
          0.85,
          4 - i * 2,
        );
        ice.scale.set(0.8, 2, 0.8);
        mesh(
          new T.SphereGeometry(0.14, 12, 8),
          mat("#fff2ba"),
          decor,
          s * 7.6,
          2,
          4 - i * 2,
        );
      }
    const moon = mesh(
      new T.TorusGeometry(0.85, 0.14, 10, 40, Math.PI * 1.6),
      mat("#fff0ba"),
      decor,
      0,
      2.8,
      -8.8,
    );
    moon.rotation.z = -0.3;
  } else {
    for (const r of [1, 1.4, 2]) {
      const ring = mesh(
        new T.TorusGeometry(r, 0.025, 6, 64),
        mat("#b6985b"),
        decor,
        0,
        0.05,
        0,
      );
      ring.rotation.x = -Math.PI / 2;
    }
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4;
      const star = mesh(
        new T.OctahedronGeometry(0.23),
        mat("#dabb7f"),
        decor,
        Math.sin(a) * 1.7,
        0.08,
        Math.cos(a) * 1.7,
      );
      star.scale.y = 0.12;
    }
    for (const s of [-1, 1]) {
      mesh(
        new T.BoxGeometry(0.1, 2.8, 1.1),
        mat("#b19bd4"),
        decor,
        s * 8.2,
        1.4,
        0,
      );
      mesh(
        new T.CylinderGeometry(0.08, 0.1, 3.3, 10),
        mat("#e2c688"),
        decor,
        s * 8.2,
        1.65,
        0.65,
      );
    }
  }
  batchGroup(decor);
}
