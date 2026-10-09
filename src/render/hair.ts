import * as T from "three";
import type { Item } from "../simulation/data";
import { mesh, line, batchGroup, colorShift } from "./modeling";
import { headSurface } from "./face";
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
/**
 * One continuous surface from the crown to the tips: it hugs the scalp,
 * stops at the hairline over the face, and falls down the back and sides,
 * so no seam or gap shows from any angle. Clumps, waves and pointed tips are
 * shaped into the same mesh.
 */
function shell(length: number, shape: number) {
  const cols = 160,
    rows = 72,
    ARC = 0.62;
  const rx = 0.362,
    ry = 0.418,
    hairline = Math.acos(0.19 / ry) / (Math.PI / 2);
  const wave = shape === 3 ? 0.03 : shape === 5 ? 0.022 : 0;
  const pos: number[] = [],
    uv: number[] = [],
    idx: number[] = [];
  for (let i = 0; i <= cols; i++) {
    const a = (i / cols) * Math.PI * 2,
      front = Math.abs(Math.atan2(Math.sin(a), Math.cos(a)));
    // An uneven hem of soft, rounded locks rather than a straight cut.
    const tips =
      0.05 * (0.5 + 0.5 * Math.cos(a * 9)) +
      0.035 * (0.5 + 0.5 * Math.cos(a * 14 + 1.3));
    const fall = T.MathUtils.smoothstep(front, 0.95, 1.4);
    const end = (1 - fall) * hairline * ARC + fall * (ARC + length - tips);
    const rz = Math.cos(a) > 0 ? 0.312 : 0.33;
    for (let j = 0; j <= rows; j++) {
      const s = (j / rows) * end;
      let x: number, y: number, z: number;
      if (s <= ARC) {
        const phi = (s / ARC) * (Math.PI / 2);
        x = rx * Math.sin(phi) * Math.sin(a);
        y = ry * Math.cos(phi);
        z = rz * Math.sin(phi) * Math.cos(a);
      } else {
        const d = s - ARC,
          k = Math.min(1, d / 0.35),
          spread =
            1 +
            0.07 * k -
            0.1 * (d / Math.max(length, 0.5)) ** 2 +
            0.022 * Math.sin(a * 14) * k;
        const curl = wave * Math.sin(d * 6 + a * 3) * k;
        x = Math.sin(a) * (rx * spread + curl);
        y = -d;
        z = Math.cos(a) * (rz * spread + curl);
      }
      // Fine ridges read as strands under the clearcoat.
      const ridge = 1 + 0.006 * Math.cos(a * 24);
      pos.push(x * ridge, y, z * ridge);
      uv.push(i / cols, j / rows);
      if (i < cols && j < rows) {
        const k = i * (rows + 1) + j;
        idx.push(k, k + rows + 1, k + 1, k + 1, k + rows + 1, k + rows + 2);
      }
    }
  }
  const g = new T.BufferGeometry();
  g.setAttribute("position", new T.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new T.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
export function createHair(item: Item) {
  const root = new T.Group();
  root.name = "hair";
  root.userData.silhouette = item.shape;
  const colors = [
    "#d9cdeb",
    "#c68695",
    "#967a64",
    "#87aabe",
    "#62566f",
    "#cfab68",
    "#2f2c3c",
    "#3b3450",
    "#5c4a3e",
    "#8a5f4a",
    "#c9a68d",
    "#7d6b58",
    "#d8a8b6",
    "#3a2f43",
    "#a8494a",
    "#3d4a44",
    "#4a3f36",
    "#2b2a2e",
    "#6b5847",
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
  // Layered bangs hug the forehead: alternating lengths, tips swept toward a
  // soft side part, and the eyebrows left visible beneath them.
  for (let i = -5; i <= 5; i++) {
    const x = i * 0.056,
      sweep = (i <= 0 ? -1 : 1) * 0.03 + 0.012,
      tip =
        0.12 + (Math.abs(i) % 2) * 0.045 + Math.max(0, Math.abs(i) - 2) * 0.02;
    const at = (px: number, py: number, lift: number) =>
      headSurface(px, py, lift).toArray();
    ribbon(
      root,
      [
        [x * 0.2, 0.395, 0.16],
        at(x * 0.6, 0.33, 0.036),
        at(x * 0.92, 0.24, 0.026),
        at(x + sweep * 0.6, (0.24 + tip) / 2, 0.02),
        at(x + sweep, tip, 0.014),
      ],
      0.04 - Math.abs(i) * 0.0015,
      mat,
      shine,
    );
  }
  const strands = new T.Group();
  strands.name = "hair-sway";
  root.add(strands);
  const length = [
    1.44, 0.43, 0.63, 1.45, 0.43, 1.48, 1.5, 1.28, 0.44, 0.5, 1.52, 0.6, 1.56,
    1.5, 0.92, 0.5, 1.32, 0.5, 0.46,
  ][item.shape];
  mesh(
    // 0 long, 1 twin tails, 2 braids, 3 long curls, 5 blonde waves, 6 ink
  // straight, 7 buns (the shell stays short behind them), 10 airy curls,
  // 12 curled hime ringlets, 13 hime cut, 14 side-tied sweep.
  shell(length, item.shape),
    new T.MeshPhysicalMaterial({
      color: colorShift(color, -0.04),
      roughness: 0.42,
      metalness: 0.04,
      clearcoat: 0.28,
      clearcoatRoughness: 0.45,
      side: T.DoubleSide,
    }),
    strands,
  );

  // Face-framing locks fall in front of the ears with a gentle S-curve.
  const sideEnd = -Math.min(0.78, length);
  for (const side of [-1, 1])
    for (const [dx, dz, w, end] of [
      [0, 0, 0.075, sideEnd],
      [0.03, -0.06, 0.07, sideEnd * 0.85],
    ])
      ribbon(
        strands,
        [
          [side * (0.29 + dx), 0.26, 0.1 + dz],
          [side * (0.345 + dx), 0.06, 0.125 + dz],
          [side * (0.34 + dx), -0.2, 0.12 + dz],
          [side * (0.31 + dx), end * 0.7, 0.13 + dz],
          [side * (0.335 + dx), end, 0.1 + dz],
        ],
        w,
        mat,
        shine,
      );
  if (item.shape === 1) {
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
  } else if (item.shape === 6) {
    // 墨玉长直: a flat centre part and two long front panels, no ornament.
    for (const side of [-1, 1])
      ribbon(
        strands,
        [
          [side * 0.07, 0.4, 0.1],
          [side * 0.24, 0.36, 0.12],
          [side * 0.3, 0.14, 0.135],
          [side * 0.27, -0.3, 0.13],
          [side * 0.25, -0.86, 0.125],
          [side * 0.21, -1.22, 0.11],
        ],
        0.115,
        mat,
        shine,
      );
  } else if (item.shape === 7) {
    // 双环飞仙髻: two rings of hair pinned high on the crown.
    for (const side of [-1, 1]) {
      for (let k = 0; k < 4; k++)
        ribbon(
          strands,
          Array.from({ length: 11 }, (_, i) => {
            const t = i / 10;
            const angle = t * Math.PI * 1.85 + (k * Math.PI) / 2;
            return [
              side * (0.13 + Math.cos(angle) * 0.108),
              0.33 + Math.sin(angle) * 0.108 + k * 0.006,
              -0.03 + Math.sin(angle * 0.5) * 0.05,
            ];
          }),
          0.032,
          mat,
          shine,
        );
      const pin = mesh(
        new T.TorusGeometry(0.104, 0.011, 8, 26),
        new T.MeshStandardMaterial({ color: "#c8a267" }),
        strands,
        side * 0.13,
        0.33,
        -0.03,
      );
      pin.rotation.x = Math.PI / 2;
      ribbon(
        strands,
        [
          [side * 0.13, 0.3, -0.06],
          [side * 0.19, 0.09, -0.12],
          [side * 0.16, -0.22, -0.14],
          [side * 0.2, -0.56, -0.11],
        ],
        0.03,
        mat,
        shine,
      );
    }
  } else if (item.shape === 8) {
    // 齐耳学生发: a blunt bob with a level fringe and inward tips.
    for (const side of [-1, 1])
      ribbon(
        strands,
        [
          [side * 0.26, 0.3, 0.09],
          [side * 0.33, 0.06, 0.115],
          [side * 0.32, -0.2, 0.12],
          [side * 0.28, -0.42, 0.1],
        ],
        0.09,
        mat,
        shine,
      );
    for (const side of [-1, 1])
      ribbon(
        strands,
        [
          [side * 0.16, 0.1, -0.28],
          [side * 0.22, -0.12, -0.25],
          [side * 0.2, -0.36, -0.22],
        ],
        0.1,
        mat,
        shine,
      );
  } else if (item.shape === 9) {
    // 元气高马尾: a high tie with a swept tail and a few loose wisps.
    const tie = mesh(
      new T.TorusGeometry(0.058, 0.014, 8, 24),
      new T.MeshStandardMaterial({ color: "#d9584f" }),
      strands,
      0,
      0.4,
      -0.08,
    );
    tie.rotation.x = 0.5;
    for (let j = 0; j < 6; j++)
      ribbon(
        strands,
        [
          [0, 0.4, -0.09],
          [0.03 * (j - 2.5), 0.3, -0.28 - j * 0.012],
          [0.05 * (j - 2.5), 0.04, -0.42 - j * 0.016],
          [0.07 * (j - 2.5), -0.35, -0.44 - j * 0.014],
          [0.09 * (j - 2.5), -0.74, -0.36 - j * 0.01],
        ],
        0.062,
        mat,
        shine,
      );
    for (const side of [-1, 1])
      ribbon(
        strands,
        [
          [side * 0.28, 0.3, 0.08],
          [side * 0.33, 0.14, 0.11],
          [side * 0.35, -0.06, 0.12],
        ],
        0.055,
        mat,
        shine,
      );
  } else if (item.shape === 10) {
    // 蓬松空气卷: soft windblown volume with an off-centre parting.
    for (let k = 0; k < 7; k++) {
      const side = k % 2 ? 1 : -1;
      ribbon(
        strands,
        Array.from({ length: 14 }, (_, i) => {
          const t = i / 13;
          return [
            side * (0.1 + t * 0.24 + Math.sin(t * 9 + k) * 0.035),
            0.36 - t * 1.5,
            0.1 - t * 0.16 + Math.cos(t * 7 + k * 1.7) * 0.055,
          ];
        }),
        0.072,
        mat,
        shine,
      );
    }
  } else if (item.shape === 11) {
    // 飒爽运动辫: a single tight braid down the back with a banded end.
    for (let k = 0; k < 3; k++)
      ribbon(
        strands,
        Array.from({ length: 15 }, (_, i) => {
          const t = i / 14;
          return [
            0.038 * Math.sin(t * 19 + k * 2.1),
            0.18 - t * 1.16,
            -0.19 + 0.026 * Math.cos(t * 19 + k * 2.1),
          ];
        }),
        0.055,
        mat,
        shine,
      );
    const band = mesh(
      new T.TorusGeometry(0.051, 0.013, 8, 22),
      new T.MeshStandardMaterial({ color: "#5f5a93" }),
      strands,
      0,
      -0.98,
      -0.19,
    );
    band.rotation.x = Math.PI / 2;
    ribbon(
      strands,
      [
        [0, -1.0, -0.19],
        [0.03, -1.14, -0.16],
        [0.01, -1.28, -0.12],
      ],
      0.045,
      mat,
      shine,
    );
  } else if (item.shape === 12) {
    // 蔷薇姬卷: long ringlets with a drilled spiral and a rose at one side.
    for (const side of [-1, 1])
      for (let k = 0; k < 5; k++)
        ribbon(
          strands,
          Array.from({ length: 20 }, (_, i) => {
            const t = i / 19;
            const spiral = t * Math.PI * 5 + (k * Math.PI) / 2.5;
            return [
              side * (0.3 + k * 0.022 + Math.sin(spiral) * (0.032 + t * 0.02)),
              0.14 - t * 1.42,
              0.09 - k * 0.026 + Math.cos(spiral) * 0.038,
            ];
          }),
          0.056,
          mat,
          shine,
        );
    const rosette = mesh(
      new T.TorusGeometry(0.052, 0.018, 8, 22),
      new T.MeshStandardMaterial({ color: "#c68695" }),
      strands,
      0.31,
      0.24,
      0.07,
    );
    rosette.rotation.y = Math.PI / 2.4;
  } else if (item.shape === 13) {
    // 夜樱公主切: blunt cheeks-length side locks over straight long hair.
    for (const side of [-1, 1]) {
      ribbon(
        strands,
        [
          [side * 0.3, 0.3, 0.06],
          [side * 0.355, 0.04, 0.11],
          [side * 0.35, -0.2, 0.12],
        ],
        0.105,
        mat,
        shine,
      );
      ribbon(
        strands,
        [
          [side * 0.2, 0.36, 0.12],
          [side * 0.26, 0.1, 0.14],
          [side * 0.26, -0.42, 0.13],
          [side * 0.23, -1.0, 0.12],
          [side * 0.2, -1.34, 0.1],
        ],
        0.1,
        mat,
        shine,
      );
    }
  } else if (item.shape === 14) {
    // 绯穗侧结: one side knotted over a loose, uneven sweep.
    const knot = mesh(
      new T.TorusGeometry(0.062, 0.02, 8, 24),
      new T.MeshStandardMaterial({ color: "#a8494a" }),
      strands,
      0.27,
      -0.05,
      0.1,
    );
    knot.rotation.y = 0.5;
    for (let j = 0; j < 4; j++)
      ribbon(
        strands,
        [
          [0.27, -0.05, 0.1],
          [0.33 + j * 0.014, -0.3, 0.08 - j * 0.02],
          [0.3 + j * 0.02, -0.62, 0.04 - j * 0.026],
          [0.34 + j * 0.016, -0.92, 0.0 - j * 0.02],
        ],
        0.05,
        mat,
        shine,
      );
  } else if (item.shape === 15) {
    // 低马尾: a low tie at the nape with a smooth tail over one shoulder.
    const tie = mesh(
      new T.TorusGeometry(0.042, 0.013, 8, 22),
      new T.MeshStandardMaterial({ color: "#d8cfc2" }),
      strands,
      0,
      -0.16,
      -0.06,
    );
    tie.rotation.x = Math.PI / 2;
    for (let j = 0; j < 4; j++)
      ribbon(
        strands,
        [
          [0.01 * (j - 1.5), -0.16, -0.07],
          [0.03 * (j - 1.5), -0.34, -0.13 + j * 0.02],
          [0.05 * (j - 1.5), -0.6, -0.12 + j * 0.03],
          [0.07 * (j - 1.5), -0.86, -0.07 + j * 0.03],
          [0.08 * (j - 1.5), -1.06, 0 + j * 0.02],
        ],
        0.048,
        mat,
        shine,
      );
  } else if (item.shape === 16) {
    // 棒球帽短发: a short crop under a casual cap, brim forward.
    const cap = new T.MeshStandardMaterial({ color: "#2b2a2e" });
    const crown = mesh(
      new T.SphereGeometry(0.335, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.52),
      cap,
      strands,
      0,
      0.28,
      0,
    );
    crown.scale.set(1, 0.86, 1.02);
    const brim = mesh(new T.CylinderGeometry(0.3, 0.3, 0.022, 20), cap, strands, 0, 0.29, 0.22);
    brim.scale.set(1, 1, 1.25);
    for (const side of [-1, 1])
      ribbon(
        strands,
        [
          [side * 0.26, 0.24, 0.1],
          [side * 0.32, 0.02, 0.12],
          [side * 0.3, -0.16, 0.11],
        ],
        0.075,
        mat,
        shine,
      );
  } else {
    // 利落及肩直发: a blunt, even cut that ends at the collarbone.
    for (const side of [-1, 1])
      ribbon(
        strands,
        [
          [side * 0.24, 0.34, 0.11],
          [side * 0.3, 0.08, 0.13],
          [side * 0.29, -0.2, 0.12],
          [side * 0.25, -0.46, 0.1],
        ],
        0.095,
        mat,
        shine,
      );
    for (const side of [-1, 1])
      ribbon(
        strands,
        [
          [side * 0.14, 0.06, -0.3],
          [side * 0.2, -0.16, -0.26],
          [side * 0.18, -0.44, -0.2],
        ],
        0.1,
        mat,
        shine,
      );
  }
  batchGroup(root);
  batchGroup(strands);
  return root;
}
