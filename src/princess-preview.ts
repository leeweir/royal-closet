/// <reference types="vite/client" />
import * as T from "three";
import "./princess-preview.css";
import {
  createCharacter,
  animateCharacter,
  updateCharacter,
} from "./render/character";
import { freshSave } from "./simulation/game";
import { ITEM } from "./simulation/data";

const query = new URLSearchParams(location.search);
const save = freshSave();
for (const part of [
  "hair",
  "shoes",
  "dress",
  "wand",
  "crown",
  "wings",
] as const) {
  const id = `${part}-${query.get(part)}`;
  if (ITEM[id]) save.outfit[part] = id;
}
let frame = query.get("view") ?? "full";

const host = document.querySelector<HTMLElement>("#stage")!;
// This static study renders on demand and retains the frame for screenshots.
const renderer = new T.WebGLRenderer({
  antialias: true,
  alpha: true,
  preserveDrawingBuffer: true,
});
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.outputColorSpace = T.SRGBColorSpace;
renderer.toneMapping = T.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.08;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = T.PCFSoftShadowMap;
host.append(renderer.domElement);
const scene = new T.Scene();
const camera = new T.PerspectiveCamera(32, 1, 0.1, 50);
scene.add(new T.HemisphereLight("#fff9f3", "#b5a0cb", 0.8));
const key = new T.DirectionalLight("#fff4e5", 2.2);
key.position.set(-3, 6, 5);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
key.shadow.camera.left = key.shadow.camera.bottom = -4;
key.shadow.camera.right = key.shadow.camera.top = 4;
key.shadow.normalBias = 0.025;
key.shadow.bias = -0.0001;
key.shadow.radius = 3;
scene.add(key);
const fill = new T.DirectionalLight("#e9dfff", 0.55);
fill.position.set(3, 3, 3);
scene.add(fill);
const rim = new T.DirectionalLight("#fff1da", 0.6);
rim.position.set(0, 4, -4);
scene.add(rim);

const plinth = new T.Mesh(
  new T.CylinderGeometry(1.28, 1.32, 0.08, 96),
  new T.MeshStandardMaterial({ color: "#eee4f0", roughness: 0.75 }),
);
plinth.position.y = -0.06;
plinth.receiveShadow = true;
scene.add(plinth);
const border = new T.Mesh(
  new T.TorusGeometry(1.29, 0.009, 8, 120),
  new T.MeshStandardMaterial({
    color: "#b99c68",
    metalness: 0.55,
    roughness: 0.38,
  }),
);
border.rotation.x = Math.PI / 2;
border.position.y = -0.025;
scene.add(border);
const ground = new T.Mesh(
  new T.PlaneGeometry(200, 200),
  new T.ShadowMaterial({ opacity: 0.08 }),
);
ground.rotation.x = -Math.PI / 2;
ground.position.y = -0.11;
ground.receiveShadow = true;
scene.add(ground);

let character: T.Group | undefined;
let angle = 0;
function render() {
  document.querySelector("header span")!.textContent =
    frame === "head"
      ? `发型近景 · ${ITEM[save.outfit.hair].name}`
      : frame === "feet"
        ? `鞋履近景 · ${ITEM[save.outfit.shoes].name}`
        : frame === "wand" || frame === "hand"
          ? `魔杖近景 · ${ITEM[save.outfit.wand].name}`
          : "VRM 公主 · 服饰适配预览";
  document.querySelector("footer span")!.textContent =
    frame === "head"
      ? ITEM[save.outfit.hair].name
      : frame === "feet"
        ? ITEM[save.outfit.shoes].name
        : frame === "wand" || frame === "hand"
          ? ITEM[save.outfit.wand].name
          : `${ITEM[save.outfit.dress].name} · ${ITEM[save.outfit.hair].name} · ${ITEM[save.outfit.shoes].name}`;
  renderer.render(scene, camera);
}
function resize() {
  const { width, height } = host.getBoundingClientRect();
  renderer.setSize(width, height);
  camera.aspect = width / height;
  camera.position.set(0, 1.9, Math.max(7.8, 5.2 / camera.aspect));
  camera.lookAt(0, 1.78, 0);
  if (frame === "head") {
    camera.position.set(0, 3.04, 1.85);
    camera.lookAt(0, 3.0, 0);
  } else if (frame === "feet") {
    camera.position.set(0, 0.65, 2.25);
    camera.lookAt(0, 0.4, 0);
  } else if (frame === "wand") {
    camera.position.set(0.48, 2.22, 3.2);
    camera.lookAt(0.48, 2.22, 0.45);
  } else if (frame === "hand") {
    camera.position.set(0.39, 1.96, 1.3);
    camera.lookAt(0.39, 1.96, 0.48);
  } else if (frame === "bodice") {
    camera.position.set(0, 2.3, 2.6);
    camera.lookAt(0, 2.3, 0);
  }
  camera.updateProjectionMatrix();
  render();
}
new ResizeObserver(resize).observe(host);
function setAngle(value: number) {
  angle = value;
  if (character) character.rotation.y = angle;
  document
    .querySelectorAll<HTMLButtonElement>("[data-angle]")
    .forEach((button) => {
      button.setAttribute(
        "aria-pressed",
        String(Number(button.dataset.angle) === angle),
      );
    });
  render();
}
document
  .querySelectorAll<HTMLButtonElement>("[data-angle]")
  .forEach((button) => {
    button.addEventListener("click", () =>
      setAngle(Number(button.dataset.angle)),
    );
  });

try {
  const root = await createCharacter(save);
  animateCharacter(root, 0, false, 0, 0, 0, false, true);
  character = root;
  scene.add(root);
  document.querySelector<HTMLElement>("#loading")!.hidden = true;
  resize();
  setAngle(angle);
  const preview = {
    ready: true,
    diagnostics: () => ({
      angle,
      bones: root.userData.bones,
      drawCalls: renderer.info.render.calls,
      triangles: renderer.info.render.triangles,
      geometries: renderer.info.memory.geometries,
      textures: renderer.info.memory.textures,
    }),
  };
  Object.assign(window, { __PRINCESS_PREVIEW__: preview });
  if (import.meta.env.DEV) {
    Object.assign(preview, {
      root,
      setAngle,
      setFrame: (value: string) => {
        frame = value;
        resize();
      },
      equip: (
        part: "hair" | "shoes" | "dress" | "wand" | "crown" | "wings",
        style: number,
      ) => {
        save.outfit[part] = `${part}-${style}`;
        updateCharacter(root, save);
        render();
      },
      pose: (moving: boolean, time: number, look = 0, gesture = 0) => {
        animateCharacter(root, time, moving, gesture, look, 0, false, !moving);
        render();
      },
    });
  }
} catch (error) {
  document.querySelector<HTMLElement>("#loading")!.textContent =
    "模型加载失败，请刷新重试。";
  console.error(error);
}
