import * as T from "three";
import {
  createCharacter,
  updateCharacter,
  animateCharacter,
  resetCharacterMotion,
  characterDiagnostics,
  EXPRESSIONS,
  disposeGroup,
  mesh,
} from "./character";
import { batchGroup, line } from "./modeling";
import { REGIONS, regionOf, INTERACT_RADIUS } from "../simulation/data";
import { advanceGround, clampGround } from "../simulation/locomotion";
import type { Save, Run, Outfit } from "../simulation/game";
import {
  adventureAbilities,
  stageLayout,
  REGION_STORIES,
} from "../simulation/adventure";
import { createCompanion, addRegionScenery } from "./region-scenes";
export type PointKind = "gem" | "rune" | "fairy" | "portal";
export interface WorldPoint {
  kind: PointKind;
  index: number;
  x: number;
  z: number;
  object: T.Group;
}
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
export class World {
  renderer: T.WebGLRenderer;
  scene = new T.Scene();
  camera = new T.PerspectiveCamera(36, 1, 0.1, 100);
  environment = new T.Group();
  avatar: T.Group;
  particles: T.Points;
  mode: "closet" | "adventure" | "runway" = "closet";
  points: WorldPoint[] = [];
  target = new T.Vector3();
  keys = new Set<string>();
  paused = false;
  /** False while the 3D panel is hidden by the current screen. */
  visible = true;
  drag = false;
  rotate = 0;
  zoom = 1;
  pose = 0;
  expression = 0;
  look = { x: 0, y: 0 };
  happyUntil = 0;
  last = 0;
  time = 0;
  run: Run | null = null;
  onNear: (p: WorldPoint | null) => void = () => {};
  onGem: (i: number) => void = () => {};
  onError: () => void = () => {};
  onFrame: () => void = () => {};
  destination: WorldPoint | null = null;
  private destinationRing: T.Group | null = null;
  private cameraAnchor = new T.Vector3();
  private walkDistance = 0;
  private ground = new T.Plane(new T.Vector3(0, 1, 0), 0);
  private outfit: Outfit;
  private magicReadyAt = 0;
  private magicStartedAt = -100;
  private magicRing: T.Mesh | null = null;
  runwayTime = 0;
  private runwayDone: (() => void) | null = null;
  private nearKey = "";
  private pointer = { x: 0, y: 0, startX: 0, startY: 0, moved: false };
  private ray = new T.Raycaster();
  private touchAxis = { x: 0, z: 0 };
  private ro: ResizeObserver;
  private sun: T.DirectionalLight;
  private mats = new Map<string, T.MeshStandardMaterial>();
  private portalReady: boolean | null = null;
  static async create(host: HTMLElement, s: Save) {
    const avatar = await createCharacter(s);
    try {
      return new World(host, avatar, s);
    } catch (error) {
      disposeGroup(avatar);
      throw error;
    }
  }
  private constructor(
    public host: HTMLElement,
    avatar: T.Group,
    save: Save,
  ) {
    this.outfit = { ...save.outfit };
    this.renderer = new T.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: "high-performance",
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.6));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = T.PCFSoftShadowMap;
    this.renderer.outputColorSpace = T.SRGBColorSpace;
    this.renderer.toneMapping = T.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.setClearColor(0, 0);
    this.renderer.domElement.setAttribute(
      "aria-label",
      "可拖动旋转的 3D 公主；冒险时点击地面移动",
    );
    host.append(this.renderer.domElement);
    this.scene.add(new T.HemisphereLight("#fff9f3", "#b5a0cb", 0.8));
    const sun = new T.DirectionalLight("#fff4e5", 2.2);
    sun.position.set(-3, 6, 5);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.normalBias = 0.04;
    this.scene.add(sun);
    this.sun = sun;
    const fill = new T.DirectionalLight("#e9dfff", 0.55);
    fill.position.set(3, 3, 3);
    this.scene.add(fill);
    const rim = new T.DirectionalLight("#fff1da", 0.6);
    rim.position.set(0, 4, -4);
    this.scene.add(rim);
    this.scene.add(this.environment);
    this.avatar = avatar;
    this.scene.add(this.avatar);
    const pts = [];
    for (let i = 0; i < 65; i++)
      pts.push(
        (Math.random() - 0.5) * 14,
        Math.random() * 8,
        (Math.random() - 0.5) * 12,
      );
    const geo = new T.BufferGeometry();
    geo.setAttribute("position", new T.Float32BufferAttribute(pts, 3));
    this.particles = new T.Points(
      geo,
      new T.PointsMaterial({
        color: "#ffffff",
        size: 0.045,
        transparent: true,
        opacity: 0.85,
      }),
    );
    this.scene.add(this.particles);
    this.closet();
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(host);
    this.resize();
    this.bind();
    this.renderer.setAnimationLoop((t) => this.tick(t));
  }
  private bind() {
    const el = this.renderer.domElement;
    el.addEventListener("pointerdown", (e) => {
      if (this.paused) return;
      this.pointer = {
        x: e.clientX,
        y: e.clientY,
        startX: e.clientX,
        startY: e.clientY,
        moved: false,
      };
      this.drag = true;
      el.setPointerCapture(e.pointerId);
    });
    el.addEventListener("pointermove", (e) => {
      const rect = el.getBoundingClientRect();
      this.look.x = T.MathUtils.clamp(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -1,
        1,
      );
      this.look.y = T.MathUtils.clamp(
        1 - ((e.clientY - rect.top) / rect.height) * 2,
        -1,
        1,
      );
      if (!this.drag || this.paused) return;
      const dx = e.clientX - this.pointer.x;
      if (
        Math.hypot(
          e.clientX - this.pointer.startX,
          e.clientY - this.pointer.startY,
        ) > 9
      )
        this.pointer.moved = true;
      if (this.mode === "closet") this.rotate += dx * 0.012;
      this.pointer.x = e.clientX;
      this.pointer.y = e.clientY;
    });
    el.addEventListener("pointerup", (e) => {
      if (
        this.drag &&
        !this.pointer.moved &&
        this.mode === "adventure" &&
        !this.paused
      ) {
        const r = el.getBoundingClientRect();
        this.ray.setFromCamera(
          new T.Vector2(
            ((e.clientX - r.left) / r.width) * 2 - 1,
            (-(e.clientY - r.top) / r.height) * 2 + 1,
          ),
          this.camera,
        );
        // Pick the visible object first. A ray to the floor behind a floating
        // crystal can miss its pickup radius, especially on a touch screen.
        const nearby = this.projectPoints().filter(
          (p) =>
            p.visible &&
            !(p.kind === "gem" && this.run?.gems.includes(p.index)),
        );
        const picked = nearby
          .map((p) => ({
            p,
            distance: Math.hypot(p.visualX - e.clientX, p.visualY - e.clientY),
          }))
          .filter((p) => p.distance < (e.pointerType === "touch" ? 34 : 26))
          .sort((a, b) => a.distance - b.distance)[0];
        if (picked) this.seek(picked.p.kind, picked.p.index);
        else {
          const hit = this.ray.ray.intersectPlane(this.ground, new T.Vector3());
          if (hit) this.moveTo(hit.x, hit.z);
        }
      }
      if (this.drag && !this.pointer.moved && this.mode === "closet")
        this.happyUntil = this.time + 2.5;
      this.drag = false;
    });
    el.addEventListener("pointercancel", () => (this.drag = false));
    el.addEventListener("pointerleave", () => {
      if (!this.drag) this.look = { x: 0, y: 0 };
    });
    // Keyboard users can turn the princess and make her smile.
    el.tabIndex = 0;
    el.addEventListener("keydown", (e) => {
      if (this.mode !== "closet" || this.paused) return;
      if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        e.preventDefault();
        this.rotate += e.key === "ArrowLeft" ? -0.3 : 0.3;
      } else if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        this.happyUntil = this.time + 2.5;
      }
    });
    el.addEventListener(
      "wheel",
      (e) => {
        if (this.mode === "closet") {
          e.preventDefault();
          this.zoom = T.MathUtils.clamp(
            this.zoom + e.deltaY * 0.0005,
            0.8,
            1.2,
          );
        }
      },
      { passive: false },
    );
    window.addEventListener("keydown", (e) => {
      if ((e.target as HTMLElement).matches("input,textarea,select")) return;
      if (
        [
          "ArrowUp",
          "ArrowDown",
          "ArrowLeft",
          "ArrowRight",
          "w",
          "a",
          "s",
          "d",
          "W",
          "A",
          "S",
          "D",
        ].includes(e.key) &&
        this.mode === "adventure" &&
        !this.paused
      ) {
        e.preventDefault();
        this.keys.add(e.key.toLowerCase());
      }
    });
    window.addEventListener("keyup", (e) =>
      this.keys.delete(e.key.toLowerCase()),
    );
    window.addEventListener("blur", () => {
      this.stop();
    });
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) this.stop();
    });
    el.addEventListener("webglcontextlost", (e) => {
      e.preventDefault();
      this.paused = true;
      this.onError();
    });
    el.addEventListener("webglcontextrestored", () => {
      this.paused = false;
    });
  }
  resize() {
    const { width, height } = this.host.getBoundingClientRect();
    if (width <= 0 || height <= 0) return;
    this.renderer.setSize(width, height);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }
  updateOutfit(s: Save) {
    this.outfit = { ...s.outfit };
    updateCharacter(this.avatar, s);
  }
  clear() {
    this.environment.clear();
    this.points = [];
    this.mats.clear();
    this.portalReady = null;
    this.destinationRing = null;
    this.destination = null;
    this.magicRing = null;
    this.runwayDone = null;
  }
  /** One material per look, so static scenery can be merged by material. */
  private mat(color: string, metalness = 0, roughness = 0.65) {
    const key = `${color}|${metalness}|${roughness}`;
    let m = this.mats.get(key);
    if (!m) {
      m = new T.MeshStandardMaterial({ color, metalness, roughness });
      this.mats.set(key, m);
    }
    return m;
  }
  private orb(
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
      new T.SphereGeometry(1, 18, 12),
      this.mat(color),
      parent,
      x,
      y,
      z,
    );
    m.scale.set(sx, sy, sz);
    return m;
  }
  private shadowArea(size: number) {
    const cam = this.sun.shadow.camera;
    cam.left = cam.bottom = -size;
    cam.right = cam.top = size;
    cam.updateProjectionMatrix();
  }
  closet() {
    disposeGroup(this.environment);
    this.clear();
    this.mode = "closet";
    this.stop();
    this.camera.fov = 36;
    this.camera.updateProjectionMatrix();
    this.run = null;
    this.rotate = -0.13;
    this.zoom = 1;
    this.avatar.position.set(0, 0.14, 0);
    this.avatar.scale.setScalar(1);
    this.avatar.rotation.set(0, 0, 0);
    resetCharacterMotion(this.avatar);
    this.scene.fog = null;
    this.shadowArea(3.2);
    mesh(
      new T.CylinderGeometry(1.25, 1.3, 0.13, 96),
      this.mat("#eee5f5", 0.2),
      this.environment,
      0,
      0.055,
      0,
    );
    const gold = mesh(
      new T.TorusGeometry(1.25, 0.012, 8, 96),
      this.mat("#ceb887", 0.6),
      this.environment,
      0,
      0.125,
      0,
    );
    gold.rotation.x = Math.PI / 2;
    const floor = mesh(
      new T.PlaneGeometry(200, 200),
      new T.ShadowMaterial({ opacity: 0.1 }),
      this.environment,
      0,
      -0.025,
      0,
    );
    floor.rotation.x = -Math.PI / 2;
    // A gilded arch and a pair of slender palace pillars frame the character.
    const curve = new T.EllipseCurve(0, 2.35, 1.56, 1.9, 0, Math.PI, false, 0);
    const p = curve.getPoints(70).map((v) => new T.Vector3(v.x, v.y, -0.88));
    p.unshift(new T.Vector3(1.56, 0.05, -0.88));
    p.push(new T.Vector3(-1.56, 0.05, -0.88));
    mesh(
      new T.TubeGeometry(new T.CatmullRomCurve3(p), 100, 0.023, 8, false),
      this.mat("#d4c095", 0.3),
      this.environment,
    );
    for (const side of [-1, 1]) {
      mesh(
        new T.CylinderGeometry(0.09, 0.1, 2.45, 24),
        this.mat("#f6f1f6"),
        this.environment,
        side * 1.85,
        1.22,
        -1.2,
      );
      for (const y of [0.1, 2.4])
        mesh(
          new T.CylinderGeometry(0.17, 0.17, 0.1, 24),
          this.mat("#e2d6ca"),
          this.environment,
          side * 1.85,
          y,
          -1.2,
        );
      const foliage = new T.Group();
      this.environment.add(foliage);
      const stem = this.mat("#b5a99c", 0.3),
        petals = this.mat("#dfbfd5", 0.05),
        leaf = this.mat("#c6bdcf");
      line(
        foliage,
        Array.from({ length: 16 }, (_, i) => [
          side * (1.78 + Math.sin(i * 0.7) * 0.13),
          0.18 + i * 0.115,
          -1.05 + Math.cos(i * 0.7) * 0.12,
        ]),
        0.01,
        stem,
      );
      for (let i = 0; i < 8; i++) {
        const x = side * (1.75 + Math.sin(i * 1.5) * 0.12),
          y = 0.35 + i * 0.19,
          z = -1.04;
        for (let j = 0; j < 5; j++) {
          const a = (j / 5) * Math.PI * 2;
          const petal = mesh(
            new T.SphereGeometry(1, 12, 8),
            petals,
            foliage,
            x + Math.cos(a) * 0.047,
            y + Math.sin(a) * 0.047,
            z,
          );
          petal.scale.set(0.057, 0.04, 0.018);
          petal.rotation.z = a;
        }
        mesh(
          new T.SphereGeometry(0.026, 12, 8),
          stem,
          foliage,
          x,
          y,
          z + 0.018,
        );
        const smallLeaf = mesh(
          new T.SphereGeometry(1, 12, 8),
          leaf,
          foliage,
          x + side * 0.08,
          y - 0.08,
          z - 0.012,
        );
        smallLeaf.scale.set(0.025, 0.1, 0.012);
        smallLeaf.rotation.z = -side * 0.7;
      }
      batchGroup(foliage);
    }
    for (let i = 0; i < 7; i++) {
      const a = i * 0.9;
      mesh(
        new T.OctahedronGeometry(0.045, 0),
        this.mat("#ddc790", 0.6),
        this.environment,
        Math.sin(a) * 1.4,
        3.1 + Math.cos(a) * 0.44,
        -0.45,
      );
    }
    // Merge the static set by material; animated props live in sub-groups.
    batchGroup(this.environment);
  }
  adventure(run: Run) {
    disposeGroup(this.environment);
    this.clear();
    this.mode = "adventure";
    this.stop();
    this.camera.fov = 42;
    this.camera.updateProjectionMatrix();
    this.run = run;
    this.nearKey = "";
    const regionId = regionOf(run.stage);
    const region = REGIONS[regionId];
    const layout = stageLayout(run.stage);
    this.magicReadyAt = this.time;
    this.avatar.scale.setScalar(0.72);
    this.avatar.position.set(layout.spawn.x, 0, layout.spawn.z);
    this.target.copy(this.avatar.position);
    this.avatar.rotation.set(0, Math.PI, 0);
    resetCharacterMotion(this.avatar);
    this.cameraAnchor.copy(this.avatar.position);
    this.followCamera(0, true);
    this.scene.fog = new T.Fog("#ece8f2", 35, 70);
    this.shadowArea(12);
    mesh(
      new T.CylinderGeometry(11, 10.4, 0.5, 80),
      this.mat(region.ground),
      this.environment,
      0,
      -0.27,
      0,
    );
    mesh(
      new T.CylinderGeometry(10.8, 8.6, 1.8, 40),
      this.mat("#b9b0c8"),
      this.environment,
      0,
      -1.32,
      0,
    );
    addRegionScenery(this.environment, regionId, layout.path, layout.angle);
    for (let i = 0; i < 19; i++) {
      const a = (i / 19) * Math.PI * 2;
      const r = 8.8 + Math.sin(i * 2) * 0.6;
      const x = Math.sin(a) * r,
        z = Math.cos(a) * r;
      if (z > 5.5) continue;
      const trunk = mesh(
        new T.CylinderGeometry(0.1, 0.17, 1.55, 8),
        this.mat("#ac9394"),
        this.environment,
        x,
        0.7,
        z,
      );
      trunk.rotation.z = Math.sin(i) * 0.08;
      if (regionId === 3) {
        for (let j = 0; j < 3; j++)
          mesh(
            new T.ConeGeometry(0.83 - j * 0.16, 1.25, 7),
            this.mat(j === 2 ? "#f4f5ff" : region.leaf),
            this.environment,
            x,
            1.4 + j * 0.55,
            z,
          );
      } else if (regionId === 4) {
        mesh(
          new T.CylinderGeometry(0.32, 0.4, 2.1, 12),
          this.mat("#f4e8d5", 0.1),
          this.environment,
          x,
          1.1,
          z,
        );
        mesh(
          new T.ConeGeometry(0.57, 0.8, 6),
          this.mat("#ac8cbc", 0.2),
          this.environment,
          x,
          2.5,
          z,
        );
        mesh(
          new T.OctahedronGeometry(0.12),
          this.mat("#d4b878", 0.5),
          this.environment,
          x,
          3.05,
          z,
        );
      } else {
        this.orb(this.environment, region.leaf, x, 2.0, z, 0.83, 1.03, 0.83);
        this.orb(this.environment, region.leaf, x + 0.4, 1.68, z + 0.18, 0.58);
        this.orb(this.environment, region.leaf, x - 0.38, 1.75, z - 0.12, 0.54);
      }
    }
    if (regionId === 2) {
      const water = mesh(
        new T.RingGeometry(10.2, 12.5, 80),
        new T.MeshStandardMaterial({
          color: "#7ec9d2",
          transparent: true,
          opacity: 0.68,
          metalness: 0.35,
          roughness: 0.2,
          side: T.DoubleSide,
        }),
        this.environment,
        0,
        -0.16,
        0,
      );
      water.rotation.x = -Math.PI / 2;
      for (let i = 0; i < 10; i++) {
        const a = i * 0.67;
        this.orb(
          this.environment,
          "#c2d9dc",
          Math.sin(a) * 9.9,
          0.09,
          Math.cos(a) * 9.9,
          0.55,
          0.28,
          0.45,
        );
      }
    }
    for (let i = 0; i < 10; i++) {
      const a = i * 2.399,
        r = 7.2,
        x = Math.sin(a) * r,
        z = Math.cos(a) * r;
      if (z > 6) continue;
      if (regionId === 0 || regionId === 1) {
        mesh(
          new T.CylinderGeometry(0.045, 0.06, 0.25, 8),
          this.mat("#e5dacb"),
          this.environment,
          x,
          0.15,
          z,
        );
        this.orb(
          this.environment,
          regionId === 0 ? "#d8a6bd" : "#be91bd",
          x,
          0.31,
          z,
          0.22,
          0.12,
          0.22,
        );
        for (let j = 0; j < 3; j++)
          this.orb(
            this.environment,
            "#fff1db",
            x + Math.cos(j * 2.1) * 0.11,
            0.4,
            z + Math.sin(j * 2.1) * 0.11,
            0.03,
          );
      } else if (regionId === 3) {
        const g = mesh(
          new T.OctahedronGeometry(0.35),
          this.mat("#a0c5da", 0.4, 0.2),
          this.environment,
          x,
          0.48,
          z,
        );
        g.scale.y = 2;
      } else if (regionId === 4) {
        const g = mesh(
          new T.OctahedronGeometry(0.19),
          this.mat("#dfbb70", 0.6),
          this.environment,
          x,
          1.3,
          z,
        );
        g.rotation.z = 0.3;
      }
    }
    for (let i = 0; i < 80; i++) {
      const a = i * 2.4,
        r = 6.8 + Math.sin(i * 7) * 1.4,
        x = Math.sin(a) * r,
        z = Math.cos(a) * r;
      const f = mesh(
        new T.ConeGeometry(0.09, 0.29, 5),
        this.mat(i % 3 ? "#fff1d3" : region.leaf),
        this.environment,
        x,
        0.13,
        z,
      );
      f.rotation.z = Math.sin(i) * 0.35;
    }
    layout.gems.forEach(({ x, z }, index) => {
      const g = new T.Group();
      g.position.set(x, 0.65, z);
      this.environment.add(g);
      mesh(new T.OctahedronGeometry(0.3), this.mat("#c39aed", 0.35, 0.2), g);
      const ring = mesh(
        new T.TorusGeometry(0.35, 0.016, 6, 30),
        this.mat("#e4cba2"),
        g,
      );
      ring.rotation.x = Math.PI / 2;
      this.points.push({ kind: "gem", index, x, z, object: g });
    });
    const rune = new T.Group();
    rune.position.set(layout.rune.x, 0, layout.rune.z);
    this.environment.add(rune);
    mesh(
      new T.CylinderGeometry(0.65, 0.75, 0.16, 6),
      this.mat("#aaa2c4"),
      rune,
      0,
      0.08,
      0,
    );
    for (let i = 0; i < 3; i++) {
      const a = i * 2.09;
      mesh(
        new T.OctahedronGeometry(0.17),
        this.mat(["#e8abca", "#a4d5c5", "#edcf8a"][i], 0.4),
        rune,
        Math.sin(a) * 0.42,
        0.5,
        Math.cos(a) * 0.42,
      );
    }
    this.points.push({ kind: "rune", index: 0, ...layout.rune, object: rune });
    const fairy = createCompanion(regionId);
    fairy.position.set(layout.npc.x, 0.18, layout.npc.z);
    fairy.scale.setScalar(1.3);
    this.environment.add(fairy);
    this.points.push({ kind: "fairy", index: 0, ...layout.npc, object: fairy });
    const portal = new T.Group();
    portal.position.set(layout.portal.x, 1.2, layout.portal.z);
    this.environment.add(portal);
    const ring = mesh(
      new T.TorusGeometry(1, 0.075, 12, 64),
      this.mat("#c7afd8", 0.4),
      portal,
    );
    ring.scale.y = 1.2;
    mesh(
      new T.CircleGeometry(0.95, 48),
      new T.MeshBasicMaterial({
        color: "#cebbee",
        transparent: true,
        opacity: 0.45,
        side: T.DoubleSide,
      }),
      portal,
    );
    for (const side of [-1, 1])
      mesh(
        new T.CylinderGeometry(0.13, 0.2, 1.8, 8),
        this.mat("#ddd4ed"),
        portal,
        side * 1.2,
        -0.3,
        0,
      );
    this.points.push({
      kind: "portal",
      index: 0,
      ...layout.portal,
      object: portal,
    });
    batchGroup(this.environment);
    const marker = new T.Group();
    const destinationDisc = new T.Mesh(
      new T.RingGeometry(0.27, 0.34, 48),
      new T.MeshBasicMaterial({
        color: "#fff6cd",
        side: T.DoubleSide,
        transparent: true,
        opacity: 0.95,
        depthWrite: false,
      }),
    );
    destinationDisc.rotation.x = -Math.PI / 2;
    marker.add(destinationDisc);
    marker.visible = false;
    this.environment.add(marker);
    this.destinationRing = marker;
    this.magicRing = new T.Mesh(
      new T.RingGeometry(0.92, 1, 64),
      new T.MeshBasicMaterial({
        color: "#f9df96",
        transparent: true,
        opacity: 0,
        side: T.DoubleSide,
        depthWrite: false,
      }),
    );
    this.magicRing.rotation.x = -Math.PI / 2;
    this.magicRing.visible = false;
    this.environment.add(this.magicRing);
  }
  get abilities() {
    return adventureAbilities(
      this.outfit,
      this.run ? regionOf(this.run.stage) : -1,
    );
  }
  get magicCooldown() {
    return Math.max(0, this.magicReadyAt - this.time);
  }
  castMagic() {
    if (
      this.mode !== "adventure" ||
      this.paused ||
      this.magicCooldown > 0 ||
      !this.run
    )
      return null;
    const power = this.abilities;
    this.magicReadyAt = this.time + power.cooldown;
    this.magicStartedAt = this.time;
    if (this.magicRing) {
      this.magicRing.position.set(
        this.avatar.position.x,
        0.06,
        this.avatar.position.z,
      );
      this.magicRing.visible = true;
    }
    let collected = 0;
    for (const p of this.points)
      if (
        p.kind === "gem" &&
        !this.run.gems.includes(p.index) &&
        Math.hypot(
          p.x - this.avatar.position.x,
          p.z - this.avatar.position.z,
        ) <= power.spellRadius
      ) {
        this.onGem(p.index);
        p.object.visible = false;
        collected++;
        if (this.destination === p) {
          this.target.copy(this.avatar.position);
          this.destination = null;
        }
      }
    this.happyUntil = this.time + 1.2;
    return collected;
  }
  startRunway(done: () => void) {
    disposeGroup(this.environment);
    this.clear();
    this.mode = "runway";
    this.stop();
    this.run = null;
    this.runwayDone = done;
    this.runwayTime = 0;
    this.camera.fov = 36;
    this.camera.updateProjectionMatrix();
    this.avatar.scale.setScalar(1);
    this.avatar.position.set(0, 0, -2);
    this.avatar.rotation.set(0, 0, 0);
    resetCharacterMotion(this.avatar);
    this.scene.fog = null;
    this.shadowArea(6);
    mesh(
      new T.BoxGeometry(3.1, 0.14, 7.2),
      this.mat("#dbbad4"),
      this.environment,
      0,
      -0.09,
      0,
    );
    for (const side of [-1, 1]) {
      mesh(
        new T.BoxGeometry(0.045, 0.025, 7.2),
        this.mat("#e6cd95"),
        this.environment,
        side * 1.5,
        0.002,
        0,
      );
      mesh(
        new T.CylinderGeometry(0.1, 0.16, 4.5, 16),
        this.mat("#f3e4da"),
        this.environment,
        side * 2,
        2.15,
        -3.4,
      );
      for (let i = 0; i < 7; i++) {
        const z = -3 + i;
        mesh(
          new T.CylinderGeometry(0.15, 0.19, 0.1, 12),
          this.mat("#bca8c9"),
          this.environment,
          side * 1.83,
          0.02,
          z,
        );
        mesh(
          new T.SphereGeometry(0.075, 12, 8),
          new T.MeshBasicMaterial({ color: "#fff1cb" }),
          this.environment,
          side * 1.83,
          0.14,
          z,
        );
      }
    }
    mesh(
      new T.BoxGeometry(3.8, 4.5, 0.1),
      this.mat("#bba6d0"),
      this.environment,
      0,
      2.15,
      -3.65,
    );
    const arch = mesh(
      new T.TorusGeometry(1.45, 0.035, 8, 64, Math.PI),
      this.mat("#f1dba4"),
      this.environment,
      0,
      2,
      -3.5,
    );
    arch.scale.y = 1.25;
    const floor = mesh(
      new T.PlaneGeometry(200, 200),
      new T.ShadowMaterial({ opacity: 0.09 }),
      this.environment,
      0,
      -0.17,
      0,
    );
    floor.rotation.x = -Math.PI / 2;
    batchGroup(this.environment);
  }
  finishRunway() {
    if (this.mode !== "runway") return;
    const done = this.runwayDone;
    this.runwayDone = null;
    this.closet();
    done?.();
  }
  private followCamera(dt: number, snap = false) {
    if (snap || reducedMotion.matches)
      this.cameraAnchor.copy(this.avatar.position);
    else this.cameraAnchor.lerp(this.avatar.position, 1 - Math.exp(-dt * 8));
    const distance = Math.max(1, 0.48 / this.camera.aspect);
    this.camera.position
      .copy(this.cameraAnchor)
      .add(new T.Vector3(0, 7.8 * distance, 10.8 * distance));
    this.camera.lookAt(this.cameraAnchor.x, 0.65, this.cameraAnchor.z - 1.5);
    this.camera.updateMatrixWorld();
  }
  private moveTo(x: number, z: number) {
    const point = clampGround({ x, z });
    this.target.set(point.x, 0, point.z);
    this.destination = null;
    if (this.destinationRing) {
      this.destinationRing.position.set(point.x, 0.045, point.z);
      this.destinationRing.visible = true;
    }
  }
  seek(kind: PointKind, index?: number) {
    if (this.mode !== "adventure" || this.paused) return;
    const point = this.points
      .filter(
        (p) =>
          p.kind === kind &&
          (index === undefined || p.index === index) &&
          !(kind === "gem" && this.run?.gems.includes(p.index)),
      )
      .sort(
        (a, b) =>
          Math.hypot(
            a.x - this.avatar.position.x,
            a.z - this.avatar.position.z,
          ) -
          Math.hypot(
            b.x - this.avatar.position.x,
            b.z - this.avatar.position.z,
          ),
      )[0];
    if (!point) return;
    const distance = Math.hypot(
      point.x - this.avatar.position.x,
      point.z - this.avatar.position.z,
    );
    const approach =
      kind === "gem"
        ? 1
        : Math.max(0, distance - 1.05) / Math.max(distance, 0.001);
    this.moveTo(
      this.avatar.position.x + (point.x - this.avatar.position.x) * approach,
      this.avatar.position.z + (point.z - this.avatar.position.z) * approach,
    );
    this.destination = point;
  }
  setAxis(x: number, z: number) {
    this.touchAxis = { x, z };
  }
  stop() {
    this.keys.clear();
    this.touchAxis = { x: 0, z: 0 };
    this.target.copy(this.avatar.position);
    this.destination = null;
    if (this.destinationRing) this.destinationRing.visible = false;
    this.drag = false;
  }
  private tick(ms: number) {
    const elapsed = (ms - this.last) / 1000;
    if (elapsed < 1 / 30) return;
    const dt = Math.min(elapsed, 0.1);
    this.last = ms;
    if (document.hidden || this.paused || !this.visible) return;
    this.time += dt;
    const t = this.time;
    let isMoving = false;
    this.walkDistance = 0;
    const reduced = reducedMotion.matches;
    if (this.mode === "closet") {
      this.avatar.rotation.y = this.rotate;
      this.avatar.position.y = 0.14 + (reduced ? 0 : Math.sin(t * 1.8) * 0.014);
      this.avatar.rotation.z =
        this.pose === 1 && !reduced
          ? Math.sin(t * 2) * 0.025
          : this.pose === 2
            ? 0.04
            : 0;
      const dist = Math.max(7.2, 4.8 / this.camera.aspect) * this.zoom;
      this.camera.position.set(0.0, 2.24, dist);
      this.camera.lookAt(0, 2.07, 0);
      if (this.pose === 2 && !reduced)
        this.avatar.rotation.y += Math.sin(t * 0.6) * 0.4;
    } else if (this.mode === "runway") {
      this.runwayTime += dt;
      const time = this.runwayTime;
      const before = this.avatar.position.z;
      const smooth = (v: number) => {
        v = T.MathUtils.clamp(v, 0, 1);
        return v * v * (3 - 2 * v);
      };
      if (reduced) {
        this.avatar.position.set(0, 0, 0);
        this.avatar.rotation.y = time < 3 ? 0 : time < 6 ? 0.65 : 0;
      } else if (time < 2.8) {
        this.avatar.position.z = -2 + (3.8 * time) / 2.8;
        this.avatar.rotation.y = 0;
        isMoving = true;
      } else if (time < 4.4) {
        this.avatar.position.z = 1.8;
        this.avatar.rotation.y = Math.PI * 2 * smooth((time - 2.8) / 1.6);
      } else if (time < 5.9) {
        this.avatar.rotation.y = 0;
      } else if (time < 6.3) {
        this.avatar.rotation.y = Math.PI * smooth((time - 5.9) / 0.4);
      } else {
        this.avatar.rotation.y = Math.PI;
        this.avatar.position.z = 1.8 - 3.8 * Math.min(1, (time - 6.3) / 2.7);
        isMoving = time < 9;
      }
      this.walkDistance = Math.abs(this.avatar.position.z - before);
      const distance = Math.max(9, 5.2 / this.camera.aspect);
      this.camera.position.set(0.65, 3.2, distance);
      this.camera.lookAt(0, 1.7, 0);
    } else {
      const x =
        (this.keys.has("d") || this.keys.has("arrowright") ? 1 : 0) -
        (this.keys.has("a") || this.keys.has("arrowleft") ? 1 : 0) +
        this.touchAxis.x;
      const z =
        (this.keys.has("s") || this.keys.has("arrowdown") ? 1 : 0) -
        (this.keys.has("w") || this.keys.has("arrowup") ? 1 : 0) +
        this.touchAxis.z;
      const movement = advanceGround(
        this.avatar.position,
        this.target,
        { x, z },
        dt,
        this.abilities.speed,
      );
      this.avatar.position.set(movement.position.x, 0, movement.position.z);
      this.target.set(movement.target.x, 0, movement.target.z);
      this.walkDistance = movement.distance;
      isMoving = movement.distance > 0.0001;
      if (movement.heading !== null) {
        const desired = new T.Quaternion().setFromAxisAngle(
          T.Object3D.DEFAULT_UP,
          movement.heading,
        );
        this.avatar.quaternion.rotateTowards(desired, dt * 9);
      }
      if (x || z) this.destination = null;
      if (this.destinationRing)
        this.destinationRing.visible =
          !(x || z) && this.avatar.position.distanceTo(this.target) > 0.08;
      this.followCamera(dt);
      let near: WorldPoint | null = null;
      for (const p of this.points) {
        const dist = Math.hypot(
          p.x - this.avatar.position.x,
          p.z - this.avatar.position.z,
        );
        if (p.kind === "gem") {
          p.object.visible = !this.run?.gems.includes(p.index);
          if (p.object.visible && dist < this.abilities.pickupRadius) {
            this.onGem(p.index);
            if (this.destination === p) {
              this.target.copy(this.avatar.position);
              this.destination = null;
              if (this.destinationRing) this.destinationRing.visible = false;
            }
          }
        } else if (dist < INTERACT_RADIUS) near = p;
      }
      const key = near?.kind ?? "";
      if (key !== this.nearKey) {
        this.nearKey = key;
        this.onNear(near);
      }
    }
    animateCharacter(
      this.avatar,
      t,
      isMoving,
      this.mode === "closet"
        ? this.pose
        : this.mode === "runway" &&
            this.runwayTime >= 4.4 &&
            this.runwayTime < 5.9
          ? 1
          : 0,
      this.mode === "closet" ? this.look.x : 0,
      this.mode === "closet" ? this.look.y : 0,
      t < this.happyUntil,
      reduced,
      this.mode === "closet" ? EXPRESSIONS[this.expression] : "neutral",
      this.walkDistance,
    );
    const ready =
      !!this.run &&
      this.run.gems.length === 5 &&
      this.run.puzzle &&
      this.run.friend;
    const motion = reduced ? 0 : t;
    for (const p of this.points) {
      if (p.kind === "gem") {
        p.object.rotation.y = motion * 0.8;
        p.object.position.y = 0.65 + Math.sin(motion * 2 + p.index) * 0.08;
      } else if (p.kind === "fairy")
        p.object.position.y = 0.18 + Math.sin(motion * 3) * 0.045;
      else if (p.kind === "portal" && ready !== this.portalReady) {
        this.portalReady = ready;
        const mat = (p.object.children[1] as T.Mesh)
          .material as T.MeshBasicMaterial;
        mat.color.set(ready ? "#a5ddc3" : "#cebbee");
      }
    }
    if (this.magicRing) {
      const progress = (this.time - this.magicStartedAt) / 0.7;
      this.magicRing.visible = progress >= 0 && progress < 1;
      this.magicRing.scale.setScalar(
        this.abilities.spellRadius * Math.min(1, 0.25 + progress),
      );
      (this.magicRing.material as T.MeshBasicMaterial).opacity =
        0.8 * (1 - progress);
    }
    this.particles.rotation.y = motion * 0.016;
    this.renderer.render(this.scene, this.camera);
    if (this.mode !== "closet") this.onFrame();
    if (this.mode === "runway" && this.runwayTime >= 9) this.finishRunway();
  }
  photo() {
    this.renderer.render(this.scene, this.camera);
    return this.renderer.domElement.toDataURL("image/png");
  }
  diagnostics() {
    return {
      mode: this.mode,
      abilities: this.abilities,
      magicCooldown: this.magicCooldown,
      companion: this.run
        ? REGION_STORIES[regionOf(this.run.stage)].npc.name
        : null,
      runwayTime: this.runwayTime,
      drawCalls: this.renderer.info.render.calls,
      geometries: this.renderer.info.memory.geometries,
      textures: this.renderer.info.memory.textures,
      design: this.avatar.userData.design,
      pose: this.pose,
      ...characterDiagnostics(this.avatar),
      position: { x: this.avatar.position.x, z: this.avatar.position.z },
      target: { x: this.target.x, z: this.target.z },
      heading: this.avatar.rotation.y,
      travelDistance: this.walkDistance,
      camera: this.camera.position.toArray(),
      avatarScreen: this.projectAvatar(),
      points: this.projectPoints(),
    };
  }
  private projectAvatar() {
    const r = this.host.getBoundingClientRect();
    const foot = this.avatar.position.clone().project(this.camera);
    const head = this.avatar.position
      .clone()
      .add(new T.Vector3(0, 3.4 * this.avatar.scale.y, 0))
      .project(this.camera);
    return {
      x: r.left + ((foot.x + 1) * r.width) / 2,
      feetY: r.top + ((1 - foot.y) * r.height) / 2,
      headY: r.top + ((1 - head.y) * r.height) / 2,
    };
  }
  projectPoints() {
    const r = this.host.getBoundingClientRect();
    return this.points.map((p) => {
      const ground = new T.Vector3(p.x, 0, p.z).project(this.camera);
      const center = p.object.position.clone().project(this.camera);
      const labelHeight =
        p.kind === "portal" ? 2.65 : p.kind === "fairy" ? 1.8 : 0.9;
      const label = new T.Vector3(p.x, labelHeight, p.z).project(this.camera);
      return {
        kind: p.kind,
        index: p.index,
        worldX: p.x,
        worldZ: p.z,
        x: r.left + ((ground.x + 1) * r.width) / 2,
        y: r.top + ((1 - ground.y) * r.height) / 2,
        visualX: r.left + ((center.x + 1) * r.width) / 2,
        visualY: r.top + ((1 - center.y) * r.height) / 2,
        labelX: ((label.x + 1) * r.width) / 2,
        labelY: ((1 - label.y) * r.height) / 2,
        visible:
          center.z > -1 &&
          center.z < 1 &&
          Math.abs(center.x) < 0.94 &&
          Math.abs(center.y) < 0.92 &&
          p.object.visible,
      };
    });
  }
}
