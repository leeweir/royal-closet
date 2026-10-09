import * as T from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import type { Item } from "../simulation/data";
import { toon } from "./toon";
import { torsoSurface } from "./body-fit";

// Garment coordinates match the character's waist, bust and shoulder anchors.
// All ornament geometry is attached to the cloth, never to the character's skin.
type Surface = (t: number, a: number) => T.Vector3;
type Cloth =
  | "satin"
  | "velvet"
  | "lace"
  | "tulle"
  | "brocade"
  | "knit"
  | "jersey"
  | "cotton";
const TAU = Math.PI * 2;
const gold = "#dbb875";

function cloth(color: string, kind: Cloth) {
  const mat = toon(color, kind);
  if (kind === "tulle") {
    mat.transparent = true;
    mat.opacity = 0.28;
    mat.depthWrite = false;
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

type Neckline = "sweetheart" | "collar" | "crew" | "turtleneck";
/** How high the cloth climbs: its y value at the top of the bodice shell. */
const NECKLINE_TOP: Record<Neckline, number> = {
  sweetheart: 2.505,
  collar: 2.585,
  crew: 2.615,
  turtleneck: 2.66,
};
function bodice(
  group: T.Group,
  material: T.Material,
  trim: T.Material,
  asymmetric = false,
  corset = false,
  neckline: Neckline = "sweetheart",
) {
  const surface: Surface = (t, a) => {
    const front = Math.max(0, Math.cos(a));
    const top = asymmetric
      ? 2.51 - Math.sin(a) * 0.075
      : NECKLINE_TOP[neckline] + front * 0.04 * Math.sin(a * 2) ** 2;
    return torsoSurface(1.895 + t * (top - 1.895), a, 0.013);
  };
  add(group, shell(surface, 0, TAU, 96, 36), material).name = "fitted-bodice";
  group.userData.neckline = neckline;
  // A standing band turns the neckline into a real collar: it climbs the
  // throat instead of lying flat, so the shoulders are covered rather than
  // framed by bare skin.
  const standing = neckline === "turtleneck" || neckline === "crew";
  const rise = neckline === "turtleneck" ? 0.1 : 0.034;
  const collar: Surface = (t, a) => {
    const p = surface(1, a);
    // Flat necklines fold down onto the chest; standing ones rise up the
    // throat, where torsoSurface already narrows to the neck.
    const y = standing ? p.y + t * rise : p.y - t * 0.058;
    return torsoSurface(
      y,
      a,
      (standing ? 0.022 : 0.018) + 0.005 * Math.sin(t * Math.PI),
    );
  };
  add(
    group,
    shell(collar, 0, TAU, 96, standing ? 14 : 8),
    standing ? material : trim,
  );
  const inset = grid(
    (u, t) => {
      const angle = (u - 0.5) * (0.84 - 0.28 * t);
      return at(surface, 0.96 - t * 0.9, angle, 0.005);
    },
    20,
    24,
  );
  add(group, inset, trim);
  const seams: T.BufferGeometry[] = [];
  for (const a of [-0.47, 0.47])
    seams.push(
      line(
        Array.from({ length: 25 }, (_, i) => at(surface, i / 24, a, 0.007)),
        0.004,
      ),
    );
  if (corset) {
    for (let i = 0; i < 4; i++) {
      const t = 0.22 + i * 0.15;
      for (const side of [-1, 1])
        seams.push(
          line(
            [
              at(surface, t, side * 0.16, 0.011),
              at(surface, t + 0.1, -side * 0.16, 0.011),
            ],
            0.004,
            4,
          ),
        );
    }
  }
  add(group, combine(seams), material);
  // Small shoulder straps join the bodice to the arm caps in the bind pose.
  for (const side of [-1, 1]) {
    const strap = grid(
      (u, t) => {
        const a = side * (0.66 + t * (Math.PI - 1.32));
        const y = 2.52 + Math.sin(t * Math.PI) * 0.096;
        return torsoSurface(y, a + (u - 0.5) * 0.3, 0.018);
      },
      8,
      28,
    );
    add(group, strap, trim);
  }

  return surface;
}

function waist(group: T.Group, material: T.Material, thickness = 0.014) {
  const ring = new T.TorusGeometry(0.239, thickness, 8, 80);
  ring.rotateX(Math.PI / 2);
  ring.scale(1, 1, 0.72);
  ring.translate(0, 1.899, 0);
  add(group, ring, material);
}

function longSleeves(
  group: T.Group,
  material: T.Material,
  cuff: T.Material,
  flare = 0.05,
  wrist = 0.33,
) {
  // Sleeves hang from the same shoulder anchors as the puff caps so the rig
  // can swing them with the upper arm on every silhouette.
  for (const side of [-1, 1]) {
    const armAttachment = new T.Group();
    armAttachment.name = side < 0 ? "sleeve-left" : "sleeve-right";
    group.add(armAttachment);
    const arm = grid(
      (u, t) => {
        const a = u * TAU;
        const radius = 0.066 + flare * Math.pow(t, 1.35);
        return new T.Vector3(
          side * (0.34 + t * 0.055) + Math.sin(a) * radius,
          2.545 - t * (0.28 + wrist),
          Math.cos(a) * radius * 0.82,
        );
      },
      48,
      26,
    );
    add(armAttachment, arm, material);
    const hemRing = grid(
      (u, t) => {
        const a = u * TAU,
          r = 0.066 + flare + t * 0.014;
        return new T.Vector3(
          side * 0.395 + Math.sin(a) * r,
          2.265 - wrist - t * 0.05,
          Math.cos(a) * r * 0.82,
        );
      },
      48,
      8,
    );
    add(armAttachment, hemRing, cuff);
  }
}

/** Flat sailor collar with two front points; a fuku signature, not a shawl. */
function sailorCollar(group: T.Group, material: T.Material, trim: T.Material) {
  const back = grid(
    (u, t) => {
      const a = (u - 0.5) * Math.PI * 1.16;
      const y = 2.585 - t * 0.2;
      const p = torsoSurface(y, a + Math.PI, 0.026 + t * 0.012);
      return new T.Vector3(p.x, p.y + Math.sin(u * Math.PI) * 0.012, p.z);
    },
    32,
    14,
  );
  add(group, back, material);
  for (const side of [-1, 1]) {
    const point = grid(
      (u, t) => {
        const a = side * (0.06 + t * 0.66);
        const p = at(
          (tt, aa) => torsoSurface(2.585 - tt * 0.24, aa, 0.03),
          t * 0.96,
          a -
            side * (u - 0.5) * (0.2 - t * 0.12) +
            Math.sin(t * Math.PI) * 0.02,
          0.008,
        );
        return new T.Vector3(p.x, p.y - t * 0.035, p.z);
      },
      20,
      24,
    );
    add(group, point, material);
    add(
      group,
      line(
        Array.from({ length: 25 }, (_, i) => {
          const t = i / 24;
          return at(
            (tt, aa) => torsoSurface(2.585 - tt * 0.24, aa, 0.037),
            t * 0.96,
            side * (0.06 + t * 0.66),
            0,
          );
        }),
        0.005,
      ),
      trim,
    );
  }
  const knot = add(
    group,
    new T.BoxGeometry(0.062, 0.05, 0.036, 2, 2, 2),
    trim,
  );
  knot.position.set(0, 2.395, 0.202);
  knot.rotation.z = 0.1;
  add(
    group,
    ribbon(
      [
        new T.Vector3(0, 2.39, 0.204),
        new T.Vector3(-0.03, 2.3, 0.211),
        new T.Vector3(0.05, 2.16, 0.198),
        new T.Vector3(0.02, 2.06, 0.192),
      ],
      0.052,
    ),
    trim,
  );
}

/** Hanging sash ends with a knot; used by the kimono-family silhouettes. */
function sashTails(
  group: T.Group,
  material: T.Material,
  y: number,
  reach: number,
  width = 0.1,
) {
  add(
    group,
    ribbon(
      [
        new T.Vector3(0, y, 0.185),
        new T.Vector3(0.03, y - reach * 0.35, 0.21),
        new T.Vector3(-0.04, y - reach * 0.72, 0.2),
        new T.Vector3(0.01, y - reach, 0.16),
      ],
      width,
    ),
    material,
  );
  add(
    group,
    ribbon(
      [
        new T.Vector3(0, y, 0.185),
        new T.Vector3(-0.02, y - reach * 0.3, 0.215),
        new T.Vector3(0.05, y - reach * 0.66, 0.203),
        new T.Vector3(0.04, y - reach * 0.98, 0.17),
      ],
      width,
    ),
    material,
  );
}

/**
 * Knife pleats as a surface: the fold offset grows with `t` so a pleated
 * skirt reads as crisp vertical channels rather than a wavy tube.
 */
function pleated(
  r: (t: number) => number,
  y: (t: number, a: number) => number,
  depth = 0.8,
  folds = 20,
  foldSize = 0.03,
  sharp = 1,
): Surface {
  return (t, a) => {
    const fold = Math.asin(Math.sin(a * folds)) / (Math.PI / 2);
    const radius = r(t) + fold * foldSize * Math.pow(t, sharp);
    return new T.Vector3(
      Math.sin(a) * radius,
      y(t, a),
      Math.cos(a) * radius * depth,
    );
  };
}

/** Crossed collar band over the bodice — the hanfu and kimono neckline. */
function crossedCollar(
  group: T.Group,
  material: T.Material,
  trim: T.Material,
  top = 2.58,
  drop = 0.24,
  ease = 0.021,
) {
  for (const side of [-1, 1]) {
    const band = grid(
      (u, t) => {
        const a = side * (0.1 + t * 0.62);
        const y = top - t * drop;
        const p = torsoSurface(y, a, ease);
        return new T.Vector3(
          p.x + Math.sin(a) * 0.006,
          p.y + (u - 0.5) * 0.006,
          p.z + Math.cos(a) * 0.006,
        );
      },
      10,
      28,
    );
    add(group, band, material);
    add(
      group,
      line(
        Array.from({ length: 29 }, (_, i) => {
          const t = i / 28;
          const a = side * (0.1 + t * 0.62);
          return torsoSurface(top - t * drop, a, ease + 0.008);
        }),
        0.0045,
      ),
      trim,
    );
  }
}

/** A wide drape of fabric hanging from the shoulders; the kimono sleeve. */
function hangingSleeves(
  group: T.Group,
  material: T.Material,
  trim: T.Material,
  reach = 0.78,
  spread = 0.235,
) {
  for (const side of [-1, 1]) {
    const armAttachment = new T.Group();
    armAttachment.name = side < 0 ? "sleeve-left" : "sleeve-right";
    group.add(armAttachment);
    const drape = grid(
      (u, t) => {
        const a = u * TAU;
        const radius = 0.072 + spread * Math.pow(t, 0.72);
        return new T.Vector3(
          side * (0.335 + t * 0.05) + Math.sin(a) * radius,
          2.55 - t * reach,
          Math.cos(a) * radius * 0.66,
        );
      },
      44,
      24,
    );
    add(armAttachment, drape, material);
    const cuffRing = grid(
      (u, t) => {
        const a = u * TAU,
          r = 0.072 + spread + t * 0.02;
        return new T.Vector3(
          side * 0.385 + Math.sin(a) * r,
          2.55 - reach - t * 0.05,
          Math.cos(a) * r * 0.66,
        );
      },
      44,
      8,
    );
    add(armAttachment, cuffRing, trim);
  }
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
          Math.sin(t * Math.PI) * 0.05 +
          Math.cos(a * 9) * 0.006 * Math.sin(t * Math.PI);
        return new T.Vector3(
          side * (0.34 + t * 0.059) + Math.sin(a) * radius,
          2.53 - t * 0.23,
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
          side * 0.399 + Math.sin(a) * r,
          2.305 - t * 0.058 + Math.cos(a * 9) * 0.008 * t,
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
  const satin = cloth(color, "satin");
  const ivory = cloth(item.accent, "satin");
  const lace = cloth(item.accent, "lace");
  const tulle = cloth(item.accent, "tulle");
  const velvet = cloth(
    new T.Color(color).lerp(new T.Color("#655090"), 0.3).getStyle(),
    "velvet",
  );
  // The everyday silhouettes read as fabric, not as lacquer: a deep ink for
  // hanfu piping, plus matte knit and jersey for the casual and sporty sets.
  const ink = cloth(
    new T.Color(color).lerp(new T.Color("#2c2a3d"), 0.55).getStyle(),
    "brocade",
  );
  const knit = cloth(
    new T.Color(color).lerp(new T.Color("#f3e9dc"), 0.4).getStyle(),
    "knit",
  );
  const jersey = cloth(
    new T.Color(color).lerp(new T.Color("#ffffff"), 0.2).getStyle(),
    "jersey",
  );
  const metallic = toon("#ffe3a2", "gold trim");
  const silver = toon("#eef6ff", "ivory trim");
  const crystal = toon("#ade4ff", "crystal");
  const shape = Math.max(0, Math.min(17, item.shape));
  const silhouettes = [
    "moonlight-a-line",
    "rose-lolita",
    "asymmetric-leaf",
    "ice-mermaid",
    "witch-pleats-and-tails",
    "royal-open-robe-and-train",
    "ink-hanfu-ruqun",
    "tang-chest-wrap",
    "republican-student-uniform",
    "sailor-fuku",
    "cream-knit-casual",
    "track-jacket-and-shorts",
    "sweet-lolita-bell",
    "kimono-furisode",
    "vermilion-miko-hakama",
    "cream-turtleneck-knit-dress",
    "sage-hoodie-and-bike-shorts",
    "charcoal-belted-trench",
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
      ["satin", "brocade"],
      ["satin", "brocade", "tulle"],
      ["satin", "velvet"],
      ["satin", "lace"],
      ["knit", "satin"],
      ["jersey", "satin"],
      ["satin", "lace", "tulle"],
      ["satin", "brocade"],
      ["satin", "cotton"],
      ["satin", "brocade"],
      ["knit", "satin"],
      ["jersey", "knit"],
      ["satin", "velvet"],
    ][shape],
    waistY: 1.9,
  };

  if (shape === 0) {
    const skirt = radial(
      (t) => 0.235 + 0.625 * Math.pow(Math.sin((t * Math.PI) / 2), 0.84),
      (t, a) => 1.895 - 1.655 * t + Math.cos(a * 12) * 0.016 * t,
      0.79,
      12,
      0.025,
    );
    add(group, shell(skirt), satin);
    const petticoat: Surface = (t, a) => {
      const p = at(skirt, 0.91 + t * 0.086, a, 0.012 + t * 0.018);
      p.y += Math.cos(a * 24) * 0.012 * t;
      return p;
    };
    add(group, shell(petticoat, 0, TAU, 112, 12), ivory);
    // Six broad scallops create an illustrated overskirt with a readable hem.
    const petals: Surface = (t, a) => {
      const length = 0.51 + 0.075 * (0.5 + 0.5 * Math.cos(a * 6));
      return at(
        skirt,
        t * length,
        a,
        0.018 + 0.025 * Math.sin((t * Math.PI) / 2),
      );
    };
    add(group, shell(petals, 0, TAU, 112, 28), satin);
    const petalEdge: Surface = (t, a) => at(petals, 0.89 + t * 0.11, a, 0.006);
    add(group, shell(petalEdge, 0, TAU, 112, 8), ivory);
    bodice(group, satin, ivory);
    puffSleeves(group, satin, ivory);
    waist(group, ivory, 0.019);
    const stars = Array.from({ length: 12 }, (_, i) => {
      const a = (i / 12) * TAU;
      return {
        position: at(skirt, 0.79, a, 0.016),
        angle: a,
        scale: i % 2 ? 0.75 : 1,
      };
    });
    ornamentInstances(group, starGeometry(0.048, 0.007), metallic, stars);
    bow(group, ivory, new T.Vector3(0, 1.94, 0.192), 0.195);
    ornamentInstances(group, starGeometry(0.055, 0.009), metallic, [
      { position: new T.Vector3(0, 1.94, 0.232) },
    ]);
    const brooch = add(group, new T.OctahedronGeometry(0.038, 0), crystal);
    brooch.position.set(0, 2.435, 0.205);
    brooch.scale.set(0.75, 1.3, 0.4);
    bow(group, ivory, new T.Vector3(0, 1.925, -0.2), 0.22);
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
        (t, a) => 1.72 - i * 0.14 - 0.21 * t + Math.cos(a * 12) * 0.034 * t,
        0.84,
        12,
        0.025,
      );
      add(group, shell(tier, 0, TAU, 112, 16), i % 2 ? ivory : satin);
      add(group, hem(tier, 0.009), ivory);
      const frill = radial(
        (t) => radiusAtY(1.52 - i * 0.14 - 0.055 * t) + 0.055 + 0.015 * t,
        (t, a) => 1.52 - i * 0.14 - t * 0.055 + Math.cos(a * 12) * 0.034,
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
    bow(group, velvet, new T.Vector3(0, 2.43, 0.192), 0.12);
    bow(group, satin, new T.Vector3(0, 1.863, 0.291), 0.16);
    for (const side of [-1, 1])
      rose(group, velvet, new T.Vector3(side * 0.23, 1.72, 0.397), 0.095);
    const buttons = Array.from({ length: 4 }, (_, i) => ({
      position: torsoSurface(2.05 + i * 0.075, 0, 0.021),
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
    puffSleeves(group, satin, ivory);
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
    bow(group, satin, new T.Vector3(0, 2.4, 0.201), 0.125);
  } else if (shape === 5) {
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
          torsoSurface(2.43 - 0.52 * t, 0, 0.022).z - Math.abs(x) * 0.08,
        );
      },
      16,
      24,
    );
    add(group, stomacher, ivory);
    const jewels = Array.from({ length: 6 }, (_, i) => ({
      position: torsoSurface(2.385 - i * 0.077, 0, 0.029),
      scale: 1 - i * 0.07,
    }));
    const jewel = new T.OctahedronGeometry(0.022, 0);
    jewel.scale(0.9, 1.4, 0.4);
    ornamentInstances(group, jewel, crystal, jewels);
    bow(group, satin, new T.Vector3(0, 1.916, -0.22), 0.265);
  } else if (shape === 6) {
    // 水墨仙裳: a cross-collared ruqun with a high waistband and a long,
    // evenly pleated skirt that flows past the ankles.
    const skirt = pleated(
      (t) => 0.242 + 0.5 * Math.pow(Math.sin((t * Math.PI) / 2), 0.72),
      (t) => 1.9 - 1.685 * t,
      0.82,
      24,
      0.026,
      1.1,
    );
    add(group, shell(skirt, 0, TAU, 148, 46), satin);
    add(group, hem(skirt, 0.008), ink);
    crossedCollar(group, satin, ink);
    longSleeves(group, satin, ink, 0.085, 0.3);
    bodice(group, satin, ink, false, true, "collar");
    // A wide obi sits above the waist seam; a jade ring closes it.
    const obi = radial(
      () => 0.247,
      (t, a) => 1.985 - t * 0.12 + Math.cos(a * 24) * 0.004,
      0.8,
      24,
      0.012,
    );
    add(group, shell(obi, 0, TAU, 128, 12), ivory);
    add(group, hem(obi, 0.006), ink);
    const jade = toon("#7fc2a8", "jade");
    const jadeRing = add(
      group,
      new T.TorusGeometry(0.042, 0.011, 8, 24),
      jade,
    );
    jadeRing.position.set(0, 1.93, 0.2);
    jadeRing.rotation.x = Math.PI / 2;
    sashTails(group, ivory, 1.9, 0.5, 0.075);
    // Ink-wash blossoms climbing the skirt.
    const petals: T.BufferGeometry[] = [];
    for (let i = 0; i < 7; i++) {
      const a = -0.5 + i * 0.42,
        t = 0.3 + (i % 3) * 0.2;
      const center = at(skirt, t, a, 0.012);
      for (let n = 0; n < 5; n++) {
        const angle = (n / 5) * TAU;
        petals.push(
          line(
            [
              center.clone(),
              center
                .clone()
                .add(
                  new T.Vector3(
                    Math.sin(angle) * 0.036,
                    0.03 - Math.cos(angle) * 0.036,
                    Math.sin(a) * 0.012,
                  ),
                ),
            ],
            0.006,
            2,
          ),
        );
      }
    }
    add(group, combine(petals), ink);
  } else if (shape === 7) {
    // 齐胸襦裙: the skirt band ties above the bust, with a translucent
    // outer layer and two waist streamers.
    const skirt = radial(
      (t) => 0.246 + 0.47 * Math.pow(Math.sin((t * Math.PI) / 2), 0.66),
      (t, a) => 2.24 - 2.03 * t + Math.cos(a * 16) * 0.02 * t,
      0.82,
      16,
      0.024,
    );
    add(group, shell(skirt, 0, TAU, 136, 44), satin);
    const over = radial(
      (t) => 0.252 + 0.5 * Math.pow(t, 0.7),
      (t, a) => 2.23 - t * 2.0 + Math.cos(a * 12) * 0.028 * t,
      0.83,
      12,
      0.03,
    );
    add(group, shell(over, 0, TAU, 120, 30), tulle).renderOrder = 1;
    add(group, hem(skirt, 0.009), metallic);
    // The chest-wrap sits over a fitted inner bodice, so the fabric still
    // follows the torso envelope where the bandeau leaves a gap.
    bodice(group, satin, ivory);
    const bandeau = grid(
      (u, t) => {
        const a = (u - 0.5) * TAU;
        return torsoSurface(2.4 - t * 0.16, a, 0.014);
      },
      96,
      20,
    );
    add(group, bandeau, satin);
    const chestBand = radial(
      () => 0.243,
      (t, a) => 2.395 - t * 0.115 + Math.cos(a * 22) * 0.005,
      0.8,
      22,
      0.01,
    );
    add(group, shell(chestBand, 0, TAU, 128, 12), ivory);
    add(group, hem(chestBand, 0.007), metallic);
    for (const a of [0.34, TAU - 0.34])
      add(
        group,
        line(
          Array.from({ length: 26 }, (_, i) => {
            const t = i / 25;
            const p = at(skirt, 0.02 + t * 0.42, a + t * 0.05, 0.014);
            return new T.Vector3(p.x + Math.sin(a) * 0.03, p.y, p.z);
          }),
          0.007,
        ),
        ivory,
      );
    add(
      group,
      ribbon(
        [
          new T.Vector3(0, 2.39, 0.2),
          new T.Vector3(-0.05, 2.24, 0.226),
          new T.Vector3(0.04, 2.02, 0.222),
          new T.Vector3(-0.02, 1.82, 0.19),
        ],
        0.09,
      ),
      ivory,
    );
    for (let i = 0; i < 5; i++) {
      const bead = add(
        group,
        new T.OctahedronGeometry(0.019 - i * 0.0015, 0),
        crystal,
      );
      bead.position.set(0, 2.36 - i * 0.045, 0.215);
    }
    sashTails(group, satin, 1.9, 0.42);
  } else if (shape === 8) {
    // 青衿学生装: a stand collar, a straight buttoned bodice and a knee
    // length knife-pleated skirt with a twin white stripe.
    const skirt = pleated(
      (t) => 0.24 + 0.235 * Math.pow(t, 0.8),
      (t, a) => 1.9 - t * 0.68 + Math.cos(a * 20) * 0.012 * t,
      0.82,
      20,
      0.022,
      1,
    );
    add(group, shell(skirt, 0, TAU, 128, 30), satin);
    add(group, hem(skirt, 0.007), ivory);
    add(
      group,
      line(
        Array.from({ length: 97 }, (_, i) =>
          at(skirt, 0.795, (i / 96) * TAU, 0.008),
        ),
        0.006,
      ),
      ivory,
    );
    bodice(group, satin, ivory, false, true, "collar");
    // Mandarin collar: a short standing band above the bodice edge.
    const collar = radial(
      (t) => 0.152 - t * 0.012,
      (t, a) => 2.585 + t * 0.045,
      0.72,
      0,
      0,
    );
    add(group, shell(collar, 0, TAU, 96, 10), satin);
    add(group, hem(collar, 0.006), ivory);
    // Button placket down the front.
    const placket = grid(
      (u, t) =>
        at(
          (tt, aa) => torsoSurface(2.53 - tt * 0.6, aa, 0.017),
          t,
          (u - 0.5) * 0.075,
          0,
        ),
      8,
      24,
    );
    add(group, placket, ivory);
    const buttons: { position: T.Vector3; angle: number; scale: number }[] = [];
    for (let i = 0; i < 5; i++)
      buttons.push({
        position: torsoSurface(2.5 - i * 0.115, 0, 0.03),
        angle: 0,
        scale: 1,
      });
    ornamentInstances(group, new T.CylinderGeometry(0.013, 0.013, 0.007, 12), metallic, buttons);
    longSleeves(group, satin, ivory, 0.02, 0.29);
    waist(group, ivory, 0.012);
    bow(group, satin, new T.Vector3(0, 1.905, 0.2), 0.115);
  } else if (shape === 9) {
    // 海风水手服: a sailor collar with a knotted tie over a pleated skirt.
    const skirt = pleated(
      (t) => 0.24 + 0.24 * Math.pow(t, 0.85),
      (t, a) => 1.9 - t * 0.66 + Math.cos(a * 22) * 0.01 * t,
      0.82,
      22,
      0.024,
      1,
    );
    add(group, shell(skirt, 0, TAU, 128, 30), satin);
    add(group, hem(skirt, 0.008), ivory);
    add(
      group,
      line(
        Array.from({ length: 97 }, (_, i) =>
          at(skirt, 0.86, (i / 96) * TAU, 0.009),
        ),
        0.007,
      ),
      ivory,
    );
    bodice(group, satin, ivory, false, false, "collar");
    sailorCollar(group, satin, ivory);
    puffSleeves(group, satin, ivory);
    waist(group, ivory, 0.011);
  } else if (shape === 10) {
    // 奶油针织: an oversized ribbed cardigan over a soft long skirt.
    const skirt: Surface = (t, a) => {
      const r = 0.243 + 0.3 * Math.pow(t, 0.72);
      return new T.Vector3(
        Math.sin(a) * r,
        1.9 - t * 1.66,
        Math.cos(a) * r * 0.84,
      );
    };
    add(group, shell(skirt, 0, TAU, 120, 44), satin);
    add(group, hem(skirt, 0.012), knit);
    // Ribbed hem band in a deeper tone.
    const ribbed = radial(
      (t) => 0.545 + t * 0.02,
      (t, a) => 0.245 + t * 0.09 + Math.cos(a * 30) * 0.006,
      0.84,
      30,
      0.008,
    );
    add(group, shell(ribbed, 0, TAU, 120, 10), knit);
    const cardigan: Surface = (t, a) => {
      const front = Math.max(0, Math.cos(a));
      const y = 2.58 - t * 0.92;
      const p = torsoSurface(y, a, 0.032 + t * 0.02);
      return new T.Vector3(
        p.x * (1 + t * 0.12),
        p.y,
        p.z * (1 + t * 0.16) - front * t * 0.012,
      );
    };
    add(group, shell(cardigan, 0, TAU, 112, 26), knit);
    add(group, hem(cardigan, 0.012), ivory);
    for (const side of [-1, 1])
      add(
        group,
        line(
          Array.from({ length: 21 }, (_, i) => {
            const t = i / 20;
            const a = side * 0.42;
            return torsoSurface(2.58 - t * 0.9, a, 0.038 + t * 0.02);
          }),
          0.009,
        ),
        ivory,
      );
    longSleeves(group, knit, ivory, 0.045, 0.27);
    const buttons: { position: T.Vector3; angle: number; scale: number }[] = [];
    for (let i = 0; i < 4; i++)
      buttons.push({
        position: torsoSurface(2.4 - i * 0.19, 0.3, 0.045),
        angle: 0.3,
        scale: 1,
      });
    ornamentInstances(
      group,
      new T.SphereGeometry(0.016, 12, 10),
      toon("#d8b98a", "wood"),
      buttons,
    );
    bodice(group, knit, ivory, false, false, "turtleneck");
    waist(group, ivory, 0.009);
  } else if (shape === 11) {
    // 跃动运动服: a zipped track jacket with side stripes over lined shorts.
    const shorts = radial(
      (t) => 0.246 + 0.13 * Math.pow(t, 0.6),
      (t, a) => 1.9 - t * 0.74 + Math.cos(a * 14) * 0.012 * t,
      0.8,
      14,
      0.02,
    );
    add(group, shell(shorts, 0, TAU, 112, 26), satin);
    add(group, hem(shorts, 0.009), jersey);
    // The inner seam makes the shorts read as two legs, not a tube.
    for (const a of [0, Math.PI])
      add(
        group,
        grid(
          (u, t) => {
            const p = at(shorts, 0.55 + t * 0.44, a, 0.006);
            return new T.Vector3(p.x + (u - 0.5) * 0.016, p.y, p.z * 0.42);
          },
          6,
          14,
        ),
        jersey,
      );
    bodice(group, satin, jersey, false, true, "crew");
    const jacket: Surface = (t, a) => {
      const y = 2.545 - t * 0.86;
      const p = torsoSurface(y, a, 0.028 + t * 0.014);
      return new T.Vector3(p.x, p.y, p.z);
    };
    add(group, shell(jacket, 0, TAU, 112, 24), satin);
    add(group, hem(jacket, 0.01), jersey);
    // Centre zip and the racing stripe down each sleeve.
    add(
      group,
      line(
        Array.from({ length: 22 }, (_, i) =>
          torsoSurface(2.545 - (i / 21) * 0.84, 0, 0.045),
        ),
        0.007,
      ),
      jersey,
    );
    const collar = radial(
      (t) => 0.156 - t * 0.01,
      (t, a) => 2.57 + t * 0.05,
      0.74,
      0,
      0,
    );
    add(group, shell(collar, 0, TAU, 96, 10), satin);
    add(group, hem(collar, 0.006), jersey);
    longSleeves(group, satin, jersey, 0.03, 0.26);
    for (const side of [-1, 1])
      add(
        group,
        line(
          Array.from({ length: 18 }, (_, i) => {
            const t = i / 17;
            const r = 0.062 + 0.03 * t;
            const a = side * 1.5;
            return new T.Vector3(
              side * (0.34 + t * 0.055) + Math.sin(a) * r,
              2.545 - t * 0.54,
              Math.cos(a) * r * 0.82,
            );
          }),
          0.011,
        ),
        jersey,
      );
    waist(group, jersey, 0.014);
    bow(group, jersey, new T.Vector3(0, 1.895, 0.2), 0.09);
  } else if (shape === 12) {
    // 甜梦洛丽塔: a bell skirt on layered ruffles with a large back bow.
    const bell = radial(
      (t) => 0.244 + 0.46 * Math.pow(Math.sin((t * Math.PI) / 2), 0.6),
      (t, a) => 1.9 - t * 0.95 + Math.cos(a * 18) * 0.022 * t,
      0.88,
      18,
      0.026,
    );
    add(group, shell(bell, 0, TAU, 136, 34), satin);
    for (let i = 0; i < 3; i++) {
      const tier = radial(
        (t) => 0.244 + 0.46 * Math.pow(Math.sin(((0.62 + i * 0.19) * Math.PI) / 2), 0.6) + t * 0.085,
        (t, a) => 1.9 - (0.62 + i * 0.19) * 0.95 - t * 0.11 +
          Math.cos(a * 16) * 0.03,
        0.88,
        16,
        0.03,
      );
      add(group, shell(tier, 0, TAU, 128, 8), i % 2 ? lace : ivory);
    }
    add(group, hem(bell, 0.012), lace);
    bodice(group, satin, ivory, false, true, "collar");
    puffSleeves(group, satin, lace);
    waist(group, ivory, 0.018);
    bow(group, ivory, new T.Vector3(0, 1.92, 0.2), 0.155);
    bow(group, satin, new T.Vector3(0, 1.93, -0.225), 0.3);
    sashTails(group, ivory, 1.86, 0.55, 0.11);
    const pearls: { position: T.Vector3; angle: number; scale: number }[] = [];
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * TAU;
      pearls.push({ position: at(bell, 0.3, a, 0.014), angle: a, scale: 1 });
    }
    ornamentInstances(
      group,
      new T.SphereGeometry(0.012, 10, 8),
      ivory,
      pearls,
    );
  } else if (shape === 13) {
    // 和风振袖: a crossed kimono collar, a wide obi and long hanging sleeves.
    const kimono: Surface = (t, a) => {
      const p = torsoSurface(2.53 - t * 0.86, a, 0.03 + t * 0.018);
      return new T.Vector3(p.x * (1 + t * 0.06), p.y, p.z * (1 + t * 0.05));
    };
    add(group, shell(kimono, 0, TAU, 112, 26), satin);
    const skirt = radial(
      (t) => 0.246 + 0.215 * Math.pow(t, 0.78),
      (t, a) => 1.9 - t * 1.7 + Math.cos(a * 16) * 0.016 * t,
      0.83,
      16,
      0.022,
    );
    add(group, shell(skirt, 0, TAU, 128, 44), satin);
    add(group, hem(skirt, 0.01), ivory);
    crossedCollar(group, satin, ivory, 2.585, 0.5, 0.034);
    hangingSleeves(group, satin, ivory, 0.84, 0.28);
    bodice(group, satin, ivory, false, true, "collar");
    // Obi: a broad stiff band with a braided cord and a back knot.
    const obi = radial(
      () => 0.262,
      (t, a) => 2.0 - t * 0.28 + Math.cos(a * 20) * 0.005,
      0.82,
      20,
      0.01,
    );
    add(group, shell(obi, 0, TAU, 128, 14), ivory);
    add(group, hem(obi, 0.007), metallic);
    add(
      group,
      line(
        Array.from({ length: 97 }, (_, i) =>
          at(obi, 0.5, (i / 96) * TAU, 0.012),
        ),
        0.008,
      ),
      metallic,
    );
    const obiKnot = add(group, new T.BoxGeometry(0.17, 0.1, 0.06), ivory);
    obiKnot.position.set(0, 1.86, -0.245);
    const obiCord = add(
      group,
      new T.TorusGeometry(0.05, 0.012, 8, 24),
      metallic,
    );
    obiCord.position.set(0, 1.86, -0.278);
    obiCord.rotation.x = Math.PI / 2;
    sashTails(group, ivory, 1.83, 0.6, 0.13);
    // Scattered blossom stamps down the front panels.
    const stamps: { position: T.Vector3; angle: number; scale: number }[] = [];
    for (let i = 0; i < 9; i++) {
      const a = -0.42 + i * 0.22;
      stamps.push({
        position: at(skirt, 0.34 + (i % 3) * 0.2, a, 0.012),
        angle: a,
        scale: i % 2 ? 0.8 : 1,
      });
    }
    ornamentInstances(group, starGeometry(0.03, 0.006), metallic, stamps);
  } else if (shape === 14) {
    // 绯樱巫女服: a white kosode over a scarlet divided hakama.
    const kosode: Surface = (t, a) => {
      const p = torsoSurface(2.55 - t * 0.72, a, 0.026 + t * 0.012);
      return new T.Vector3(p.x, p.y, p.z);
    };
    add(group, shell(kosode, 0, TAU, 112, 24), ivory);
    // A fitted inner bodice keeps the kosode on the torso envelope; the wide
    // outer panel is a separate drape, not a second shell.
    bodice(group, ivory, satin, false, false, "collar");
    crossedCollar(group, satin, ivory, 2.585, 0.42, 0.03);
    // Hakama: two wide pleated legs sharing one waist band.
    for (const side of [-1, 1]) {
      const leg = pleated(
        (t) => 0.145 + 0.1 * Math.pow(t, 0.7),
        (t, a) => 1.86 - t * 1.66,
        0.92,
        10,
        0.03,
        1,
      );
      const geometry = shell(leg, 0, TAU, 96, 34);
      geometry.translate(side * 0.135, 0, 0);
      add(group, geometry, satin);
      const legHem = hem(leg, 0.01);
      legHem.translate(side * 0.135, 0, 0);
      add(group, legHem, ivory);
    }
    const band = radial(
      () => 0.255,
      (t, a) => 1.95 - t * 0.11,
      0.8,
      0,
      0,
    );
    add(group, shell(band, 0, TAU, 112, 10), satin);
    add(group, hem(band, 0.007), ivory);
    // Long white sleeves with a red cuff tie.
    hangingSleeves(group, ivory, satin, 0.6, 0.11);
    // Chest cord and the sakaki sprig at the back of the obi.
    add(
      group,
      line(
        [
          new T.Vector3(-0.09, 2.44, 0.2),
          new T.Vector3(0, 2.39, 0.226),
          new T.Vector3(0.09, 2.44, 0.2),
        ],
        0.008,
      ),
      metallic,
    );
    add(
      group,
      ribbon(
        [
          new T.Vector3(0, 2.44, 0.224),
          new T.Vector3(0.05, 2.31, 0.23),
          new T.Vector3(-0.04, 2.17, 0.215),
          new T.Vector3(0.02, 2.03, 0.195),
        ],
        0.075,
      ),
      satin,
    );
    for (const a of [1.35, TAU - 1.35])
      add(
        group,
        line(
          Array.from({ length: 18 }, (_, i) => {
            const t = i / 17;
            const p = at(kosode, 0.1 + t * 0.8, a, 0.014);
            return new T.Vector3(p.x, p.y, p.z);
          }),
          0.006,
        ),
        satin,
      );
    waist(group, ivory, 0.012);
  } else if (shape === 15) {
    // 云白高领针织: a column of fine ribbing from a folded turtleneck to a
    // soft A-line hem, with roomy sleeves that stop at the wrist.
    const knitBelt = cloth(item.accent, "knit");
    const column: Surface = (t, a) => {
      const radius =
        0.243 +
        0.235 * Math.pow(Math.sin((t * Math.PI) / 2), 0.66) +
        Math.cos(a * 30) * 0.005 * t;
      return new T.Vector3(
        Math.sin(a) * radius,
        1.9 - t * 0.88,
        Math.cos(a) * radius * 0.86,
      );
    };
    add(group, shell(column, 0, TAU, 132, 40), knit);
    add(group, hem(column, 0.014), knitBelt);
    // Wide ribbed cuff and hem, the two places a knit reads as a knit.
    const ribbed = radial(
      (t) => 0.47 + t * 0.014,
      (t, a) => 1.03 + t * 0.075 + Math.cos(a * 34) * 0.006,
      0.86,
      34,
      0.009,
    );
    add(group, shell(ribbed, 0, TAU, 132, 10), knitBelt);
    // The turtleneck itself: a folded collar standing off the throat.
    const neck: Surface = (t, a) => {
      const y = 2.66 + t * 0.1;
      const p = torsoSurface(y, a, 0.03 - t * 0.006);
      return new T.Vector3(p.x, p.y, p.z);
    };
    add(group, shell(neck, 0, TAU, 96, 14), knit);
    add(group, hem(neck, 0.01), knitBelt);
    bodice(group, knit, knitBelt, false, false, "turtleneck");
    longSleeves(group, knit, knitBelt, 0.075, 0.3);
    waist(group, knitBelt, 0.013);
  } else if (shape === 16) {
    // 苔绿连帽卫衣: a pullover with a hood resting on the back of the neck,
    // a pouch pocket and cycling shorts underneath.
    const shorts = radial(
      (t) => 0.246 + 0.12 * Math.pow(t, 0.6),
      (t, a) => 1.9 - t * 0.7 + Math.cos(a * 14) * 0.012 * t,
      0.82,
      14,
      0.02,
    );
    add(group, shell(shorts, 0, TAU, 112, 26), satin);
    add(group, hem(shorts, 0.009), jersey);
    for (const a of [0, Math.PI])
      add(
        group,
        grid(
          (u, t) => {
            const p = at(shorts, 0.55 + t * 0.44, a, 0.006);
            return new T.Vector3(p.x + (u - 0.5) * 0.016, p.y, p.z * 0.42);
          },
          6,
          14,
        ),
        jersey,
      );
    const hoodie: Surface = (t, a) => {
      const p = torsoSurface(2.615 - t * 0.675, a, 0.03 + t * 0.006);
      return new T.Vector3(p.x, p.y, p.z);
    };
    add(group, shell(hoodie, 0, TAU, 112, 26), knit);
    add(group, hem(hoodie, 0.016), jersey);
    // Kangaroo pocket sits low and flat across the front.
    const pocket = grid(
      (u, t) => {
        const a = (u - 0.5) * 0.94;
        return at(
          (tt, aa) => torsoSurface(2.0 - tt * 0.17, aa, 0.036),
          t,
          a,
          0.006,
        );
      },
      24,
      16,
    );
    add(group, pocket, jersey);
    // The hood is a soft half-shell behind the neck, not a sphere on the head.
    const hood: Surface = (t, a) => {
      const spread = 0.19 + t * 0.18;
      return new T.Vector3(
        Math.sin(a) * spread * 0.92,
        2.575 - t * 0.06 - Math.abs(Math.sin(a)) * 0.05 * t,
        -0.13 - t * 0.075 + Math.cos(a) * spread * 0.42,
      );
    };
    add(group, shell(hood, 0, TAU, 96, 20), knit);
    add(group, hem(hood, 0.012), jersey);
    bodice(group, knit, jersey, false, false, "crew");
    longSleeves(group, knit, jersey, 0.03, 0.27);
    // Drawstrings hanging from the collar.
    for (const side of [-1, 1])
      add(
        group,
        line(
          [
            new T.Vector3(side * 0.045, 2.6, 0.2),
            new T.Vector3(side * 0.05, 2.44, 0.225),
            new T.Vector3(side * 0.04, 2.3, 0.215),
          ],
          0.008,
        ),
        jersey,
      );
    waist(group, jersey, 0.011);
  } else if (shape === 17) {
    // 墨黑长风衣: a belted trench over straight trousers, lapels folded
    // open and the coat hanging past the knee.
    const trousers = cloth(
      new T.Color(color).lerp(new T.Color("#2f3036"), 0.35).getStyle(),
      "cotton",
    );
    // Two straight legs with a centre crease, joined at the hips.
    for (const side of [-1, 1]) {
      const leg: Surface = (t, a) => {
        const radius = 0.105 + 0.022 * Math.pow(t, 0.8);
        return new T.Vector3(
          Math.sin(a) * radius,
          1.86 - t * 1.66,
          Math.cos(a) * radius * 0.9,
        );
      };
      const geometry = shell(leg, 0, TAU, 84, 30);
      geometry.translate(side * 0.115, 0, 0);
      add(group, geometry, trousers);
      const legHem = hem(leg, 0.009);
      legHem.translate(side * 0.115, 0, 0);
      add(group, legHem, jersey);
      add(
        group,
        line(
          [
            new T.Vector3(side * 0.115, 1.8, 0.1),
            new T.Vector3(side * 0.121, 0.7, 0.105),
            new T.Vector3(side * 0.126, 0.21, 0.1),
          ],
          0.0035,
        ),
        jersey,
      );
    }
    const hips = radial(
      (t) => 0.25 + 0.02 * t,
      (t, a) => 1.93 - t * 0.12,
      0.84,
      0,
      0,
    );
    add(group, shell(hips, 0, TAU, 112, 12), trousers);
    bodice(group, satin, jersey, false, false, "collar");
    // The coat: an open shell that stops short of the front centre.
    const coat: Surface = (t, a) => {
      const radius = 0.262 + 0.185 * Math.pow(t, 0.72);
      return new T.Vector3(
        Math.sin(a) * radius,
        2.6 - t * 1.22,
        Math.cos(a) * radius * 0.86,
      );
    };
    add(group, shell(coat, 0.42, TAU - 0.42, 116, 34), satin);
    for (const a of [0.42, TAU - 0.42])
      add(
        group,
        line(
          Array.from({ length: 30 }, (_, i) => at(coat, i / 29, a, 0.012)),
          0.013,
        ),
        jersey,
      );
    add(group, hem(coat, 0.013, 0.42, TAU - 0.42), jersey);
    // Folded lapels over each side of the chest.
    for (const side of [-1, 1])
      add(
        group,
        grid(
          (u, t) => {
            const a = side * (0.42 - t * 0.34);
            const p = at(coat, t * 0.56, a, 0.016);
            return new T.Vector3(
              p.x + Math.sin(a) * (u - 0.5) * 0.1,
              p.y,
              p.z + Math.cos(a) * (u - 0.5) * 0.04,
            );
          },
          12,
          22,
        ),
        jersey,
      );
    longSleeves(group, satin, jersey, 0.05, 0.29);
    // Belt, buckle and a knotted sash at the waist.
    const belt = radial(
      () => 0.292,
      (t, a) => 1.9 - t * 0.1,
      0.86,
      0,
      0,
    );
    add(group, shell(belt, 0, TAU, 128, 10), jersey);
    const buckle = add(group, new T.BoxGeometry(0.075, 0.06, 0.022), metallic);
    buckle.position.set(0, 1.85, 0.26);
    sashTails(group, satin, 1.84, 0.5, 0.11);
    waist(group, jersey, 0.012);
  }
  return group;
}
