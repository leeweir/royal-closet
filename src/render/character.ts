import * as T from "three";
import { ITEM } from "../simulation/data";
import type { Save } from "../simulation/game";
import { material, mesh, orb, profile, batchGroup } from "./modeling";
import { createFace, animateFace } from "./face";
import { createHair } from "./hair";
import { createCouture } from "./couture";
import {
  createCrown,
  createWings,
  createWand,
  createShoes,
} from "./accessories";
export { material, mesh, orb } from "./modeling";
type Rig = {
  body: T.Group;
  head: T.Group;
  hair: T.Group;
  left: T.Group;
  right: T.Group;
  elbowL: T.Group;
  elbowR: T.Group;
  legs: T.Group[];
  shoes: T.Group;
  wings: T.Group;
  couture: T.Group;
};
export function createCharacter(s: Save) {
  const root = new T.Group();
  root.name = "princess";
  const body = new T.Group();
  root.add(body);
  const skin = new T.MeshPhysicalMaterial({
    color: "#ffdccd",
    roughness: 0.63,
    clearcoat: 0.05,
    emissive: "#e8bdad",
    emissiveIntensity: 0.1,
  });
  const flesh = new T.Group();
  body.add(flesh);
  mesh(
    profile([
      [1.7, 0.22, 0.14],
      [1.9, 0.221, 0.15],
      [2.12, 0.24, 0.17],
      [2.38, 0.284, 0.19],
      [2.51, 0.28, 0.16],
      [2.59, 0.2, 0.135],
    ]),
    skin,
    flesh,
  );
  const neck = mesh(
    new T.CapsuleGeometry(0.078, 0.11, 8, 16),
    skin,
    flesh,
    0,
    2.68,
    0,
  );
  neck.scale.z = 0.9;
  batchGroup(flesh);
  const legs: T.Group[] = [];
  for (const side of [-1, 1]) {
    const leg = new T.Group();
    leg.position.set(side * 0.15, 1.69, 0);
    body.add(leg);
    mesh(
      profile([
        [-1.48, 0.043, 0.048, 0.075],
        [-1.23, 0.068, 0.067],
        [-0.98, 0.081, 0.08],
        [-0.84, 0.076, 0.084],
        [-0.6, 0.088, 0.086],
        [-0.3, 0.115, 0.104],
        [0, 0.109, 0.105],
      ]),
      skin,
      leg,
    );
    legs.push(leg);
  }
  function arm(side: number) {
    const a = new T.Group();
    a.position.set(side * 0.343, 2.53, 0);
    a.name = side < 0 ? "arm-left" : "arm-right";
    body.add(a);
    const upper = mesh(
      new T.CapsuleGeometry(0.06, 0.29, 8, 20),
      skin,
      a,
      0,
      -0.17,
      0,
    );
    upper.scale.z = 0.91;
    const fore = new T.Group();
    fore.position.y = -0.37;
    a.add(fore);
    const lower = mesh(
      new T.CapsuleGeometry(0.046, 0.23, 8, 20),
      skin,
      fore,
      0,
      -0.155,
      0,
    );
    lower.scale.z = 0.86;
    const palm = mesh(
      new T.SphereGeometry(1, 20, 16),
      skin,
      fore,
      0,
      -0.341,
      0.016,
    );
    palm.scale.set(0.052, 0.077, 0.027);
    for (let i = 0; i < 4; i++) {
      const finger = mesh(
        new T.CapsuleGeometry(0.009, 0.044 - i * 0.003, 4, 8),
        skin,
        fore,
        (i - 1.5) * 0.019,
        -0.41 + i * 0.004,
        0.013,
      );
      finger.rotation.z = (i - 1.5) * 0.06;
    }
    const thumb = mesh(
      new T.CapsuleGeometry(0.013, 0.034, 4, 10),
      skin,
      fore,
      side * 0.052,
      -0.365,
      0.025,
    );
    thumb.rotation.z = -side * 0.5;
    batchGroup(fore);
    return { a, fore };
  }
  const l = arm(-1),
    r = arm(1);
  const couture = createCouture(
    ITEM[s.outfit.dress],
    s.dye ?? ITEM[s.outfit.dress].color,
  );
  body.add(couture);
  for (const [name, arm] of [
    ["sleeve-left", l.a],
    ["sleeve-right", r.a],
  ] as const) {
    const sleeve = couture.getObjectByName(name);
    if (sleeve) arm.attach(sleeve);
  }
  const head = createFace();
  head.position.set(0, 3.08, 0);
  body.add(head);
  const hair = createHair(ITEM[s.outfit.hair]);
  head.add(hair);
  const crown = createCrown(ITEM[s.outfit.crown]);
  crown.position.y = 0.39;
  head.add(crown);
  const wings = createWings(ITEM[s.outfit.wings]);
  wings.position.set(0, 2.3, -0.18);
  body.add(wings);
  const shoes = createShoes(ITEM[s.outfit.shoes]);
  body.add(shoes);
  const wand = createWand(ITEM[s.outfit.wand]);
  wand.position.set(0.024, -0.35, 0.07);
  wand.rotation.z = -0.12;
  r.fore.add(wand);
  root.userData.rig = {
    body,
    head,
    hair,
    left: l.a,
    right: r.a,
    elbowL: l.fore,
    elbowR: r.fore,
    legs,
    shoes,
    wings,
    couture,
  } satisfies Rig;
  root.userData.design = {
    dress: couture.userData.silhouette,
    hair: ITEM[s.outfit.hair].shape,
    crown: ITEM[s.outfit.crown].shape,
    wings: ITEM[s.outfit.wings].shape,
    wand: ITEM[s.outfit.wand].shape,
  };
  return root;
}
export function animateCharacter(
  root: T.Group,
  time: number,
  moving: boolean,
  pose: number,
  lookX: number,
  lookY: number,
  happy: boolean,
  reduced = false,
) {
  const rig = root.userData.rig as Rig;
  if (!rig) return;
  const t = reduced ? 0 : time,
    sway = Math.sin(t * 1.8);
  rig.body.rotation.z = sway * 0.01;
  rig.head.rotation.set(
    Math.sin(t * 1.1) * 0.024 + lookY * 0.032,
    lookX * 0.075,
    Math.sin(t * 0.8) * 0.035,
  );
  rig.left.rotation.set(
    moving ? Math.sin(t * 10) * 0.28 : 0.04,
    0,
    -0.13 + sway * 0.035,
  );
  rig.right.rotation.set(
    moving ? -Math.sin(t * 10) * 0.22 : -0.16,
    0,
    0.16 - sway * 0.025,
  );
  rig.elbowL.rotation.x = -0.12;
  rig.elbowL.rotation.z = 0;
  rig.elbowR.rotation.x = -0.23;
  rig.elbowR.rotation.z = 0;
  if (pose === 1 && !moving) {
    rig.left.rotation.z = -1.95;
    rig.left.rotation.x = -0.25;
    rig.elbowL.rotation.z = -0.9 + Math.sin(t * 5) * 0.18;
    rig.head.rotation.z = -0.09;
    happy = true;
  }
  if (pose === 2 && !moving) {
    rig.left.rotation.z = -0.62;
    rig.right.rotation.z = 0.65;
    rig.elbowL.rotation.x = -0.4;
    rig.elbowR.rotation.x = -0.5;
    rig.couture.rotation.y = Math.sin(t * 1.8) * 0.06;
  } else rig.couture.rotation.y = sway * 0.012;
  rig.legs.forEach(
    (leg, i) =>
      (leg.rotation.x = moving ? Math.sin(t * 10 + i * Math.PI) * 0.27 : 0),
  );
  for (const [i, name] of ["shoe-left", "shoe-right"].entries()) {
    const shoe = rig.shoes.getObjectByName(name);
    if (shoe) {
      shoe.position.z = moving ? Math.sin(t * 10 + i * Math.PI) * 0.16 : 0;
      shoe.rotation.x = moving ? Math.sin(t * 10 + i * Math.PI) * 0.1 : 0;
    }
  }
  for (const [i, name] of ["wing-left", "wing-right"].entries()) {
    const wing = rig.wings.getObjectByName(name);
    if (wing)
      wing.rotation.y = (i === 0 ? 1 : -1) * (0.04 + Math.sin(t * 2.3) * 0.045);
  }
  const h = rig.hair.getObjectByName("hair-sway");
  if (h) h.rotation.x = Math.sin(t * 1.7) * 0.018;
  animateFace(rig.head, t, lookX, lookY, happy);
}
export function disposeGroup(root: T.Object3D) {
  const geos = new Set<T.BufferGeometry>(),
    mats = new Set<T.Material>(),
    textures = new Set<T.Texture>();
  root.traverse((o) => {
    if (o instanceof T.Mesh || o instanceof T.Points) {
      geos.add(o.geometry);
      (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => {
        mats.add(m);
        for (const value of Object.values(m))
          if (value instanceof T.Texture) textures.add(value);
      });
      if (o instanceof T.InstancedMesh) o.dispose();
    }
  });
  geos.forEach((g) => g.dispose());
  textures.forEach((t) => t.dispose());
  mats.forEach((m) => m.dispose());
}
