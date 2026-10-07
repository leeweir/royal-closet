import * as T from "three";
import {
  createCharacter,
  disposeGroup,
  mesh,
  orb,
  material,
} from "./character";
import { GEM_POSITIONS, REGIONS } from "../simulation/data";
import type { Save, Run } from "../simulation/game";
export type PointKind = "gem" | "rune" | "fairy" | "portal";
export interface WorldPoint {
  kind: PointKind;
  index: number;
  x: number;
  z: number;
  object: T.Group;
}
export class World {
  renderer: T.WebGLRenderer;
  scene = new T.Scene();
  camera = new T.PerspectiveCamera(36, 1, 0.1, 100);
  environment = new T.Group();
  avatar: T.Group;
  particles: T.Points;
  mode: "closet" | "adventure" = "closet";
  points: WorldPoint[] = [];
  target = new T.Vector3();
  keys = new Set<string>();
  paused = false;
  drag = false;
  rotate = 0;
  zoom = 1;
  pose = 0;
  last = 0;
  time = 0;
  run: Run | null = null;
  onNear: (p: WorldPoint | null) => void = () => {};
  onGem: (i: number) => void = () => {};
  onError: () => void = () => {};
  private nearKey = "";
  private pointer = { x: 0, y: 0, moved: false };
  private ray = new T.Raycaster();
  private touchAxis = { x: 0, z: 0 };
  private ro: ResizeObserver;
  constructor(
    public host: HTMLElement,
    s: Save,
  ) {
    this.renderer = new T.WebGLRenderer({
      antialias: true,
      alpha: true,
      preserveDrawingBuffer: true,
      powerPreference: "high-performance",
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.6));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = T.PCFSoftShadowMap;
    this.renderer.outputColorSpace = T.SRGBColorSpace;
    this.renderer.toneMapping = T.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    this.renderer.setClearColor(0, 0);
    this.renderer.domElement.setAttribute(
      "aria-label",
      "可拖动旋转的 3D 公主；冒险时点击地面移动",
    );
    host.append(this.renderer.domElement);
    this.scene.add(new T.HemisphereLight("#fff6eb", "#a6a2c1", 2.5));
    const sun = new T.DirectionalLight("#fff5e7", 3);
    sun.position.set(4, 8, 5);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.left = -12;
    sun.shadow.camera.right = 12;
    sun.shadow.camera.top = 12;
    sun.shadow.camera.bottom = -12;
    sun.shadow.normalBias = 0.04;
    this.scene.add(sun);
    const fill = new T.DirectionalLight("#ded7ff", 1.2);
    fill.position.set(-5, 3, -3);
    this.scene.add(fill);
    this.scene.add(this.environment);
    this.avatar = createCharacter(s);
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
      this.pointer = { x: e.clientX, y: e.clientY, moved: false };
      this.drag = true;
      el.setPointerCapture(e.pointerId);
    });
    el.addEventListener("pointermove", (e) => {
      if (!this.drag || this.paused) return;
      const dx = e.clientX - this.pointer.x;
      if (Math.abs(dx) > 2 || Math.abs(e.clientY - this.pointer.y) > 2)
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
        const hit = new T.Vector3();
        this.ray.ray.intersectPlane(
          new T.Plane(new T.Vector3(0, 1, 0), 0),
          hit,
        );
        if (hit)
          this.target.set(
            T.MathUtils.clamp(hit.x, -7.8, 7.8),
            0,
            T.MathUtils.clamp(hit.z, -7.8, 7.8),
          );
      }
      this.drag = false;
    });
    el.addEventListener("pointercancel", () => (this.drag = false));
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
      this.keys.clear();
      this.touchAxis = { x: 0, z: 0 };
    });
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) this.keys.clear();
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
    const old = this.avatar;
    this.avatar = createCharacter(s);
    this.avatar.position.copy(old.position);
    this.avatar.rotation.copy(old.rotation);
    this.avatar.scale.copy(old.scale);
    this.scene.remove(old);
    disposeGroup(old);
    this.scene.add(this.avatar);
  }
  clear() {
    this.environment.clear();
    this.points = [];
  }
  closet() {
    disposeGroup(this.environment);
    this.clear();
    this.mode = "closet";
    this.run = null;
    this.rotate = -0.13;
    this.zoom = 1;
    this.avatar.position.set(0, 0.14, 0);
    this.avatar.scale.setScalar(1);
    this.avatar.rotation.set(0, 0, 0);
    this.scene.fog = null;
    mesh(
      new T.CylinderGeometry(1.25, 1.3, 0.13, 96),
      material("#eee5f5", 0.2),
      this.environment,
      0,
      0.055,
      0,
    );
    const gold = mesh(
      new T.TorusGeometry(1.25, 0.012, 8, 96),
      material("#ceb887", 0.6),
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
    const curve = new T.EllipseCurve(0, 2.0, 1.56, 1.8, 0, Math.PI, false, 0);
    const p = curve.getPoints(70).map((v) => new T.Vector3(v.x, v.y, -0.88));
    p.unshift(new T.Vector3(1.56, 0.05, -0.88));
    p.push(new T.Vector3(-1.56, 0.05, -0.88));
    mesh(
      new T.TubeGeometry(new T.CatmullRomCurve3(p), 100, 0.023, 8, false),
      material("#d4c095", 0.3),
      this.environment,
    );
    for (const side of [-1, 1]) {
      mesh(
        new T.CylinderGeometry(0.09, 0.1, 2.45, 24),
        material("#f6f1f6"),
        this.environment,
        side * 1.85,
        1.22,
        -1.2,
      );
      for (const y of [0.1, 2.4])
        mesh(
          new T.CylinderGeometry(0.17, 0.17, 0.1, 24),
          material("#e2d6ca"),
          this.environment,
          side * 1.85,
          y,
          -1.2,
        );
      for (let i = 0; i < 12; i++) {
        const a = i * 2.4;
        orb(
          this.environment,
          i % 3 ? "#e5c6df" : "#cab6d7",
          side * (1.72 + Math.sin(a) * 0.16),
          0.25 + i * 0.12,
          -1.05 + Math.cos(a) * 0.1,
          0.095,
        );
      }
    }
    for (let i = 0; i < 7; i++) {
      const a = i * 0.9;
      mesh(
        new T.OctahedronGeometry(0.045, 0),
        material("#ddc790", 0.6),
        this.environment,
        Math.sin(a) * 1.4,
        3.1 + Math.cos(a) * 0.44,
        -0.45,
      );
    }
    this.resize();
  }
  adventure(run: Run) {
    disposeGroup(this.environment);
    this.clear();
    this.mode = "adventure";
    this.run = run;
    this.nearKey = "";
    const regionId = Math.min(4, Math.floor(run.stage / 4));
    const region = REGIONS[regionId];
    this.avatar.scale.setScalar(0.59);
    this.avatar.position.set(0, 0, 6);
    this.target.copy(this.avatar.position);
    this.avatar.rotation.set(0, Math.PI, 0);
    this.scene.fog = new T.Fog("#ece8f2", 35, 70);
    mesh(
      new T.CylinderGeometry(11, 10.4, 0.5, 80),
      material(region.ground),
      this.environment,
      0,
      -0.27,
      0,
    );
    mesh(
      new T.CylinderGeometry(10.8, 8.6, 1.8, 40),
      material("#b9b0c8"),
      this.environment,
      0,
      -1.32,
      0,
    );
    for (let i = 0; i < 18; i++) {
      const z = 6.5 - i * 0.76;
      const tile = mesh(
        new T.CylinderGeometry(0.57, 0.6, 0.025, 7),
        material(i % 2 ? "#f4efe7" : "#e7dfd7"),
        this.environment,
        Math.sin(i * 0.73) * 0.45,
        0.017,
        z,
      );
      tile.rotation.y = i * 0.53;
    }
    for (let i = 0; i < 19; i++) {
      const a = (i / 19) * Math.PI * 2;
      const r = 8.8 + Math.sin(i * 2) * 0.6;
      const x = Math.sin(a) * r,
        z = Math.cos(a) * r;
      if (z > 5.5) continue;
      const trunk = mesh(
        new T.CylinderGeometry(0.1, 0.17, 1.55, 8),
        material("#ac9394"),
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
            material(j === 2 ? "#f4f5ff" : region.leaf),
            this.environment,
            x,
            1.4 + j * 0.55,
            z,
          );
      } else if (regionId === 4) {
        mesh(
          new T.CylinderGeometry(0.32, 0.4, 2.1, 12),
          material("#f4e8d5", 0.1),
          this.environment,
          x,
          1.1,
          z,
        );
        mesh(
          new T.ConeGeometry(0.57, 0.8, 6),
          material("#ac8cbc", 0.2),
          this.environment,
          x,
          2.5,
          z,
        );
        mesh(
          new T.OctahedronGeometry(0.12),
          material("#d4b878", 0.5),
          this.environment,
          x,
          3.05,
          z,
        );
      } else {
        orb(this.environment, region.leaf, x, 2.0, z, 0.83, 1.03, 0.83);
        orb(this.environment, region.leaf, x + 0.4, 1.68, z + 0.18, 0.58);
        orb(this.environment, region.leaf, x - 0.38, 1.75, z - 0.12, 0.54);
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
        orb(
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
          material("#e5dacb"),
          this.environment,
          x,
          0.15,
          z,
        );
        const cap = orb(
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
          orb(
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
          material("#a0c5da", 0.4, 0.2),
          this.environment,
          x,
          0.48,
          z,
        );
        g.scale.y = 2;
      } else if (regionId === 4) {
        const g = mesh(
          new T.OctahedronGeometry(0.19),
          material("#dfbb70", 0.6),
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
        material(i % 3 ? "#fff1d3" : region.leaf),
        this.environment,
        x,
        0.13,
        z,
      );
      f.rotation.z = Math.sin(i) * 0.35;
    }
    GEM_POSITIONS.forEach(([baseX, baseZ], index) => {
      const angle = ((run.stage % 4) * Math.PI) / 2;
      const x = baseX * Math.cos(angle) - baseZ * Math.sin(angle),
        z = baseX * Math.sin(angle) + baseZ * Math.cos(angle);
      const g = new T.Group();
      g.position.set(x, 0.65, z);
      this.environment.add(g);
      mesh(new T.OctahedronGeometry(0.3), material("#c39aed", 0.35, 0.2), g);
      const ring = mesh(
        new T.TorusGeometry(0.35, 0.016, 6, 30),
        material("#e4cba2"),
        g,
      );
      ring.rotation.x = Math.PI / 2;
      this.points.push({ kind: "gem", index, x, z, object: g });
    });
    const rune = new T.Group();
    rune.position.set(-5, 0, -4);
    this.environment.add(rune);
    mesh(
      new T.CylinderGeometry(0.65, 0.75, 0.16, 6),
      material("#aaa2c4"),
      rune,
      0,
      0.08,
      0,
    );
    for (let i = 0; i < 3; i++) {
      const a = i * 2.09;
      mesh(
        new T.OctahedronGeometry(0.17),
        material(["#e8abca", "#a4d5c5", "#edcf8a"][i], 0.4),
        rune,
        Math.sin(a) * 0.42,
        0.5,
        Math.cos(a) * 0.42,
      );
    }
    this.points.push({ kind: "rune", index: 0, x: -5, z: -4, object: rune });
    const fairy = new T.Group();
    fairy.position.set(5, 1.2, 5);
    fairy.scale.setScalar(1.3);
    this.environment.add(fairy);
    orb(fairy, "#fff0bf", 0, 0, 0, 0.18);
    for (const side of [-1, 1]) {
      const w = orb(
        fairy,
        "#f3d4e7",
        side * 0.23,
        0.07,
        -0.04,
        0.25,
        0.12,
        0.055,
      );
      w.rotation.z = side * 0.5;
    }
    this.points.push({ kind: "fairy", index: 0, x: 5, z: 5, object: fairy });
    const portal = new T.Group();
    portal.position.set(0, 1.2, -7.4);
    this.environment.add(portal);
    const ring = mesh(
      new T.TorusGeometry(1, 0.075, 12, 64),
      material("#c7afd8", 0.4),
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
        material("#ddd4ed"),
        portal,
        side * 1.2,
        -0.3,
        0,
      );
    this.points.push({
      kind: "portal",
      index: 0,
      x: 0,
      z: -7.4,
      object: portal,
    });
    this.resize();
  }
  setAxis(x: number, z: number) {
    this.touchAxis = { x, z };
  }
  stop() {
    this.keys.clear();
    this.touchAxis = { x: 0, z: 0 };
    this.target.copy(this.avatar.position);
  }
  private tick(ms: number) {
    const elapsed = (ms - this.last) / 1000;
    if (elapsed < 1 / 30) return;
    const dt = Math.min(elapsed, 0.1);
    this.last = ms;
    if (document.hidden || this.paused || this.host.closest("[hidden]")) return;
    this.time += dt;
    const t = this.time;
    if (this.mode === "closet") {
      this.avatar.rotation.y = this.rotate;
      this.avatar.position.y =
        0.14 +
        (matchMedia("(prefers-reduced-motion: reduce)").matches
          ? 0
          : Math.sin(t * 1.8) * 0.014);
      this.avatar.rotation.z =
        this.pose === 1 ? Math.sin(t * 2) * 0.025 : this.pose === 2 ? 0.04 : 0;
      const dist = (this.camera.aspect < 0.8 ? 7.0 : 6.6) * this.zoom;
      this.camera.position.set(0.0, 2.08, dist);
      this.camera.lookAt(0, 1.84, 0);
    } else {
      this.camera.position.set(10, 15, 18);
      const distance = this.camera.aspect < 0.85 ? 1.48 : 1;
      this.camera.position.multiplyScalar(distance);
      this.camera.lookAt(0, 0, 0);
      if (!this.paused) {
        let x =
          (this.keys.has("d") || this.keys.has("arrowright") ? 1 : 0) -
          (this.keys.has("a") || this.keys.has("arrowleft") ? 1 : 0) +
          this.touchAxis.x;
        let z =
          (this.keys.has("s") || this.keys.has("arrowdown") ? 1 : 0) -
          (this.keys.has("w") || this.keys.has("arrowup") ? 1 : 0) +
          this.touchAxis.z;
        const direction = new T.Vector3();
        if (x || z) {
          direction.set(x, 0, z).normalize();
          this.target.copy(this.avatar.position);
        } else direction.copy(this.target).sub(this.avatar.position).setY(0);
        const moving = direction.length() > 0.08;
        if (moving) {
          const step = Math.min(direction.length(), dt * 3.8);
          direction.normalize();
          this.avatar.position.addScaledVector(direction, step);
          this.avatar.position.x = T.MathUtils.clamp(
            this.avatar.position.x,
            -7.8,
            7.8,
          );
          this.avatar.position.z = T.MathUtils.clamp(
            this.avatar.position.z,
            -7.8,
            7.8,
          );
          this.avatar.rotation.y = Math.atan2(direction.x, direction.z);
          this.avatar.position.y = Math.abs(Math.sin(t * 11)) * 0.08;
        } else this.avatar.position.y = 0;
        let near: WorldPoint | null = null;
        for (const p of this.points) {
          const dist = Math.hypot(
            p.x - this.avatar.position.x,
            p.z - this.avatar.position.z,
          );
          if (p.kind === "gem") {
            p.object.visible = !this.run?.gems.includes(p.index);
            if (p.object.visible && dist < 0.78) this.onGem(p.index);
          } else if (dist < 1.5) near = p;
        }
        const key = near?.kind ?? "";
        if (key !== this.nearKey) {
          this.nearKey = key;
          this.onNear(near);
        }
      }
    }
    this.points.forEach((p) => {
      if (p.kind === "gem") {
        p.object.rotation.y = t * 0.8;
        p.object.position.y = 0.65 + Math.sin(t * 2 + p.index) * 0.08;
      }
      if (p.kind === "fairy") {
        p.object.position.y = 1.2 + Math.sin(t * 3) * 0.13;
      }
      if (p.kind === "portal" && this.run) {
        const mat = (p.object.children[1] as T.Mesh)
          .material as T.MeshBasicMaterial;
        mat.color.set(
          this.run.gems.length === 5 && this.run.puzzle && this.run.friend
            ? "#a5ddc3"
            : "#cebbee",
        );
      }
    });
    this.particles.rotation.y = t * 0.016;
    this.renderer.render(this.scene, this.camera);
  }
  photo() {
    this.renderer.render(this.scene, this.camera);
    return this.renderer.domElement.toDataURL("image/png");
  }
  diagnostics() {
    return {
      mode: this.mode,
      drawCalls: this.renderer.info.render.calls,
      geometries: this.renderer.info.memory.geometries,
      position: { x: this.avatar.position.x, z: this.avatar.position.z },
      points: this.points.map((p) => {
        const v = new T.Vector3(p.x, 0, p.z).project(this.camera);
        const r = this.host.getBoundingClientRect();
        return {
          kind: p.kind,
          index: p.index,
          x: r.left + ((v.x + 1) * r.width) / 2,
          y: r.top + ((1 - v.y) * r.height) / 2,
        };
      }),
    };
  }
}
