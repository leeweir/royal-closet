import * as T from "three";
import type { Item } from "../simulation/data";
import { mesh, line, batchGroup, colorShift } from "./modeling";
function ribbon(
  parent: T.Group,
  pts: number[][],
  width: number,
  mat: T.Material,
  highlight: T.Material,
) {
  const path = new T.CatmullRomCurve3(
    pts.map((p) => new T.Vector3(...(p as [number, number, number]))),
  );
  const outward =
    Math.abs(pts[0][0]) < 0.1 && pts[0][2] > 0.14
      ? new T.Vector3(0, 0, 1)
      : new T.Vector3(pts[0][0], 0, pts[0][2]).normalize();
  const pos: number[] = [],
    uv: number[] = [],
    idx: number[] = [];
  const n = 40,
    m = 10;
  for (let i = 0; i <= n; i++) {
    const t = i / n,
      c = path.getPoint(t),
      tan = path.getTangent(t);
    const across = new T.Vector3().crossVectors(tan, outward).normalize();
    const taper = Math.sin(Math.PI * (0.1 + t * 0.89)) ** 0.45;
    for (let j = 0; j <= m; j++) {
      const q = (j / m) * 2 - 1;
      const v = c.clone().addScaledVector(across, q * width * taper);
      v.addScaledVector(
        outward,
        Math.sqrt(Math.max(0, 1 - q * q)) * width * 0.26,
      );
      pos.push(v.x, v.y, v.z);
      uv.push(j / m, t);
      if (i < n && j < m) {
        const k = i * (m + 1) + j;
        idx.push(k, k + 1, k + m + 1, k + 1, k + m + 2, k + m + 1);
      }
    }
  }
  const g = new T.BufferGeometry();
  g.setAttribute("position", new T.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new T.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  mesh(g, mat, parent);
  for (const offset of [-0.35, 0.3]) {
    const marks = Array.from({ length: 12 }, (_, i) => {
      const t = 0.1 + (i / 12) * 0.74,
        c = path.getPoint(t),
        tan = path.getTangent(t),
        a = new T.Vector3().crossVectors(tan, outward).normalize();
      c.addScaledVector(a, offset * width);
      c.addScaledVector(outward, width * 0.275);
      return [c.x, c.y, c.z];
    });
    line(parent, marks, 0.0018, highlight, 20);
  }
}
export function createHair(item: Item) {
  const root = new T.Group();
  root.name = "hair";
  root.userData.silhouette = item.shape;
  const colors = [
    "#ddd4e8",
    "#c68695",
    "#967a64",
    "#87aabe",
    "#62566f",
    "#cfab68",
  ];
  const color = colors[item.shape];
  const mat = new T.MeshPhysicalMaterial({
    color,
    roughness: 0.4,
    metalness: 0.06,
    clearcoat: 0.3,
    clearcoatRoughness: 0.45,
    side: T.DoubleSide,
  });
  const shine = new T.MeshStandardMaterial({
    color: colorShift(color, 0.23),
    roughness: 0.5,
  });
  const cap = mesh(
    new T.SphereGeometry(1, 48, 32, 0, Math.PI * 2, 0, 1.2),
    mat,
    root,
  );
  cap.scale.set(0.373, 0.442, 0.307);
  cap.position.y = 0.002;
  // Continuous rear scalp prevents gaps between swept decorative locks at any angle.
  const rearCap = mesh(
    new T.SphereGeometry(1, 48, 32, Math.PI, Math.PI, 0, 2.62),
    mat,
    root,
  );
  rearCap.scale.set(0.375, 0.44, 0.311);

  // Swept bangs stop above the eyes; each strip has a rounded cross section and a tapered tip.
  for (let i = 0; i < 7; i++) {
    const x = (i - 3) * 0.09;
    const side = x < 0 ? -1 : 1;
    ribbon(
      root,
      [
        [x * 0.25, 0.39, 0.17],
        [x * 0.65, 0.32, 0.247],
        [x, 0.225, 0.285],
        [x + side * 0.025, 0.135 + (i === 3 ? 0.035 : 0), 0.292],
      ],
      0.06,
      mat,
      shine,
    );
  }
  const strands = new T.Group();
  strands.name = "hair-sway";
  root.add(strands);
  // A fluted half-ellipsoid gives each haircut real volume beneath its separate locks.
  const length = [1.44, 0.43, 0.63, 1.45, 0.43, 1.48][item.shape];
  const positions: number[] = [],
    uvs: number[] = [],
    indices: number[] = [];
  for (let j = 0; j <= 32; j++) {
    const t = j / 32,
      y = 0.16 - t * (length + 0.16),
      rx = 0.363 + 0.023 * Math.sin(t * Math.PI) - 0.095 * t * t,
      rz = 0.305 - 0.14 * t * t,
      center = -0.055 * t;
    for (let i = 0; i <= 48; i++) {
      const u = i / 48,
        a = Math.PI / 2 + u * Math.PI,
        flute = 1 + 0.018 * Math.cos(a * 18 + t * 2);
      positions.push(
        Math.sin(a) * rx * flute,
        y + Math.pow(t, 7) * 0.028 * Math.cos(a * 14),
        Math.cos(a) * rz * flute + center,
      );
      uvs.push(u, t);
      if (j < 32 && i < 48) {
        const k = j * 49 + i;
        indices.push(k, k + 49, k + 1, k + 1, k + 49, k + 50);
      }
    }
  }
  const curtain = new T.BufferGeometry();
  curtain.setAttribute("position", new T.Float32BufferAttribute(positions, 3));
  curtain.setAttribute("uv", new T.Float32BufferAttribute(uvs, 2));
  curtain.setIndex(indices);
  curtain.computeVertexNormals();
  mesh(
    curtain,
    new T.MeshPhysicalMaterial({
      color: colorShift(color, -0.035),
      roughness: 0.42,
      metalness: 0.04,
      clearcoat: 0.28,
      side: T.DoubleSide,
    }),
    strands,
  );

  for (const side of [-1, 1]) {
    ribbon(
      strands,
      [
        [side * 0.31, 0.24, 0.075],
        [side * 0.352, 0.05, 0.09],
        [side * 0.358, -0.24, 0.11],
        [side * 0.33, -0.43, 0.15],
      ],
      0.068,
      mat,
      shine,
    );
  }
  if (item.shape === 4) {
    for (let i = 0; i < 11; i++) {
      const a = (i / 10) * Math.PI + Math.PI / 2;
      const x = Math.sin(a) * 0.31,
        z = Math.cos(a) * 0.27;
      ribbon(
        strands,
        [
          [x * 0.85, 0.3, z],
          [x, 0.0, z * 1.12],
          [x * 1.03, -0.3, z],
          [x * 0.83, -0.43, z * 0.85],
        ],
        0.1,
        mat,
        shine,
      );
    }
  } else if (item.shape === 1) {
    for (const side of [-1, 1]) {
      const tie = mesh(
        new T.TorusGeometry(0.065, 0.012, 8, 24),
        new T.MeshStandardMaterial({ color: "#f4d7bf" }),
        strands,
        side * 0.38,
        0.1,
        0,
      );
      tie.rotation.y = Math.PI / 2;
      for (let j = 0; j < 5; j++)
        ribbon(
          strands,
          [
            [side * 0.34, 0.2, -0.02],
            [side * (0.48 + j * 0.02), -0.12, -0.1 - j * 0.027],
            [side * (0.49 + j * 0.025), -0.51, -0.16 - j * 0.03],
            [side * (0.35 + j * 0.025), -0.91, -0.06 - j * 0.03],
            [side * (0.49 + j * 0.014), -1.14, -0.035 - j * 0.02],
          ],
          0.065,
          mat,
          shine,
        );
    }
  } else if (item.shape === 2) {
    for (const side of [-1, 1]) {
      for (let k = 0; k < 3; k++) {
        const pts = Array.from({ length: 12 }, (_, i) => {
          const t = i / 11;
          return [
            side * (0.34 + 0.035 * Math.sin(t * 16 + k * 2.1)),
            0.12 - t * 1.28,
            -0.08 + 0.033 * Math.cos(t * 16 + k * 2.1),
          ];
        });
        ribbon(strands, pts, 0.045, mat, shine);
      }
      const bow = mesh(
        new T.TorusGeometry(0.034, 0.009, 6, 18),
        new T.MeshStandardMaterial({ color: "#9bc3a9" }),
        strands,
        side * 0.34,
        -1.05,
        -0.055,
      );
      bow.rotation.y = Math.PI / 2;
    }
    for (let i = 0; i < 5; i++)
      ribbon(
        strands,
        [
          [(i - 2) * 0.09, 0.14, -0.26],
          [(i - 2) * 0.1, -0.3, -0.29],
          [(i - 2) * 0.095, -0.65, -0.29],
        ],
        0.075,
        mat,
        shine,
      );
  } else {
    const length = item.shape === 5 ? 1.48 : 1.45;
    for (let i = 0; i < 11; i++) {
      const a = Math.PI / 2 + (i / 10) * Math.PI;
      const x = Math.sin(a) * 0.29,
        z = Math.cos(a) * 0.265;
      const wave = item.shape === 3 ? 0.12 : item.shape === 5 ? 0.07 : 0.035;
      ribbon(
        strands,
        [
          [x * 0.85, 0.28, z],
          [x * 1.12, -0.15, z * 1.2],
          [x * 1.22 + Math.sin(i) * wave, -0.63, z * 1.26],
          [x * 1.05 - Math.sin(i) * wave, -1.03, z * 1.15],
          [x * 0.9 + Math.sin(i) * wave, -length, z * 0.95],
        ],
        0.08,
        mat,
        shine,
      );
    }
  }
  batchGroup(root);
  batchGroup(strands);
  return root;
}
