import * as T from "three";
import { MToonMaterial } from "@pixiv/three-vrm";
import { shareTexture } from "./modeling";
import type { Item } from "../simulation/data";
import { refineHairSurface } from "./hair-surface";

export const HAIR_COLORS = [
  "#bca6d3",
  "#ce8fa6",
  "#8d7864",
  "#88b6cc",
  "#655572",
  "#d5b471",
];
export type HairTemplate = {
  geometry: T.BufferGeometry;
  material: MToonMaterial;
  scalp: boolean;
}[];

/** Capture the model's own scalp and fringe once in the wardrobe bind pose. */
export function captureHairTemplate(nativeHair: T.Mesh[]): HairTemplate {
  return nativeHair.map((source) => {
    const materials = Array.isArray(source.material)
      ? source.material
      : [source.material];
    const material = materials[0] as MToonMaterial;
    for (const value of Object.values(material))
      if (value instanceof T.Texture) shareTexture(value);
    const geometry = source.geometry.clone();
    const position = geometry.getAttribute("position");
    const vertex = new T.Vector3();
    if (source instanceof T.SkinnedMesh) source.skeleton.update();
    for (let i = 0; i < position.count; i++) {
      vertex.fromBufferAttribute(position, i);
      if (source instanceof T.SkinnedMesh) source.applyBoneTransform(i, vertex);
      vertex.applyMatrix4(source.matrixWorld);
      position.setXYZ(i, vertex.x, vertex.y, vertex.z);
    }
    // The original geometry also has an outline group. We retain the actual
    // hair surface, not a second overlapping copy of it.
    if (geometry.groups.length) {
      const index = geometry.index!;
      const kept: number[] = [];
      for (const group of geometry.groups.filter((g) => !g.materialIndex))
        for (let i = group.start; i < group.start + group.count; i++)
          kept.push(index.getX(i));
      geometry.setIndex(kept);
      geometry.clearGroups();
    }
    geometry.deleteAttribute("skinIndex");
    geometry.deleteAttribute("skinWeight");
    geometry.morphAttributes = {};
    geometry.computeVertexNormals();
    const scalp = material.name.startsWith("HairBack");
    if (!scalp) {
      // Keep the source skin weights, including VRM spring-bone influences,
      // on the default long hair. The template above remains unmodified.
      const previous = source.geometry;
      source.geometry = refineHairSurface(previous, 0, 2.04);
      previous.dispose();
    }
    return { geometry, material, scalp };
  });
}

function tress(
  points: number[][],
  width: number,
  depth: number,
  material: T.Material,
) {
  const curve = new T.CatmullRomCurve3(
    points.map((p) => new T.Vector3(...(p as [number, number, number]))),
  );
  const segments = points.length > 10 ? 192 : 128;
  const sides = 24,
    stride = sides + 1;
  const frames = curve.computeFrenetFrames(segments, false);
  const positions: number[] = [],
    indices: number[] = [],
    colors: number[] = [],
    uv: number[] = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments,
      center = curve.getPointAt(t);
    const taper =
      (0.65 + 0.35 * Math.sin(Math.PI * t)) * Math.pow(1 - t, 0.35) + 0.015;
    for (let j = 0; j <= sides; j++) {
      const a = (j / sides) * Math.PI * 2;
      const p = center
        .clone()
        .addScaledVector(frames.normals[i], Math.cos(a) * width * taper)
        .addScaledVector(frames.binormals[i], Math.sin(a) * depth * taper);
      positions.push(p.x, p.y, p.z);
      const shade = 0.8 + 0.2 * Math.pow(Math.max(0, Math.cos(a - 0.8)), 8);
      colors.push(shade, shade, shade);
      uv.push(j / sides, t);
      if (i < segments && j < sides) {
        const k = i * stride + j;
        indices.push(k, k + stride, k + 1, k + 1, k + stride, k + stride + 1);
      }
    }
  }
  const geometry = new T.BufferGeometry();
  geometry.setAttribute("position", new T.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new T.Float32BufferAttribute(colors, 3));
  geometry.setAttribute("uv", new T.Float32BufferAttribute(uv, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const normals = geometry.getAttribute("normal");
  for (let i = 0; i <= segments; i++) {
    const start = i * stride,
      end = start + sides;
    const normal = new T.Vector3()
      .fromBufferAttribute(normals, start)
      .add(new T.Vector3().fromBufferAttribute(normals, end))
      .normalize();
    normals.setXYZ(start, normal.x, normal.y, normal.z);
    normals.setXYZ(end, normal.x, normal.y, normal.z);
  }
  const mesh = new T.Mesh(geometry, material);
  mesh.castShadow = true;
  return mesh;
}

export function createVrmHair(template: HairTemplate, item: Item) {
  const root = new T.Group();
  root.name = "fitted-hair";
  const color = new T.Color(HAIR_COLORS[item.shape]);
  for (const original of template) {
    const geometry = original.scalp
      ? original.geometry.clone()
      : refineHairSurface(original.geometry, item.shape);
    const material = original.material.clone();
    material.name = "fitted-hair";
    material.color.copy(color);
    material.shadeColorFactor.copy(color).multiplyScalar(0.58);
    material.onBeforeCompile = original.material.onBeforeCompile;
    material.customProgramCacheKey = original.material.customProgramCacheKey;
    const mesh = new T.Mesh(geometry, material);
    mesh.castShadow = true;
    root.add(mesh);
  }
  if (item.shape === 1 || item.shape === 2) {
    const material = new MToonMaterial({
      color: color.clone().multiplyScalar(0.7),
      shadeColorFactor: color.clone().multiplyScalar(0.4),
      shadingToonyFactor: 0.65,
      giEqualizationFactor: 0.9,
      vertexColors: true,
      side: T.DoubleSide,
    });
    for (const side of [-1, 1]) {
      for (let j = -1; j <= 1; j++) {
        const offset = j * 0.037;
        const points =
          item.shape === 1
            ? [
                [side * 0.23, 3.055, -0.145],
                [side * (0.35 + offset), 2.96, -0.18],
                [side * (0.43 + offset), 2.7, -0.18],
                [side * (0.46 + offset), 2.42, -0.15],
                [side * (0.41 + offset), 2.21, -0.13],
                [side * (0.45 + offset), 2.07 + j * 0.025, -0.1],
              ]
            : Array.from({ length: 97 }, (_, i) => {
                const t = i / 96,
                  a = t * Math.PI * 12 + (j * Math.PI * 2) / 3;
                const emerge = T.MathUtils.smoothstep(t, 0, 0.22);
                return [
                  side *
                    T.MathUtils.lerp(
                      0.206,
                      0.235 +
                        0.065 * Math.sin(t * Math.PI) +
                        0.022 * Math.sin(a),
                      emerge,
                    ),
                  3.015 - t * 0.895,
                  T.MathUtils.lerp(
                    -0.1,
                    0.015 + 0.205 * t + 0.022 * Math.cos(a),
                    emerge,
                  ),
                ];
              });
        root.add(
          tress(
            points,
            item.shape === 1 ? 0.062 : 0.027,
            item.shape === 1 ? 0.037 : 0.025,
            material,
          ),
        );
      }
      const tie = new T.Mesh(
        new T.TorusGeometry(item.shape === 1 ? 0.047 : 0.027, 0.009, 8, 32),
        new MToonMaterial({
          color: new T.Color(item.accent),
          shadeColorFactor: new T.Color(item.accent).multiplyScalar(0.7),
        }),
      );
      if (item.shape === 1) {
        tie.position.set(side * 0.279, 3.01, -0.16);
        tie.rotation.y = Math.PI / 2;
      } else {
        tie.position.set(side * 0.255, 2.16, 0.21);
        tie.rotation.x = Math.PI / 2;
      }
      root.add(tie);
    }
  }
  return root;
}
