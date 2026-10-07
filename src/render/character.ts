import * as T from "three";
import { ITEM } from "../simulation/data";
import type { Save } from "../simulation/game";
const skin = "#ffe1d3",
  gold = "#d8b676";
export function material(color: string, metalness = 0, roughness = 0.6) {
  return new T.MeshStandardMaterial({ color, metalness, roughness });
}
export function mesh(
  geo: T.BufferGeometry,
  mat: T.Material,
  parent: T.Object3D,
  x = 0,
  y = 0,
  z = 0,
) {
  const m = new T.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}
export function orb(
  parent: T.Object3D,
  color: string,
  x: number,
  y: number,
  z: number,
  sx: number,
  sy = sx,
  sz = sx,
) {
  const m = mesh(
    new T.SphereGeometry(1, 24, 18),
    material(color),
    parent,
    x,
    y,
    z,
  );
  m.scale.set(sx, sy, sz);
  return m;
}
function curve(
  parent: T.Object3D,
  points: number[][],
  radius: number,
  color: string,
) {
  return mesh(
    new T.TubeGeometry(
      new T.CatmullRomCurve3(
        points.map((p) => new T.Vector3(...(p as [number, number, number]))),
      ),
      32,
      radius,
      8,
      false,
    ),
    material(color, 0.15),
    parent,
  );
}
function lock(parent: T.Object3D, pts: number[][], r: number, color: string) {
  const path = new T.CatmullRomCurve3(
    pts.map((p) => new T.Vector3(...(p as [number, number, number]))),
  );
  const geo = new T.TubeGeometry(path, 28, r, 10, false);
  const pos = geo.attributes.position;
  for (let i = 0; i <= 28; i++) {
    const center = path.getPointAt(i / 28);
    const f = Math.pow(1 - i / 29, 0.55);
    for (let j = 0; j <= 10; j++) {
      const k = i * 11 + j;
      pos.setXYZ(
        k,
        center.x + (pos.getX(k) - center.x) * f,
        center.y + (pos.getY(k) - center.y) * f,
        center.z + (pos.getZ(k) - center.z) * f,
      );
    }
  }
  geo.computeVertexNormals();
  return mesh(geo, material(color, 0.08, 0.36), parent);
}
function bow(
  parent: T.Object3D,
  x: number,
  y: number,
  z: number,
  color: string,
  size = 0.16,
) {
  for (const s of [-1, 1]) {
    const b = orb(
      parent,
      color,
      x + s * size * 0.55,
      y,
      z,
      size * 0.75,
      size * 0.5,
      size * 0.22,
    );
    b.rotation.z = s * 0.3;
  }
  orb(parent, gold, x, y, z + 0.02, size * 0.22);
}
function faceTexture() {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 512;
  const x = c.getContext("2d")!;
  x.clearRect(0, 0, 512, 512);
  for (const side of [-1, 1]) {
    const cx = 256 + side * 105;
    x.fillStyle = "#f4a0ae";
    x.globalAlpha = 0.28;
    x.beginPath();
    x.ellipse(cx + side * 16, 329, 41, 17, 0, 0, Math.PI * 2);
    x.fill();
    x.globalAlpha = 1;
    x.fillStyle = "#fffaf8";
    x.beginPath();
    x.ellipse(cx, 251, 58, 69, side * 0.08, 0, Math.PI * 2);
    x.fill();
    const g = x.createLinearGradient(cx, 194, cx, 318);
    g.addColorStop(0, "#322a62");
    g.addColorStop(0.55, "#8272b6");
    g.addColorStop(1, "#c4b2ec");
    x.fillStyle = g;
    x.beginPath();
    x.ellipse(cx, 257, 40, 60, 0, 0, Math.PI * 2);
    x.fill();
    x.fillStyle = "#322b51";
    x.beginPath();
    x.ellipse(cx, 244, 16, 38, 0, 0, Math.PI * 2);
    x.fill();
    x.strokeStyle = "#4d3b57";
    x.lineWidth = 12;
    x.lineCap = "round";
    x.beginPath();
    x.moveTo(cx - 58, 235);
    x.quadraticCurveTo(cx, 176, cx + 58, 232);
    x.stroke();
    x.lineWidth = 7;
    x.beginPath();
    x.moveTo(cx + side * 47, 223);
    x.lineTo(cx + side * 68, 204);
    x.stroke();
    x.fillStyle = "white";
    x.beginPath();
    x.ellipse(cx - 13, 218, 14, 19, -0.4, 0, Math.PI * 2);
    x.fill();
    x.beginPath();
    x.arc(cx + 17, 280, 7, 0, Math.PI * 2);
    x.fill();
    x.strokeStyle = "#a78a9e";
    x.lineWidth = 5;
    x.beginPath();
    x.moveTo(cx - 39, 164);
    x.quadraticCurveTo(cx, 150, cx + 34, 165);
    x.stroke();
  }
  x.strokeStyle = "#b77885";
  x.lineWidth = 5;
  x.beginPath();
  x.moveTo(238, 359);
  x.quadraticCurveTo(255, 375, 274, 358);
  x.stroke();
  x.fillStyle = "#f3bda9";
  x.beginPath();
  x.ellipse(258, 323, 6, 4, 0, 0, Math.PI * 2);
  x.fill();
  const tex = new T.CanvasTexture(c);
  tex.colorSpace = T.SRGBColorSpace;
  return tex;
}
function skirt(
  parent: T.Object3D,
  color: string,
  top: number,
  bottom: number,
  yTop: number,
  yBottom: number,
  pleats: number,
) {
  const vertices: number[] = [],
    indices: number[] = [];
  const n = 96,
    m = 18;
  for (let j = 0; j <= m; j++) {
    const t = j / m;
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * Math.PI * 2;
      const r =
        top +
        (bottom - top) * Math.pow(t, 0.66) +
        Math.cos(a * pleats) * 0.022 * t;
      vertices.push(
        Math.sin(a) * r,
        yTop + (yBottom - yTop) * t + Math.cos(a * pleats) * 0.025 * t,
        Math.cos(a) * r,
      );
    }
  }
  for (let j = 0; j < m; j++)
    for (let i = 0; i < n; i++) {
      const k = j * (n + 1) + i;
      indices.push(k, k + n + 1, k + 1, k + 1, k + n + 1, k + n + 2);
    }
  const g = new T.BufferGeometry();
  g.setAttribute("position", new T.Float32BufferAttribute(vertices, 3));
  g.setIndex(indices);
  g.computeVertexNormals();
  const mat = material(color, 0.12, 0.43);
  mat.side = T.DoubleSide;
  mesh(g, mat, parent);
  const pts = Array.from({ length: 97 }, (_, i) => {
    const a = (i / 96) * Math.PI * 2;
    return new T.Vector3(
      Math.sin(a) * (bottom + 0.005),
      yBottom + Math.cos(a * pleats) * 0.025,
      Math.cos(a) * (bottom + 0.005),
    );
  });
  mesh(
    new T.TubeGeometry(new T.CatmullRomCurve3(pts), 96, 0.012, 6, false),
    material(gold, 0.5),
    parent,
  );
}
function star(
  parent: T.Object3D,
  color: string,
  x: number,
  y: number,
  z: number,
  r: number,
) {
  const s = new T.Shape();
  for (let i = 0; i < 10; i++) {
    const a = Math.PI / 2 + (i * Math.PI) / 5,
      rad = i % 2 ? r * 0.45 : r;
    const px = Math.cos(a) * rad,
      py = Math.sin(a) * rad;
    if (!i) s.moveTo(px, py);
    else s.lineTo(px, py);
  }
  s.closePath();
  return mesh(
    new T.ExtrudeGeometry(s, {
      depth: 0.035,
      bevelEnabled: true,
      bevelSize: 0.008,
      bevelThickness: 0.008,
      bevelSegments: 1,
      steps: 1,
    }),
    material(color, 0.45, 0.25),
    parent,
    x,
    y,
    z,
  );
}
export function createCharacter(s: Save) {
  const root = new T.Group();
  const dress = ITEM[s.outfit.dress],
    hair = ITEM[s.outfit.hair],
    crown = ITEM[s.outfit.crown],
    shoes = ITEM[s.outfit.shoes],
    wings = ITEM[s.outfit.wings],
    wand = ITEM[s.outfit.wand];
  const col = s.dye ?? dress.color,
    accent = dress.accent;
  const body = new T.Group();
  root.add(body);
  for (const side of [-1, 1]) {
    orb(body, skin, side * 0.17, 0.48, 0, 0.105, 0.4, 0.1);
    orb(body, shoes.color, side * 0.17, 0.16, 0.065, 0.14, 0.105, 0.23);
    bow(body, side * 0.17, 0.21, 0.24, shoes.accent, 0.065);
  }
  const wide = dress.shape === 4 ? 0.69 : dress.shape === 2 ? 0.67 : 0.79;
  skirt(body, accent, wide * 0.88, wide, 0.55, 0.35, 12);
  skirt(body, col, 0.255, wide * 0.99, 1.54, 0.45, 12);
  if (dress.shape !== 2) {
    skirt(body, col, 0.285, wide * 0.84, 1.55, 0.91, 12);
  } else {
    for (let k = 0; k < 8; k++) {
      const a = (k * Math.PI) / 4;
      const leaf = orb(
        body,
        accent,
        Math.sin(a) * 0.42,
        1.12,
        Math.cos(a) * 0.42,
        0.15,
        0.4,
        0.04,
      );
      leaf.rotation.y = a;
      leaf.rotation.z = 0.1;
    }
  }
  const torso = mesh(
    new T.CylinderGeometry(0.285, 0.25, 0.49, 32),
    material(col, 0.1, 0.4),
    body,
    0,
    1.76,
    0,
  );
  torso.scale.z = 0.69;
  orb(body, accent, 0, 1.96, 0.025, 0.29, 0.12, 0.22);
  mesh(
    new T.CylinderGeometry(0.11, 0.135, 0.21, 24),
    material(skin),
    body,
    0,
    2.1,
    0,
  );
  const belt = mesh(
    new T.TorusGeometry(0.263, 0.025, 8, 48),
    material(gold, 0.5),
    body,
    0,
    1.52,
    0,
  );
  belt.rotation.x = Math.PI / 2;
  belt.scale.y = 0.75;
  bow(body, 0, 1.55, 0.24, accent, 0.19);
  orb(body, wand.color, 0, 1.88, 0.22, 0.055, 0.08, 0.025);
  for (const side of [-1, 1]) {
    const arm = new T.Group();
    arm.position.set(side * 0.29, 1.96, 0);
    arm.rotation.z = side * 0.18;
    body.add(arm);
    orb(arm, col, side * 0.025, -0.025, 0, 0.16, 0.16, 0.15);
    mesh(
      new T.CapsuleGeometry(0.064, 0.41, 5, 12),
      material(skin),
      arm,
      side * 0.07,
      -0.35,
      0.015,
    );
    orb(arm, accent, side * 0.095, -0.51, 0.015, 0.085, 0.07, 0.085);
    orb(arm, skin, side * 0.1, -0.61, 0.025, 0.074, 0.09, 0.071);
  }
  const head = new T.Group();
  head.position.y = 2.5;
  body.add(head);
  orb(head, skin, 0, 0, 0, 0.36, 0.425, 0.315);
  orb(head, skin, -0.345, -0.015, 0, 0.064, 0.093, 0.055);
  orb(head, skin, 0.345, -0.015, 0, 0.064, 0.093, 0.055);
  const face = mesh(
    new T.PlaneGeometry(0.655, 0.66),
    new T.MeshBasicMaterial({
      map: faceTexture(),
      transparent: true,
      depthWrite: false,
    }),
    head,
    0,
    -0.015,
    0.31,
  );
  face.renderOrder = 2;
  const hcolor =
    hair.shape === 0
      ? "#ded6ed"
      : hair.shape === 1
        ? "#e1b4b0"
        : hair.shape === 2
          ? "#a48370"
          : hair.shape === 3
            ? "#b8d1e2"
            : hair.shape === 4
              ? "#6c5c83"
              : "#e6c98e";
  const cap = mesh(
    new T.SphereGeometry(1, 32, 24, 0, Math.PI * 2, 0, Math.PI * 0.44),
    material(hcolor, 0.1, 0.35),
    head,
    0,
    0.045,
    -0.01,
  );
  cap.scale.set(0.387, 0.43, 0.345);
  for (let i = 0; i < 9; i++) {
    const a = Math.PI * 0.5 + (i / 8) * Math.PI;
    const xx = Math.sin(a) * 0.32,
      zz = Math.cos(a) * 0.26;
    lock(
      head,
      [
        [xx, 0.22, zz],
        [xx * 1.16, -0.1, zz - 0.04],
        [xx * 1.26, -0.6, zz - 0.04],
        [xx * 1.42, -(hair.shape === 4 ? 0.5 : 1.0), zz + 0.1],
      ],
      0.15,
      hcolor,
    );
  }
  for (let i = 0; i < 7; i++) {
    const px = (i - 3) * 0.105;
    lock(
      head,
      [
        [px * 0.8, 0.35, 0.15],
        [px, 0.28, 0.29],
        [px + 0.04, 0.13 + (i % 2) * 0.055, 0.322],
      ],
      0.1,
      hcolor,
    );
  }
  for (const side of [-1, 1]) {
    lock(
      head,
      [
        [side * 0.33, 0.22, 0.12],
        [side * 0.385, -0.08, 0.12],
        [side * 0.43, -0.45, 0.16],
        [side * 0.31, -0.64, 0.21],
      ],
      0.095,
      hcolor,
    );
    if (hair.shape === 1 || hair.shape === 3) {
      lock(
        head,
        [
          [side * 0.36, 0.19, -0.05],
          [side * 0.63, -0.05, -0.07],
          [side * 0.58, -0.6, -0.05],
          [side * 0.68, -0.85, 0.1],
        ],
        0.19,
        hcolor,
      );
      bow(head, side * 0.41, 0.1, 0.04, accent, 0.12);
    }
  }
  const crownGroup = new T.Group();
  head.add(crownGroup);
  crownGroup.position.y = 0.35;
  if (crown.shape === 1 || crown.shape === 2) {
    for (let i = 0; i < 11; i++) {
      const a = (i / 11) * Math.PI * 2;
      const x = Math.sin(a) * 0.31,
        z = Math.cos(a) * 0.29;
      orb(crownGroup, crown.color, x, 0.025, z, 0.065);
      orb(crownGroup, accent, x, 0.07, z, 0.027);
    }
  } else {
    const ring = mesh(
      new T.TorusGeometry(0.245, 0.023, 8, 48),
      material(gold, 0.7, 0.3),
      crownGroup,
      0,
      0.035,
      0,
    );
    ring.rotation.x = Math.PI / 2;
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      const x = Math.sin(a) * 0.245,
        z = Math.cos(a) * 0.245;
      mesh(
        new T.ConeGeometry(0.055, 0.18 + (i % 2) * 0.045, 4),
        material(gold, 0.5),
        crownGroup,
        x,
        0.12,
        z,
      );
      orb(crownGroup, crown.color, x, 0.23 + (i % 2) * 0.04, z, 0.032);
    }
    star(crownGroup, accent, 0, 0.23, 0.25, 0.08);
  }
  for (const side of [-1, 1]) {
    const wg = new T.Group();
    wg.position.set(side * 0.2, 1.8, -0.2);
    wg.rotation.y = side * 0.28;
    body.add(wg);
    const shape = new T.Shape();
    shape.moveTo(0, 0);
    shape.bezierCurveTo(side * 0.3, 0.6, side * 0.95, 0.68, side * 0.85, 0.27);
    shape.bezierCurveTo(side * 0.8, 0.05, side * 0.7, -0.04, side * 0.3, -0.12);
    shape.bezierCurveTo(
      side * 0.75,
      -0.13,
      side * 0.65,
      -0.75,
      side * 0.32,
      -0.5,
    );
    shape.quadraticCurveTo(0, -0.24, 0, 0);
    const mat = new T.MeshStandardMaterial({
      color: wings.color,
      transparent: true,
      opacity: 0.54,
      side: T.DoubleSide,
      metalness: 0.2,
      roughness: 0.35,
      depthWrite: false,
    });
    mesh(new T.ShapeGeometry(shape, 24), mat, wg);
    curve(
      wg,
      [
        [0, 0, 0.01],
        [side * 0.3, 0.23, 0.01],
        [side * 0.7, 0.34, 0.01],
      ],
      0.009,
      accent,
    );
    curve(
      wg,
      [
        [0, -0.05, 0.01],
        [side * 0.22, -0.25, 0.01],
        [side * 0.4, -0.4, 0.01],
      ],
      0.008,
      accent,
    );
    orb(wg, accent, side * 0.67, 0.31, 0.02, 0.025);
  }
  const staff = new T.Group();
  staff.position.set(0.49, 1.18, 0.1);
  staff.rotation.z = -0.16;
  body.add(staff);
  mesh(
    new T.CylinderGeometry(0.014, 0.014, 1.0, 12),
    material(gold, 0.7),
    staff,
    0,
    0.12,
    0,
  );
  if (wand.shape === 1) {
    orb(staff, wand.color, 0, 0.69, 0, 0.1);
    for (let i = 0; i < 5; i++)
      orb(
        staff,
        accent,
        Math.cos(i * 1.26) * 0.1,
        0.69 + Math.sin(i * 1.26) * 0.1,
        0,
        0.06,
      );
  } else {
    star(staff, wand.color, 0, 0.72, 0, 0.16);
    orb(staff, accent, 0, 0.72, 0.055, 0.044);
  }
  bow(staff, 0, 0.48, 0.025, accent, 0.08);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    orb(
      body,
      gold,
      Math.sin(a) * wide * 0.88,
      0.65,
      Math.cos(a) * wide * 0.88,
      0.016,
    );
  }
  return root;
}
export function disposeGroup(root: T.Object3D) {
  root.traverse((o) => {
    if (o instanceof T.Mesh || o instanceof T.Points) {
      o.geometry.dispose();
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) {
        if ("map" in m && (m as T.MeshStandardMaterial).map)
          (m as T.MeshStandardMaterial).map!.dispose();
        m.dispose();
      }
    }
  });
}
