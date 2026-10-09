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
  // The buns, ponytail and sport braid add their own volume on top of the
  // refined template strands, in the character's bind coordinates.
  if (
    item.shape === 7 ||
    item.shape === 9 ||
    item.shape === 11 ||
    item.shape === 15 ||
    item.shape === 17
  ) {
    const material = new MToonMaterial({
      color: color.clone().multiplyScalar(0.72),
      shadeColorFactor: color.clone().multiplyScalar(0.42),
      shadingToonyFactor: 0.65,
      giEqualizationFactor: 0.9,
      vertexColors: true,
      side: T.DoubleSide,
    });
    if (item.shape === 7) {
      // 双环飞仙髻: two rings of hair high on the crown, each with a fall.
      for (const side of [-1, 1]) {
        for (let k = 0; k < 4; k++) {
          root.add(
            tress(
              Array.from({ length: 13 }, (_, i) => {
                const t = i / 12;
                const angle = t * Math.PI * 1.85 + (k * Math.PI) / 2;
                return [
                  side * (0.22 + Math.cos(angle) * 0.185),
                  3.44 + Math.sin(angle) * 0.185 + k * 0.01,
                  -0.06 + Math.sin(angle * 0.5) * 0.085,
                ];
              }),
              0.052,
              0.04,
              material,
            ),
          );
        }
        root.add(
          tress(
            [
              [side * 0.22, 3.4, -0.11],
              [side * 0.32, 3.14, -0.22],
              [side * 0.27, 2.72, -0.25],
              [side * 0.31, 2.26, -0.2],
            ],
            0.05,
            0.038,
            material,
          ),
        );
      }
    } else if (item.shape === 9) {
      // 元气高马尾: a swept tail from the crown, plus two loose wisps.
      for (let j = 0; j < 6; j++)
        root.add(
          tress(
            [
              [0, 3.5, -0.14],
              [0.032 * (j - 2.5), 3.34, -0.42 - j * 0.018],
              [0.052 * (j - 2.5), 2.96, -0.62 - j * 0.024],
              [0.072 * (j - 2.5), 2.44, -0.64 - j * 0.02],
              [0.094 * (j - 2.5), 1.96, -0.54 - j * 0.016],
            ],
            0.078,
            0.052,
            material,
          ),
        );
    } else if (item.shape === 11) {
      // 飒爽运动辫: one tight braid down the back, banded at the end.
      for (let k = 0; k < 3; k++)
        root.add(
          tress(
            Array.from({ length: 17 }, (_, i) => {
              const t = i / 16;
              return [
                0.042 * Math.sin(t * 19 + k * 2.1),
                3.24 - t * 1.72,
                -0.3 + 0.03 * Math.cos(t * 19 + k * 2.1),
              ];
            }),
            0.066,
            0.048,
            material,
          ),
        );
      const band = new T.Mesh(
        new T.TorusGeometry(0.062, 0.016, 8, 22),
        new MToonMaterial({
          color: new T.Color(item.accent),
          shadeColorFactor: new T.Color(item.accent).multiplyScalar(0.7),
        }),
      );
      band.position.set(0, 1.62, -0.3);
      band.rotation.x = Math.PI / 2;
      root.add(band);
    } else if (item.shape === 15) {
      // 低马尾: a smooth tail gathered at the nape, falling over one shoulder.
      for (let j = 0; j < 4; j++)
        root.add(
          tress(
            [
              [0.02 * (j - 1.5), 3.06, -0.16],
              [0.05 * (j - 1.5), 2.9, -0.3 - j * 0.02],
              [0.09 * (j - 1.5), 2.6, -0.36 - j * 0.03],
              [0.13 * (j - 1.5), 2.26, -0.32 - j * 0.03],
              [0.15 * (j - 1.5), 1.98, -0.24 - j * 0.02],
            ],
            0.062,
            0.042,
            material,
          ),
        );
      const tie = new T.Mesh(
        new T.TorusGeometry(0.05, 0.013, 8, 22),
        new MToonMaterial({
          color: new T.Color(item.accent),
          shadeColorFactor: new T.Color(item.accent).multiplyScalar(0.7),
        }),
      );
      tie.position.set(0, 3.0, -0.24);
      tie.rotation.x = 0.7;
      root.add(tie);
    } else {
      // 利落及肩直发: a blunt cut that ends at the collarbone.
      for (const side of [-1, 1])
        for (let j = -1; j <= 1; j++)
          root.add(
            tress(
              [
                [side * (0.2 + j * 0.03), 3.02, -0.08 + j * 0.06],
                [side * (0.26 + j * 0.03), 2.8, -0.14 + j * 0.07],
                [side * (0.29 + j * 0.03), 2.5, -0.16 + j * 0.07],
                [side * (0.3 + j * 0.03), 2.2, -0.12 + j * 0.06],
              ],
              0.058,
              0.04,
              material,
            ),
          );
    }
  }
  return root;
}
