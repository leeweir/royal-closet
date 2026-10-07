import * as T from "three";
import { TessellateModifier } from "three/addons/modifiers/TessellateModifier.js";
import { mesh, batchGroup, shareTexture, cachedChild } from "./modeling";

// The head is a sphere whose x/y deformation depends only on height, so the
// front surface can be solved analytically and every facial feature hugs it.
const SX = 0.34,
  SZ = 0.296;
const lowerFace = (y: number) => T.MathUtils.smoothstep(-y, 0, 1);
const heightOf = (y: number) => (y > 0 ? y * 0.39 : y * 0.385);
function widthOf(y: number) {
  // Soft cheeks taper into a slim, gently pointed chin.
  const cheek = 1 + 0.025 * Math.exp(-(((y + 0.28) / 0.25) ** 2));
  return SX * (1 - 0.36 * lowerFace(y) ** 2.6) * cheek;
}
function depthOf(y: number, z: number) {
  const lower = lowerFace(y);
  return z > 0 ? SZ * (1 - 0.1 * lower) : SZ * (1.04 - 0.3 * lower);
}
function deform(v: T.Vector3) {
  const { x, y, z } = v;
  return v.set(x * widthOf(y), heightOf(y), z * depthOf(y, z));
}
/** Point on the front of the head at local (x, y), lifted along +z. */
export function headSurface(x: number, y: number, lift = 0) {
  const ys = T.MathUtils.clamp(y > 0 ? y / 0.39 : y / 0.385, -1, 1);
  const xs = x / widthOf(ys);
  const zs = Math.sqrt(Math.max(0, 1 - xs * xs - ys * ys));
  return new T.Vector3(x, y, zs * depthOf(ys, 1) + lift);
}

const cache = new Map<string, T.Texture>();
function canvasTexture(
  key: string,
  size: number,
  draw: (x: CanvasRenderingContext2D) => void,
) {
  let tex = cache.get(key);
  if (!tex) {
    const c = document.createElement("canvas");
    c.width = c.height = size;
    draw(c.getContext("2d")!);
    tex = shareTexture(new T.CanvasTexture(c));
    tex.colorSpace = T.SRGBColorSpace;
    cache.set(key, tex);
  }
  return tex;
}
// The eye white and iris share one padded texture; gaze slides the texture,
// so the iris is always clipped by the eye outline.
const EYE_PAD = 0.2,
  EYE_SPAN = 1 - EYE_PAD * 2;
const eyeTexture = () =>
  canvasTexture("eye", 512, (x) => {
    x.fillStyle = "#fbf7fb";
    x.fillRect(0, 0, 512, 512);
    const crease = x.createLinearGradient(0, 100, 0, 230);
    crease.addColorStop(0, "#c9b6d6");
    crease.addColorStop(1, "#fbf7fb00");
    x.fillStyle = crease;
    x.fillRect(0, 0, 512, 230);
    x.save();
    x.translate(251 - 112, 272 - 138);
    x.scale(224 / 256, 276 / 256);
    x.beginPath();
    x.ellipse(128, 128, 128, 128, 0, 0, Math.PI * 2);
    x.clip();
    const g = x.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0, "#3d1d24");
    g.addColorStop(0.4, "#8a4a4c");
    g.addColorStop(0.75, "#d58d72");
    g.addColorStop(1, "#f7c9a2");
    x.fillStyle = g;
    x.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 64; i++) {
      const a = (i / 64) * Math.PI * 2;
      x.strokeStyle = i % 2 ? "#ffe2c840" : "#3a1a2040";
      x.lineWidth = 2;
      x.beginPath();
      x.moveTo(128 + Math.cos(a) * 40, 136 + Math.sin(a) * 46);
      x.lineTo(128 + Math.cos(a) * 112, 136 + Math.sin(a) * 118);
      x.stroke();
    }
    x.strokeStyle = "#3a1c22";
    x.lineWidth = 12;
    x.beginPath();
    x.ellipse(128, 128, 122, 122, 0, 0, Math.PI * 2);
    x.stroke();
    x.fillStyle = "#2a1216";
    x.beginPath();
    x.ellipse(128, 132, 26, 36, 0, 0, Math.PI * 2);
    x.fill();
    const lid = x.createLinearGradient(0, 0, 0, 110);
    lid.addColorStop(0, "#2a1016cc");
    lid.addColorStop(1, "#2a101600");
    x.fillStyle = lid;
    x.fillRect(0, 0, 256, 110);
    x.fillStyle = "#ffffff";
    x.beginPath();
    x.ellipse(84, 78, 26, 32, -0.35, 0, Math.PI * 2);
    x.fill();
    x.beginPath();
    x.ellipse(170, 186, 11, 13, 0, 0, Math.PI * 2);
    x.fill();
    x.fillStyle = "#ffffffaa";
    x.beginPath();
    x.ellipse(150, 62, 7, 7, 0, 0, Math.PI * 2);
    x.fill();
    x.restore();
  });
const glowTexture = (color: string) =>
  canvasTexture(`glow${color}`, 64, (x) => {
    const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, color + "b0");
    g.addColorStop(1, color + "00");
    x.fillStyle = g;
    x.fillRect(0, 0, 64, 64);
  });

/** Closed outline of a brush stroke along points, thickest in the middle. */
function stroke(points: number[][], width: number, end = 0.25) {
  const curve = new T.CatmullRomCurve3(
    points.map(([u, v]) => new T.Vector3(u, v, 0)),
  );
  const left: T.Vector2[] = [],
    right: T.Vector2[] = [];
  for (let i = 0; i <= 24; i++) {
    const t = i / 24,
      p = curve.getPoint(t),
      d = curve.getTangent(t);
    const w = (width / 2) * (end + (1 - end) * Math.sin(Math.PI * t) ** 0.6);
    left.push(new T.Vector2(p.x - d.y * w, p.y + d.x * w));
    right.push(new T.Vector2(p.x + d.y * w, p.y - d.x * w));
  }
  return new T.Shape([...left, ...right.reverse()]);
}
/** Lay a flat shape onto the face; u runs outward on the given side. */
function decal(
  shape: T.Shape,
  parent: T.Object3D,
  mat: T.Material,
  side: number,
  lift: number,
  mirror = true,
  origin = parent.position,
) {
  // Subdivide so broad decals bend with the face instead of sinking into it.
  const g = new TessellateModifier(0.008, 8).modify(
    new T.ShapeGeometry(shape, 16),
  );
  const [sx, sy] = (parent.userData.scale as [number, number]) ?? [1, 1];
  g.scale(sx, sy, 1);
  const pos = g.attributes.position,
    uv = g.attributes.uv;
  g.computeBoundingBox();
  const box = g.boundingBox!;
  for (let i = 0; i < pos.count; i++) {
    const u = pos.getX(i),
      v = pos.getY(i);
    const x = (mirror ? side : 1) * u;
    const p = headSurface(origin.x + x, origin.y + v, lift);
    pos.setXYZ(i, p.x - parent.position.x, p.y - parent.position.y, p.z);
    // UVs follow the mirrored position so both eyes catch light from one side.
    const ux = mirror && side < 0 ? box.max.x + box.min.x - u : u;
    uv.setXY(
      i,
      (ux - box.min.x) / (box.max.x - box.min.x),
      (v - box.min.y) / (box.max.y - box.min.y),
    );
  }
  g.computeVertexNormals();
  const m = mesh(g, mat, parent);
  m.castShadow = false;
  return m;
}
function ellipse(cx: number, cy: number, rx: number, ry: number) {
  const s = new T.Shape();
  s.absellipse(cx, cy, rx, ry, 0, Math.PI * 2, false, 0);
  return s;
}

export function createFace(skin: T.Material) {
  const head = new T.Group();
  head.name = "head";
  const g = new T.SphereGeometry(1, 64, 48);
  const pos = g.attributes.position,
    v = new T.Vector3();
  for (let i = 0; i < pos.count; i++)
    pos.setXYZ(i, ...deform(v.fromBufferAttribute(pos, i)).toArray());
  g.computeVertexNormals();
  mesh(g, skin, head);

  const flat = (color: string) =>
    new T.MeshBasicMaterial({ color, side: T.DoubleSide });
  const lash = flat("#3b2228"),
    lidLine = flat("#cf9a98"),
    lowerLash = flat("#b07c80"),
    brow = flat("#b48a86");
  const staticFace = new T.Group();
  head.add(staticFace);
  for (const side of [-1, 1]) {
    // Ears stay tucked under the hair, as in most anime designs.

    const cheek = new T.Group();
    cheek.position.set(side * 0.2, -0.14, 0);
    head.add(cheek);
    decal(
      ellipse(0, 0, 0.065, 0.036),
      cheek,
      new T.MeshBasicMaterial({
        map: glowTexture("#f093a3"),
        transparent: true,
        depthWrite: false,
      }),
      side,
      0.004,
    );

    // Eye built outward from the nose: white, clipped iris, lash and lid lines.
    const eye = new T.Group();
    eye.name = side < 0 ? "eye-left" : "eye-right";
    eye.position.set(side * 0.127, -0.05, 0);
    // Almond eyes: wide, a little narrower than a chibi's.
    eye.userData.scale = [1.18, 1.02];
    head.add(eye);
    const white = new T.Shape();
    white.moveTo(-0.056, 0.018);
    white.bezierCurveTo(-0.03, 0.068, 0.04, 0.074, 0.064, 0.042);
    white.bezierCurveTo(0.072, 0.0, 0.05, -0.062, 0.002, -0.064);
    white.bezierCurveTo(-0.04, -0.062, -0.06, -0.02, -0.056, 0.018);
    const tex = eyeTexture().clone();
    tex.repeat.setScalar(EYE_SPAN);
    tex.offset.setScalar(EYE_PAD);
    tex.needsUpdate = true;
    eye.userData.gaze = { tex, side };
    decal(
      white,
      eye,
      new T.MeshBasicMaterial({ map: tex, side: T.DoubleSide }),
      side,
      0.003,
    ).name = "iris";
    const lines = new T.Group();
    eye.add(lines);
    decal(
      stroke(
        [
          [-0.06, 0.016],
          [-0.03, 0.058],
          [0.025, 0.07],
          [0.062, 0.048],
          [0.084, 0.03],
        ],
        0.0145,
        0.3,
      ),
      lines,
      lash,
      side,
      0.007,
    );
    for (const [du, dv, r] of [
      [0.07, 0.05, 0.5],
      [0.056, 0.062, 0.8],
    ])
      decal(
        stroke(
          [
            [du, dv],
            [du + 0.016, dv + 0.012 * r],
            [du + 0.03, dv + 0.024 * r],
          ],
          0.006,
          0.1,
        ),
        lines,
        lash,
        side,
        0.007,
      );
    decal(
      stroke(
        [
          [-0.045, 0.06],
          [0.0, 0.088],
          [0.05, 0.078],
        ],
        0.0035,
        0.1,
      ),
      lines,
      lidLine,
      side,
      0.004,
    );
    decal(
      stroke(
        [
          [0.0, -0.068],
          [0.034, -0.056],
          [0.058, -0.03],
        ],
        0.004,
        0.15,
      ),
      lines,
      lowerLash,
      side,
      0.006,
    );
    batchGroup(lines);
    decal(
      stroke(
        [
          [-0.06, 0.148],
          [-0.005, 0.168],
          [0.062, 0.152],
        ],
        0.0055,
        0.2,
      ),
      staticFace,
      brow,
      side,
      0.003,
      true,
      eye.position,
    );
  }

  batchGroup(staticFace);

  const shadow = new T.Group();
  shadow.position.set(0, -0.15, 0);
  head.add(shadow);
  decal(
    ellipse(0, 0, 0.022, 0.013),
    shadow,
    new T.MeshBasicMaterial({
      map: glowTexture("#d98f8a"),
      transparent: true,
      depthWrite: false,
    }),
    1,
    0.003,
  );

  const mouth = new T.Group();
  mouth.name = "mouth";
  mouth.position.set(0, -0.215, 0);
  head.add(mouth);
  decal(
    stroke(
      [
        [-0.03, 0.007],
        [0, -0.006],
        [0.03, 0.007],
      ],
      0.005,
      0.2,
    ),
    mouth,
    flat("#b55a6c"),
    1,
    0.004,
  );
  const lip = new T.Group();
  lip.position.set(0, -0.012, 0);
  mouth.add(lip);
  decal(
    ellipse(0, 0, 0.026, 0.011),
    lip,
    new T.MeshBasicMaterial({
      map: glowTexture("#ec8f9c"),
      transparent: true,
      depthWrite: false,
    }),
    1,
    0.0032,
  );
  const open = new T.Shape();
  open.moveTo(-0.032, 0.006);
  open.quadraticCurveTo(0, -0.004, 0.032, 0.006);
  open.bezierCurveTo(0.028, -0.034, -0.028, -0.034, -0.032, 0.006);
  const smile = new T.Group();
  smile.name = "smile-open";
  smile.visible = false;
  mouth.add(smile);
  decal(open, smile, flat("#9e4560"), 1, 0.003);
  decal(ellipse(0, -0.018, 0.016, 0.007), smile, flat("#f08b9b"), 1, 0.0035);
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
    const e = cachedChild(head, name)!;
    // Happy eyes squint into soft arcs, like a smile reaching the eyes.
    e.scale.y = 1 - Math.max(blink * 0.96, happy ? 0.22 : 0);
    const { tex, side } = e.userData.gaze as { tex: T.Texture; side: number };
    tex.offset.set(EYE_PAD + side * lookX * 0.056, EYE_PAD - lookY * 0.035);
  }
  cachedChild(head, "mouth")!.scale.set(happy ? 1.1 : 1, 1, 1);
  cachedChild(head, "smile-open")!.visible = happy;
}
