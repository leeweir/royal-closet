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
  } else if (item.shape === 5) {
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
  } else if (item.shape === 6) {
    // 玉簪流苏: a jade pin laid across a low band with two hanging tassels.
    const jade = toon("#8fc9ac", "anime-accessory");
    // A slim jade band circles the head under the pin.
    a.torus([0, 0, 0], 0.268, 0.009, metal, [Math.PI / 2, 0, 0]);
    a.tube(
      [
        [-0.262, 0.03, 0.07],
        [-0.19, 0.052, 0.15],
        [-0.04, 0.058, 0.268],
        [0.15, 0.034, 0.242],
      ],
      0.009,
      jade,
    );
    a.tube(
      [
        [0.262, 0.026, 0.06],
        [0.19, 0.04, 0.14],
        [0.06, 0.05, 0.24],
      ],
      0.008,
      jade,
    );
    a.sphere([0.163, 0.03, 0.222], [0.026, 0.02, 0.026], pearl);
    a.add(blade(0.062, 0.028, 0.02), pearl, {
      p: [0.15, 0.032, 0.222],
      r: [0, 0, -1.35],
    });
    for (const x of [-0.12, 0.02]) {
      a.add(shapeMesh(star(0.021)), jade, { p: [x, 0.075, 0.286] });
      a.tube(
        [
          [x, 0.062, 0.288],
          [x + 0.012, -0.03, 0.3],
          [x - 0.004, -0.115, 0.294],
        ],
        0.0035,
        metal,
      );
      a.sphere([x - 0.004, -0.142, 0.293], [0.017, 0.024, 0.017], pearl);
    }
    a.add(shapeMesh(star(0.03)), jade, { p: [-0.255, 0.036, 0.075] });
  } else if (item.shape === 7) {
    // 金步摇冠: a gilded band with swaying chains and pendants.
    a.torus([0, 0, 0], 0.281, 0.011, metal, [Math.PI / 2, 0, 0]);
    for (let i = 0; i < 5; i++) {
      const theta = -0.92 + i * 0.46;
      const x = Math.sin(theta) * 0.278,
        z = Math.cos(theta) * 0.278;
      a.add(blade(0.108, 0.034, 0.024), colored, {
        p: [x, 0.016, z],
        r: [-0.24, theta, 0],
      });
      const links: P[] = [];
      for (let k = 0; k < 4; k++)
        links.push([x * (1.045 + k * 0.012), 0.09 - k * 0.052, z * (1.02 + k * 0.02)]);
      a.tube(links, 0.0032, metal);
      crystal(a, [links[3][0], links[3][1] - 0.03, links[3][2]], 0.019, 0.032, stone);
    }
    for (let i = -2; i <= 2; i++)
      a.sphere([i * 0.058, 0.028, 0.276 - Math.abs(i) * 0.028], [0.013, 0.013, 0.013], pearl);
    a.add(shapeMesh(star(0.036)), colored, { p: [0, 0.058, 0.302] });
  } else if (item.shape === 8) {
    // 素色发带: a plain ribbon with a small knot, no metal at all.
    const cloth = toon(item.color, "anime-accessory");
    const band = new T.TorusGeometry(0.272, 0.013, 6, 48);
    band.scale(1, 1, 1.02);
    a.add(band, cloth, { p: [0, 0, 0], r: [Math.PI / 2, 0, 0] });
    a.add(
      ribbon(
        [
          [-0.14, 0.03, 0.245],
          [-0.19, 0.075, 0.275],
          [-0.235, 0.135, 0.26],
        ],
        0.042,
      ),
      cloth,
    );
    a.add(
      ribbon(
        [
          [0.1, 0.028, 0.253],
          [0.16, 0.07, 0.283],
          [0.205, 0.128, 0.268],
        ],
        0.038,
      ),
      cloth,
    );
    a.sphere([-0.055, 0.036, 0.272], [0.022, 0.019, 0.02], cloth);
  } else if (item.shape === 9) {
    // 红领巾结: a knotted scarf whose two broad ties run out along the collar.
    const cloth = toon("#d2483f", "anime-accessory");
    // The band follows the collar line so the knot reads at head width.
    a.torus([0, 0.03, 0], 0.285, 0.016, cloth, [Math.PI / 2, 0, 0], Math.PI * 0.72);
    for (const side of [-1, 1])
      a.add(
        ribbon(
          [
            [side * 0.03, 0.035, 0.27],
            [side * 0.14, 0.02, 0.276],
            [side * 0.245, -0.02, 0.22],
          ],
          0.062,
        ),
        cloth,
      );
    a.sphere([0, 0.04, 0.278], [0.034, 0.028, 0.029], cloth);
    a.add(
      ribbon(
        [
          [0, 0.02, 0.28],
          [-0.018, -0.075, 0.29],
          [0.012, -0.17, 0.278],
        ],
        0.062,
      ),
      cloth,
    );
  } else if (item.shape === 10) {
    // 毛线发圈: a chunky knit tie wrapping a loose side bun.
    const wool = toon(item.color, "anime-accessory");
    const coil = new T.TorusGeometry(0.058, 0.019, 8, 28);
    a.add(coil, wool, { p: [0.163, 0.055, 0.232], r: [0.2, 0.8, 0] });
    const coil2 = new T.TorusGeometry(0.058, 0.019, 8, 28);
    a.add(coil2, wool, { p: [0.198, 0.058, 0.213], r: [1.15, 0.35, 0] });
    // Three wool strands sweep across to the far side of the head.
    for (let i = 0; i < 3; i++)
      a.tube(
        [
          [0.14 + i * 0.014, 0.062 + i * 0.012, 0.246 - i * 0.014],
          [-0.02 + i * 0.02, 0.11 + i * 0.014, 0.3 - i * 0.012],
          [-0.15 - i * 0.016, 0.075 + i * 0.01, 0.26 - i * 0.01],
          [-0.225 - i * 0.012, 0.02 + i * 0.008, 0.19 - i * 0.008],
        ],
        0.017,
        wool,
      );
    a.sphere([0.185, 0.036, 0.246], [0.048, 0.046, 0.046], pearl);
    a.sphere([-0.238, 0.014, 0.178], [0.026, 0.024, 0.024], wool);
  } else if (item.shape === 11) {
    // 运动发带: a wide band that reads as stretch jersey, cinched at the back.
    const jersey = toon(item.color, "anime-accessory");
    const band = new T.TorusGeometry(0.271, 0.021, 6, 44);
    band.scale(1, 1, 1.03);
    a.add(band, jersey, { p: [0, 0.012, 0], r: [Math.PI / 2, 0, 0] });
    for (const y of [-0.006, 0.03])
      a.torus([0, y, 0], 0.272, 0.005, toon(item.accent, "anime-accessory"), [
        Math.PI / 2,
        0,
        0,
      ]);
    a.add(
      ribbon(
        [
          [-0.02, 0.02, -0.268],
          [0.01, -0.04, -0.3],
          [0.055, -0.115, -0.276],
        ],
        0.05,
      ),
      jersey,
    );
    a.add(
      ribbon(
        [
          [0.02, 0.02, -0.268],
          [-0.03, -0.035, -0.298],
          [-0.07, -0.105, -0.272],
        ],
        0.044,
      ),
      jersey,
    );
  } else if (item.shape === 12) {
    // 蕾丝发冠: a lace band with a bow sunk in the middle of small roses.
    const band = new T.TorusGeometry(0.276, 0.011, 6, 48);
    a.add(band, pearl, { p: [0, 0, 0], r: [Math.PI / 2, 0, 0], s: [1, 1, 1.02] });
    for (let i = 0; i < 9; i++) {
      const theta = -1.5 + i * 0.375;
      a.torus(
        [Math.sin(theta) * 0.28, 0.01, Math.cos(theta) * 0.286],
        0.023,
        0.005,
        pearl,
        [0, theta, 0],
      );
    }
    rose(a, [0, 0.062, 0.288], 0.05, toon("#f0bccb", "anime-accessory"), metal);
    for (const side of [-1, 1]) {
      a.add(
        ribbon(
          [
            [side * 0.07, 0.03, 0.276],
            [side * 0.142, 0.068, 0.288],
            [side * 0.108, 0.026, 0.283],
          ],
          0.052,
        ),
        pearl,
      );
      a.sphere([side * 0.152, 0.046, 0.26], [0.016, 0.02, 0.016], metal);
      a.sphere([side * 0.101, 0.062, 0.273], [0.014, 0.014, 0.014], metal);
    }
  } else if (item.shape === 13) {
    // 夜樱簪花: a blossom pin resting on a slim band across the head.
    const wood = toon("#7a5b53", "anime-accessory");
    const petal = toon("#f1cbdd", "anime-accessory");
    a.torus([0, 0, 0], 0.266, 0.007, wood, [Math.PI / 2, 0, 0]);
    a.tube(
      [
        [-0.264, 0.03, 0.08],
        [-0.2, 0.05, 0.152],
        [-0.05, 0.066, 0.278],
        [0.13, 0.052, 0.262],
        [0.24, 0.03, 0.15],
      ],
      0.0065,
      wood,
    );
    for (const [x, y, z, r] of [
      [-0.06, 0.07, 0.286, 0.046],
      [0.108, 0.062, 0.278, 0.038],
    ]) {
      for (let n = 0; n < 5; n++) {
        const theta = (n / 5) * Math.PI * 2;
        a.add(blade(r * 1.5, r * 0.62, 0.014), petal, {
          p: [x, y, z],
          r: [0, 0, theta - Math.PI / 2],
        });
      }
      a.sphere([x, y, z + 0.012], [0.013, 0.013, 0.011], metal);
    }
    for (const x of [-0.16, 0.05]) {
      a.tube(
        [
          [x, 0.045, 0.262],
          [x + 0.008, -0.045, 0.272],
          [x - 0.006, -0.1, 0.268],
        ],
        0.0028,
        metal,
      );
      a.sphere([x - 0.006, -0.122, 0.267], [0.014, 0.019, 0.014], petal);
    }
  } else if (item.shape === 14) {
    // 绯色巫女结: a white paper twist with two red cords, tied at the crown.
    const paper = toon("#fbfbfd", "anime-accessory");
    const cord = toon(item.color, "anime-accessory");
    // The cord runs around the crown, so the knot reads at head width.
    a.torus([0, 0.01, 0], 0.277, 0.009, cord, [Math.PI / 2, 0, 0]);
    for (const side of [-1, 1]) {
      a.add(
        ribbon(
          [
            [side * 0.03, 0.05, 0.262],
            [side * 0.155, 0.115, 0.264],
            [side * 0.086, 0.168, 0.246],
            [side * 0.205, 0.225, 0.196],
          ],
          0.072,
        ),
        paper,
      );
      a.tube(
        [
          [side * 0.02, 0.04, 0.268],
          [side * 0.11, 0.02, 0.276],
          [side * 0.07, -0.075, 0.286],
          [side * 0.13, -0.15, 0.266],
        ],
        0.008,
        cord,
      );
      a.sphere([side * 0.13, -0.172, 0.264], [0.017, 0.023, 0.017], cord);
      a.add(shapeMesh(star(0.026)), paper, {
        p: [side * 0.248, -0.026, 0.12],
        r: [0, side * -0.9, 0],
      });
    }
    a.sphere([0, 0.055, 0.272], [0.032, 0.028, 0.028], metal);
    a.torus([0, 0.055, 0.288], 0.032, 0.005, cord);
  } else if (item.shape === 15) {
    // 珍珠发夹: a slim barrette of graduated pearls, worn to one side.
    const shell = toon("#f4ede2", "anime-accessory");
    // The bar sweeps across the crown so the pearls read at head width.
    a.tube(
      Array.from({ length: 25 }, (_, i): P => {
        const t = i / 24,
          theta = -1.15 + t * 2.3;
        return [
          Math.sin(theta) * 0.284,
          0.052 + Math.cos(theta) * 0.03,
          Math.cos(theta) * 0.284,
        ];
      }),
      0.012,
      metal,
    );
    for (let i = 0; i < 11; i++) {
      const t = i / 10,
        theta = -1.02 + t * 2.04;
      const r = 0.021 - Math.abs(t - 0.5) * 0.01;
      a.sphere(
        [
          Math.sin(theta) * 0.29,
          0.066 + Math.cos(theta) * 0.03,
          Math.cos(theta) * 0.29,
        ],
        [r, r, r * 0.9],
        i % 2 ? pearl : shell,
      );
    }
  } else if (item.shape === 16) {
    // 棒球帽: a soft crown, a forward brim and a small button on top.
    const cap = toon(item.color, "anime-accessory");
    const panel = toon(item.accent, "anime-accessory");
    for (let i = 0; i < 5; i++) {
      const theta = -0.9 + i * 0.45;
      a.add(blade(0.34, 0.21, 0.05), i % 2 ? cap : panel, {
        p: [Math.sin(theta) * 0.06, 0.28, Math.cos(theta) * 0.06],
        r: [0.42, theta, 0],
      });
    }
    const brim = new T.CylinderGeometry(0.315, 0.315, 0.024, 22);
    a.add(brim, cap, { p: [0, 0.29, 0.2], s: [1, 1, 1.34] });
    a.torus([0, 0.05, 0], 0.276, 0.011, cap, [Math.PI / 2, 0, 0]);
    a.sphere([0, 0.5, 0], [0.026, 0.022, 0.026], cap);
  } else {
    // 丝巾发带: a folded silk scarf knotted over the hair.
    const silk = toon(item.color, "anime-accessory");
    const silkB = toon(item.accent, "anime-accessory");
    const band = new T.TorusGeometry(0.279, 0.017, 6, 46);
    band.scale(1, 1, 1.02);
    a.add(band, silk, { p: [0, 0.004, 0], r: [Math.PI / 2, 0, 0] });
    for (const side of [-1, 1])
      a.add(
        ribbon(
          [
            [side * 0.06, -0.02, -0.262],
            [side * 0.15, -0.11, -0.288],
            [side * 0.1, -0.22, -0.27],
          ],
          0.05,
        ),
        side < 0 ? silkB : silk,
      );
    a.sphere([0, -0.01, -0.272], [0.028, 0.024, 0.024], silkB);
  }
  return silhouette(a.complete(), item, [
    "fine-jewel-tiara",
    "layered-rose-wreath",
    "laurel-leaf-circlet",
    "faceted-crystal-diadem",
    "floating-crescent-halo",
    "radiant-sun-crown",
    "jade-hairpin-with-tassels",
    "gilded-swaying-pendant-crown",
    "plain-ribbon-headband",
    "knotted-scarf-tie",
    "chunky-knit-tie",
    "wide-jersey-headband",
    "lace-and-rose-coronet",
    "slim-blossom-pin",
    "twisted-paper-and-cord-knot",
    "graduated-pearl-barrette",
    "paneled-baseball-cap",
    "knotted-silk-scarf-band",
  ]);
}

/** Re-express authored points as vectors; keeps mirrored parts readable. */
function gridPoints(points: P[]) {
  return points.map((v) => new T.Vector3(...v));
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
    } else if (item.shape === 5) {
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
    } else if (item.shape === 6 || item.shape === 7) {
      // 云纹轻纱 and 凤羽披帛 both drape a scarf over the shoulders, but the
      // hanfu cloud is a soft ripple and the tang phoenix is a long feather.
      const phoenix = item.shape === 7;
      const cloth = toon(
        phoenix
          ? new T.Color(item.color).lerp(new T.Color("#e4b06a"), 0.45).getStyle()
          : item.color,
        "anime-accessory",
      );
      const paths: P[][] = phoenix
        ? [
            [
              [0.1, -0.02, 0],
              [0.42, 0.44, -0.09],
              [0.96, 0.6, -0.13],
              [1.24, 0.31, -0.05],
            ],
            [
              [0.12, -0.14, -0.03],
              [0.5, -0.4, 0.06],
              [1.06, -0.28, 0.13],
              [1.22, -0.56, 0.06],
            ],
            [
              [0.09, 0.06, -0.06],
              [0.4, 0.74, -0.16],
              [0.92, 0.86, -0.14],
              [1.1, 0.62, -0.08],
            ],
          ]
        : [
            [
              [0.1, -0.02, 0.01],
              [0.44, 0.28, -0.03],
              [0.94, 0.4, -0.05],
              [1.2, 0.2, 0.02],
            ],
            [
              [0.11, -0.1, -0.02],
              [0.48, -0.28, 0.05],
              [1.0, -0.2, 0.1],
              [1.18, -0.42, 0.03],
            ],
          ];
      for (let i = 0; i < paths.length; i++) {
        const path = paths[i].map((v) => p(...v));
        a.add(ribbon(path, phoenix ? 0.062 : 0.082), phoenix && i === 1 ? light : cloth);
        a.tube(path, 0.0036, phoenix ? metal : edge);
      }
      if (phoenix)
        for (let i = 0; i < 9; i++) {
          const t = i / 8;
          a.add(blade(0.18 + i * 0.01, 0.02), light, {
            p: p(0.3 + t * 0.85, 0.5 - t * 0.62, -0.1 - t * 0.02),
            r: [0, 0, side * (-0.9 + t * 0.5)],
          });
        }
      else
        for (let i = 0; i < 4; i++) {
          const theta = 0.5 + i * 0.62;
          a.torus(
            p(0.36 + i * 0.22, 0.26 + Math.sin(theta) * 0.18, -0.04),
            0.062,
            0.006,
            edge,
            [0, 0, 0],
            Math.PI * 1.28,
          );
        }
    } else if (item.shape === 8) {
      // 纸鸢书页: pressed pages fanning out behind the shoulders.
      const page = toon("#f6f1e4", "anime-accessory");
      const line = toon(item.color, "anime-accessory");
      for (let i = 0; i < 6; i++) {
        const rotation = side * (-0.32 - i * 0.36);
        const length = 0.92 - i * 0.052;
        const start: P = p(0.12 + i * 0.02, -0.02 - i * 0.048, -i * 0.02);
        a.add(blade(length, 0.2, 0.03, 0), i % 2 ? page : light, {
          p: start,
          r: [0, 0, rotation],
        });
        const matrix = new T.Matrix4().compose(
          new T.Vector3(...start),
          new T.Quaternion().setFromEuler(new T.Euler(0, 0, rotation)),
          new T.Vector3(1, 1, 1),
        );
        for (let k = 1; k < 5; k++)
          a.tube(
            [
              [0, length * (k / 6), 0.031],
              [0, length * (k / 6 + 0.08), 0.031],
            ].map((v) => new T.Vector3(...v).applyMatrix4(matrix).toArray() as P),
            0.0026,
            line,
          );
      }
      for (let i = 0; i < 4; i++)
        a.sphere(p(0.2 + i * 0.16, -0.14 + i * 0.05, 0.07), [0.016, 0.02, 0.016], metal);
    } else if (item.shape === 9) {
      // 风帆羽翼: two stiff triangular sails on a gilded boom.
      const sail = toon(item.color, "anime-accessory");
      for (let i = 0; i < 3; i++) {
        const length = 0.98 - i * 0.2;
        const start: P = p(0.1 + i * 0.05, -0.04 - i * 0.06, -i * 0.02);
        const rotation = side * (-0.5 - i * 0.42);
        const matrix = new T.Matrix4().compose(
          new T.Vector3(...start),
          new T.Quaternion().setFromEuler(new T.Euler(0, 0, rotation)),
          new T.Vector3(1, 1, 1),
        );
        const shape = new T.Shape();
        shape.moveTo(0, 0.02);
        shape.lineTo(0, length);
        shape.lineTo(0.42 - i * 0.04, length * 0.24);
        shape.closePath();
        a.add(new T.ExtrudeGeometry(shape, { depth: 0.012, bevelEnabled: false }), i % 2 ? light : sail, { p: start, r: [0, 0, rotation] });
        a.tube(
          [
            [0, 0.02, 0.014],
            [0.3 - i * 0.03, length * 0.22, 0.014],
          ].map((v) => new T.Vector3(...v).applyMatrix4(matrix).toArray() as P),
          0.005,
          metal,
        );
      }
      a.tube(
        (
          [
            [0.08, -0.12, 0.02],
            [0.62, 0.06, 0.01],
            [1.18, -0.06, 0],
          ] as P[]
        ).map((v) => p(...v)),
        0.009,
        metal,
      );
    } else if (item.shape === 10) {
      // 初雪绒羽: small soft down clusters, short and rounded.
      const down = toon("#ffffff", "anime-accessory");
      for (let i = 0; i < 14; i++) {
        const t = i / 13;
        const pos = p(
          0.16 + t * 0.72,
          0.3 - t * 0.5 + Math.sin(t * 9) * 0.05,
          -0.02 - t * 0.03,
        );
        a.sphere(pos, [0.072 + (i % 3) * 0.014, 0.084 + (i % 2) * 0.02, 0.05], i % 2 ? light : soft);
        if (i % 2 === 0)
          a.add(blade(0.14, 0.032, 0.018), edge, {
            p: pos,
            r: [0, 0, side * (0.7 - t * 1.1)],
          });
      }
      a.tube(
        (
          [
            [0.12, 0.02, 0.03],
            [0.5, 0.02, 0.02],
            [0.86, -0.12, 0.01],
          ] as P[]
        ).map((v) => p(...v)),
        0.014,
        toon("#e9e2f2", "anime-feather-spine"),
      );
    } else if (item.shape === 11) {
      // 疾风之羽: four swept arrow quills with an outer rim.
      const quill = toon(item.color, "anime-accessory");
      for (let i = 0; i < 4; i++) {
        const t = i / 3;
        const start: P = p(0.11 + i * 0.03, -0.06 + i * 0.08, -i * 0.02);
        const length = 1.06 - i * 0.08;
        const rotation = side * (-0.9 + i * 0.34);
        a.add(blade(length, 0.15, 0.05, 0.02), i % 2 ? light : quill, {
          p: start,
          r: [0, 0, rotation],
        });
        const matrix = new T.Matrix4().compose(
          new T.Vector3(...start),
          new T.Quaternion().setFromEuler(new T.Euler(0, 0, rotation)),
          new T.Vector3(1, 1, 1),
        );
        a.tube(
          [
            [0, 0.02, 0.012],
            [0, length * 0.5, 0.055],
            [0, length * 0.97, 0.02],
          ].map((v) => new T.Vector3(...v).applyMatrix4(matrix).toArray() as P),
          0.0045,
          edge,
        );
        a.add(blade(0.16, 0.026, 0.03), metal, {
          p: p(start[0] + 0.3 * -Math.sin(rotation), start[1] + 0.3 * Math.cos(rotation), start[2]),
          r: [0, 0, rotation],
        });
      }
    } else if (item.shape === 12) {
      // 蕾丝蝶翼: two lace panels in heart-ish lobes with open cutwork.
      const pearl = toon("#fff4f8", "anime-accessory");
      const lace = toon(item.accent, "anime-wing-lace");
      lace.transparent = true;
      lace.opacity = 0.9;
      lace.depthWrite = false;
      for (let i = 0; i < 2; i++) {
        const scale = i ? 0.66 : 1;
        const center: P = p(i ? 0.5 : 0.42, i ? -0.36 : 0.34, i ? 0.05 : 0);
        const reach = 0.62 * scale;
        a.add(
          blade(reach, 0.5 * scale, 0.06, 0),
          i ? light : lace,
          { p: center, r: [0, 0, side * (i ? 0.85 : -0.5)] },
        );
        for (let k = 0; k < 5; k++)
          a.torus(
            [
              center[0] + 0.1 + k * 0.1 * scale,
              center[1] + Math.sin(k * 1.1) * 0.1 * scale,
              center[2] + 0.05,
            ],
            0.021 * scale,
            0.004,
            pearl,
          );
      }
      rose(a, p(0.24, 0.12, 0.07), 0.062, toon("#f0bccb", "anime-accessory"), metal);
    } else if (item.shape === 13) {
      // 夜樱薄翼: pale petals scattered along a curved spine.
      const petal = toon("#f3d6e4", "anime-accessory");
      const spine = toon("#6d5a86", "anime-accessory");
      a.tube(
        (
          [
            [0.1, -0.1, 0.03],
            [0.34, 0.26, 0.02],
            [0.76, 0.36, 0.01],
            [1.1, 0.1, 0],
          ] as P[]
        ).map((v) => p(...v)),
        0.008,
        spine,
      );
      for (let i = 0; i < 11; i++) {
        const t = i / 10;
        const pos = p(
          0.16 + t * 0.88,
          0.34 - Math.pow(t - 0.4, 2) * 1.6 + (i % 2 ? 0.06 : -0.06),
          -0.01 - t * 0.02,
        );
        a.add(blade(0.16 + (i % 3) * 0.02, 0.052, 0.02), i % 2 ? petal : soft, {
          p: pos,
          r: [0, 0, side * (1.15 - t * 2.1)],
        });
      }
      for (let i = 0; i < 3; i++)
        a.sphere(p(0.4 + i * 0.24, 0.1 + i * 0.08, 0.06), [0.017, 0.017, 0.017], metal);
    } else if (item.shape === 14) {
      // 绯叶之羽: broad vermilion maple leaves along a dark branch.
      const maple = toon(item.color, "anime-accessory");
      const branch = toon("#5c4a44", "anime-accessory");
      a.tube(
        (
          [
            [0.1, -0.06, 0.03],
            [0.3, 0.34, 0.02],
            [0.66, 0.5, 0.01],
            [1.02, 0.42, 0],
          ] as P[]
        ).map((v) => p(...v)),
        0.008,
        branch,
      );
      for (let i = 0; i < 7; i++) {
        const t = i / 6;
        const pos = p(
          0.18 + t * 0.78,
          0.4 + Math.sin(t * 2.6) * 0.12 - t * 0.06,
          -0.01 - t * 0.02,
        );
        for (const lobe of [-1, 1])
          a.add(blade(0.24 - i * 0.012, 0.14, 0.03, 0), i % 2 ? light : maple, {
            p: pos,
            r: [0, 0, side * (0.5 + lobe * 0.42) - t * 0.3],
          });
        a.tube(
          [
            pos,
            [pos[0] + 0.1 * side, pos[1] + 0.2, pos[2] + 0.02],
          ],
          0.0026,
          edge,
        );
      }
      for (let i = 0; i < 4; i++)
        a.sphere(p(0.34 + i * 0.2, 0.52 - i * 0.06, 0.07), [0.014, 0.018, 0.014], metal);
    } else if (item.shape === 15) {
      // 极简薄纱披肩: a plain tulle cape that drapes to the elbows.
      const gauze = toon(item.color, "anime-accessory");
      gauze.transparent = true;
      gauze.opacity = 0.42;
      gauze.depthWrite = false;
      const cape = gridPoints([
        [0, -0.02, 0.02],
        [0.52, -0.14, -0.08],
        [0.82, -0.4, -0.18],
        [0.66, -0.86, -0.16],
      ] as P[]);
      const capePath = cape.map((v) => p(v.x, v.y, v.z));
      a.add(ribbon(capePath, 0.3), gauze);
      a.add(ribbon(capePath, 0.09), light);
      a.tube(
        [
          [-0.44, 2.53, -0.08],
          [0, 2.5, -0.14],
          [0.44, 2.53, -0.08],
        ],
        0.008,
        edge,
      );
    } else if (item.shape === 16) {
      // 运动风衣薄片: two short wind-shell panels that flare off the shoulders.
      const shell = toon(item.color, "anime-accessory");
      for (let i = 0; i < 3; i++) {
        const length = 1.02 - i * 0.16;
        const start: P = p(0.14 + i * 0.04, 0.06 - i * 0.14, -i * 0.03);
        const rotation = side * (-0.52 - i * 0.46);
        const matrix = new T.Matrix4().compose(
          new T.Vector3(...start),
          new T.Quaternion().setFromEuler(new T.Euler(0, 0, rotation)),
          new T.Vector3(1, 1, 1),
        );
        a.add(blade(length, 0.21, 0.05, 0.02), i % 2 ? light : shell, {
          p: start,
          r: [0, 0, rotation],
        });
        a.tube(
          (
            [
              [0, 0.02, 0.014],
              [0, length * 0.55, 0.05],
              [0, length * 0.96, 0.02],
            ] as P[]
          ).map((v) => new T.Vector3(...v).applyMatrix4(matrix).toArray() as P),
          0.004,
          edge,
        );
      }
      for (let i = 0; i < 4; i++)
        a.sphere(p(0.2 + i * 0.16, -0.1 + i * 0.03, 0.06), [0.014, 0.014, 0.014], metal);
    } else {
      // 风衣垂坠薄片: a long, narrow coat flap hanging past the hip.
      const shell = toon(item.color, "anime-accessory");
      const flap: P[] = [
        [0.17, 0.02, 0.04],
        [0.46, -0.2, -0.08],
        [0.78, -0.62, -0.2],
        [0.96, -1.06, -0.3],
      ];
      a.add(ribbon(flap.map((v) => p(...v)), 0.26), shell);
      a.tube(flap.map((v) => p(...v)), 0.0045, edge);
      a.add(ribbon(flap.map((v) => p(...v)), 0.075), light);
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
    "cloud-patterned-gauze-drape",
    "phoenix-feather-shawl",
    "pressed-paper-fan",
    "stiff-sail-panels",
    "soft-snow-down-clusters",
    "swept-arrow-quills",
    "openwork-lace-panels",
    "scattered-night-blossom-petals",
    "vermilion-maple-leaves",
    "sheer-tulle-cape",
    "flared-wind-shell-panels",
    "long-coat-flaps",
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
  } else if (item.shape === 5) {
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
  } else if (item.shape === 6) {
    // 青玉毛笔: a jade brush with an ink tip and a tasseled cap.
    const jade = toon("#8fc9ac", "anime-accessory");
    const ink = toon("#33313f", "anime-accessory");
    a.add(new T.CylinderGeometry(0.026, 0.03, 0.3, 12), jade, {
      p: [0, 0.79, 0],
    });
    for (const y of [0.66, 0.92])
      a.torus([0, y, 0], 0.03, 0.005, metal, [Math.PI / 2, 0, 0]);
    a.add(new T.ConeGeometry(0.029, 0.13, 12), ink, {
      p: [0, 1.03, 0],
    });
    a.sphere([0, 1.085, 0], [0.012, 0.018, 0.012], ink);
    a.tube(
      [
        [0.03, 0.7, 0.012],
        [0.05, 0.62, 0.02],
        [0.036, 0.545, 0.015],
      ],
      0.0035,
      metal,
    );
    a.sphere([0.036, 0.516, 0.014], [0.013, 0.019, 0.013], pearl);
    a.add(shapeMesh(star(0.032)), jade, { p: [-0.032, 0.885, 0.026] });
  } else if (item.shape === 7) {
    // 牡丹团扇: a round silk fan on a lacquered handle.
    const silk = toon(item.accent, "anime-accessory");
    const frame = toon("#9a6a52", "anime-accessory");
    a.torus([0, 1.0, 0], 0.186, 0.007, frame);
    a.add(
      new T.CircleGeometry(0.183, 32),
      silk,
      { p: [0, 1.0, 0.008] },
    );
    rose(a, [0, 1.0, 0.024], 0.072, toon("#e79ab4", "anime-accessory"), metal);
    for (let i = 0; i < 6; i++) {
      const theta = 0.4 + i * 1.02;
      a.add(blade(0.06, 0.019, 0.012), silk, {
        p: [Math.cos(theta) * 0.115, 1.0 + Math.sin(theta) * 0.115, 0.022],
        r: [0, 0, theta - Math.PI / 2],
      });
    }
    a.add(new T.CylinderGeometry(0.016, 0.02, 0.42, 12), frame, {
      p: [0, 0.6, 0],
    });
    a.sphere([0, 0.82, 0.012], [0.021, 0.021, 0.021], metal);
    for (let i = 0; i < 3; i++)
      a.sphere([0, 0.43 - i * 0.05, 0.024], [0.009, 0.009, 0.009], pearl);
  } else if (item.shape === 8) {
    // 黄铜钢笔: a school fountain pen with a visible nib.
    const brass = toon("#c8a267", "anime-accessory");
    const barrel = toon(item.color, "anime-accessory");
    a.add(new T.CylinderGeometry(0.019, 0.022, 0.46, 14), barrel, {
      p: [0, 0.75, 0],
    });
    a.add(new T.CylinderGeometry(0.023, 0.023, 0.02, 14), metal, {
      p: [0, 0.985, 0],
    });
    for (const y of [0.62, 0.9])
      a.torus([0, y, 0], 0.021, 0.004, brass, [Math.PI / 2, 0, 0]);
    const nib = new T.Shape();
    nib.moveTo(-0.02, 0);
    nib.lineTo(0.02, 0);
    nib.lineTo(0.007, 0.13);
    nib.lineTo(0, 0.165);
    nib.lineTo(-0.007, 0.13);
    nib.closePath();
    a.add(shapeMesh(nib, 0.012), brass, { p: [0, 1.0, -0.006] });
    a.add(new T.CylinderGeometry(0.012, 0.006, 0.05, 10), toon("#3a3446", "anime-accessory"), {
      p: [0, 1.175, 0],
    });
    a.add(new T.CylinderGeometry(0.024, 0.024, 0.012, 14), brass, {
      p: [0, 0.5, 0],
    });
    for (let i = 0; i < 4; i++)
      a.sphere([0, 0.55 + i * 0.02, 0.026], [0.006, 0.006, 0.006], metal);
  } else if (item.shape === 9) {
    // 海风罗盘: an open brass compass with a needle.
    const brass = toon("#cbb07a", "anime-accessory");
    const glass = toon("#cfe9f5", "anime-accessory");
    glass.transparent = true;
    glass.opacity = 0.72;
    glass.depthWrite = false;
    a.add(new T.CylinderGeometry(0.152, 0.152, 0.026, 28), brass, {
      p: [0, 0.99, 0],
      r: [Math.PI / 2, 0, 0],
    });
    for (const r of [0.152, 0.121, 0.088])
      a.torus([0, 0.99, 0.006], r, 0.005, brass, [0, 0, 0]);
    a.add(new T.CircleGeometry(0.084, 28), glass, { p: [0, 0.99, 0.014] });
    for (let i = 0; i < 8; i++) {
      const theta = (i / 8) * Math.PI * 2;
      a.add(blade(i % 2 ? 0.016 : 0.03, 0.007, 0), i % 2 ? brass : toon("#d9584f", "anime-accessory"), {
        p: [Math.cos(theta) * 0.058, 0.99 + Math.sin(theta) * 0.058, 0.014],
        r: [0, 0, theta - Math.PI / 2],
      });
    }
    a.add(blade(0.062, 0.016, 0.004), toon("#d9584f", "anime-accessory"), {
      p: [0, 0.99, 0.018],
      r: [0, 0, 0.6],
    });
    a.add(blade(0.062, 0.016, 0.004), toon("#4a5f8f", "anime-accessory"), {
      p: [0, 0.99, 0.018],
      r: [0, 0, 0.6 + Math.PI],
    });
    a.sphere([0, 0.99, 0.02], [0.011, 0.011, 0.011], metal);
    a.torus([0, 0.9, -0.036], 0.035, 0.007, brass, [0.5, 0, 0], Math.PI);
  } else if (item.shape === 10) {
    // 毛线纺锤: a drop spindle wound with wool.
    const wood = toon("#a9805e", "anime-accessory");
    const wool = toon(item.color, "anime-accessory");
    a.add(new T.CylinderGeometry(0.009, 0.009, 0.5, 10), wood, {
      p: [0, 0.79, 0],
    });
    a.add(new T.ConeGeometry(0.054, 0.1, 14), wood, {
      p: [0, 1.02, 0],
      r: [Math.PI, 0, 0],
    });
    a.sphere([0, 1.09, 0], [0.019, 0.026, 0.019], wood);
    for (let i = 0; i < 7; i++) {
      const y = 0.72 - i * 0.036;
      const r = 0.048 + Math.sin((i / 6) * Math.PI) * 0.028;
      a.torus([0, y, 0], r, 0.019, wool, [Math.PI / 2, 0, 0]);
    }
    a.add(new T.CylinderGeometry(0.062, 0.062, 0.014, 16), wood, {
      p: [0, 0.44, 0],
    });
    a.tube(
      [
        [0.05, 0.62, 0.02],
        [0.11, 0.42, 0.05],
        [0.09, 0.2, 0.03],
        [0.13, 0.02, 0.06],
      ],
      0.006,
      wool,
    );
    a.sphere([0.02, 0.53, 0.03], [0.017, 0.017, 0.017], pearl);
  } else if (item.shape === 11) {
    // 跃动接力棒: a baton with racing stripes and a whistle.
    const baton = toon(item.accent, "anime-accessory");
    const stripe = toon(item.color, "anime-accessory");
    a.add(new T.CylinderGeometry(0.033, 0.033, 0.52, 16), baton, {
      p: [0, 0.76, 0],
    });
    for (const sign of [-1, 1])
      a.add(new T.CylinderGeometry(0.037, 0.037, 0.03, 16), stripe, {
        p: [0, 0.76 + sign * 0.12, 0],
      });
    for (const sign of [-1, 1])
      a.add(new T.SphereGeometry(0.033, 16, 10), stripe, {
        p: [0, 0.76 + sign * 0.26, 0],
      });
    a.add(new T.CylinderGeometry(0.019, 0.019, 0.03, 14), stripe, {
      p: [0, 0.5, 0],
    });
    const whistle = toon("#dfe4ee", "anime-accessory");
    a.add(new T.BoxGeometry(0.075, 0.05, 0.042, 2, 2, 2), whistle, {
      p: [0.062, 0.79, 0.018],
      r: [0, 0.3, 0.1],
    });
    a.add(new T.TorusGeometry(0.019, 0.006, 6, 20, Math.PI * 1.5), metal, {
      p: [0.098, 0.825, 0.012],
      r: [0, Math.PI / 2, 0],
    });
    a.sphere([0, 0.5, 0.024], [0.012, 0.012, 0.012], metal);
  } else if (item.shape === 12) {
    // 蕾丝洋伞: a closed lace parasol with a scalloped canopy.
    const silk = toon(item.accent, "anime-accessory");
    const lace = toon(item.color, "anime-accessory");
    lace.transparent = true;
    lace.opacity = 0.82;
    lace.depthWrite = false;
    a.add(new T.CylinderGeometry(0.008, 0.008, 0.46, 10), toon("#8a7f96", "anime-accessory"), {
      p: [0, 0.78, 0],
    });
    a.add(new T.ConeGeometry(0.115, 0.4, 12), silk, { p: [0, 0.92, 0] });
    for (let i = 0; i < 8; i++) {
      const theta = (i / 8) * Math.PI * 2;
      a.tube(
        [
          [Math.cos(theta) * 0.02, 0.72, Math.sin(theta) * 0.02],
          [Math.cos(theta) * 0.082, 0.95, Math.sin(theta) * 0.082],
          [Math.cos(theta) * 0.115, 1.116, Math.sin(theta) * 0.115],
        ],
        0.0034,
        metal,
      );
    }
    for (let i = 0; i < 10; i++) {
      const theta = (i / 10) * Math.PI * 2;
      a.add(blade(0.058, 0.024, 0.016), lace, {
        p: [Math.cos(theta) * 0.1, 0.73, Math.sin(theta) * 0.1],
        r: [-Math.PI / 2 - 0.3, theta, 0],
      });
    }
    a.sphere([0, 1.13, 0], [0.019, 0.026, 0.019], metal);
    a.add(new T.TorusGeometry(0.032, 0.007, 6, 22, Math.PI), toon("#8a7f96", "anime-accessory"), {
      p: [0, 0.542, 0],
      r: [0, Math.PI / 2, 0],
    });
    for (let i = 0; i < 3; i++)
      a.sphere([0, 0.6 - i * 0.03, 0.026], [0.008, 0.008, 0.008], pearl);
  } else if (item.shape === 13) {
    // 夜樱折扇: a folded fan, half open, with blossoms.
    const paper = toon(item.accent, "anime-accessory");
    const petal = toon(item.color, "anime-accessory");
    const blossom = toon("#f1cbdd", "anime-accessory");
    const rib = toon("#5c4a44", "anime-accessory");
    for (let i = 0; i < 9; i++) {
      const spread = -0.66 + i * 0.145;
      const length = 0.27 + i * 0.002;
      a.add(blade(length, 0.038, 0.012), i % 2 ? paper : petal, {
        p: [0, 0.86, 0],
        r: [0, 0, spread],
      });
      a.tube(
        [
          [0, 0.862, 0.008],
          [Math.sin(spread) * length * 0.55, 0.86 + Math.cos(spread) * length * 0.55, 0.012],
          [Math.sin(spread) * length * 0.98, 0.86 + Math.cos(spread) * length * 0.98, 0.01],
        ],
        0.0036,
        rib,
      );
    }
    a.sphere([0, 0.858, 0.014], [0.017, 0.017, 0.014], metal);
    for (let i = 0; i < 3; i++)
      a.add(shapeMesh(star(0.022)), blossom, {
        p: [
          Math.sin(-0.3 + i * 0.34) * 0.2,
          0.86 + Math.cos(-0.3 + i * 0.34) * 0.2,
          0.03,
        ],
      });
    a.tube(
      [
        [0, 0.6, 0.014],
        [0.02, 0.57, 0.02],
        [-0.01, 0.53, 0.016],
      ],
      0.0032,
      rib,
    );
  } else if (item.shape === 14) {
    // 绯色御币: a sakaki branch with folded paper streamers.
    const wood = toon("#8a6a52", "anime-accessory");
    const paper = toon("#fbfbfd", "anime-accessory");
    const cord = toon(item.color, "anime-accessory");
    const sakakiLeaf = toon("#9ec7a4", "anime-accessory");
    a.add(new T.CylinderGeometry(0.013, 0.017, 0.4, 10), wood, {
      p: [0, 0.7, 0],
    });
    a.add(new T.CylinderGeometry(0.01, 0.01, 0.3, 8), wood, {
      p: [0, 1.0, 0],
      r: [0, 0, 0.5],
    });
    a.add(new T.CylinderGeometry(0.008, 0.008, 0.24, 8), wood, {
      p: [0.03, 1.0, 0],
      r: [0, 0, -0.7],
    });
    for (let i = 0; i < 5; i++) {
      const x = -0.05 + i * 0.025;
      for (const side of [-1, 1])
        a.add(blade(0.1 + (i % 2) * 0.03, 0.036, 0.02), sakakiLeaf, {
          p: [x, 1.06 + (i % 2) * 0.02, side * 0.012],
          r: [side * 0.3, 0, side * (1.1 - i * 0.1)],
        });
    }
    for (let i = 0; i < 4; i++) {
      const x = -0.075 + i * 0.05;
      const zig = new T.Shape();
      zig.moveTo(-0.026, 0);
      zig.lineTo(0.026, 0);
      zig.lineTo(0.014, 0.1);
      zig.lineTo(-0.014, 0.1);
      zig.closePath();
      a.add(shapeMesh(zig, 0.006), paper, { p: [x, 1.0, 0.026] });
      a.tube(
        [
          [x, 1.008, 0.028],
          [x + 0.008, 1.05, 0.03],
        ],
        0.0026,
        cord,
      );
    }
    a.sphere([0, 0.53, 0.026], [0.012, 0.012, 0.012], metal);
  } else if (item.shape === 15) {
    // 银色钢笔: a slim metal pen with a clip and a dark grip section.
    const barrel = toon("#d9dde4", "anime-accessory");
    a.add(new T.CylinderGeometry(0.019, 0.021, 0.52, 14), barrel, {
      p: [0, 0.77, 0],
    });
    a.add(new T.CylinderGeometry(0.022, 0.022, 0.026, 14), metal, { p: [0, 0.53, 0] });
    a.add(new T.CylinderGeometry(0.02, 0.02, 0.16, 14), colored, { p: [0, 0.44, 0] });
    a.add(new T.ConeGeometry(0.019, 0.14, 14), metal, { p: [0, 1.0, 0] });
    a.tube(
      [
        [0.021, 0.98, 0],
        [0.03, 0.9, 0],
        [0.028, 0.82, 0],
      ],
      0.005,
      metal,
    );
    for (const y of [0.62, 0.94])
      a.torus([0, y, 0], 0.021, 0.0035, barrel, [Math.PI / 2, 0, 0]);
    a.sphere([0, 0.53, 0.024], [0.009, 0.009, 0.009], metal);
  } else if (item.shape === 16) {
    // 运动水壶: a squat bottle with a ribbed body and a screw cap.
    const body = toon(item.color, "anime-accessory");
    const lid = toon(item.accent, "anime-accessory");
    a.add(new T.CylinderGeometry(0.062, 0.058, 0.5, 20), body, { p: [0, 0.75, 0] });
    for (let i = 0; i < 5; i++)
      a.torus([0, 0.58 + i * 0.09, 0], 0.062, 0.006, lid, [Math.PI / 2, 0, 0]);
    a.add(new T.CylinderGeometry(0.03, 0.05, 0.06, 18), body, { p: [0, 1.03, 0] });
    a.add(new T.CylinderGeometry(0.033, 0.033, 0.055, 18), lid, { p: [0, 1.09, 0] });
    a.add(new T.TorusGeometry(0.036, 0.007, 6, 20, Math.PI * 1.4), lid, {
      p: [0, 1.11, 0.03],
      r: [Math.PI / 2, 0, 0],
    });
    a.add(new T.CylinderGeometry(0.064, 0.064, 0.028, 20), lid, { p: [0, 0.5, 0] });
    } else if (item.shape === 14) {
    // 折叠长柄伞: a closed umbrella with a hooked handle and a furled canopy.
    const shaft = toon("#5a5560", "anime-accessory");
    const canopy = toon(item.color, "anime-accessory");
    const tip = toon(item.accent, "anime-accessory");
    a.add(new T.CylinderGeometry(0.014, 0.014, 0.44, 12), shaft, { p: [0, 0.79, 0] });
    a.add(new T.ConeGeometry(0.072, 0.6, 14), canopy, { p: [0, 0.86, 0] });
    for (let i = 0; i < 8; i++) {
      const theta = (i / 8) * Math.PI * 2;
      a.tube(
        [
          [Math.cos(theta) * 0.02, 0.57, Math.sin(theta) * 0.02],
          [Math.cos(theta) * 0.062, 0.9, Math.sin(theta) * 0.062],
          [Math.cos(theta) * 0.072, 1.15, Math.sin(theta) * 0.072],
        ],
        0.0032,
        tip,
      );
    }
    a.add(new T.CylinderGeometry(0.016, 0.004, 0.07, 10), tip, { p: [0, 1.2, 0] });
    a.tube(
      [
        [0, 0.58, 0],
        [0, 0.53, 0.03],
        [0.005, 0.49, 0.075],
        [0.02, 0.48, 0.1],
        [0.045, 0.5, 0.1],
      ],
      0.016,
      shaft,
    );
    a.torus([0, 0.5, 0], 0.03, 0.014, tip, [0, 0, 0], Math.PI * 1.1);
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
    "jade-brush-with-ink-tip",
    "round-silk-peony-fan",
    "brass-school-fountain-pen",
    "open-brass-mariner-compass",
    "wool-wound-drop-spindle",
    "striped-relay-baton",
    "closed-lace-parasol",
    "half-open-blossom-fan",
    "sakaki-branch-with-paper-streamers",
    "slim-metal-pen",
    "ribbed-sport-bottle",
    "furled-long-umbrella",
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
    // The running shoe and the platform shoe bring their own replacement
    // soles; keeping the base sole as well would push a foot past its
    // six-merged-mesh budget.
    if (item.shape !== 11 && item.shape !== 12)
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
    } else if (item.shape === 5) {
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
    } else if (item.shape === 6) {
      // 云纹绣鞋: flat cloth shoes with an upturned cloud toe and a soft sole.
      const cloths = toon(item.color, "anime-accessory");
      a.add(
        profile([
          [0.15, 0.083, 0.1, -0.06],
          [0.27, 0.079, 0.088, -0.068],
          [0.44, 0.08, 0.092, -0.086],
          [0.46, 0.084, 0.1, -0.088],
        ]),
        cloths,
      );
      a.add(shoeSole(), toon("#e8ded0", "anime-accessory"), {
        p: [0, 0.031, 0],
        r: [Math.PI / 2, 0, 0],
      });
      // Upturned cloud toe: three stacked curls above the instep.
      for (let i = 0; i < 3; i++)
        a.torus(
          [0, 0.1 + i * 0.016, 0.19 + i * 0.012],
          0.026 - i * 0.005,
          0.006,
          trim,
          [1.2, 0, 0],
          Math.PI * 1.35,
        );
      a.tube(
        [
          [-0.088, 0.05, -0.07],
          [-0.1, 0.05, 0.1],
          [-0.07, 0.05, 0.235],
          [0, 0.048, 0.286],
          [0.07, 0.05, 0.235],
          [0.1, 0.05, 0.1],
          [0.088, 0.05, -0.07],
        ],
        0.005,
        trim,
      );
      for (const side of [-1, 1])
        a.add(shapeMesh(star(0.019)), trim, {
          p: [side * 0.052, 0.107, 0.14],
          r: [-0.7, 0, 0],
        });
    } else if (item.shape === 7) {
      // 丝绦履: silk-soled slippers wrapped with long crossing ribbons.
      const silk = toon(item.color, "anime-accessory");
      a.add(
        profile([
          [0.13, 0.084, 0.101, -0.05],
          [0.25, 0.08, 0.09, -0.07],
          [0.42, 0.081, 0.094, -0.088],
          [0.47, 0.086, 0.103, -0.09],
        ]),
        silk,
      );
      a.add(shoeSole(), toon("#d9cbb8", "anime-accessory"), {
        p: [0, 0.03, 0],
        r: [Math.PI / 2, 0, 0],
      });
      for (const sign of [-1, 1])
        for (let k = 0; k < 2; k++)
          a.tube(
            Array.from({ length: 34 }, (_, i): P => {
              const t = i / 33;
              const angle = sign * (t * Math.PI * 1.9 + k * 1.6);
              return [
                Math.sin(angle) * (0.078 - k * 0.012),
                0.14 + t * 0.3 + k * 0.03,
                -0.055 + Math.cos(angle) * (0.086 - k * 0.014),
              ];
            }),
            0.0055,
            trim,
          );
      for (const sign of [-1, 1])
        a.add(blade(0.085, 0.026, 0.028), trim, {
          p: [sign * 0.07, 0.44, -0.06],
          r: [0, 0, sign * 1.0],
        });
      a.tube(
        [
          [-0.08, 0.055, -0.05],
          [-0.09, 0.055, 0.1],
          [0, 0.052, 0.25],
          [0.09, 0.055, 0.1],
          [0.08, 0.055, -0.05],
        ],
        0.0045,
        trim,
      );
    } else if (item.shape === 8) {
      // 圆头学生鞋: a plain rounded loafer with a single strap.
      const leathers = toon("#3f3644", "anime-accessory");
      a.add(
        profile([
          [0.14, 0.086, 0.104, -0.058],
          [0.26, 0.082, 0.093, -0.07],
          [0.44, 0.085, 0.099, -0.09],
          [0.44, 0.1, 0.116, -0.092],
        ]),
        leathers,
      );
      a.tube(
        Array.from({ length: 49 }, (_, i) => shoeCollar((i / 48) * Math.PI * 2)),
        0.005,
        trim,
      );
      a.add(new T.BoxGeometry(0.104, 0.016, 0.05), sole, {
        p: [0, 0.036, 0],
      });
      a.add(shoeSole(), toon("#4a414f", "anime-accessory"), {
        p: [0, 0.03, 0],
        r: [Math.PI / 2, 0, 0],
      });
      a.tube(
        [
          [-0.082, 0.15, 0.03],
          [-0.05, 0.206, 0.03],
          [0.05, 0.206, 0.03],
          [0.082, 0.15, 0.03],
        ],
        0.011,
        trim,
      );
      a.add(new T.BoxGeometry(0.03, 0.022, 0.012), metal, {
        p: [0.072, 0.188, 0.044],
        r: [0, 0, -0.3],
      });
      a.tube(
        [
          [-0.088, 0.052, -0.068],
          [-0.1, 0.052, 0.1],
          [0, 0.05, 0.29],
          [0.1, 0.052, 0.1],
          [0.088, 0.052, -0.068],
        ],
        0.004,
        trim,
      );
    } else if (item.shape === 9) {
      // 白线帆布鞋: a canvas plimsoll with a white rubber toe cap and laces.
      // Canvas, toe cap and eyelets share three materials so a pair stays
      // within the accessory draw budget.
      const canvas = toon("#f4f6f8", "anime-accessory");
      const accent = toon(item.color, "anime-accessory");
      const rubber = toon("#e6e2da", "anime-accessory");
      a.add(
        profile([
          [0.15, 0.086, 0.105, -0.06],
          [0.27, 0.084, 0.095, -0.07],
          [0.47, 0.088, 0.102, -0.088],
          [0.44, 0.106, 0.122, -0.09],
        ]),
        canvas,
      );
      a.add(shoeSole(), rubber, { p: [0, 0.03, 0], r: [Math.PI / 2, 0, 0] });
      a.add(new T.BoxGeometry(0.098, 0.014, 0.13), canvas, {
        p: [0, 0.08, 0.095],
      });
      for (let i = 0; i < 4; i++) {
        const y = 0.115 + i * 0.033;
        for (const sign of [-1, 1])
          a.sphere([sign * 0.038, y, 0.084 - i * 0.013], [0.009, 0.009, 0.009], accent);
        a.tube(
          [
            [-0.036, y - 0.006, 0.086 - i * 0.013],
            [0, y + 0.006, 0.094 - i * 0.013],
            [0.036, y - 0.006, 0.086 - i * 0.013],
          ],
          0.0034,
          accent,
        );
      }
      // White rubber toe cap over the canvas at the front.
      a.add(shoeUpper(), rubber, { p: [0, 0.001, 0], s: [0.99, 0.62, 0.3] });
      a.tube(
        [
          [-0.088, 0.052, -0.068],
          [-0.1, 0.052, 0.1],
          [0, 0.05, 0.29],
          [0.1, 0.052, 0.1],
          [0.088, 0.052, -0.068],
        ],
        0.0046,
        accent,
      );
    } else if (item.shape === 10) {
      // 软绒短靴: a soft fleece ankle boot with a rolled cuff.
      const fleece = toon(item.color, "anime-accessory");
      a.add(
        profile([
          [0.18, 0.087, 0.106, -0.06],
          [0.3, 0.08, 0.092, -0.07],
          [0.46, 0.078, 0.092, -0.084],
          [0.34, 0.12, 0.128, -0.082],
        ]),
        fleece,
      );
      a.add(shoeSole(), sole, { p: [0, 0.031, 0], r: [Math.PI / 2, 0, 0] });
      for (let i = 0; i < 3; i++) {
        const y = 0.3 + i * 0.042;
        a.torus(
          [0, y, -0.082],
          0.088 + i * 0.002,
          0.022 - i * 0.004,
          i % 2 ? trim : fleece,
          [0, 0, 0],
        );
      }
      a.torus([0, 0.42, -0.082], 0.092, 0.024, trim);
      a.add(new T.BoxGeometry(0.062, 0.046, 0.06), sole, {
        p: [0, 0.028, -0.098],
      });
      a.add(shapeMesh(star(0.024)), metal, {
        p: [-0.064, 0.3, 0.02],
        r: [0, -1.1, 0],
      });
    } else if (item.shape === 11) {
      // 轻跃运动鞋: a running shoe on a thick sole with a swoosh. The mesh
      // upper replaces the base leather rather than covering it, so a foot
      // keeps six merged meshes: base, upper, midsole, outsole, trim and gold.
      const meshTop = toon("#f2f4f7", "anime-accessory");
      const accent = toon(item.color, "anime-accessory");
      const midsole = toon(item.accent, "anime-accessory");
      a.add(
        profile([
          [0.15, 0.09, 0.108, -0.06],
          [0.28, 0.092, 0.1, -0.072],
          [0.48, 0.096, 0.106, -0.09],
          [0.4, 0.13, 0.14, -0.092],
        ]),
        meshTop,
      );
      a.add(new T.BoxGeometry(0.108, 0.05, 0.312), midsole, {
        p: [0, 0.045, 0.02],
      });
      a.add(shoeSole(), toon("#2f3540", "anime-accessory"), {
        p: [0, 0.022, 0],
        r: [Math.PI / 2, 0, 0],
      });
      // The instep stripes reuse the accent midsole tone and the swoosh the
      // mesh fabric, so a foot stays at six merged meshes.
      for (let i = 0; i < 4; i++)
        a.tube(
          [
            [-0.048, 0.132 + i * 0.03, 0.06 - i * 0.02],
            [0, 0.14 + i * 0.03, 0.068 - i * 0.02],
            [0.048, 0.132 + i * 0.03, 0.06 - i * 0.02],
          ],
          0.0042,
          midsole,
        );
      for (let i = 0; i < 5; i++)
        a.add(blade(0.11 - i * 0.012, 0.026, 0.03), meshTop, {
          p: [-0.086 + i * 0.008, 0.08 + i * 0.014, -0.01 - i * 0.012],
          r: [0.5, -1.4, 0.35],
        });
      a.tube(
        [
          [0.09, 0.13, -0.04],
          [0.104, 0.1, -0.08],
        ],
        0.004,
        accent,
      );
    } else if (item.shape === 12) {
      // 厚底洛丽塔鞋: a platform shoe with a bow and buttons. The patent
      // shares the base upper so a foot keeps six merged meshes.
      const patent = toon(item.color, "anime-accessory");
      const platform = toon("#8e8098", "anime-accessory");
      a.add(
        profile([
          [0.13, 0.092, 0.108, -0.056],
          [0.25, 0.088, 0.096, -0.066],
          [0.4, 0.09, 0.1, -0.082],
          [0.42, 0.11, 0.12, -0.084],
        ]),
        patent,
      );
      a.add(new T.BoxGeometry(0.104, 0.075, 0.3), platform, {
        p: [0, 0.055, 0.016],
      });
      a.add(shoeSole(), toon("#302b38", "anime-accessory"), {
        p: [0, 0.032, 0],
        r: [Math.PI / 2, 0, 0],
      });
      a.tube(
        [
          [-0.082, 0.17, 0.028],
          [-0.05, 0.232, 0.028],
          [0.05, 0.232, 0.028],
          [0.082, 0.17, 0.028],
        ],
        0.012,
        trim,
      );
      for (const sign of [-1, 1])
        a.add(
          ribbon(
            [
              [sign * 0.012, 0.2, 0.042],
              [sign * 0.058, 0.226, 0.052],
              [sign * 0.03, 0.19, 0.048],
            ],
            0.042,
          ),
          trim,
        );
      a.sphere([0, 0.205, 0.05], [0.017, 0.015, 0.015], metal);
      for (let i = 0; i < 3; i++)
        a.sphere([-0.05 + i * 0.05, 0.062, 0.14 - Math.abs(i - 1) * 0.02], [0.011, 0.011, 0.011], metal);
      a.sphere([0, 0.15, 0.186], [0.019, 0.015, 0.019], metal);
    } else if (item.shape === 13) {
      // 风吕敷足袋: a split-toe tabi with a wrapped cloth ankle.
      const cloths = toon("#f7f5f0", "anime-accessory");
      const wrap = toon(item.color, "anime-accessory");
      a.add(shoeUpper(), cloths, { s: [0.96, 0.94, 0.97] });
      a.add(
        profile([
          [0.15, 0.058, 0.062, -0.062],
          [0.26, 0.056, 0.06, -0.07],
          [0.36, 0.058, 0.064, -0.078],
        ]),
        cloths,
      );
      // The split between the big toe and the others.
      a.add(new T.BoxGeometry(0.006, 0.05, 0.16), wrap, {
        p: [0.026, 0.075, 0.09],
      });
      for (let i = 0; i < 3; i++)
        a.tube(
          Array.from({ length: 33 }, (_, j): P => {
            const t = j / 32,
              angle = t * Math.PI * 2;
            return [
              Math.sin(angle) * (0.062 - i * 0.005),
              0.13 + i * 0.045 + Math.sin(t * Math.PI) * 0.012,
              -0.07 + Math.cos(angle) * (0.074 - i * 0.006),
            ];
          }),
          0.008,
          wrap,
        );
      a.tube(
        [
          [0, 0.28, 0.024],
          [0, 0.32, -0.02],
          [0, 0.29, -0.064],
        ],
        0.005,
        wrap,
      );
      a.add(new T.BoxGeometry(0.06, 0.026, 0.024), wrap, {
        p: [0, 0.3, 0.038],
      });
    } else if (item.shape === 14) {
      // 绯绳木屐: a geta with two teeth and a vermilion thong.
      const woodClog = toon("#c8a882", "anime-accessory");
      const thong = toon(item.color, "anime-accessory");
      a.add(new T.BoxGeometry(0.108, 0.026, 0.31), woodClog, {
        p: [0, 0.078, 0.012],
      });
      for (const sign of [-1, 1])
        a.add(new T.BoxGeometry(0.096, 0.062, 0.03), woodClog, {
          p: [0, 0.032, 0.012 + sign * 0.088],
        });
      a.tube(
        [
          [-0.052, 0.096, 0.13],
          [0, 0.104, 0.132],
          [0.052, 0.096, 0.13],
        ],
        0.012,
        thong,
      );
      for (const sign of [-1, 1])
        a.tube(
          [
            [sign * 0.05, 0.096, 0.128],
            [sign * 0.018, 0.112, 0.06],
            [0.004 * sign, 0.102, 0.018],
          ],
          0.0075,
          thong,
        );
      a.sphere([0, 0.1, 0.014], [0.016, 0.012, 0.016], thong);
    } else if (item.shape === 15) {
      // 白色小白鞋: a minimal leather sneaker, clean and low.
      const upperMat = toon("#f7f7f5", "anime-accessory");
      const soleMat = toon(item.accent, "anime-accessory");
      const accent = toon(item.color, "anime-accessory");
      a.add(
        profile([
          [0.15, 0.088, 0.106, -0.06],
          [0.27, 0.086, 0.096, -0.07],
          [0.46, 0.09, 0.102, -0.088],
          [0.43, 0.108, 0.122, -0.09],
        ]),
        upperMat,
      );
      a.add(new T.BoxGeometry(0.102, 0.036, 0.308), soleMat, {
        p: [0, 0.038, 0.014],
      });
      a.add(shoeSole(), toon("#e4e2dc", "anime-accessory"), {
        p: [0, 0.026, 0],
        r: [Math.PI / 2, 0, 0],
      });
      // One side stripe and a heel tab mark it as a sneaker, not a slipper.
      for (const sign of [-1, 1])
        a.add(blade(0.15, 0.02), accent, {
          p: [sign * 0.09, 0.09, 0.03],
          r: [0.4, sign * -1.5, 0.15],
        });
      a.add(new T.BoxGeometry(0.032, 0.026, 0.012), accent, {
        p: [0, 0.2, -0.09],
      });
      for (const sign of [-1, 1])
        a.sphere([sign * 0.03, 0.185, 0.0], [0.008, 0.008, 0.008], accent);
    } else if (item.shape === 16) {
      // 厚底老爹鞋: a chunky sole with layered panels.
      const upperMat = toon("#eceae4", "anime-accessory");
      const accent = toon(item.color, "anime-accessory");
      const soleMat = toon(item.accent, "anime-accessory");
      a.add(
        profile([
          [0.16, 0.094, 0.112, -0.062],
          [0.3, 0.098, 0.104, -0.074],
          [0.5, 0.102, 0.11, -0.092],
          [0.42, 0.14, 0.148, -0.094],
        ]),
        upperMat,
      );
      a.add(new T.BoxGeometry(0.118, 0.075, 0.33), soleMat, {
        p: [0, 0.058, 0.018],
      });
      a.add(new T.BoxGeometry(0.106, 0.03, 0.3), accent, { p: [0, 0.03, 0.02] });
      a.add(shoeSole(), toon("#cfccc4", "anime-accessory"), {
        p: [0, 0.022, 0],
        r: [Math.PI / 2, 0, 0],
      });
      for (const sign of [-1, 1])
        a.add(blade(0.17, 0.024), accent, {
          p: [sign * 0.094, 0.1, 0.04],
          r: [0.42, sign * -1.5, 0.2],
        });
      a.add(new T.BoxGeometry(0.05, 0.04, 0.016), accent, { p: [0, 0.235, -0.088] });
      for (let i = 0; i < 3; i++)
        a.sphere([-0.04 + i * 0.04, 0.215, 0.02], [0.009, 0.009, 0.009], accent);
    } else {
      // 切尔西短靴: a plain ankle boot with elastic gussets.
      const leatherMat = toon(item.color, "anime-accessory");
      const gusset = toon(item.accent, "anime-accessory");
      a.add(
        profile([
          [0.19, 0.092, 0.11, -0.062],
          [0.31, 0.086, 0.098, -0.072],
          [0.46, 0.084, 0.098, -0.086],
          [0.34, 0.13, 0.136, -0.086],
        ]),
        leatherMat,
      );
      a.add(shoeSole(), toon("#4a4148", "anime-accessory"), {
        p: [0, 0.031, 0],
        r: [Math.PI / 2, 0, 0],
      });
      a.add(new T.BoxGeometry(0.064, 0.05, 0.066), toon("#4a4148", "anime-accessory"), {
        p: [0, 0.028, -0.104],
      });
      // Elastic side panels and the pull tab at the heel.
      for (const sign of [-1, 1])
        a.add(new T.BoxGeometry(0.014, 0.11, 0.062), gusset, {
          p: [sign * 0.088, 0.24, -0.045],
        });
      a.add(new T.BoxGeometry(0.036, 0.048, 0.012), gusset, {
        p: [0, 0.36, -0.078],
      });
      for (const sign of [-1, 1])
        a.tube(
          Array.from({ length: 25 }, (_, i): P => {
            const t = i / 24,
              angle = t * Math.PI * 2;
            return [
              Math.sin(angle) * 0.082,
              0.425 + t * 0.01,
              -0.086 + Math.cos(angle) * 0.1,
            ];
          }),
          0.006,
          gusset,
        );
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
    "cloud-toe-embroidered-shoes",
    "silk-ribbon-wrap-slippers",
    "rounded-school-loafers",
    "white-toe-canvas-plimsolls",
    "soft-fleece-ankle-boots",
    "cushioned-running-shoes",
    "platform-lolita-shoes",
    "split-toe-tabi-and-wrap",
    "two-tooth-wooden-geta",
    "minimal-low-sneakers",
    "chunky-layered-sneakers",
    "elastic-gusset-ankle-boots",
  ]);
}
