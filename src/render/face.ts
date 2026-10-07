import * as T from "three";
import { mesh, line, batchGroup } from "./modeling";

function irisTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const x = c.getContext("2d")!;
  const g = x.createRadialGradient(128, 143, 12, 128, 128, 120);
  g.addColorStop(0, "#7055a1");
  g.addColorStop(0.52, "#ad88d5");
  g.addColorStop(0.83, "#66508c");
  g.addColorStop(1, "#271e47");
  x.fillStyle = g;
  x.beginPath();
  x.arc(128, 128, 120, 0, Math.PI * 2);
  x.fill();
  for (let i = 0; i < 56; i++) {
    const a = (i / 56) * Math.PI * 2;
    x.strokeStyle = i % 2 ? "#d6b8fa55" : "#39224f88";
    x.lineWidth = 2;
    x.beginPath();
    x.moveTo(128 + Math.cos(a) * 42, 128 + Math.sin(a) * 49);
    x.lineTo(128 + Math.cos(a) * 99, 128 + Math.sin(a) * 108);
    x.stroke();
  }
  x.fillStyle = "#2e203f";
  x.beginPath();
  x.ellipse(128, 120, 34, 63, 0, 0, Math.PI * 2);
  x.fill();
  const upper = x.createLinearGradient(0, 30, 0, 150);
  upper.addColorStop(0, "#241c4088");
  upper.addColorStop(1, "#241c4000");
  x.fillStyle = upper;
  x.beginPath();
  x.arc(128, 128, 120, 0, Math.PI * 2);
  x.fill();
  x.fillStyle = "#fffdfa";
  x.beginPath();
  x.ellipse(91, 67, 23, 29, -0.4, 0, Math.PI * 2);
  x.fill();
  x.fillStyle = "#ffffff99";
  x.beginPath();
  x.ellipse(173, 178, 12, 16, -0.2, 0, Math.PI * 2);
  x.fill();
  x.fillStyle = "#f9d5ff";
  x.beginPath();
  x.ellipse(114, 197, 28, 7, 0, 0, Math.PI * 2);
  x.fill();
  const tex = new T.CanvasTexture(c);
  tex.colorSpace = T.SRGBColorSpace;
  return tex;
}
function glowTexture(color: string) {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const x = c.getContext("2d")!,
    g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, color + "a0");
  g.addColorStop(1, color + "00");
  x.fillStyle = g;
  x.fillRect(0, 0, 64, 64);
  const tex = new T.CanvasTexture(c);
  tex.colorSpace = T.SRGBColorSpace;
  return tex;
}
export function createFace() {
  const head = new T.Group();
  head.name = "head";
  const ink = new T.MeshBasicMaterial({ color: "#50334f" });
  const skin = new T.MeshPhysicalMaterial({
    color: "#ffdccd",
    roughness: 0.63,
    metalness: 0,
    clearcoat: 0.05,
    emissive: "#e8bdad",
    emissiveIntensity: 0.1,
  });
  const g = new T.SphereGeometry(1, 64, 48);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i),
      x = pos.getX(i),
      z = pos.getZ(i);
    const jaw =
      y < -0.12 ? 1 - 0.2 * Math.pow(Math.min(1, (-y - 0.12) / 0.8), 0.7) : 1;
    pos.setXYZ(
      i,
      x * 0.355 * jaw,
      y * 0.397,
      z * 0.285 * (1 - 0.1 * T.MathUtils.smoothstep(-y, 0.15, 0.8)),
    );
  }
  g.computeVertexNormals();
  mesh(g, skin, head);
  const staticFace = new T.Group();
  head.add(staticFace);
  for (const side of [-1, 1]) {
    const ear = mesh(
      new T.SphereGeometry(1, 20, 16),
      skin,
      staticFace,
      side * 0.345,
      -0.008,
      -0.025,
    );
    ear.scale.set(0.045, 0.079, 0.03);
    const blush = mesh(
      new T.PlaneGeometry(0.125, 0.07),
      new T.MeshBasicMaterial({
        map: glowTexture("#e898a4"),
        transparent: true,
        depthWrite: false,
      }),
      head,
      side * 0.208,
      -0.113,
      0.238,
    );
    blush.rotation.y = side * 0.4;
    const eye = new T.Group();
    eye.name = side < 0 ? "eye-left" : "eye-right";
    eye.position.set(side * 0.144, 0.045, 0.244);
    eye.rotation.y = side * 0.22;
    head.add(eye);
    const sclera = mesh(
      new T.SphereGeometry(1, 32, 24),
      new T.MeshStandardMaterial({ color: "#fffefa", roughness: 0.4 }),
      eye,
    );
    sclera.scale.set(0.121, 0.078, 0.018);
    const iris = mesh(
      new T.CircleGeometry(1, 48),
      new T.MeshBasicMaterial({
        map: irisTexture(),
        transparent: true,
        side: T.DoubleSide,
      }),
      eye,
      side * 0.005,
      -0.003,
      0.021,
    );
    iris.name = "iris";
    iris.scale.set(0.067, 0.073, 1);
    const upper = [
      [side * -0.118, 0.005, 0.017],
      [side * -0.07, 0.07, 0.017],
      [side * 0.02, 0.092, 0.019],
      [side * 0.095, 0.064, 0.021],
      [side * 0.126, 0.035, 0.014],
    ];
    line(eye, upper, 0.0075, ink);
    const lower = line(
      eye,
      [
        [side * -0.105, -0.037, 0.013],
        [side * -0.03, -0.087, 0.021],
        [side * 0.059, -0.076, 0.024],
        [side * 0.108, -0.043, 0.017],
      ],
      0.002,
      new T.MeshBasicMaterial({ color: "#ad7583" }),
    );
    lower.name = "lower-lid";
    for (let j = 0; j < 3; j++)
      line(
        eye,
        [
          [side * (0.091 + j * 0.014), 0.071 - j * 0.011, 0.015],
          [side * (0.113 + j * 0.023), 0.088 - j * 0.012, 0.023],
          [side * (0.129 + j * 0.023), 0.094 - j * 0.011, 0.021],
        ],
        0.0035,
        ink,
        8,
      );
    const irisEye = eye.getObjectByName("iris")!;
    eye.remove(irisEye);
    const whiteEye = sclera;
    eye.remove(whiteEye);
    eye.children.forEach((o) => {
      o.scale.y = 0.82;
    });
    batchGroup(eye);
    eye.add(irisEye, whiteEye);
    eye.traverse((o) => {
      if (o instanceof T.Mesh) o.castShadow = false;
    });
    line(
      staticFace,
      [
        [side * 0.073, 0.191, 0.206],
        [side * 0.133, 0.205, 0.235],
        [side * 0.214, 0.181, 0.217],
      ],
      0.0055,
      new T.MeshBasicMaterial({ color: "#947981" }),
    );
  }
  const nose = mesh(
    new T.SphereGeometry(1, 20, 16),
    skin,
    staticFace,
    0,
    -0.105,
    0.278,
  );
  nose.scale.set(0.018, 0.026, 0.018);
  batchGroup(staticFace);
  const mouth = new T.Group();
  mouth.name = "mouth";
  mouth.position.set(0, -0.185, 0.255);
  head.add(mouth);
  line(
    mouth,
    [
      [-0.037, 0.008, 0],
      [-0.015, -0.005, 0.007],
      [0.016, -0.005, 0.007],
      [0.04, 0.013, 0],
    ],
    0.0038,
    new T.MeshBasicMaterial({ color: "#b96577" }),
  );
  const happy = mesh(
    new T.CircleGeometry(0.043, 32),
    new T.MeshBasicMaterial({ color: "#be6b80", side: T.DoubleSide }),
    mouth,
    0,
    -0.012,
    -0.002,
  );
  happy.name = "smile-open";
  happy.scale.set(1, 0.65, 1);
  happy.visible = false;
  line(
    mouth,
    [
      [-0.02, -0.017, 0.001],
      [0, -0.025, 0.003],
      [0.018, -0.016, 0.001],
    ],
    0.002,
    new T.MeshBasicMaterial({ color: "#f5afba" }),
  );
  return head;
}
export function animateFace(
  head: T.Group,
  time: number,
  lookX: number,
  lookY: number,
  happy: boolean,
) {
  const blink = Math.pow(Math.max(0, Math.cos(time * 1.1 + 1.1)), 38);
  for (const name of ["eye-left", "eye-right"]) {
    const e = head.getObjectByName(name)!;
    e.scale.y = 1 - blink * 0.96;
    const iris = e.getObjectByName("iris")!;
    iris.position.x = lookX * 0.014;
    iris.position.y = -0.003 + lookY * 0.01;
  }
  const m = head.getObjectByName("mouth")!;
  m.scale.set(happy ? 1.15 : 1, happy ? 1.25 : 1, 1);
  m.getObjectByName("smile-open")!.visible = happy;
}
