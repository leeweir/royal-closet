// Run with: node --import tsx tests/accessory-audit.mjs
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import * as T from "three";
import { MToonMaterial } from "@pixiv/three-vrm";
import { ITEMS, SET_COUNT } from "../src/simulation/data.ts";
import {
  createCrown,
  createWings,
  createShoes,
  createWand,
} from "../src/render/accessories.ts";

const makers = {
  crown: createCrown,
  wings: createWings,
  shoes: createShoes,
  wand: createWand,
};
const silhouettes = new Map(),
  fingerprints = new Map(),
  calls = new Map();
// One shape per set in every category, so the audit follows the data.
const perCategory = SET_COUNT;
const results = [];
for (const item of ITEMS.filter((i) => makers[i.category])) {
  const root = makers[item.category](item);
  const bounds = new T.Box3().setFromObject(root),
    size = bounds.getSize(new T.Vector3());
  const hash = createHash("sha256");
  let meshes = 0,
    triangles = 0;
  root.traverse((object) => {
    if (!object.isMesh) return;
    meshes++;
    const geometry = object.geometry;
    assert(geometry.index, `${item.id}: merged geometry is indexed`);
    assert(
      geometry.attributes.normal,
      `${item.id}: surface has lighting normals`,
    );
    for (const attribute of [
      geometry.attributes.position,
      geometry.attributes.normal,
    ]) {
      assert(
        Array.from(attribute.array).every(Number.isFinite),
        `${item.id}: finite mesh attributes`,
      );
    }
    assert(
      object.material instanceof MToonMaterial,
      `${item.id}: expected surface material`,
    );
    triangles += geometry.index.count / 3;
    hash.update(Buffer.from(geometry.attributes.position.array.buffer));
  });
  assert(meshes > 0 && meshes <= 12, `${item.id}: accessory draw budget`);
  assert(
    triangles > 0 && triangles < 90000,
    `${item.id}: accessory triangle budget`,
  );
  assert(size.x > 0 && size.y > 0 && size.z > 0, `${item.id}: visible volume`);
  if (item.category === "wings" || item.category === "shoes") {
    const prefix = item.category === "wings" ? "wing" : "shoe";
    for (const side of ["left", "right"])
      assert(
        root.getObjectByName(`${prefix}-${side}`)?.isGroup,
        `${item.id}: independent ${side} animation pivot`,
      );
  }
  if (item.category === "wings")
    assert(
      size.x >= 1.5 && size.x <= 3,
      `${item.id}: shoulder-width wing proportions`,
    );
  if (item.category === "crown")
    assert(
      size.x >= 0.5 && size.x <= 0.8,
      `${item.id}: head-width crown proportions`,
    );
  if (item.category === "shoes")
    assert(
      bounds.min.y > -0.025 && bounds.min.y < 0.06,
      `${item.id}: soles stay at the ground`,
    );
  if (item.category === "wand")
    assert(
      size.y >= 0.9 && size.y <= 1.25,
      `${item.id}: handheld wand proportions`,
    );
  const categorySilhouettes = silhouettes.get(item.category) ?? new Set();
  categorySilhouettes.add(root.userData.silhouette);
  silhouettes.set(item.category, categorySilhouettes);
  const categoryGeometry = fingerprints.get(item.category) ?? new Set();
  categoryGeometry.add(hash.digest("hex"));
  fingerprints.set(item.category, categoryGeometry);
  calls.set(item.id, meshes);
  results.push({ item: item.name, meshes, triangles });
  root.traverse((object) => {
    if (object.isMesh) {
      object.geometry.dispose();
      object.material.dispose();
    }
  });
}
for (const category of Object.keys(makers)) {
  assert.equal(
    silhouettes.get(category).size,
    perCategory,
    `${category}: one named silhouette per set`,
  );
  assert.equal(
    fingerprints.get(category).size,
    perCategory,
    `${category}: one distinct geometry per set, independent of color`,
  );
}
for (let shape = 0; shape < perCategory; shape++) {
  const total = Object.keys(makers).reduce(
    (sum, category) => sum + calls.get(`${category}-${shape}`),
    0,
  );
  assert(total <= 40, `Collection ${shape}: combined accessory draw budget`);
}
console.table(results);
console.log(
  `${perCategory * 4} accessory models: finite geometry, one distinct shape per set, animation pivots and render budgets verified.`,
);
