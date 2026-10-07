import * as T from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import type { Item } from "../simulation/data";

// Garment coordinates match the character's waist, bust and shoulder anchors.
// All ornament geometry is attached to the cloth, never to the character's skin.
type Surface = (t: number, a: number) => T.Vector3;
type Cloth = "satin" | "velvet" | "lace" | "tulle";
const TAU = Math.PI * 2;
const gold = "#dbb875";

function texture(kind: "weave" | "lace" | "brocade") {
  const size = 256;
  const data = new Uint8Array(size * size * 4);
  // DataTexture also allows a garment to be inspected without a DOM/canvas.
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const k = (y * size + x) * 4;
      let value = 246;
      if (kind === "weave") {
        value = 225 + (x % 3 === 0 ? 17 : 0) + (y % 3 === 0 ? 10 : 0);
      } else if (kind === "lace") {
        const px = (x % 64) - 32;
        const py = (y % 64) - 32;
        const r = Math.hypot(px, py);
        const a = Math.atan2(py, px);
        const petal = 15 + 7 * Math.cos(a * 6);
        const flower = Math.abs(r - petal) < 2.2 || r < 4;
        const net =
          Math.abs(((x + y) % 16) - 8) < 1.2 ||
          Math.abs(((x - y + 256) % 16) - 8) < 1.2;
        value = flower ? 255 : net ? 150 : 0;
      } else {
        const px = (x % 64) - 32;
        const py = (y % 64) - 32;
        const r = Math.hypot(px * 0.8, py);
        const a = Math.atan2(py, px);
        value = Math.abs(r - (18 + 5 * Math.cos(a * 4))) < 2.2 ? 204 : 247;
      }
      data[k] = data[k + 1] = data[k + 2] = value;
      data[k + 3] = 255;
    }
  }
  const tex = new T.DataTexture(data, size, size, T.RGBAFormat);
  tex.wrapS = tex.wrapT = T.RepeatWrapping;
  tex.repeat.set(kind === "weave" ? 5 : 3, kind === "weave" ? 5 : 3);
  tex.magFilter = T.LinearFilter;
  tex.minFilter = T.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  return tex;
}

function cloth(color: string, kind: Cloth, maps: Record<string, T.Texture>) {
  const mat = new T.MeshPhysicalMaterial({
    color,
    side: T.DoubleSide,
    roughness: kind === "velvet" ? 0.77 : kind === "satin" ? 0.31 : 0.62,
    metalness: kind === "satin" ? 0.035 : 0,
    sheen: 1,
    sheenColor: new T.Color(color).lerp(new T.Color("#fff7f0"), 0.42),
    sheenRoughness: kind === "velvet" ? 0.55 : 0.3,
    bumpMap: maps.weave,
    bumpScale: kind === "velvet" ? 0.008 : 0.0025,
  });
  mat.name = kind;
  if (kind === "lace") {
    mat.alphaMap = maps.lace;
    mat.alphaTest = 0.36;
    mat.transparent = true;
    mat.opacity = 0.9;
    mat.depthWrite = false;
  }
  if (kind === "tulle") {
    mat.transparent = true;
    mat.opacity = 0.21;
    mat.depthWrite = false;
    mat.roughness = 0.72;
  }
  return mat;
}

function add(group: T.Group, geometry: T.BufferGeometry, material: T.Material) {
  const mesh = new T.Mesh(geometry, material);
  mesh.castShadow = !(material as T.MeshPhysicalMaterial).transparent;
  mesh.receiveShadow = true;
  group.add(mesh);
  return mesh;
}

function combine(geometries: T.BufferGeometry[]) {
  const merged = mergeGeometries(geometries, false)!;
  for (const geometry of geometries) geometry.dispose();
  return merged;
}

function grid(fn: (u: number, t: number) => T.Vector3, n = 96, m = 32) {
  const positions: number[] = [],
    uv: number[] = [],
    indices: number[] = [];
  for (let j = 0; j <= m; j++) {
    for (let i = 0; i <= n; i++) {
      const p = fn(i / n, j / m);
      positions.push(p.x, p.y, p.z);
      uv.push(i / n, 1 - j / m);
    }
  }
  for (let j = 0; j < m; j++) {
    for (let i = 0; i < n; i++) {
      const k = j * (n + 1) + i;
      indices.push(k, k + n + 1, k + 1, k + 1, k + n + 1, k + n + 2);
    }
  }
  const geometry = new T.BufferGeometry();
  geometry.setAttribute("position", new T.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new T.Float32BufferAttribute(uv, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  // Smooth the duplicated UV seam of closed cloth tubes without collapsing UVs.
  const position = geometry.getAttribute("position");
  const normal = geometry.getAttribute("normal");
  const first = new T.Vector3(),
    last = new T.Vector3(),
    average = new T.Vector3();
  for (let j = 0; j <= m; j++) {
    const a = j * (n + 1),
      b = a + n;
    first.fromBufferAttribute(position, a);
    last.fromBufferAttribute(position, b);
    if (first.distanceToSquared(last) > 1e-10) continue;
    first.fromBufferAttribute(normal, a);
    last.fromBufferAttribute(normal, b);
    average.addVectors(first, last).normalize();
    normal.setXYZ(a, average.x, average.y, average.z);
    normal.setXYZ(b, average.x, average.y, average.z);
  }
  return geometry;
}

function shell(surface: Surface, start = 0, end = TAU, n = 112, m = 40) {
  return grid((u, t) => surface(t, start + u * (end - start)), n, m);
}

function line(points: T.Vector3[], radius = 0.006, segments = 48) {
  return new T.TubeGeometry(
    new T.CatmullRomCurve3(points),
    segments,
    radius,
    5,
    false,
  );
}

function at(surface: Surface, t: number, a: number, offset = 0.008) {
  const p = surface(t, a);
  p.x += Math.sin(a) * offset;
  p.z += Math.cos(a) * offset;
  return p;
}

function hem(surface: Surface, radius = 0.01, start = 0, end = TAU) {
  return line(
    Array.from({ length: 97 }, (_, i) =>
      at(surface, 1, start + ((end - start) * i) / 96),
    ),
    radius,
    112,
  );
}

function radial(
  r: (t: number) => number,
  y: (t: number, a: number) => number,
  depth = 0.78,
  pleats = 18,
  strength = 0.025,
): Surface {
  return (t, a) => {
    const radius = r(t) + strength * Math.pow(t, 0.8) * Math.cos(a * pleats);
    return new T.Vector3(
      Math.sin(a) * radius,
      y(t, a),
      Math.cos(a) * radius * depth,
    );
  };
}

function ribbon(
  points: T.Vector3[],
  width: number,
  forward = new T.Vector3(0, 0, 1),
) {
  const path = new T.CatmullRomCurve3(points);
  return grid(
    (u, t) => {
      const p = path.getPoint(t);
      const tangent = path.getTangent(t);
      const across = new T.Vector3().crossVectors(tangent, forward).normalize();
      return p
        .addScaledVector(across, (u - 0.5) * width)
        .addScaledVector(forward, Math.cos((u - 0.5) * Math.PI) * width * 0.12);
    },
    12,
    32,
  );
}

function starGeometry(radius: number, depth = 0.012) {
  const shape = new T.Shape();
  for (let i = 0; i < 10; i++) {
    const angle = Math.PI / 2 + (i * Math.PI) / 5;
    const r = i % 2 ? radius * 0.43 : radius;
    if (i === 0) shape.moveTo(Math.cos(angle) * r, Math.sin(angle) * r);
    else shape.lineTo(Math.cos(angle) * r, Math.sin(angle) * r);
  }
  shape.closePath();
  return new T.ExtrudeGeometry(shape, { depth, bevelEnabled: false });
}

function ornamentInstances(
  group: T.Group,
  geometry: T.BufferGeometry,
  material: T.Material,
  placements: { position: T.Vector3; angle?: number; scale?: number }[],
) {
  if (!placements.length) return;
  const batch = new T.InstancedMesh(geometry, material, placements.length);
  const object = new T.Object3D();
  placements.forEach((p, i) => {
    object.position.copy(p.position);
    object.rotation.set(0, p.angle ?? 0, 0);
    object.scale.setScalar(p.scale ?? 1);
    object.updateMatrix();
    batch.setMatrixAt(i, object.matrix);
  });
  batch.castShadow = true;
  group.add(batch);
  return batch;
}

function bow(
  group: T.Group,
  material: T.Material,
  position: T.Vector3,
  size = 0.16,
) {
  // Hollow folded ribbons retain a crisp cloth edge and central crease.
  const parts: T.BufferGeometry[] = [];
  for (const side of [-1, 1]) {
    parts.push(
      grid(
        (u, t) => {
          const a = t * TAU;
          const reach = size * (0.1 + 0.85 * Math.sin((u * Math.PI) / 2));
          return new T.Vector3(
            position.x + side * reach,
            position.y +
              Math.sin(a) * size * (0.15 + u * 0.35) +
              side * u * size * 0.09,
            position.z +
              Math.cos(a) * size * 0.13 * u +
              Math.sin(u * Math.PI) * size * 0.22,
          );
        },
        18,
        28,
      ),
    );
    parts.push(
      grid(
        (u, t) =>
          new T.Vector3(
            position.x +
              side * size * (0.12 + t * 0.3) +
              (u - 0.5) * size * (0.25 + t * 0.13),
            position.y - t * size * 1.05 + Math.abs(u - 0.5) * size * 0.2 * t,
            position.z + size * (0.02 + Math.sin(t * Math.PI) * 0.2),
          ),
        10,
        18,
      ),
    );
  }
  add(group, combine(parts), material);
  const knot = add(
    group,
    new T.BoxGeometry(size * 0.2, size * 0.25, size * 0.25, 1, 1, 1),
    material,
  );
  knot.position.copy(position);
  knot.rotation.z = 0.07;
}

function rose(
  group: T.Group,
  material: T.Material,
  position: T.Vector3,
  size: number,
) {
  const petals: T.BufferGeometry[] = [];
  for (let layer = 0; layer < 3; layer++) {
    const count = 5 + layer * 2;
    for (let i = 0; i < count; i++) {
      const a = (i / count) * TAU + layer * 0.47;
      petals.push(
        grid(
          (u, t) => {
            const w = Math.sin(t * Math.PI) * size * (0.24 + layer * 0.12);
            const r = size * (0.1 + layer * 0.14 + t * (0.18 + layer * 0.12));
            const angle = a + ((u - 0.5) * w) / Math.max(r, 0.01);
            return new T.Vector3(
              position.x + Math.sin(angle) * r,
              position.y + Math.cos(angle) * r,
              position.z +
                size * (0.24 - layer * 0.055) +
                Math.sin(t * Math.PI) * size * 0.12 -
                t * t * size * 0.13,
            );
          },
          8,
          12,
        ),
      );
    }
  }
  add(group, combine(petals), material);
}

function bodice(
  group: T.Group,
  material: T.Material,
  trim: T.Material,
  asymmetric = false,
  corset = false,
) {
  const surface: Surface = (t, a) => {
    const r =
      0.234 +
      0.076 * Math.sin((t * Math.PI) / 2) -
      0.006 * Math.sin(t * Math.PI);
    const front = Math.max(0, Math.cos(a));
    const neckline = asymmetric
      ? 2.45 - Math.sin(a) * 0.12
      : 2.53 - front * (0.047 + Math.cos(a * 2) * 0.025);
    return new T.Vector3(
      Math.sin(a) * r,
      1.895 + t * (neckline - 1.895),
      Math.cos(a) * r * (0.7 - 0.035 * t),
    );
  };
  add(group, shell(surface, 0, TAU, 96, 32), material);
  const seams: T.BufferGeometry[] = [hem(surface, 0.008)];
  for (const a of [-0.64, 0.64, Math.PI - 0.64, Math.PI + 0.64]) {
    seams.push(
      line(
        Array.from({ length: 21 }, (_, i) => at(surface, i / 20, a)),
        0.004,
      ),
    );
  }
  if (corset) {
    for (let i = 0; i < 7; i++) {
      const y = 2.015 + i * 0.056;
      for (const side of [-1, 1])
        seams.push(
          line(
            [
              new T.Vector3(side * 0.045, y, 0.199),
              new T.Vector3(-side * 0.045, y + 0.045, 0.211),
            ],
            0.0024,
            4,
          ),
        );
    }
  }
  add(group, combine(seams), trim);
  return surface;
}

function waist(group: T.Group, material: T.Material, thickness = 0.014) {
  const ring = new T.TorusGeometry(0.239, thickness, 8, 80);
  ring.rotateX(Math.PI / 2);
  ring.scale(1, 1, 0.72);
  ring.translate(0, 1.899, 0);
  add(group, ring, material);
}

function puffSleeves(group: T.Group, material: T.Material, lace: T.Material) {
  for (const side of [-1, 1]) {
    const armAttachment = new T.Group();
    armAttachment.name = side < 0 ? "sleeve-left" : "sleeve-right";
    group.add(armAttachment);
    const sleeve = grid(
      (u, t) => {
        const a = u * TAU;
        const radius =
          0.068 +
          Math.sin(t * Math.PI) * 0.061 +
          Math.cos(a * 9) * 0.006 * Math.sin(t * Math.PI);
        return new T.Vector3(
          side * (0.34 + t * 0.067) + Math.sin(a) * radius,
          2.53 - t * 0.3,
          Math.cos(a) * radius * 0.82,
        );
      },
      56,
      24,
    );
    add(armAttachment, sleeve, material);
    const cuff = grid(
      (u, t) => {
        const a = u * TAU,
          r = 0.071 + t * 0.029;
        return new T.Vector3(
          side * 0.411 + Math.sin(a) * r,
          2.25 - t * 0.058 + Math.cos(a * 9) * 0.008 * t,
          Math.cos(a) * r * 0.85,
        );
      },
      56,
      8,
    );
    add(armAttachment, cuff, lace);
  }
}

function embroidery(
  surface: Surface,
  angles: number[],
  start = 0.24,
  end = 0.93,
) {
  const paths: T.BufferGeometry[] = [];
  for (const a of angles) {
    paths.push(
      line(
        Array.from({ length: 40 }, (_, i) => {
          const t = start + ((end - start) * i) / 39;
          return at(
            surface,
            t,
            a + Math.sin((i / 39) * Math.PI * 4) * 0.06,
            0.012,
          );
        }),
        0.0035,
      ),
    );
    for (let k = 0; k < 5; k++) {
      const base = start + ((end - start) * (k + 0.35)) / 5;
      for (const side of [-1, 1])
        paths.push(
          line(
            Array.from({ length: 18 }, (_, i) => {
              const u = i / 17;
              return at(
                surface,
                base + u * 0.067,
                a + side * Math.sin(u * Math.PI) * 0.075,
                0.015,
              );
            }),
            0.003,
            18,
          ),
        );
    }
  }
  return combine(paths);
}

/** Six deliberately different patterns, fitted to y=1.90 waist / y=2.58 shoulders. */
export function createCouture(item: Item, color: string): T.Group {
  const group = new T.Group();
  group.name = "couture";
  const maps = {
    weave: texture("weave"),
    lace: texture("lace"),
    brocade: texture("brocade"),
  };
  const satin = cloth(color, "satin", maps);
  const ivory = cloth(item.accent, "satin", maps);
  const lace = cloth(item.accent, "lace", maps);
  const tulle = cloth(item.accent, "tulle", maps);
  const velvet = cloth(
    new T.Color(color).multiplyScalar(0.58).getStyle(),
    "velvet",
    maps,
  );
  const metallic = new T.MeshStandardMaterial({
    color: gold,
    metalness: 0.73,
    roughness: 0.27,
  });
  metallic.name = "gold embroidery";
  const silver = new T.MeshStandardMaterial({
    color: "#e9f5ff",
    metalness: 0.72,
    roughness: 0.22,
  });
  const crystal = new T.MeshPhysicalMaterial({
    color: "#cae9ff",
    metalness: 0.12,
    roughness: 0.12,
    clearcoat: 1,
    clearcoatRoughness: 0.08,
  });
  const shape = Math.max(0, Math.min(5, item.shape));
  const silhouettes = [
    "moonlight-a-line",
    "rose-lolita",
    "asymmetric-leaf",
    "ice-mermaid",
    "witch-pleats-and-tails",
    "royal-open-robe-and-train",
  ];
  group.userData = {
    silhouette: silhouettes[shape],
    materialKinds: [
      ["satin", "lace", "tulle"],
      ["satin", "lace", "velvet"],
      ["satin"],
      ["satin", "lace", "tulle"],
      ["satin", "velvet"],
      ["satin", "lace", "velvet", "brocade"],
    ][shape],
    waistY: 1.9,
  };

  if (shape === 0) {
    const skirt = radial(
      (t) => 0.235 + 0.625 * Math.pow(t, 0.8),
      (t, a) => 1.895 - 1.655 * t + Math.cos(a * 18) * 0.016 * t,
      0.79,
      18,
      0.025,
    );
    add(group, shell(skirt), satin);
    const veil = radial(
      (t) => 0.249 + 0.654 * Math.pow(t, 0.8),
      (t, a) => 1.9 - 1.58 * t + Math.cos(a * 6) * 0.042 * Math.pow(t, 4),
      0.8,
      18,
      0.029,
    );
    add(group, shell(veil), tulle).renderOrder = 1;
    add(group, hem(veil, 0.006), silver);
    const hemLace = radial(
      (t) => 0.824 + 0.027 * t,
      (t, a) => 0.37 - 0.12 * t + Math.cos(a * 18) * 0.012,
      0.79,
      18,
      0.025,
    );
    add(group, shell(hemLace, 0, TAU, 112, 8), lace);
    bodice(group, satin, silver);
    waist(group, silver, 0.009);
    const stars: { position: T.Vector3; angle: number; scale: number }[] = [];
    for (let row = 0; row < 4; row++) {
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * TAU + row * 0.19;
        stars.push({
          position: at(veil, 0.29 + row * 0.19, a, 0.014),
          angle: a,
          scale: 0.75 + (i % 3) * 0.2,
        });
      }
    }
    ornamentInstances(group, starGeometry(0.024, 0.005), silver, stars);
    add(
      group,
      embroidery(
        skirt,
        [-0.45, 0.45, Math.PI - 0.45, Math.PI + 0.45],
        0.44,
        0.94,
      ),
      silver,
    );
    for (const side of [-1, 1]) {
      add(
        group,
        ribbon(
          [
            new T.Vector3(side * 0.18, 2.48, 0.14),
            new T.Vector3(side * 0.28, 2.56, 0.015),
            new T.Vector3(side * 0.28, 2.49, -0.17),
          ],
          0.073,
        ),
        lace,
      );
    }
    bow(group, ivory, new T.Vector3(0, 1.895, -0.19), 0.21);
  } else if (shape === 1) {
    const radiusAtY = (y: number) =>
      0.235 +
      0.41 *
        Math.pow(
          Math.sin((T.MathUtils.clamp((1.895 - y) / 0.71, 0, 1) * Math.PI) / 2),
          0.75,
        );
    const base = radial(
      (t) => 0.235 + 0.41 * Math.pow(Math.sin((t * Math.PI) / 2), 0.75),
      (t, a) => 1.895 - 0.71 * t + Math.cos(a * 18) * 0.016 * t,
      0.84,
      18,
      0.028,
    );
    add(group, shell(base), satin);
    // Three scalloped tiers sit above an ivory lace petticoat.
    for (let i = 0; i < 3; i++) {
      const tier = radial(
        (t) => radiusAtY(1.72 - i * 0.14 - 0.21 * t) + 0.012 + 0.045 * t,
        (t, a) => 1.72 - i * 0.14 - 0.21 * t + Math.cos(a * 18) * 0.027 * t,
        0.84,
        18,
        0.037,
      );
      add(group, shell(tier, 0, TAU, 112, 16), i % 2 ? ivory : satin);
      add(group, hem(tier, 0.009), ivory);
      const frill = radial(
        (t) => radiusAtY(1.52 - i * 0.14 - 0.055 * t) + 0.055 + 0.015 * t,
        (t, a) => 1.52 - i * 0.14 - t * 0.055 + Math.cos(a * 18) * 0.027,
        0.84,
        18,
        0.036,
      );
      add(group, shell(frill, 0, TAU, 112, 6), lace);
    }
    bodice(group, satin, ivory, false, true);
    waist(group, ivory, 0.021);
    puffSleeves(group, satin, lace);
    const apron: Surface = (t, a) => {
      const y = 1.835 - 0.55 * t + Math.cos(a * Math.PI * 4) * 0.012 * t;
      const angle = a * (0.38 + 0.21 * t);
      const radius =
        radiusAtY(y) +
        0.02 +
        0.08 * Math.sin((t * Math.PI) / 2) +
        Math.cos(angle * 18) * 0.013 * t;
      return new T.Vector3(
        Math.sin(angle) * radius,
        y,
        Math.cos(angle) * radius * 0.84 + 0.014,
      );
    };
    add(group, shell(apron, -1, 1, 48, 26), ivory);
    add(group, hem(apron, 0.009, -1, 1), satin);
    bow(group, velvet, new T.Vector3(0, 2.414, 0.214), 0.1);
    bow(group, satin, new T.Vector3(0, 1.863, 0.291), 0.16);
    for (const side of [-1, 1])
      rose(group, velvet, new T.Vector3(side * 0.23, 1.72, 0.397), 0.095);
    const buttons = Array.from({ length: 4 }, (_, i) => ({
      position: new T.Vector3(0, 2.05 + i * 0.075, 0.209),
      scale: 1,
    }));
    ornamentInstances(
      group,
      new T.SphereGeometry(0.011, 10, 8),
      ivory,
      buttons,
    );
  } else if (shape === 2) {
    const under = radial(
      (t) => 0.235 + 0.37 * Math.pow(t, 0.72),
      (t, a) =>
        1.895 - t * (0.86 + 0.14 * Math.sin(a)) + Math.cos(a * 10) * 0.025 * t,
      0.79,
      10,
      0.025,
    );
    add(group, shell(under), ivory);
    const petals: T.BufferGeometry[] = [],
      veins: T.BufferGeometry[] = [];
    for (let i = 0; i < 10; i++) {
      const angle = (i / 10) * TAU;
      const length = 0.84 + 0.23 * (0.5 + 0.5 * Math.sin(angle));
      const leaf = (u: number, t: number) => {
        const a =
          angle + (u - 0.5) * 0.77 * Math.pow(Math.sin(Math.PI * t), 0.65);
        const r =
          0.244 +
          0.425 * Math.pow(t, 0.73) +
          Math.cos((u - 0.5) * Math.PI) * 0.032 * Math.sin(t * Math.PI);
        return new T.Vector3(
          Math.sin(a) * r,
          1.91 - length * t,
          Math.cos(a) * r * 0.79,
        );
      };
      petals.push(grid(leaf, 20, 28));
      veins.push(
        line(
          Array.from({ length: 23 }, (_, j) =>
            leaf(0.5, 0.05 + (j / 22) * 0.92).add(
              new T.Vector3(
                Math.sin(angle) * 0.007,
                0,
                Math.cos(angle) * 0.007,
              ),
            ),
          ),
          0.0034,
        ),
      );
      for (const side of [-1, 1])
        for (const t of [0.28, 0.45, 0.62]) {
          veins.push(
            line(
              [
                leaf(0.5, t),
                leaf(0.5 + side * 0.18, t + 0.065),
                leaf(0.5 + side * 0.37, t + 0.13),
              ],
              0.0025,
              12,
            ),
          );
        }
    }
    add(group, combine(petals), satin);
    add(group, combine(veins), metallic);
    bodice(group, satin, metallic, true);
    add(
      group,
      ribbon(
        [
          new T.Vector3(0.1, 1.91, 0.19),
          new T.Vector3(-0.1, 2.22, 0.213),
          new T.Vector3(-0.23, 2.48, 0.145),
          new T.Vector3(-0.27, 2.585, 0.01),
          new T.Vector3(-0.26, 2.43, -0.145),
        ],
        0.115,
      ),
      ivory,
    );
    const vines: T.BufferGeometry[] = [];
    for (const side of [-1, 1])
      vines.push(
        line(
          Array.from({ length: 30 }, (_, i) => {
            const t = i / 29;
            return new T.Vector3(
              side * (0.09 + Math.sin(t * Math.PI * 3) * 0.035),
              1.96 + t * 0.44,
              0.208 + t * 0.004,
            );
          }),
          0.004,
        ),
      );
    add(group, combine(vines), metallic);
    waist(group, metallic, 0.008);
    const jewel = add(group, new T.OctahedronGeometry(0.042, 0), crystal);
    jewel.scale.set(0.65, 1.1, 0.3);
    jewel.position.set(-0.23, 2.43, 0.19);
  } else if (shape === 3) {
    const skirt = radial(
      (t) => {
        if (t < 0.62) return 0.236 + Math.sin((t / 0.77) * Math.PI) * 0.088;
        return 0.286 + 0.5 * Math.pow((t - 0.62) / 0.38, 1.5);
      },
      (t, a) => 1.895 - 1.665 * t + Math.cos(a * 20) * 0.023 * Math.pow(t, 5),
      0.77,
      20,
      0.028,
    );
    add(group, shell(skirt, 0, TAU, 128, 56), satin);
    const flounce = radial(
      (t) => 0.35 + 0.47 * Math.pow(t, 0.86),
      (t, a) => 0.69 - t * 0.4 + Math.cos(a * 10) * 0.036 * t,
      0.78,
      20,
      0.034,
    );
    add(group, shell(flounce), tulle).renderOrder = 1;
    add(group, hem(skirt, 0.008), silver);
    bodice(group, satin, silver);
    waist(group, silver, 0.009);
    add(
      group,
      ribbon(
        [
          new T.Vector3(-0.37, 2.5, 0.02),
          new T.Vector3(-0.4, 2.37, -0.12),
          new T.Vector3(-0.22, 2.19, -0.27),
          new T.Vector3(0.22, 2.19, -0.27),
          new T.Vector3(0.4, 2.37, -0.12),
          new T.Vector3(0.37, 2.5, 0.02),
        ],
        0.18,
        new T.Vector3(0, 0, -1),
      ),
      tulle,
    );
    for (const side of [-1, 1])
      add(
        group,
        ribbon(
          [
            new T.Vector3(side * 0.17, 2.47, 0.157),
            new T.Vector3(side * 0.32, 2.54, 0.014),
            new T.Vector3(side * 0.4, 2.35, -0.03),
            new T.Vector3(side * 0.4, 2.16, 0.01),
          ],
          0.09,
        ),
        lace,
      );
    const crystals: { position: T.Vector3; angle: number; scale: number }[] =
      [];
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * TAU;
      crystals.push({
        position: at(skirt, 0.035, a, 0.015),
        angle: a,
        scale: 1,
      });
    }
    for (let i = 0; i < 5; i++)
      crystals.push({
        position: new T.Vector3(
          (i - 2) * 0.063,
          2.43 - Math.abs(i - 2) * 0.01,
          0.208 - Math.abs(i - 2) * 0.009,
        ),
        angle: 0,
        scale: i === 2 ? 1.4 : 0.8,
      });
    const gem = new T.OctahedronGeometry(0.026, 0);
    gem.scale(0.65, 1.55, 0.42);
    ornamentInstances(group, gem, crystal, crystals);
    add(
      group,
      embroidery(
        skirt,
        [-0.62, 0.62, Math.PI - 0.62, Math.PI + 0.62],
        0.08,
        0.58,
      ),
      silver,
    );
  } else if (shape === 4) {
    const pleated: Surface = (t, a) => {
      const fold = Math.asin(Math.sin(a * 16)) / (Math.PI / 2);
      const r = 0.235 + 0.32 * Math.pow(t, 0.85) + fold * 0.036 * t;
      return new T.Vector3(
        Math.sin(a) * r,
        1.895 - t * 0.72,
        Math.cos(a) * r * 0.8,
      );
    };
    add(group, shell(pleated, 0, TAU, 128, 30), velvet);
    add(group, hem(pleated, 0.008), metallic);
    const tail = radial(
      (t) => 0.25 + 0.395 * Math.pow(t, 0.77),
      (t, a) =>
        1.895 - t * (0.675 + 0.81 * Math.pow(Math.abs(Math.sin(a * 2)), 0.7)),
      0.88,
      16,
      0.019,
    );
    add(group, shell(tail, Math.PI * 0.53, Math.PI * 1.47, 80, 38), satin);
    add(group, hem(tail, 0.009, Math.PI * 0.53, Math.PI * 1.47), metallic);
    bodice(group, velvet, metallic, false, true);
    waist(group, satin, 0.028);
    // A small pointed cape collar, cropped above the bodice seams.
    const collar = radial(
      (t) => 0.119 + t * 0.279,
      (t, a) =>
        2.595 -
        t * (0.24 + 0.11 * Math.max(0, Math.cos(a)) + 0.035 * Math.cos(a * 6)),
      0.76,
      0,
      0,
    );
    add(group, shell(collar, 0, TAU, 96, 12), satin);
    add(group, hem(collar, 0.007), metallic);
    const stars: { position: T.Vector3; angle: number; scale: number }[] = [];
    for (let i = 0; i < 16; i++)
      stars.push({
        position: at(pleated, 0.82, (i / 16) * TAU, 0.01),
        angle: (i / 16) * TAU,
        scale: i % 2 ? 0.65 : 1,
      });
    ornamentInstances(group, starGeometry(0.029, 0.006), metallic, stars);
    const moon = new T.Shape();
    moon.absarc(0, 0, 0.065, Math.PI * 0.35, Math.PI * 1.65, false);
    moon.quadraticCurveTo(
      -0.02,
      0,
      Math.cos(Math.PI * 0.35) * 0.065,
      Math.sin(Math.PI * 0.35) * 0.065,
    );
    const buckle = add(
      group,
      new T.ExtrudeGeometry(moon, { depth: 0.014, bevelEnabled: false }),
      metallic,
    );
    buckle.position.set(0, 1.895, 0.19);
    buckle.rotation.z = -0.2;
    bow(group, satin, new T.Vector3(0, 2.35, 0.266), 0.092);
  } else {
    const base = radial(
      (t) => 0.235 + 0.755 * Math.pow(Math.sin((t * Math.PI) / 2), 0.82),
      (t, a) => 1.895 - 1.655 * t + Math.cos(a * 20) * 0.018 * t,
      0.84,
      20,
      0.026,
    );
    add(group, shell(base, 0, TAU, 128, 48), ivory);
    // The visible underskirt is finished separately from the open court robe.
    add(group, embroidery(base, [-0.19, 0.19], 0.3, 0.91), metallic);
    const frontLace: Surface = (t, a) => at(base, 0.91 + t * 0.086, a, 0.014);
    add(group, shell(frontLace, -0.47, 0.47, 40, 10), lace);
    add(group, hem(base, 0.009, -0.48, 0.48), metallic);
    const robe: Surface = (t, a) => {
      const p = base(t, a);
      p.x += Math.sin(a) * 0.034;
      p.z += Math.cos(a) * 0.034;
      p.y += 0.05 * t + 0.07 * Math.sin(a * 3) * Math.pow(t, 3);
      return p;
    };
    satin.bumpMap = maps.brocade;
    satin.bumpScale = 0.004;
    add(group, shell(robe, 0.49, TAU - 0.49, 112, 48), satin);
    const edges = [hem(robe, 0.014, 0.49, TAU - 0.49)];
    for (const a of [0.49, TAU - 0.49])
      edges.push(
        line(
          Array.from({ length: 40 }, (_, i) => at(robe, i / 39, a, 0.013)),
          0.015,
        ),
      );
    add(group, combine(edges), metallic);
    const train = (u: number, t: number) => {
      const w = 0.245 + 0.4 * Math.sin(t * Math.PI * 0.8) + t * 0.25;
      const s = u * 2 - 1;
      return new T.Vector3(
        s * w,
        0.22 +
          1.68 * Math.pow(1 - t, 3) +
          Math.cos(s * Math.PI * 5) * 0.018 * Math.sin(t * Math.PI),
        -0.195 - t * 1.5 + s * s * t * 0.14,
      );
    };
    add(group, grid(train, 60, 56), velvet);
    const trainBorder = [
      line(
        Array.from({ length: 49 }, (_, i) => train(i / 48, 1)),
        0.016,
      ),
    ];
    for (const u of [0, 1])
      trainBorder.push(
        line(
          Array.from({ length: 41 }, (_, i) => train(u, i / 40)),
          0.014,
        ),
      );
    add(group, combine(trainBorder), metallic);
    add(
      group,
      embroidery(
        robe,
        [0.78, 1.2, 1.65, 2.18, TAU - 0.78, TAU - 1.2, TAU - 1.65, TAU - 2.18],
        0.23,
        0.9,
      ),
      metallic,
    );
    bodice(group, satin, metallic, false, true);
    waist(group, metallic, 0.025);
    puffSleeves(group, satin, lace);
    // Brocade stomacher is a panel on the front of the fitted corset.
    const stomacher = grid(
      (u, t) => {
        const x = (u - 0.5) * (0.18 - t * 0.09);
        return new T.Vector3(
          x,
          2.43 - 0.52 * t,
          0.215 - t * 0.025 + Math.cos((u - 0.5) * Math.PI) * 0.012,
        );
      },
      16,
      24,
    );
    add(group, stomacher, ivory);
    const jewels = Array.from({ length: 6 }, (_, i) => ({
      position: new T.Vector3(0, 2.385 - i * 0.077, 0.226 - i * 0.004),
      scale: 1 - i * 0.07,
    }));
    const jewel = new T.OctahedronGeometry(0.022, 0);
    jewel.scale(0.9, 1.4, 0.4);
    ornamentInstances(group, jewel, crystal, jewels);
    bow(group, satin, new T.Vector3(0, 1.916, -0.22), 0.265);
  }
  return group;
}
