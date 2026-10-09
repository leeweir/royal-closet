import * as T from "three";

/** VRoid hair consists of separate, three-column UV strips, one per surface.
 * Rebuild those surfaces along smooth curves instead of bending their triangles.
 * The scalp is a different mesh and must not go through this operation. */
export function refineHairSurface(
  source: T.BufferGeometry,
  style: number,
  scale = 1,
) {
  const p = source.getAttribute("position"),
    uv = source.getAttribute("uv"),
    skin = source.getAttribute("skinIndex"),
    weights = source.getAttribute("skinWeight");
  const indices = source.index!;
  const parent = Array.from({ length: p.count }, (_, i) => i);
  const find = (i: number): number =>
    parent[i] === i ? i : (parent[i] = find(parent[i]));
  const triangles: number[][] = [];
  const groups = source.groups.length
    ? source.groups.filter((g) => !g.materialIndex)
    : [{ start: 0, count: indices.count }];
  for (const group of groups)
    for (let i = group.start; i < group.start + group.count; i += 3) {
      const tri = [indices.getX(i), indices.getX(i + 1), indices.getX(i + 2)];
      parent[find(tri[1])] = find(tri[0]);
      parent[find(tri[2])] = find(tri[0]);
      triangles.push(tri);
    }
  const components = new Map<
    number,
    { vertices: Set<number>; faces: number[][] }
  >();
  for (const face of triangles) {
    const id = find(face[0]);
    if (!components.has(id))
      components.set(id, { vertices: new Set(), faces: [] });
    const component = components.get(id)!;
    face.forEach((v) => component.vertices.add(v));
    component.faces.push(face);
  }

  const positions: number[] = [],
    texcoords: number[] = [],
    faces: number[] = [],
    joints: number[] = [],
    influences: number[] = [];
  // Styles whose silhouette ends at the jaw: the existing long strands are
  // trimmed there rather than compressed, which would crease them at the cheek.
  // 1 twin tails, 2 braids, 4 bob, 7 buns, 8 student bob, 9 high ponytail,
  // 11 sport braid, 14 side tie. Styles 6/10/12/13 stay long.
  const short =
    style === 1 || style === 2 || style === 4 || style === 7 || style === 8 ||
    style === 9 || style === 11 || style === 14;
  const cuts: number[] = [];
  const write = (
    point: T.Vector3,
    u: number,
    v: number,
    blend: [number, number][],
  ) => {
    positions.push(point.x / scale, point.y / scale, point.z / scale);
    texcoords.push(u, v);
    if (skin && weights) {
      const mix = new Map<number, number>();
      for (const [id, amount] of blend)
        for (let c = 0; c < 4; c++) {
          const bone = skin.getComponent(id, c);
          mix.set(
            bone,
            (mix.get(bone) ?? 0) + weights.getComponent(id, c) * amount,
          );
        }
      const ranked = [...mix].sort((a, b) => b[1] - a[1]).slice(0, 4);
      const total = ranked.reduce((sum, entry) => sum + entry[1], 0);
      for (let c = 0; c < 4; c++) {
        joints.push(ranked[c]?.[0] ?? 0);
        influences.push((ranked[c]?.[1] ?? 0) / total);
      }
    }
  };
  for (const component of components.values()) {
    const byV = new Map<number, number[]>();
    for (const id of component.vertices) {
      const v = uv.getY(id);
      if (!byV.has(v)) byV.set(v, []);
      byV.get(v)!.push(id);
    }
    const rows = [...byV]
      .sort((a, b) => a[0] - b[0])
      .map(([, row]) => row.sort((a, b) => uv.getX(a) - uv.getX(b)));
    // The tiny end caps are degenerate at the authored root/tip. Rebuilt strips
    // meet there already; retaining the old caps would leave detached fragments.
    if (rows.length < 3) continue;
    if (rows.some((row) => row.length !== 3))
      throw new Error("Unexpected VRoid hair UV topology");
    const curves = [0, 1, 2].map(
      (col) =>
        new T.CatmullRomCurve3(
          rows.map((row) =>
            new T.Vector3()
              .fromBufferAttribute(p, row[col])
              .multiplyScalar(scale),
          ),
          false,
          "catmullrom",
          0.5,
        ),
    );
    const center = (t: number) =>
      curves[0].getPoint(t).add(curves[2].getPoint(t)).multiplyScalar(0.5);
    let end = 1;
    const cutY = style === 4 ? 2.72 : 2.79;
    const trimmed = short && center(1).y < cutY;
    if (trimmed) {
      // Cut the existing path at jaw height. Compressing the whole long path
      // retained its shoulder bend and made a right angle next to the cheek.
      let lo = 0,
        hi = 1;
      for (let i = 0; i < 24; i++) {
        const t = (lo + hi) / 2;
        if (center(t).y > cutY) lo = t;
        else hi = t;
      }
      end = (lo + hi) / 2;
      cuts.push(end);
    }
    const segments = Math.max(48, Math.ceil((rows.length - 1) * end * 2));
    const columns = 8,
      stride = columns + 1;
    const offset = positions.length / 3;
    const first = component.faces.find(
      ([a, b, c]) =>
        Math.abs(
          (uv.getX(b) - uv.getX(a)) * (uv.getY(c) - uv.getY(a)) -
            (uv.getY(b) - uv.getY(a)) * (uv.getX(c) - uv.getX(a)),
        ) > 1e-10,
    )!;
    const [a, b, c] = first;
    const forward =
      (uv.getX(b) - uv.getX(a)) * (uv.getY(c) - uv.getY(a)) -
        (uv.getY(b) - uv.getY(a)) * (uv.getX(c) - uv.getX(a)) >
      0;
    for (let i = 0; i <= segments; i++) {
      const t = (i / segments) * end;
      const section = curves.map((curve) => curve.getPoint(t));
      const middle = section[0].clone().add(section[2]).multiplyScalar(0.5);
      // A quadratic cross-section passes through all three authored columns,
      // retaining the scalp fit without the original two flat facets.
      const control = section[1].clone().multiplyScalar(2).sub(middle);
      const width = trimmed
        ? T.MathUtils.smootherstep(middle.y, cutY, cutY + 0.105)
        : 1;
      const rowT = t * (rows.length - 1),
        row = Math.min(rows.length - 2, Math.floor(rowT)),
        f = rowT - row;
      for (let j = 0; j <= columns; j++) {
        const u = j / columns;
        const point = section[0]
          .clone()
          .multiplyScalar((1 - u) ** 2)
          .addScaledVector(control, 2 * u * (1 - u))
          .addScaledVector(section[2], u ** 2);
        if (trimmed) point.sub(middle).multiplyScalar(width).add(middle);
        if (!short) {
          const fall = Math.max(0, 2.94 - point.y);
          // Clearance builds up across the neck and shoulder; there is no
          // height cutoff or max() clamp capable of creasing a strand.
          point.z +=
            0.115 *
            T.MathUtils.smootherstep(fall, 0, 0.45) *
            T.MathUtils.smootherstep(middle.z, 0, 0.075);
          const wave =
            style === 3
              ? Math.sin(fall * 13) * 0.032
              : style === 5
                ? Math.sin(fall * 9) * 0.018
                : 0;
          point.x +=
            Math.sign(middle.x) * wave * T.MathUtils.smootherstep(fall, 0, 0.2);
          if (style === 5) point.y -= fall * 0.08;
        }
        const col = Math.min(1, Math.floor(u * 2)),
          h = u * 2 - col;
        const blend: [number, number][] = [
          [rows[row][col], (1 - f) * (1 - h)],
          [rows[row][col + 1], (1 - f) * h],
          [rows[row + 1][col], f * (1 - h)],
          [rows[row + 1][col + 1], f * h],
        ];
        write(
          point,
          blend.reduce((s, [id, w]) => s + uv.getX(id) * w, 0),
          blend.reduce((s, [id, w]) => s + uv.getY(id) * w, 0),
          blend,
        );
        if (i < segments && j < columns) {
          const k = offset + i * stride + j;
          if (forward)
            faces.push(k, k + 1, k + stride, k + 1, k + stride + 1, k + stride);
          else
            faces.push(k, k + stride, k + 1, k + 1, k + stride, k + stride + 1);
        }
      }
    }
  }
  const geometry = new T.BufferGeometry();
  geometry.setAttribute("position", new T.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new T.Float32BufferAttribute(texcoords, 2));
  if (skin && weights) {
    geometry.setAttribute("skinIndex", new T.Uint16BufferAttribute(joints, 4));
    geometry.setAttribute(
      "skinWeight",
      new T.Float32BufferAttribute(influences, 4),
    );
  }
  geometry.setIndex(faces);
  if (source.groups.length) geometry.addGroup(0, faces.length, 0);
  geometry.computeVertexNormals();
  // Front/back strip surfaces share their edge positions but have separate UV
  // vertices. Average the seam normals so lighting does not draw a hard crease.
  const output = geometry.getAttribute("position"),
    normals = geometry.getAttribute("normal");
  const seams = new Map<string, { sum: T.Vector3; ids: number[] }>();
  for (let i = 0; i < output.count; i++) {
    const key = [output.getX(i), output.getY(i), output.getZ(i)]
      .map((v) => Math.round(v * 1e6))
      .join(",");
    if (!seams.has(key)) seams.set(key, { sum: new T.Vector3(), ids: [] });
    const seam = seams.get(key)!;
    seam.ids.push(i);
    seam.sum.add(new T.Vector3().fromBufferAttribute(normals, i));
  }
  for (const { sum, ids } of seams.values()) {
    if (sum.lengthSq() < 1e-12) continue;
    sum.normalize();
    for (const i of ids) normals.setXYZ(i, sum.x, sum.y, sum.z);
  }
  geometry.userData.trimmedStrands = cuts.length;
  return geometry;
}
