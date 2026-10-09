import * as T from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
/** Textures built once per session; disposeGroup leaves them alone. */
export const sharedTextures = new WeakSet<T.Texture>();
export function shareTexture<X extends T.Texture>(tex: X) {
  sharedTextures.add(tex);
  return tex;
}
/** Cel-shaded materials reused across the wardrobe; disposeGroup leaves them. */
export const sharedMaterials = new WeakSet<T.Material>();
export function shareMaterial<X extends T.Material>(material: X) {
  sharedMaterials.add(material);
  return material;
}
/** Look a named descendant up once and remember it for per-frame use. */
export function cachedChild(root: T.Object3D, name: string) {
  const cache = (root.userData.children ??= {}) as Record<
    string,
    T.Object3D | null
  >;
  if (!(name in cache)) cache[name] = root.getObjectByName(name) ?? null;
  return cache[name];
}
export function material(color: string, metalness = 0, roughness = 0.65) {
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
    new T.SphereGeometry(1, 32, 24),
    material(color),
    parent,
    x,
    y,
    z,
  );
  m.scale.set(sx, sy, sz);
  return m;
}
export function line(
  parent: T.Object3D,
  points: number[][],
  radius: number,
  mat: T.Material,
  segments = 28,
) {
  return mesh(
    new T.TubeGeometry(
      new T.CatmullRomCurve3(
        points.map((p) => new T.Vector3(...(p as [number, number, number]))),
      ),
      segments,
      radius,
      6,
      false,
    ),
    mat,
    parent,
  );
}
export function profile(rows: number[][], segments = 48) {
  const p: number[] = [],
    uv: number[] = [],
    idx: number[] = [];
  for (let j = 0; j < rows.length; j++) {
    const [y, rx, rz, cz = 0] = rows[j];
    for (let i = 0; i <= segments; i++) {
      const a = (i / segments) * Math.PI * 2;
      p.push(Math.sin(a) * rx, y, Math.cos(a) * rz + cz);
      uv.push(i / segments, j / (rows.length - 1));
      if (j < rows.length - 1 && i < segments) {
        const k = j * (segments + 1) + i;
        idx.push(
          k,
          k + 1,
          k + segments + 1,
          k + 1,
          k + segments + 2,
          k + segments + 1,
        );
      }
    }
  }
  const g = new T.BufferGeometry();
  g.setAttribute("position", new T.Float32BufferAttribute(p, 3));
  g.setAttribute("uv", new T.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
export function batchGroup(group: T.Group) {
  group.updateMatrixWorld(true);
  const buckets = new Map<T.Material, T.BufferGeometry[]>();
  const children = [...group.children];
  for (const o of children) {
    if (
      !(o instanceof T.Mesh) ||
      Array.isArray(o.material) ||
      o instanceof T.InstancedMesh
    )
      continue;
    const g = o.geometry.clone().applyMatrix4(o.matrix);
    const list = buckets.get(o.material) ?? [];
    list.push(g);
    buckets.set(o.material, list);
    group.remove(o);
    o.geometry.dispose();
  }
  for (const [mat, list] of buckets) {
    const mixed = list.some((g) => g.index) && list.some((g) => !g.index);
    const geos = mixed
      ? list.map((g) => (g.index ? g.toNonIndexed() : g))
      : list;
    if (mixed) list.forEach((g) => g.index && g.dispose());
    const merged = mergeGeometries(geos, false);
    if (merged) mesh(merged, mat, group);
    else for (const g of geos) mesh(g, mat, group);
    if (merged) geos.forEach((g) => g.dispose());
  }
}
export function colorShift(color: string, amount: number) {
  return new T.Color(color)
    .lerp(new T.Color(amount > 0 ? "#ffffff" : "#291e47"), Math.abs(amount))
    .getStyle();
}
