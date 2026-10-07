import { after, test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import * as T from "three";
import { MToonMaterial } from "@pixiv/three-vrm";
import { torsoSurface } from "../src/render/body-fit";
import { createCouture } from "../src/render/couture";
import { ITEMS } from "../src/simulation/data";

// Hold the dye constant: these checks must prove changes in the cloth's geometry.
const garments = ITEMS.filter((item) => item.category === "dress").map((item) =>
  createCouture(item, "#ad8cc7"),
);

function meshes(group: T.Group) {
  const result: T.Mesh[] = [];
  group.traverse((object) => {
    if (object instanceof T.Mesh) result.push(object);
  });
  return result;
}

function positions(group: T.Group) {
  group.updateMatrixWorld(true);
  const result: T.Vector3[] = [];
  const instance = new T.Matrix4();
  for (const mesh of meshes(group)) {
    const attribute = mesh.geometry.getAttribute("position");
    const count = mesh instanceof T.InstancedMesh ? mesh.count : 1;
    for (let i = 0; i < count; i++) {
      if (mesh instanceof T.InstancedMesh) mesh.getMatrixAt(i, instance);
      else instance.identity();
      const matrix = new T.Matrix4().multiplyMatrices(
        mesh.matrixWorld,
        instance,
      );
      for (let j = 0; j < attribute.count; j++)
        result.push(
          new T.Vector3()
            .fromBufferAttribute(attribute, j)
            .applyMatrix4(matrix),
        );
    }
  }
  return result;
}

const vertices = garments.map(positions);
const bounds = vertices.map((points) => new T.Box3().setFromPoints(points));
function width(points: T.Vector3[], lowY: number, highY: number) {
  return Math.max(
    ...points
      .filter((point) => point.y >= lowY && point.y <= highY)
      .map((point) => Math.abs(point.x)),
  );
}

test("all six dresses change geometry even with the same dye", () => {
  const signatures = garments.map((group) => {
    const hash = createHash("sha256");
    for (const mesh of meshes(group)) {
      const p = mesh.geometry.getAttribute("position").array;
      hash.update(Buffer.from(p.buffer, p.byteOffset, p.byteLength));
      if (mesh.geometry.index) {
        const index = mesh.geometry.index.array;
        hash.update(
          Buffer.from(index.buffer, index.byteOffset, index.byteLength),
        );
      }
      if (mesh instanceof T.InstancedMesh) {
        const matrix = mesh.instanceMatrix.array;
        hash.update(
          Buffer.from(matrix.buffer, matrix.byteOffset, matrix.byteLength),
        );
      }
    }
    return hash.digest("hex");
  });
  assert.equal(new Set(signatures).size, 6);
});

test("garment attributes remain finite and fit the waist and shoulder anchors", () => {
  garments.forEach((group, i) => {
    assert.equal(group.name, "couture");
    assert.ok(bounds[i].min.y > 0.17, "garments stay above the floor");
    assert.ok(
      bounds[i].max.y >= 2.5 && bounds[i].max.y < 2.65,
      "cloth ends around the shoulder line",
    );
    const waist = vertices[i].filter(
      (p) => Math.abs(p.y - 1.895) < 0.004 && Math.abs(p.z) < 0.18,
    );
    assert.ok(
      waist.some((p) => Math.abs(p.x) >= 0.225 && Math.abs(p.x) < 0.245),
      "cloth includes the fitted waist",
    );
    for (const mesh of meshes(group)) {
      for (const attribute of Object.values(mesh.geometry.attributes)) {
        for (const value of attribute.array) assert.ok(Number.isFinite(value));
      }
      if (mesh instanceof T.InstancedMesh)
        for (const value of mesh.instanceMatrix.array)
          assert.ok(Number.isFinite(value));
    }
  });
});

test("moonlight gown and Lolita have materially different hem heights", () => {
  assert.ok(bounds[0].min.y > 0.2 && bounds[0].min.y < 0.27);
  assert.ok(
    width(vertices[0], 0.2, 0.5) > 0.85,
    "moonlight has a broad full length skirt",
  );
  assert.ok(
    bounds[1].min.y > 1.14 && bounds[1].min.y < 1.2,
    "Lolita leaves the legs visible",
  );
  assert.ok(
    width(vertices[1], 1.15, 1.4) > 0.65,
    "Lolita retains its puffed layers",
  );
});

test("elf skirt has a visibly asymmetric pointed hem", () => {
  const left = vertices[2].filter((p) => p.x < -0.2);
  const right = vertices[2].filter((p) => p.x > 0.2);
  const leftHem = Math.min(...left.map((p) => p.y));
  const rightHem = Math.min(...right.map((p) => p.y));
  assert.ok(
    leftHem - rightHem > 0.15,
    "leaf lengths must create an asymmetric cut",
  );
  assert.ok(rightHem < 0.9);
});

test("ice dress narrows at the knees and then flares into a fishtail", () => {
  const knees = width(vertices[3], 0.8, 1.1);
  const hem = width(vertices[3], 0.2, 0.45);
  assert.ok(knees < 0.36);
  assert.ok(hem > knees * 2, "fishtail cannot be another A line skirt");
});

test("witch skirt has a short front and long separate rear tails", () => {
  const front = vertices[4].filter((p) => p.z > 0.25);
  const back = vertices[4].filter((p) => p.z < -0.25);
  assert.ok(Math.min(...front.map((p) => p.y)) > 1.15);
  assert.ok(Math.min(...back.map((p) => p.y)) < 0.5);
});

test("royal dress has the broadest court skirt and a long rear train", () => {
  assert.ok(bounds[5].max.x > 1.0);
  assert.ok(bounds[5].min.z < -1.6);
  assert.ok(
    bounds[5].min.z < bounds[0].min.z - 0.75,
    "train extends beyond an ordinary skirt",
  );
});

test("anime cloth uses cel shading and opaque fabric trim within the draw budget", () => {
  garments.forEach((group) => {
    const collection = meshes(group);
    assert.ok(collection.length < 100);
    for (const mesh of collection) {
      for (const material of Array.isArray(mesh.material)
        ? mesh.material
        : [mesh.material]) {
        assert.ok(material instanceof MToonMaterial);
        assert.equal(
          material.map,
          null,
          "fabric does not reintroduce photographic weave",
        );
        if (material.name !== "tulle")
          assert.equal(material.transparent, false);
      }
    }
  });
  for (const i of [0, 1, 3, 5]) {
    assert.ok(garments[i].getObjectByName("sleeve-left"));
    assert.ok(garments[i].getObjectByName("sleeve-right"));
  }
});

test("all bodices follow the skin envelope with a small continuous clearance", () => {
  for (const garment of garments) {
    const mesh = garment.getObjectByName("fitted-bodice") as T.Mesh;
    const p = mesh.geometry.getAttribute("position");
    for (let i = 0; i < p.count; i++) {
      const a = ((i % 97) / 96) * Math.PI * 2;
      const body = torsoSurface(p.getY(i), a);
      const clearance = Math.hypot(p.getX(i) - body.x, p.getZ(i) - body.z);
      assert.ok(
        clearance > 0.012 && clearance < 0.014,
        "bodice either clips skin or floats away",
      );
    }
  }
});

after(() => {
  const geometry = new Set<T.BufferGeometry>(),
    material = new Set<T.Material>(),
    textures = new Set<T.Texture>();
  for (const group of garments)
    for (const mesh of meshes(group)) {
      geometry.add(mesh.geometry);
      if (mesh instanceof T.InstancedMesh) mesh.dispose();
      for (const mat of Array.isArray(mesh.material)
        ? mesh.material
        : [mesh.material]) {
        material.add(mat);
        for (const value of Object.values(mat))
          if (value instanceof T.Texture) textures.add(value);
      }
    }
  geometry.forEach((value) => value.dispose());
  material.forEach((value) => value.dispose());
  textures.forEach((value) => value.dispose());
});
