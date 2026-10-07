import * as T from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import type { Item } from "../simulation/data";
import { profile } from "./modeling";
import { toon } from "./toon";

type P = [number, number, number];
type Placement = { p?: P; r?: P; s?: P };
const GOLD = "#d5b575";

/** Decorative meshes are merged by material, so their small details stay cheap. */
class Atelier {
  root: T.Group;
  private batches = new Map<T.Material, T.BufferGeometry[]>();
  constructor(root = new T.Group()) {
    this.root = root;
  }
  add(g: T.BufferGeometry, m: T.Material, t: Placement = {}) {
    if (!g.index) {
      const n = g.getAttribute("position").count;
      g.setIndex(Array.from({ length: n }, (_, i) => i));
    }
    // Shape and primitive geometries must have a common attribute signature.
    if (!g.getAttribute("normal")) g.computeVertexNormals();
    if (!g.getAttribute("uv"))
      g.setAttribute(
        "uv",
        new T.Float32BufferAttribute(
          new Float32Array(g.getAttribute("position").count * 2),
          2,
        ),
      );
    const matrix = new T.Matrix4().compose(
      new T.Vector3(...(t.p ?? [0, 0, 0])),
      new T.Quaternion().setFromEuler(new T.Euler(...(t.r ?? [0, 0, 0]))),
      new T.Vector3(...(t.s ?? [1, 1, 1])),
    );
    g.applyMatrix4(matrix);
    const list = this.batches.get(m) ?? [];
    list.push(g);
    this.batches.set(m, list);
  }
  tube(points: P[], radius: number, m: T.Material, closed = false) {
    const path = new T.CatmullRomCurve3(
      points.map((p) => new T.Vector3(...p)),
      closed,
      "centripetal",
    );
    this.add(
      new T.TubeGeometry(
        path,
        points.length === 2 ? 8 : Math.min(96, Math.max(16, points.length * 8)),
        radius,
        5,
        closed,
      ),
      m,
    );
  }
  sphere(p: P, s: P, m: T.Material) {
    this.add(new T.SphereGeometry(1, 12, 9), m, { p, s });
  }
  torus(
    p: P,
    radius: number,
    tube: number,
    m: T.Material,
    r: P = [0, 0, 0],
    arc = Math.PI * 2,
  ) {
    this.add(new T.TorusGeometry(radius, tube, 6, 48, arc), m, { p, r });
  }
  complete() {
    for (const [m, geometries] of this.batches) {
      const geometry = mergeGeometries(geometries, false);
      if (!geometry) throw new Error("Accessory mesh attributes do not match");
      const mesh = new T.Mesh(geometry, m);
      mesh.castShadow = !m.transparent;
      mesh.receiveShadow = true;
      this.root.add(mesh);
      for (const part of geometries) part.dispose();
    }
    this.batches.clear();
    return this.root;
  }
}

function shapeMesh(shape: T.Shape, depth = 0.012) {
  return new T.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelSize: 0.004,
    bevelThickness: 0.004,
    bevelSegments: 2,
    curveSegments: 28,
    steps: 1,
  });
}

function star(radius: number, points = 5) {
  const shape = new T.Shape();
  for (let i = 0; i < points * 2; i++) {
    const a = Math.PI / 2 + (i * Math.PI) / points;
    const r = radius * (i % 2 ? 0.42 : 1);
    if (i === 0) shape.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else shape.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  shape.closePath();
  return shape;
}

function crescent(radius: number) {
  const shape = new T.Shape();
  shape.moveTo(radius * 0.58, radius * 0.82);
  shape.bezierCurveTo(
    -radius * 1.22,
    radius * 1.16,
    -radius * 1.22,
    -radius * 1.16,
    radius * 0.58,
    -radius * 0.82,
  );
  shape.bezierCurveTo(
    -radius * 0.45,
    -radius * 0.64,
    -radius * 0.45,
    radius * 0.64,
    radius * 0.58,
    radius * 0.82,
  );
  return shape;
}

/** A cambered, tapered surface: petals, leaves and feather vanes share structure. */
function blade(length: number, width: number, curl = 0.04, scallop = 0) {
  const vertices: number[] = [],
    indices: number[] = [],
    uv: number[] = [];
  const rows = 18,
    columns = 8;
  for (let j = 0; j <= rows; j++) {
    const t = j / rows;
    const w =
      width *
      Math.pow(Math.sin(Math.PI * t), 0.7) *
      (1 + Math.sin(t * Math.PI * 7) * scallop);
    for (let i = 0; i <= columns; i++) {
      const u = (i / columns) * 2 - 1;
      vertices.push(
        w * u,
        length * t,
        curl * Math.sin(Math.PI * t) * (1 - u * u) + curl * 0.45 * u * u * t,
      );
      uv.push(i / columns, t);
    }
  }
  for (let j = 0; j < rows; j++)
    for (let i = 0; i < columns; i++) {
      const k = j * (columns + 1) + i;
      indices.push(
        k,
        k + columns + 1,
        k + 1,
        k + 1,
        k + columns + 1,
        k + columns + 2,
      );
    }
  const geometry = new T.BufferGeometry();
  geometry.setAttribute("position", new T.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute("uv", new T.Float32BufferAttribute(uv, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function rose(
  a: Atelier,
  p: P,
  radius: number,
  petals: T.Material,
  heart: T.Material,
  rotation: P = [0, 0, 0],
) {
  const transform = new T.Matrix4().compose(
    new T.Vector3(...p),
    new T.Quaternion().setFromEuler(new T.Euler(...rotation)),
    new T.Vector3(1, 1, 1),
  );
  for (let row = 0; row < 3; row++) {
    const count = 3 + row * 2;
    const r = radius * (0.45 + row * 0.25);
    for (let petal = 0; petal < count; petal++) {
      const positions: number[] = [],
        indices: number[] = [],
        uv: number[] = [];
      const angle = (petal / count) * Math.PI * 2 + row * 0.6;
      for (let j = 0; j <= 6; j++)
        for (let i = 0; i <= 10; i++) {
          const v = j / 6,
            u = i / 10;
          const theta = angle + (u - 0.5) * 2.1;
          const radial = r * (0.42 + v * 0.58);
          const z =
            radius *
              (0.48 * (1 - v) +
                0.16 * Math.sin(u * Math.PI) * Math.sin(v * Math.PI)) +
            (2 - row) * radius * 0.11;
          positions.push(Math.cos(theta) * radial, Math.sin(theta) * radial, z);
          uv.push(u, v);
        }
      for (let j = 0; j < 6; j++)
        for (let i = 0; i < 10; i++) {
          const k = j * 11 + i;
          indices.push(k, k + 11, k + 1, k + 1, k + 11, k + 12);
        }
      const g = new T.BufferGeometry();
      g.setAttribute("position", new T.Float32BufferAttribute(positions, 3));
      g.setAttribute("uv", new T.Float32BufferAttribute(uv, 2));
      g.setIndex(indices);
      g.computeVertexNormals();
      g.applyMatrix4(transform);
      a.add(g, petals);
    }
  }
  const center = new T.Vector3(0, 0, radius * 0.6).applyMatrix4(transform);
  a.sphere(
    center.toArray() as P,
    [radius * 0.15, radius * 0.15, radius * 0.1],
    heart,
  );
}

function crystal(
  a: Atelier,
  p: P,
  width: number,
  length: number,
  m: T.Material,
  rotation = 0,
  depth = width * 0.55,
) {
  const geometry = new T.OctahedronGeometry(1, 0);
  a.add(geometry, m, { p, r: [0, 0, rotation], s: [width, length, depth] });
}

function silhouette(root: T.Group, item: Item, names: string[]) {
  root.userData.silhouette = names[item.shape] ?? names[0];
  root.userData.itemId = item.id;
  root.name = item.category + "-" + item.shape;
  return root;
}

export function createCrown(item: Item): T.Group {
  const a = new Atelier();
  const metal = toon(GOLD, "anime-accessory");
  const colored = toon(item.color, "anime-accessory");
  const pearl = toon(item.accent, "anime-accessory");
  const green = toon("#749d79", "anime-accessory");
  const stone = toon(item.color, "anime-accessory");
  const ring = (r = 0.285) =>
    a.torus([0, 0, 0], r, 0.01, metal, [Math.PI / 2, 0, 0]);
  if (item.shape === 0) {
    ring();
    a.torus([0, 0.028, 0], 0.285, 0.006, metal, [Math.PI / 2, 0, 0]);
    for (let i = -3; i <= 3; i++) {
      const theta = i * 0.28,
        x = Math.sin(theta) * 0.285,
        z = Math.cos(theta) * 0.285;
      const h = 0.1 + (3 - Math.abs(i)) * 0.029;
      a.tube(
        [
          [x - 0.034, 0.012, z],
          [x - 0.024, h * 0.58, z + 0.006],
          [x, h, z],
          [x + 0.024, h * 0.58, z + 0.006],
          [x + 0.034, 0.012, z],
        ],
        0.007,
        metal,
      );
      crystal(a, [x, h - 0.029, z + 0.013], 0.022, 0.037, stone);
      a.sphere([x, h + 0.007, z], [0.012, 0.012, 0.012], pearl);
    }
    a.add(shapeMesh(star(0.037)), pearl, { p: [0, 0.17, 0.3] });
  } else if (item.shape === 1) {
    a.torus([0, 0, 0], 0.302, 0.014, green, [Math.PI / 2, 0, 0]);
    const roseMat = toon("#d994ad", "anime-accessory");
    for (let i = 0; i < 8; i++) {
      const theta = (i / 8) * Math.PI * 2;
      const p: P = [Math.sin(theta) * 0.3, 0.027, Math.cos(theta) * 0.3];
      rose(a, p, i % 2 ? 0.061 : 0.072, roseMat, pearl, [-0.5, theta, 0]);
      a.add(blade(0.13, 0.031), green, {
        p: [p[0], -0.006, p[2]],
        r: [-Math.PI / 2, theta + 0.3, 0.5],
      });
      a.sphere(
        [Math.sin(theta + 0.2) * 0.325, 0.025, Math.cos(theta + 0.2) * 0.325],
        [0.013, 0.016, 0.013],
        pearl,
      );
    }
  } else if (item.shape === 2) {
    a.torus([0, 0, 0], 0.291, 0.011, metal, [Math.PI / 2, 0, 0]);
    for (let i = 0; i < 18; i++) {
      const theta = (i / 18) * Math.PI * 2;
      const p: P = [Math.sin(theta) * 0.29, 0.006, Math.cos(theta) * 0.29];
      a.add(blade(0.13, 0.042, 0.026), i % 3 ? green : colored, {
        p,
        r: [-0.92, theta, i % 2 ? 0.5 : -0.5],
      });
      const end: P = [Math.sin(theta) * 0.34, 0.068, Math.cos(theta) * 0.34];
      a.tube([p, [p[0] * 1.09, 0.044, p[2] * 1.09], end], 0.003, metal);
    }
    for (let i = -1; i <= 1; i++)
      a.sphere([i * 0.037, 0.022, 0.315], [0.014, 0.015, 0.014], pearl);
  } else if (item.shape === 3) {
    ring(0.275);
    const silver = toon("#d6e6f1", "anime-accessory");
    for (let i = 0; i < 11; i++) {
      const theta = (i / 11) * Math.PI * 2;
      const h = 0.13 + (i % 3 === 0 ? 0.06 : (i % 3) * 0.012);
      const x = Math.sin(theta) * 0.27,
        z = Math.cos(theta) * 0.27;
      crystal(
        a,
        [x, h * 0.58, z],
        0.043,
        h * 0.64,
        stone,
        -Math.sin(theta) * 0.18,
        0.03,
      );
      a.tube(
        [
          [x, 0, z],
          [x, h * 0.8, z + 0.026],
          [x, h * 1.2, z],
        ],
        0.004,
        silver,
      );
    }
    crystal(a, [0, 0.087, 0.303], 0.04, 0.073, pearl);
  } else if (item.shape === 4) {
    // The moon circlet floats above a slim support band.
    ring(0.277);
    a.torus([0, 0.1, 0.06], 0.209, 0.009, metal, [-0.32, 0, 0]);
    a.add(shapeMesh(crescent(0.119), 0.024), pearl, {
      p: [0.015, 0.09, 0.295],
      r: [0, 0, 0.18],
    });
    for (let i = 0; i < 5; i++) {
      const theta = 0.3 + i * 0.52;
      const x = Math.cos(theta) * 0.22,
        y = 0.1 + Math.sin(theta) * 0.22;
      a.add(shapeMesh(star(i % 2 ? 0.015 : 0.024)), metal, {
        p: [x, y, 0.065],
      });
    }
    crystal(a, [-0.135, -0.028, 0.263], 0.013, 0.035, stone);
  } else {
    ring();
    a.torus([0, 0.052, 0.275], 0.11, 0.009, metal, [0, 0, 0], Math.PI);
    for (let i = 0; i < 13; i++) {
      const angle = (i / 12) * Math.PI;
      const len = i % 2 ? 0.045 : 0.073;
      const x = Math.cos(angle),
        y = Math.sin(angle);
      const ray = new T.Shape();
      ray.moveTo(-0.01, 0);
      ray.lineTo(0, len);
      ray.lineTo(0.01, 0);
      ray.closePath();
      a.add(shapeMesh(ray, 0.014), metal, {
        p: [x * 0.115, 0.052 + y * 0.115, 0.275],
        r: [0, 0, angle - Math.PI / 2],
      });
    }
    a.sphere([0, 0.067, 0.292], [0.05, 0.05, 0.013], colored);
    a.torus([0, 0.067, 0.31], 0.042, 0.004, pearl);
    for (let i = -3; i <= 3; i++)
      a.sphere(
        [i * 0.065, 0.026, Math.sqrt(0.285 ** 2 - (i * 0.065) ** 2)],
        [0.012, 0.012, 0.012],
        pearl,
      );
  }
  return silhouette(a.complete(), item, [
    "fine-jewel-tiara",
    "layered-rose-wreath",
    "laurel-leaf-circlet",
    "faceted-crystal-diadem",
    "floating-crescent-halo",
    "radiant-sun-crown",
  ]);
}

function ribbon(path: P[], width: number) {
  const curve = new T.CatmullRomCurve3(path.map((p) => new T.Vector3(...p)));
  const pos: number[] = [],
    uv: number[] = [],
    indices: number[] = [];
  for (let i = 0; i <= 60; i++) {
    const t = i / 60,
      p = curve.getPoint(t),
      tangent = curve.getTangent(t);
    const normal = new T.Vector3(-tangent.y, tangent.x, 0).normalize();
    const w =
      width *
      Math.pow(Math.sin(Math.PI * Math.max(0.025, Math.min(0.975, t))), 0.3);
    for (const sign of [-1, 1]) {
      const v = p.clone().addScaledVector(normal, w * sign);
      pos.push(v.x, v.y, v.z);
      uv.push(sign === -1 ? 0 : 1, t);
    }
    if (i < 60) {
      const k = i * 2;
      indices.push(k, k + 2, k + 1, k + 1, k + 2, k + 3);
    }
  }
  const geometry = new T.BufferGeometry();
  geometry.setAttribute("position", new T.Float32BufferAttribute(pos, 3));
  geometry.setAttribute("uv", new T.Float32BufferAttribute(uv, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

export function createWings(item: Item): T.Group {
  const root = new T.Group();
  for (const side of [-1, 1]) {
    const half = new T.Group();
    half.name = side === -1 ? "wing-left" : "wing-right";
    root.add(half);
    const a = new Atelier(half);
    const soft = toon(item.color, "anime-wing-membrane");
    soft.transparent = true;
    soft.opacity = 0.68;
    soft.depthWrite = false;
    const light = toon(item.accent, "anime-wing-light");
    light.transparent = true;
    light.opacity = 0.82;
    light.depthWrite = false;
    const edge = toon(item.accent, "anime-accessory");
    const metal = toon(GOLD, "anime-accessory");
    const p = (x: number, y: number, z = 0): P => [x * side, y, z];
    const vein = (points: P[], radius = 0.005, mat: T.Material = edge) =>
      a.tube(
        points.map((v) => p(...v)),
        radius,
        mat,
      );
    if (item.shape === 0) {
      const upper = new T.Shape();
      upper.moveTo(0.1 * side, -0.06);
      upper.bezierCurveTo(
        0.38 * side,
        0.48,
        1.1 * side,
        0.79,
        1.22 * side,
        0.44,
      );
      upper.bezierCurveTo(
        1.36 * side,
        0.19,
        0.89 * side,
        -0.08,
        0.55 * side,
        -0.2,
      );
      upper.quadraticCurveTo(0.25 * side, -0.19, 0.1 * side, -0.06);
      const lower = new T.Shape();
      lower.moveTo(0.13 * side, -0.09);
      lower.bezierCurveTo(
        0.65 * side,
        -0.06,
        1.03 * side,
        -0.3,
        0.65 * side,
        -0.67,
      );
      lower.bezierCurveTo(
        0.48 * side,
        -0.86,
        0.19 * side,
        -0.49,
        0.13 * side,
        -0.09,
      );
      for (const [shape, mat] of [
        [upper, soft],
        [lower, light],
      ] as const) {
        a.add(new T.ShapeGeometry(shape, 40), mat);
        a.tube(
          shape
            .getSpacedPoints(64)
            .slice(0, -1)
            .map((v) => [v.x, v.y, 0.009] as P),
          0.008,
          edge,
          true,
        );
      }
      vein(
        [
          [0.12, -0.06, 0.013],
          [0.43, 0.13, 0.025],
          [1.2, 0.44, 0.015],
        ],
        0.008,
      );
      for (let i = 0; i < 5; i++) {
        const x = 0.36 + i * 0.14;
        vein(
          [
            [0.15, -0.07, 0.012],
            [x, 0.1 + i * 0.037, 0.02],
            [0.54 + i * 0.13, 0.44 + Math.sin(i * 0.6) * 0.13, 0.014],
          ],
          0.004,
        );
        vein(
          [
            [0.15, -0.08, 0.012],
            [0.32 + i * 0.045, -0.3, 0.018],
            [0.3 + i * 0.085, -0.51 - Math.sin(i * 0.65) * 0.13, 0.012],
          ],
          0.004,
        );
      }
      a.torus(p(0.94, 0.36, 0.018), 0.078, 0.009, metal);
      a.sphere(p(0.94, 0.36, 0.021), [0.041, 0.065, 0.008], light);
    } else if (item.shape === 1 || item.shape === 2) {
      const leaves = item.shape === 2;
      const surface = leaves ? toon("#97c7ad", "anime-accessory") : soft;
      const tip = leaves ? toon("#e6ebad", "anime-accessory") : light;
      const lobes = leaves ? 5 : 4;
      for (let i = 0; i < lobes; i++) {
        const rotation = side * (-0.4 - i * 0.45);
        const length = leaves ? 0.87 - i * 0.045 : 1.03 - i * 0.04;
        const width = leaves ? 0.125 : 0.245;
        const origin: P = p(0.11 + i * 0.025, -0.02 - i * 0.055, -i * 0.016);
        const placement = { p: origin, r: [0, 0, rotation] as P };
        a.add(
          blade(length, width, 0.1, leaves ? 0.055 : 0.018),
          i % 2 ? tip : surface,
          placement,
        );
        const matrix = new T.Matrix4().compose(
          new T.Vector3(...origin),
          new T.Quaternion().setFromEuler(new T.Euler(0, 0, rotation)),
          new T.Vector3(1, 1, 1),
        );
        const map = (points: P[]) =>
          points.map(
            (v) => new T.Vector3(...v).applyMatrix4(matrix).toArray() as P,
          );
        a.tube(
          map([
            [0, 0.01, 0.007],
            [0, length * 0.5, 0.11],
            [0, length * 0.95, 0.036],
          ]),
          0.006,
          edge,
        );
        for (let k = 1; k < 6; k++)
          for (const sign of [-1, 1]) {
            const t = k / 7,
              w = width * Math.pow(Math.sin(t * Math.PI), 0.7);
            a.tube(
              map([
                [0, length * (t - 0.08), 0.103 * Math.sin(t * Math.PI)],
                [sign * w * 0.48, length * t, 0.07],
                [sign * w * 0.89, length * (t + 0.06), 0.025],
              ]),
              0.0028,
              edge,
            );
          }
      }
      if (!leaves)
        rose(
          a,
          p(0.2, -0.1, 0.08),
          0.11,
          toon("#d797af", "anime-accessory"),
          metal,
        );
      else
        for (let i = 0; i < 5; i++)
          a.sphere(
            p(0.15, -0.04 - i * 0.07, 0.08),
            [0.017, 0.021, 0.017],
            metal,
          );
    } else if (item.shape === 3) {
      const glass = toon("#99d3e9", "anime-ice-wing");
      glass.transparent = true;
      glass.opacity = 0.86;
      glass.depthWrite = false;
      const silver = toon("#ddecf5", "anime-accessory");
      const ends: P[] = [
        [0.6, 0.67, 0],
        [0.98, 0.57, 0],
        [1.29, 0.29, 0],
        [1.15, -0.13, 0],
        [0.97, -0.49, 0],
        [0.59, -0.68, 0],
      ];
      for (let i = 0; i < ends.length; i++) {
        const end = ends[i],
          start: P = [0.14, -0.07, i * -0.012];
        const dx = end[0] - start[0],
          dy = end[1] - start[1];
        const len = Math.hypot(dx, dy),
          angle = -Math.atan2(dx * side, dy);
        const center = p(
          (end[0] + start[0]) / 2,
          (end[1] + start[1]) / 2,
          start[2],
        );
        crystal(
          a,
          center,
          0.115 + (i % 2) * 0.035,
          len * 0.53,
          glass,
          angle,
          0.035,
        );
        vein([start, [end[0] * 0.5, end[1] * 0.5, 0.039], end], 0.0045, silver);
        a.sphere(p(end[0], end[1], 0), [0.014, 0.014, 0.014], silver);
      }
      for (let i = 0; i < 4; i++)
        crystal(
          a,
          p(0.48 + i * 0.16, 0.4 - i * 0.19, 0.08),
          0.045,
          0.17,
          light,
          side * (-0.8 + i * 0.6),
        );
    } else if (item.shape === 4) {
      const silk = toon(item.color, "anime-accessory");
      const paths: P[][] = [
        [
          [0.1, -0.03, 0],
          [0.39, 0.36, -0.04],
          [1.01, 0.49, -0.05],
          [1.3, 0.2, 0.01],
          [1.04, -0.03, 0.03],
          [0.7, 0.15, 0.01],
        ],
        [
          [0.15, -0.12, -0.025],
          [0.53, -0.34, 0.07],
          [1.1, -0.18, 0.12],
          [1.21, -0.43, 0.05],
          [0.91, -0.69, -0.02],
          [0.64, -0.49, -0.04],
        ],
        [
          [0.13, 0.03, -0.05],
          [0.45, 0.67, -0.11],
          [0.99, 0.73, -0.09],
          [1.15, 0.48, -0.05],
        ],
      ];
      for (let i = 0; i < paths.length; i++) {
        const path = paths[i].map((v) => p(...v));
        a.add(ribbon(path, i === 2 ? 0.018 : 0.05), i === 1 ? light : silk);
        a.tube(path, 0.004, metal);
      }
      for (let i = 0; i < 8; i++) {
        const theta = i * 0.78;
        const pos = p(0.37 + i * 0.13, Math.sin(theta) * 0.45 - 0.01, 0.055);
        a.add(
          shapeMesh(star(i % 3 === 0 ? 0.064 : 0.029)),
          i % 2 ? edge : metal,
          { p: pos, r: [0, 0, side * theta] },
        );
      }
    } else {
      const feather = toon("#fff9e8", "anime-accessory");
      const pale = toon("#eee7d9", "anime-accessory");
      const spine = toon("#ddd7e7", "anime-feather-spine");
      vein(
        [
          [0.1, -0.09, 0.03],
          [0.3, 0.34, 0.02],
          [0.69, 0.43, 0.01],
          [1.08, 0.16, 0],
        ],
        0.025,
        pale,
      );
      for (let i = 0; i < 12; i++) {
        const start: P = p(
          0.16 + i * 0.065,
          0.19 + Math.sin((i / 11) * Math.PI) * 0.18,
          -0.01 - i * 0.002,
        );
        const end: P = p(0.32 + i * 0.094, 0.66 - i * 0.122, -0.018);
        const dx = end[0] - start[0],
          dy = end[1] - start[1];
        const length = Math.hypot(dx, dy),
          rotation = -Math.atan2(dx, dy);
        const matrix = new T.Matrix4().compose(
          new T.Vector3(...start),
          new T.Quaternion().setFromEuler(new T.Euler(0, 0, rotation)),
          new T.Vector3(1, 1, 1),
        );
        const map = (list: P[]) =>
          list.map(
            (v) => new T.Vector3(...v).applyMatrix4(matrix).toArray() as P,
          );
        const width = 0.088 + i * 0.004;
        a.add(blade(length, width, 0.031, 0.018), i % 3 ? feather : pale, {
          p: start,
          r: [0, 0, rotation],
        });
        a.tube(
          map([
            [0, 0.018, 0.008],
            [0, length * 0.48, 0.04],
            [0, length * 0.94, 0.016],
          ]),
          0.0038,
          spine,
        );
      }
      for (let i = 0; i < 7; i++) {
        const rotation = side * (-0.7 - i * 0.24);
        a.add(blade(0.33 + i * 0.012, 0.06, 0.052), feather, {
          p: p(
            0.13 + i * 0.064,
            0.15 + Math.sin((i / 7) * Math.PI) * 0.15,
            0.06,
          ),
          r: [0, 0, rotation],
        });
      }
    }
    a.sphere(p(0.12, -0.06, 0.042), [0.028, 0.1, 0.043], metal);
    a.complete();
  }
  return silhouette(root, item, [
    "veined-butterfly-membranes",
    "layered-rose-petal-wings",
    "five-blade-leaf-fan",
    "faceted-ice-crystal-fan",
    "floating-star-orbit-ribbons",
    "layered-anime-angel-feathers",
  ]);
}

export function createWand(item: Item): T.Group {
  const a = new Atelier();
  const metal = toon("#ffe3a0", "wand-gold");
  const colored = toon(item.color, "wand-enamel");
  const pearl = toon(item.accent, "wand-pearl");
  const stone = toon(item.color, "wand-crystal");
  stone.emissive.set(item.color).multiplyScalar(0.12);
  a.add(
    new T.CylinderGeometry(0.01, 0.016, 0.91, 12),
    item.shape === 2 ? toon("#ae8765") : metal,
    { p: [0, 0.47, 0] },
  );
  a.add(new T.CylinderGeometry(0.018, 0.016, 0.16, 12), colored, {
    p: [0, 0.3, 0],
  });
  for (const y of [0.225, 0.38, 0.73, 0.79])
    a.torus([0, y, 0], 0.018, 0.004, metal, [Math.PI / 2, 0, 0]);
  a.sphere([0, 0.014, 0], [0.019, 0.021, 0.019], pearl);
  if (item.shape === 0) {
    a.add(shapeMesh(star(0.142), 0.025), metal, { p: [0, 0.96, -0.009] });
    a.add(shapeMesh(star(0.113), 0.018), colored, { p: [0, 0.96, 0.016] });
    crystal(a, [0, 0.96, 0.049], 0.037, 0.042, stone);
    for (let i = 0; i < 5; i++) {
      const theta = Math.PI / 2 + (i * Math.PI * 2) / 5;
      a.sphere(
        [Math.cos(theta) * 0.122, 0.96 + Math.sin(theta) * 0.122, 0.028],
        [0.008, 0.008, 0.008],
        pearl,
      );
    }
  } else if (item.shape === 1) {
    rose(a, [0, 0.96, 0], 0.136, toon("#f28eb6"), pearl);
    const green = toon("#86c696");
    for (const sign of [-1, 1])
      a.add(blade(0.18, 0.047, 0.033), green, {
        p: [0, 0.82, -0.014],
        r: [0.08, 0, -sign * 0.93],
      });
    a.tube(
      [
        [0, 0.12, 0.013],
        [0.025, 0.37, 0.02],
        [-0.026, 0.62, 0.015],
        [0.011, 0.82, 0.006],
      ],
      0.005,
      green,
    );
  } else if (item.shape === 2) {
    const vine = toon("#9ccc87");
    a.tube(
      [
        [0, 0.42, 0],
        [-0.045, 0.69, 0],
        [0.07, 0.9, 0],
        [-0.06, 1.07, 0],
        [-0.16, 1.02, 0],
      ],
      0.018,
      vine,
    );
    a.tube(
      [
        [0, 0.76, 0],
        [0.03, 0.94, 0],
        [0.13, 1.04, 0],
        [0.17, 0.98, 0],
      ],
      0.009,
      metal,
    );
    crystal(a, [0.025, 0.975, 0.018], 0.056, 0.085, stone, -0.35);
    for (let i = 0; i < 5; i++)
      a.add(blade(0.11 + (i % 2) * 0.025, 0.029, 0.025), vine, {
        p: [(i % 2 ? -1 : 1) * 0.024, 0.57 + i * 0.1, 0.014],
        r: [0, 0, (i % 2 ? 1 : -1) * 0.9],
      });
    a.sphere([-0.149, 1.021, 0.004], [0.018, 0.024, 0.018], pearl);
  } else if (item.shape === 3) {
    const silver = toon("#e9f7ff");
    crystal(a, [0, 0.96, 0], 0.07, 0.19, stone);
    for (const sign of [-1, 1]) {
      crystal(a, [sign * 0.083, 0.91, 0], 0.037, 0.12, stone, -sign * 0.4);
      a.tube(
        [
          [sign * 0.012, 0.77, 0],
          [sign * 0.115, 0.87, 0.012],
          [sign * 0.083, 1.03, 0],
        ],
        0.008,
        silver,
      );
    }
    a.torus([0, 0.92, 0.04], 0.1, 0.005, silver);
  } else if (item.shape === 4) {
    a.add(shapeMesh(crescent(0.148), 0.028), metal, { p: [0.025, 0.966, 0] });
    a.torus(
      [0.013, 0.965, 0.018],
      0.136,
      0.004,
      pearl,
      [0, 0, 0],
      Math.PI * 1.44,
    );
    a.add(shapeMesh(star(0.061)), colored, { p: [0.046, 0.962, 0.03] });
    a.tube(
      [
        [0.077, 1.08, 0.02],
        [0.081, 1.027, 0.022],
        [0.046, 1.018, 0.022],
      ],
      0.003,
      metal,
    );
    for (let i = 0; i < 4; i++)
      a.sphere(
        [-0.025 + i * 0.016, 0.56 + i * 0.052, 0.023],
        [0.007, 0.007, 0.007],
        pearl,
      );
  } else {
    a.torus([0, 0.969, 0], 0.092, 0.014, metal);
    a.sphere([0, 0.969, 0], [0.067, 0.067, 0.026], colored);
    for (let i = 0; i < 12; i++) {
      const theta = (i / 12) * Math.PI * 2;
      const ray = new T.Shape();
      ray.moveTo(-0.013, 0);
      ray.lineTo(0, i % 2 ? 0.045 : 0.079);
      ray.lineTo(0.013, 0);
      ray.closePath();
      a.add(shapeMesh(ray, 0.013), metal, {
        p: [Math.cos(theta) * 0.104, 0.969 + Math.sin(theta) * 0.104, 0],
        r: [0, 0, theta - Math.PI / 2],
      });
    }
    a.sphere([0, 0.969, 0.038], [0.026, 0.026, 0.012], pearl);
  }
  // Silk ties have a folded surface and a narrow gilded center.
  for (const sign of [-1, 1]) {
    a.add(blade(0.11, 0.042, 0.036), colored, {
      p: [0, 0.735, 0.022],
      r: [0, 0, -sign * 1.32],
    });
    a.add(
      ribbon(
        [
          [sign * 0.01, 0.74, 0.025],
          [sign * 0.047, 0.63, 0.019],
          [sign * 0.029, 0.53, 0.012],
        ],
        0.017,
      ),
      pearl,
    );
  }
  a.sphere([0, 0.734, 0.035], [0.02, 0.018, 0.016], metal);
  const root = a.complete();
  // All six props share the same grip origin, independent of the head shape.
  for (const child of root.children)
    if (child instanceof T.Mesh) child.geometry.translate(0, -0.3, 0);
  root.userData.grip = [0, 0, 0];
  return silhouette(root, item, [
    "beveled-five-point-star-wand",
    "sculpted-rose-and-vine-staff",
    "living-branch-staff",
    "three-prism-ice-scepter",
    "suspended-crescent-star-staff",
    "twelve-ray-sun-scepter",
  ]);
}

// These contours follow the VRM foot in its neutral bind pose. The upper
// lofts from the sole into a real ankle opening instead of intersecting the
// instep with an open half-cylinder.
function shoeCollar(a: number): P {
  return [
    Math.sin(a) * 0.074,
    0.214 - Math.cos(a) * 0.021,
    -0.067 + Math.cos(a) * 0.091,
  ];
}
function shoeUpper() {
  const pos: number[] = [],
    indices: number[] = [],
    uv: number[] = [];
  const rows = 20,
    cols = 64;
  for (let j = 0; j <= rows; j++) {
    const t = j / rows,
      rise = Math.pow(Math.sin((t * Math.PI) / 2), 0.65);
    for (let i = 0; i <= cols; i++) {
      const a = (i / cols) * Math.PI * 2;
      const collar = shoeCollar(a);
      const width = 0.105 + 0.009 * Math.cos(a);
      const x = Math.sin(a) * width,
        z = 0.054 + Math.cos(a) * 0.232;
      pos.push(
        T.MathUtils.lerp(x, collar[0], t),
        T.MathUtils.lerp(0.041, collar[1], rise),
        T.MathUtils.lerp(z, collar[2], t),
      );
      uv.push(i / cols, t);
      if (j < rows && i < cols) {
        const k = j * (cols + 1) + i;
        indices.push(k, k + cols + 1, k + 1, k + 1, k + cols + 1, k + cols + 2);
      }
    }
  }
  const g = new T.BufferGeometry();
  g.setAttribute("position", new T.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new T.Float32BufferAttribute(uv, 2));
  g.setIndex(indices);
  g.computeVertexNormals();
  return g;
}

function shoeSole() {
  const shape = new T.Shape();
  for (let i = 0; i <= 96; i++) {
    const a = (i / 96) * Math.PI * 2;
    const x = Math.sin(a) * (0.109 + 0.009 * Math.cos(a));
    const z = 0.054 + Math.cos(a) * 0.236;
    if (!i) shape.moveTo(x, z);
    else shape.lineTo(x, z);
  }
  shape.closePath();
  return new T.ExtrudeGeometry(shape, {
    depth: 0.023,
    bevelEnabled: true,
    bevelSize: 0.004,
    bevelThickness: 0.004,
    bevelSegments: 2,
    steps: 1,
    curveSegments: 24,
  });
}

export function createShoes(
  item: Item,
  anchors?: { leftFoot: T.Vector3; rightFoot: T.Vector3 },
): T.Group {
  const root = new T.Group();
  for (const side of [-1, 1]) {
    const foot = new T.Group();
    foot.name = side === -1 ? "shoe-left" : "shoe-right";
    const anchor = side < 0 ? anchors?.rightFoot : anchors?.leftFoot;
    foot.position.set(
      anchor?.x ?? side * 0.1574,
      0,
      (anchor?.z ?? -0.0661) + 0.0661,
    );
    root.add(foot);
    const a = new Atelier(foot);
    const leather = toon(item.color, "anime-accessory");
    const trim = toon(item.accent, "anime-accessory");
    const metal = toon(GOLD, "anime-accessory");
    const sole = toon("#938170", "anime-accessory");
    a.add(shoeUpper(), leather);
    a.tube(
      Array.from({ length: 49 }, (_, i) => shoeCollar((i / 48) * Math.PI * 2)),
      0.004,
      trim,
    );
    a.add(shoeSole(), item.shape === 3 ? trim : sole, {
      p: [0, 0.031, 0],
      r: [Math.PI / 2, 0, 0],
    });
    a.tube(
      [
        [-0.088, 0.05, -0.07],
        [-0.101, 0.05, 0.1],
        [-0.07, 0.05, 0.235],
        [0, 0.047, 0.286],
        [0.07, 0.05, 0.235],
        [0.101, 0.05, 0.1],
        [0.088, 0.05, -0.07],
      ],
      0.005,
      item.shape === 5 ? metal : trim,
    );
    if (item.shape === 0) {
      // A raised Mary Jane instep strap, separate heel and small rectangular buckle.
      a.tube(
        [
          [-0.082, 0.17, 0.025],
          [-0.05, 0.232, 0.025],
          [0.05, 0.232, 0.025],
          [0.082, 0.17, 0.025],
        ],
        0.012,
        trim,
      );
      a.add(new T.BoxGeometry(0.035, 0.026, 0.014), metal, {
        p: [0.073, 0.211, 0.039],
        r: [0, 0, -0.3],
      });
      a.add(new T.BoxGeometry(0.06, 0.045, 0.063), leather, {
        p: [0, 0.029, -0.09],
      });
      a.sphere([0, 0.168, 0.184], [0.018, 0.012, 0.021], metal);
    } else if (item.shape === 1) {
      // The ribbons cross twice around the ankle, with satin tails at the side.
      for (const sign of [-1, 1]) {
        a.tube(
          Array.from({ length: 40 }, (_, i): P => {
            const t = i / 39,
              angle = sign * (t * Math.PI * 2 + Math.PI / 2);
            return [
              Math.sin(angle) * (0.074 - 0.005 * t),
              0.205 + t * 0.27,
              -0.071 - t * 0.009 + Math.cos(angle) * 0.087,
            ];
          }),
          0.0065,
          trim,
        );
        a.add(blade(0.063, 0.019, 0.018), trim, {
          p: [side * 0.073, 0.47, -0.077],
          r: [0, 0, sign * 0.92],
        });
      }
      rose(a, [0, 0.168, 0.178], 0.035, leather, metal, [-0.76, 0, 0]);
    } else if (item.shape === 2) {
      const leaf = toon("#d1e4ad", "anime-accessory");
      a.add(
        profile([
          [0.17, 0.086, 0.105, -0.062],
          [0.26, 0.079, 0.09, -0.067],
          [0.4, 0.076, 0.091, -0.082],
          [0.46, 0.081, 0.098, -0.084],
        ]),
        leather,
      );
      for (let i = 0; i < 7; i++) {
        const theta = (i / 7) * Math.PI * 2;
        a.add(blade(0.15, 0.03, 0.025), leaf, {
          p: [Math.sin(theta) * 0.081, 0.41, -0.084 + Math.cos(theta) * 0.098],
          r: [0.18 * Math.cos(theta), theta, 0.24 * Math.sin(theta)],
        });
      }
      a.tube(
        [
          [0, 0.16, 0.053],
          [0.03, 0.27, 0.041],
          [-0.02, 0.4, 0.031],
        ],
        0.005,
        metal,
      );
      for (let i = 0; i < 4; i++)
        a.add(blade(0.06, 0.016, 0.013), leaf, {
          p: [0, 0.22 + i * 0.05, 0.04],
          r: [0, 0, (i % 2 ? 1 : -1) * 0.7],
        });
    } else if (item.shape === 3) {
      const glass = toon("#c3e7f0", "anime-accessory");
      a.add(shoeUpper(), glass, { p: [0, 0.003, 0], s: [1.035, 1.035, 1.025] });
      crystal(a, [0, 0.181, 0.163], 0.032, 0.041, glass, 0, 0.039);
      for (const sign of [-1, 1])
        crystal(
          a,
          [sign * 0.053, 0.16, 0.161],
          0.018,
          0.03,
          trim,
          sign * 0.65,
          0.021,
        );
      a.tube(
        [
          [-0.074, 0.101, 0.096],
          [-0.044, 0.189, -0.025],
          [0.057, 0.184, -0.04],
          [0.076, 0.11, 0.039],
        ],
        0.007,
        trim,
      );
      a.add(new T.ConeGeometry(0.027, 0.06, 6), glass, {
        p: [0, 0.034, -0.1],
        r: [0, 0, Math.PI],
      });
    } else if (item.shape === 4) {
      a.add(
        profile([
          [0.17, 0.086, 0.105, -0.062],
          [0.26, 0.079, 0.091, -0.067],
          [0.4, 0.076, 0.093, -0.082],
          [0.55, 0.087, 0.11, -0.09],
          [0.73, 0.105, 0.126, -0.091],
        ]),
        leather,
      );
      a.tube(
        Array.from({ length: 49 }, (_, i): P => {
          const a = (i / 48) * Math.PI * 2;
          return [Math.sin(a) * 0.105, 0.73, -0.091 + Math.cos(a) * 0.126];
        }),
        0.007,
        trim,
      );
      for (let i = 0; i < 3; i++) {
        const y = 0.25 + i * 0.17;
        const rx = [0.081, 0.08, 0.094][i],
          rz = [0.094, 0.099, 0.12][i],
          cz = [-0.067, -0.084, -0.09][i];
        a.tube(
          Array.from({ length: 49 }, (_, j): P => {
            const angle = (j / 48) * Math.PI * 2;
            return [Math.sin(angle) * rx, y, cz + Math.cos(angle) * rz];
          }),
          0.006,
          trim,
        );
        a.add(new T.BoxGeometry(0.039, 0.031, 0.01), metal, {
          p: [side * 0.056, y, 0.023],
          r: [0, side * 0.5, 0],
        });
        a.add(new T.BoxGeometry(0.022, 0.014, 0.012), leather, {
          p: [side * 0.057, y, 0.031],
          r: [0, side * 0.5, 0],
        });
      }
      a.tube(
        [
          [0, 0.15, 0.034],
          [0, 0.44, 0.028],
          [0, 0.7, 0.036],
        ],
        0.0035,
        metal,
      );
      a.add(new T.BoxGeometry(0.063, 0.05, 0.064), leather, {
        p: [0, 0.025, -0.105],
      });
    } else {
      // Gold silk pumps with pearl chains and a sculpted fan at the toe.
      a.tube(
        [
          [-0.072, 0.15, -0.025],
          [-0.056, 0.21, -0.08],
          [0.056, 0.21, -0.08],
          [0.072, 0.15, -0.025],
        ],
        0.0055,
        metal,
      );
      for (let i = 0; i < 7; i++)
        a.sphere(
          [
            -0.05 + i * 0.017,
            0.201 + Math.sin((i / 6) * Math.PI) * 0.012,
            -0.066,
          ],
          [0.007, 0.007, 0.007],
          trim,
        );
      for (let i = -2; i <= 2; i++)
        a.add(blade(0.059, 0.015, 0.019), metal, {
          p: [0, 0.17, 0.175],
          r: [-1.06, 0, i * 0.33],
        });
      a.sphere([0, 0.193, 0.174], [0.017, 0.014, 0.017], trim);
      a.add(new T.CylinderGeometry(0.027, 0.019, 0.048, 10), metal, {
        p: [0, 0.03, -0.1],
      });
    }
    a.complete();
  }
  return silhouette(root, item, [
    "buckled-mary-jane-heels",
    "cross-laced-ballet-slippers",
    "leaf-cuff-ankle-boots",
    "faceted-glass-slippers",
    "triple-buckle-knee-boots",
    "pearl-chain-gold-silk-pumps",
  ]);
}
