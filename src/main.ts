import "./style.css";
import "./atelier.css";
import "./adventure.css";
import {
  createLights,
  toggleLights,
  solveLights,
  memorySequence,
  puzzleKind,
} from "./simulation/puzzles";
import {
  categories,
  ITEMS,
  ITEM,
  REGIONS,
  STAGE_COUNT,
  regionOf,
  THEMES,
  SERIES,
  type Category,
} from "./simulation/data";
import {
  validateSave,
  level,
  nextStage,
  regionUnlocked,
  equip,
  craft,
  contest,
  styleScore,
  login,
  QUESTS,
  ACHIEVEMENTS,
  claim,
  createRun,
  collect,
  finishRun,
  exchange,
  refreshDay,
  adventureBonus,
  type Save,
  type Run,
} from "./simulation/game";
import {
  COLLECTIONS,
  equipCollection,
  REGION_STORIES,
  stageName,
  adventureAbilities,
  itemAbility,
} from "./simulation/adventure";
import type { World, WorldPoint, PointKind } from "./render/world";
import { icon, itemArt } from "./ui";
import { loadSave, storeSave, readBackup, onExternalSave } from "./storage";
import { FittingRoom } from "./simulation/fitting";
import "./fitting.css";
const loaded = loadSave();
let save: Save = loaded.save;
const fitting = new FittingRoom();
function visibleSave(): Save {
  return { ...save, ...fitting.appearance(save) };
}
function endFitting() {
  if (!fitting.active) return;
  fitting.end();
  world?.updateOutfit(save);
  document.querySelector("#save-status")!.textContent = "已恢复正式搭配";
}
function refreshFitting() {
  clearTimeout(toastTimer);
  document.querySelector("#toast")!.classList.remove("show");
  world?.updateOutfit(visibleSave());
  renderCloset();
  updateCaption();
}
const storageWarning = loaded.warning;
let lightState: boolean[] = [],
  timingHits = 0,
  timingPosition = 0,
  timingLast = 0;
let screen = "closet",
  category: Category = "dress",
  filter = "all",
  selectedRegion = 0,
  selectedTheme = 0,
  run: Run | null = null,
  near: WorldPoint | null = null,
  modalId = 0,
  puzzleInput: number[] = [],
  puzzleReady = false,
  toastTimer = 0;
// The wardrobe opens on the set tab, which is the way most players dress.
let closetSets = true;
let setFilter = "all" as "all" | "owned";
let runwayEntry: { theme: number; outfit: Save["outfit"] } | null = null;
let craftPage = 0,
  journalPage = 0,
  journalTab = "daily";
const craftPageSize = () => (matchMedia("(max-width:600px)").matches ? 2 : 4);
function pages(action: string, page: number, total: number) {
  return `<div class="page-controls"><button class="soft-button" data-action="${action}" data-id="${page - 1}" ${page === 0 ? "disabled" : ""}>${icon("chevron-left")} 上一页</button><span>${page + 1} / ${total}</span><button class="soft-button" data-action="${action}" data-id="${page + 1}" ${page >= total - 1 ? "disabled" : ""}>下一页 ${icon("chevron-right")}</button></div>`;
}
let audio: AudioContext | null = null;
const app = document.querySelector<HTMLDivElement>("#app")!;
app.innerHTML = `<div class="app-shell"><header class="topbar"><a class="brand" href="#" aria-label="星愿衣橱首页"><span class="brand-mark">${icon("crown")}</span><span><b>星愿衣橱</b><small>Starlight Atelier</small></span></a><div class="top-right"><div class="currencies" id="currencies"></div><button class="icon-button gift-button" data-action="login" aria-label="每日星愿礼物">${icon("gift")}<span class="notification-dot" id="gift-dot"></span></button><button class="icon-button" data-action="settings" aria-label="设置与存档">${icon("settings")}</button></div></header><div class="app-body"><nav class="sidebar" aria-label="游戏导航">${[
  ["closet", "shirt", "我的衣橱"],
  ["map", "compass", "星愿冒险"],
  ["contest", "sparkles", "搭配舞会"],
  ["craft", "wand-sparkles", "织梦工坊"],
  ["journal", "book-open", "冒险手帐"],
]
  .map(
    ([id, ic, label]) =>
      `<button class="nav-button" data-action="nav" data-id="${id}" aria-label="${label}">${icon(ic)}<span>${label}</span><b class="nav-dot"></b></button>`,
  )
  .join(
    "",
  )}<div class="sidebar-bottom"><span>✧</span><small>把童话<br>穿在身上</small></div></nav><main id="main"><div id="world-wrap" class="world-wrap"><div class="scene-heading"><h1>今天，也要闪闪发光。</h1><p>换上心爱的裙装，去遇见新的故事。</p></div><div id="world" aria-busy="true"><div class="model-loading" role="status"><span class="loading-silhouette"></span><p>公主正在整理裙摆…</p></div></div><div class="scene-tools"><button data-action="rotate" class="icon-button" aria-label="重置视角">${icon("rotate-ccw")}</button><button data-action="expression" class="icon-button" aria-label="切换表情，当前自然" title="切换表情">${icon("smile")}</button><button data-action="pose" class="icon-button" aria-label="切换公主姿势">${icon("heart")}</button><button data-action="photo" class="icon-button" aria-label="拍照下载">${icon("camera")}</button></div><div class="scene-caption" id="scene-caption"></div><div class="drag-hint">${icon("refresh-cw")} 拖动旋转，轻点公主会微笑</div><div id="adventure-hud"></div></div><section id="content"></section></main></div><footer class="footer"><span>✧ 每一份想象，都值得闪耀</span><span id="save-status">进度自动保存在此浏览器</span><button data-action="help">玩法指南 ${icon("info")}</button></footer></div><div id="toast" role="status" aria-live="polite"></div><dialog id="modal" aria-labelledby="modal-title"><button class="modal-close icon-button" data-action="close" aria-label="关闭">${icon("x")}</button><div id="modal-content"></div></dialog><input id="import-input" type="file" accept=".json,application/json" hidden>`;
let world: World | null = null;
let modelStatus: "loading" | "ready" | "error" = "loading";
const expressionNames = ["自然", "开心", "温柔", "惊喜", "俏皮"];
async function bootWorld() {
  const host = document.querySelector<HTMLElement>("#world")!;
  modelStatus = "loading";
  host.setAttribute("aria-busy", "true");
  host.innerHTML = `<div class="model-loading" role="status"><span class="loading-silhouette"></span><p>公主正在整理裙摆…</p></div>`;
  document
    .querySelectorAll<HTMLButtonElement>(".scene-tools button")
    .forEach((button) => (button.disabled = true));
  try {
    const { World } = await import("./render/world");
    world = await World.create(host, save);
    // A save can change while the model is downloading (equip, import, tabs).
    world.updateOutfit(visibleSave());
    world.visible = !wrap.hidden;
    world.paused = dialog.open;
    world.onGem = (i) => {
      if (run && collect(run, i)) {
        sound(660 + i * 90);
        renderHUD();
        persist();
      }
    };
    world.onNear = (p) => {
      near = p;
      renderHUD();
    };
    world.onFrame = () =>
      screen === "runway" ? updateRunwayHUD() : positionWorldLabels();
    world.onError = () =>
      toast("3D 画面暂时中断，请在设置中导出进度后刷新页面。");
    host.querySelector(".model-loading")?.remove();
    host.setAttribute("aria-busy", "false");
    document
      .querySelectorAll<HTMLButtonElement>(".scene-tools button")
      .forEach((button) => (button.disabled = false));
    modelStatus = "ready";
  } catch (error) {
    console.error("Princess load failed", error);
    modelStatus = "error";
    host.setAttribute("aria-busy", "false");
    host.innerHTML = `<div class="webgl-fallback" role="status">${icon("sparkles")}<h2>公主还没准备好</h2><p>请检查网络与浏览器图形加速后重试。衣橱进度已保留。</p><button class="soft-button" data-action="retry-model">重新加载</button></div>`;
  }
}
void bootWorld();
const content = document.querySelector<HTMLElement>("#content")!,
  main = document.querySelector<HTMLElement>("#main")!,
  wrap = document.querySelector<HTMLElement>("#world-wrap")!,
  dialog = document.querySelector<HTMLDialogElement>("#modal")!;
function persist() {
  document.querySelector("#save-status")!.textContent = storeSave(save)
    ? fitting.active
      ? "正式进度已保存 · 试穿不保存"
      : "进度已自动保存"
    : "无法自动保存，请在设置中导出存档";
  renderTop();
}
function sound(freq = 620) {
  if (!save.sound) return;
  try {
    audio ??= new AudioContext();
    void audio.resume();
    const o = audio.createOscillator(),
      g = audio.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(freq, audio.currentTime);
    g.gain.setValueAtTime(0.07, audio.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + 0.3);
    o.connect(g);
    g.connect(audio.destination);
    o.start();
    o.stop(audio.currentTime + 0.3);
  } catch {}
}
function toast(msg: string) {
  const el = document.querySelector("#toast")!;
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => el.classList.remove("show"), 2800);
}
function renderTop() {
  document.querySelector("#currencies")!.innerHTML =
    `<span class="level-pill">Lv. ${level(save)}</span><span class="currency">${icon("coins")}<b>${save.coins.toLocaleString()}</b><small>金币</small></span><span class="currency gem">${icon("gem")}<b>${save.gems.toLocaleString()}</b><small>星晶</small></span>`;
  document.querySelector<HTMLElement>("#gift-dot")!.hidden =
    save.loginDate === save.daily.date;
}
function title(kicker: string, title: string, desc: string, extra = "") {
  return `<div class="section-heading"><div><span class="eyebrow">${kicker}</span><h2>${title}</h2><p>${desc}</p></div>${extra}</div>`;
}
function updateCaption() {
  const look = visibleSave();
  const i = ITEM[look.outfit.dress];
  main.classList.toggle("is-fitting", screen === "closet" && fitting.active);
  document.querySelector(".scene-heading h1")!.textContent = fitting.active
    ? "试穿效果 · 不会保存"
    : "今天，也要闪闪发光。";
  document.querySelector(".scene-heading p")!.textContent = fitting.active
    ? "转一转看看细节，退出后恢复原搭配。"
    : "换上心爱的裙装，去遇见新的故事。";
  if (fitting.active)
    document.querySelector("#save-status")!.textContent =
      "试穿仅供预览，不会保存";
  document.querySelector("#scene-caption")!.innerHTML =
    `<h2>${i.name}</h2><div class="stars">${"✦".repeat(i.rarity)}<span>${i.style}风格</span><span>${fitting.active ? "试穿预览" : look.dye ? "专属染色" : "星愿系列"}</span></div>`;
}
function render() {
  refreshDay(save);
  document.querySelectorAll<HTMLElement>(".nav-button").forEach((b) => {
    b.classList.toggle("active", b.dataset.id === screen);
    if (b.dataset.id === screen) b.setAttribute("aria-current", "page");
    else b.removeAttribute("aria-current");
  });
  main.className = `screen-${screen}`;
  wrap.hidden = !["closet", "contest", "adventure", "runway"].includes(screen);
  if (world) world.visible = !wrap.hidden;
  content.hidden = screen === "adventure" || screen === "runway";
  if (screen !== "adventure" && screen !== "runway")
    document.querySelector("#adventure-hud")!.innerHTML = "";
  if (screen === "closet") renderCloset();
  if (screen === "map") renderMap();
  if (screen === "craft") renderCraft();
  if (screen === "contest") renderContest();
  if (screen === "journal") renderJournal();
  updateCaption();
  renderTop();
  if (world) requestAnimationFrame(() => world!.resize());
}
const DYES = [
  ["#b7a0df", "薰衣草紫"],
  ["#eeb1c5", "樱花粉"],
  ["#8abdab", "薄荷绿"],
  ["#83bfe0", "湖水蓝"],
  ["#f5e7c9", "奶油白"],
  ["#596eab", "星夜蓝"],
];
function renderCloset() {
  const look = visibleSave();
  const list = ITEMS.filter(
    (i) =>
      i.category === category &&
      (filter === "all" || save.owned.includes(i.id)),
  );
  const heading = `<div class="wardrobe-header"><div><h2>我的衣橱 <span>${save.owned.length}<em> / ${ITEMS.length}</em></span></h2></div><div class="wardrobe-actions"><button class="soft-button compact fitting-toggle" data-action="fitting" aria-pressed="${fitting.active}">${icon("shirt")} ${fitting.active ? "退出试穿" : "试穿模式"}</button><button class="soft-button compact" data-action="slots" ${fitting.active ? 'disabled title="试穿搭配不能收藏，请先退出试穿"' : ""}>${icon("bookmark")} 搭配收藏</button></div></div><div class="category-tabs" role="group" aria-label="服饰分类"><button class="category ${closetSets ? "active" : ""}" data-action="sets" aria-pressed="${closetSets}">${icon("sparkles")}<span>套装</span></button>${categories.map((c) => `<button class="category ${!closetSets && category === c.id ? "active" : ""}" data-action="category" data-id="${c.id}" aria-pressed="${!closetSets && category === c.id}">${icon(c.icon)}<span>${c.name}</span></button>`).join("")}</div>`;
  if (closetSets) {
    const sets = COLLECTIONS.filter(
      (set) =>
        setFilter === "all" ||
        set.items.every((id) => save.owned.includes(id)),
    );
    const complete = COLLECTIONS.filter((set) =>
      set.items.every((id) => save.owned.includes(id)),
    ).length;
    content.innerHTML = `${heading}<div class="wardrobe-filter"><span>${fitting.active ? "试穿不保存 · 离开衣橱恢复" : "一键换齐六件 · 未拥有也可试穿"}</span><span class="filter-actions">已集齐 ${complete} / ${COLLECTIONS.length}<button data-action="set-filter">${setFilter === "all" ? "全部套装" : "已拥有"} ${icon("chevron-right")}</button></span></div><div class="items-grid collection-grid">${sets
      .map((set) => {
        const owned = set.items.filter((id) => save.owned.includes(id)).length;
        const active = set.items.every(
          (id) => look.outfit[ITEM[id].category] === id,
        );
        const dress = ITEM[`dress-${set.id}`];
        return `<div class="hanger"><button class="item-card collection-card ${active ? "selected" : ""} ${owned === 6 ? "" : "locked"}" data-action="equip-set" data-id="${set.id}" aria-pressed="${active}" aria-label="${set.name}套装，已拥有 ${owned}/6 件"><span class="item-status">${icon(active ? "check" : owned === 6 ? "sparkles" : "lock")}</span><div class="item-visual">${itemArt(dress)}<span class="set-seal">6 件套</span></div><span class="item-name">${set.name}</span><span class="item-stars"><small>${dress.style}</small></span><span class="collection-progress">${active ? (fitting.active ? "正在试穿 · 不保存" : "正在穿着") : owned === 6 ? (fitting.active ? "试穿整套" : "一键穿上") : `试穿 · 已集齐 ${owned}/6`}</span></button></div>`;
      })
      .join("")}</div>${sets.length ? "" : `<p class="empty-note">还没有集齐任何一套。未集齐的单品可在织梦工坊制作。</p>`}<div class="collection-note">${icon("wand-sparkles")} 成套穿搭，也有不同的冒险能力。<button class="text-button" data-action="abilities">查看当前能力</button></div><button class="adventure-teaser" data-action="nav" data-id="map"><span class="teaser-icon">${icon("compass")}</span><span><b>穿上整套心动，向童话出发</b><small>未集齐的单品可在织梦工坊制作</small></span>${icon("chevron-right")}</button>`;
    return;
  }
  content.innerHTML = `${heading}<div class="wardrobe-filter"><span>${fitting.active ? "试穿不保存 · 离开衣橱恢复" : "轻点换装 · 未拥有可试穿"}</span><button data-action="filter">${filter === "all" ? "全部服饰" : "已拥有"} ${icon("chevron-right")}</button></div><div class="items-grid">${list
    .map((i) => {
      const owned = save.owned.includes(i.id),
        active = look.outfit[category] === i.id;
      return `<div class="hanger"><button class="item-card ${active ? "selected" : ""} ${owned ? "" : "locked"}" data-action="equip" data-id="${i.id}" title="${itemAbility(i.category, i.id)}" aria-label="${i.name}${owned ? "" : "，未拥有，可试穿"}" aria-pressed="${active}"><span class="item-status">${active ? icon("check") : !owned ? icon("lock") : ""}</span><div class="item-visual" style="--item-color:${i.color}">${itemArt(i)}</div><span class="item-name">${i.name}</span><span class="item-stars">${"✦".repeat(i.rarity)}<small>${i.style}</small></span>${!owned ? '<span class="unlock-label">可试穿</span>' : ""}</button></div>`;
    })
    .join(
      "",
    )}</div><div class="dye-row"><span>${icon("palette")} 染色</span>${DYES.map(([c, name]) => `<button class="swatch ${look.dye === c ? "active" : ""}" aria-pressed="${look.dye === c}" style="--swatch:${c}" data-action="dye" data-id="${c}" aria-label="染成${name}" title="${name}"></button>`).join("")}<button class="reset-dye" data-action="dye" data-id="reset" aria-label="恢复服装原色">${icon("rotate-ccw")}</button></div><button class="adventure-teaser" data-action="nav" data-id="map"><span class="teaser-icon">${icon("compass")}</span><span><b>衣橱之外，还有整个童话世界</b><small>去冒险收集材料，制作新衣</small></span>${icon("chevron-right")}</button>`;
}
function renderMap() {
  const current = nextStage(save),
    unlocked = regionUnlocked(save),
    reg = REGIONS[selectedRegion];
  content.innerHTML = `${title("五个国度 · 二十段故事", "星愿冒险", "收集星光、结识精灵，寻找藏在远方的衣橱灵感。", `<span class="progress-chip">${icon("compass")} 故事进度 ${save.completed.length} / ${STAGE_COUNT}</span>`)}<div class="map-layout"><div class="kingdom-map"><div class="map-topline"><span>星愿王国 · 旅途地图</span><span>✧</span></div><div class="map-nodes">${REGIONS.map((r, i) => `<button class="map-node node-${i} ${selectedRegion === i ? "selected" : ""} ${i > unlocked ? "locked" : ""}" data-action="region" data-id="${i}"><span>${icon(i > unlocked ? "lock" : r.icon)}</span><b>${r.name}</b><small>${i > unlocked ? "等待探索" : `${save.completed.filter((s) => regionOf(s) === i).length}/4`}</small></button>`).join("")}</div><div class="map-note">五个国度，一场属于你的星愿旅程</div></div><div class="region-detail" style="--region:${reg.color}"><span class="region-badge">${icon(reg.icon)}</span><span class="eyebrow">第 0${selectedRegion + 1} 章</span><h2>${reg.name}</h2><p>${reg.story}</p><div class="region-style">${icon("shirt")} 灵感风格 <b>${reg.style}</b></div><p class="affinity-note">每件同风格服饰 +8 金币，每两件 +1 织梦丝</p><div class="stage-list">${REGION_STORIES[
    selectedRegion
  ].stages
    .map((name, i) => {
      const st = selectedRegion * 4 + i,
        done = save.completed.includes(st),
        locked = st > current;
      return `<button class="stage-button ${done ? "done" : st === current ? "current" : ""}" data-action="start" data-id="${st}" ${locked ? "disabled" : ""}><span class="stage-number">${done ? icon("check") : String(i + 1).padStart(2, "0")}</span><span><b>${name}</b><small>${done ? "再次探索 · 仍可获得奖励" : locked ? "完成前一关解锁" : "采集 · 奇遇 · 符文解谜"}</small></span>${icon(locked ? "lock" : "chevron-right")}</button>`;
    })
    .join(
      "",
    )}</div><div class="region-reward">${icon("gift")} 章节纪念：${reg.reward}</div>${current >= STAGE_COUNT ? `<button class="primary-button" data-action="start" data-id="${STAGE_COUNT}">无尽星愿 · 自由探索</button>` : ""}</div></div><div class="journey-notes"><span>${icon("gem")} 首次探索有额外星晶</span><span>${icon("heart")} 没有体力限制，随时出发</span><span>${icon("bookmark")} 每次完成自动记录旅程</span></div>`;
}
function renderCraft() {
  const list = ITEMS.filter((i) => i.shape >= 2),
    size = craftPageSize(),
    total = Math.ceil(list.length / size);
  craftPage = Math.max(0, Math.min(craftPage, total - 1));
  content.innerHTML = `${title("一针一线 · 把灵感缝进裙摆", "织梦工坊", "每件新装都有自己的故事。探索获得织梦丝，亲手制作你的收藏。", `<button class="soft-button" data-action="exchange">${icon("sparkles")} 织梦丝 ${save.thread} <span class="small-plus">＋</span></button>`)}<div class="craft-filters"><span class="progress-chip">${icon("wand-sparkles")} 已制作 ${save.totalCrafts} 件新装</span><span>星晶兑换：15 星晶 → 8 织梦丝</span></div><div class="craft-grid">${list
    .slice(craftPage * size, (craftPage + 1) * size)
    .map((i) => {
      const owned = save.owned.includes(i.id),
        locked = i.region > regionUnlocked(save);
      return `<article class="craft-card" data-state="${owned ? "owned" : locked ? "locked" : "available"}" style="--item-color:${i.color}"><div class="craft-art"><span class="pattern-label">${SERIES[i.shape]}系列</span>${itemArt(i)}<span class="item-stars">${"✦".repeat(i.rarity)}</span></div><div class="craft-info"><span class="tiny-label">${categories.find((c) => c.id === i.category)!.name} · ${i.style}</span><h3>${i.name}</h3><p>${locked ? `探索至${REGIONS[i.region].name}解锁图纸` : owned ? "已经收进衣橱，快去试穿吧" : "图纸已解锁，可以开始制作"}</p><span class="cost">${icon("coins")} ${i.cost} <span>·</span> ${icon("sparkles")} ${i.material}</span><button class="${owned ? "soft-button" : "primary-button"}" data-action="craft" data-id="${i.id}" ${owned || locked ? "disabled" : ""}>${owned ? "已收藏" : locked ? "图纸未解锁" : "制作新装"} ${icon(owned ? "check" : "wand-sparkles")}</button></div></article>`;
    })
    .join("")}</div>${pages("craft-page", craftPage, total)}`;
}
function renderContest() {
  const t = THEMES[selectedTheme];
  content.innerHTML = `${title("穿上心爱的搭配 · 今夜赴约", "搭配舞会", "以当前搭配参加舞会，每个主题每天都能领取一次奖励。")}<div class="theme-tabs">${THEMES.map((t, i) => `<button aria-pressed="${i === selectedTheme}" class="${i === selectedTheme ? "active" : ""}" data-action="theme" data-id="${i}">${t.style}</button>`).join("")}</div><div class="contest-card"><span class="contest-emblem">${icon("sparkles")}</span><span class="eyebrow">今夜的邀请函</span><h2>${t.name}</h2><p>${t.description}</p><div class="contest-tag">主题风格：${t.style}</div><div class="style-meter"><span>当前搭配契合度</span><b>${styleScore(save, t.style)}<small> / 100</small></b><div><i style="width:${styleScore(save, t.style)}%"></i></div></div><p class="contest-tip">每件服饰提供基础分；穿上「${t.style}」单品能获得额外加分。85 分以上可获得 S 评价。</p><button class="primary-button wide" data-action="contest">${icon("sparkles")} 登上星光秀台</button><button class="text-button" data-action="nav" data-id="closet">回衣橱调整搭配 ${icon("chevron-right")}</button></div><div class="contest-reward">${icon("gift")} 最高可得 150 金币、12 星晶与 25 经验</div>`;
}
function showAbilities() {
  const look = visibleSave();
  const powers = adventureAbilities(
    look.outfit,
    run ? regionOf(run.stage) : selectedRegion,
  );
  openModal(
    `<div class="modal-emblem">${icon("wand-sparkles")}</div><h2 id="modal-title">${fitting.active ? "试穿能力预览" : "穿搭，也是一种魔法"}</h2>${fitting.active ? "<p>正式拥有并穿上后，才会在冒险中生效。</p>" : ""}<div class="ability-list"><p><b>${ITEM[look.outfit.shoes].name}</b>步速 +${powers.speedBonus}%</p><p><b>${ITEM[look.outfit.wings].name}</b>靠近 ${powers.pickupRadius.toFixed(2)} 米，自动收集星晶</p><p><b>${ITEM[look.outfit.wand].name}</b>点「魔杖共鸣」，采集周围 ${powers.spellRadius.toFixed(1)} 米内的星晶；${powers.cooldown} 秒后可再次施放</p><p><b>${ITEM[look.outfit.dress].name}</b>在${powers.style}地区，魔法范围增加 0.6 米，恢复时间缩短 2 秒</p></div><button class="primary-button wide" data-action="close">${fitting.active ? "继续试穿" : "带着魔法出发"}</button>`,
  );
}
function startRunway() {
  if (!world || runwayEntry) return;
  endFitting();
  runwayEntry = { theme: selectedTheme, outfit: { ...save.outfit } };
  screen = "runway";
  world.startRunway(finishRunway);
  render();
  document.querySelector("#adventure-hud")!.innerHTML =
    `<div class="runway-heading"><span class="eyebrow">STARLIGHT RUNWAY</span><h1>${THEMES[selectedTheme].name}</h1><p class="runway-phase" aria-live="polite">星光入场</p></div><div class="runway-controls"><button class="soft-button" data-action="runway-exit">返回准备</button><span class="runway-progress" role="progressbar" aria-label="走秀进度" aria-valuemin="0" aria-valuemax="100"><i></i></span><button class="soft-button" data-action="runway-skip">跳过演出</button></div>`;
  updateRunwayHUD();
}
function updateRunwayHUD() {
  if (!world || screen !== "runway") return;
  const time = world.runwayTime;
  const phase = document.querySelector(".runway-phase");
  const label =
    time < 2.8
      ? "星光入场"
      : time < 4.4
        ? "转身，让裙摆绽放"
        : time < 5.9
          ? "向今夜的宾客致意"
          : "把这一刻，留在星光里";
  if (phase && phase.textContent !== label) phase.textContent = label;
  const progress = document.querySelector<HTMLElement>(".runway-progress");
  if (progress) {
    progress.setAttribute(
      "aria-valuenow",
      String(Math.round((time / 9) * 100)),
    );
    progress.querySelector<HTMLElement>("i")!.style.width =
      `${Math.min(100, (time / 9) * 100)}%`;
  }
}
function finishRunway() {
  if (!runwayEntry) return;
  const entry = runwayEntry;
  runwayEntry = null;
  const theme = THEMES[entry.theme];
  const result = contest(save, entry.theme, theme.style, entry.outfit);
  persist();
  screen = "contest";
  render();
  openModal(
    `<div class="contest-grade">${result.score >= 85 ? "S" : result.score >= 65 ? "A" : "B"}</div><span class="eyebrow">YOUR MOMENT TO SHINE</span><h2 id="modal-title">${result.score >= 85 ? "今夜的星光，为你而亮。" : "你的风格，值得被看见。"}</h2><p>${theme.name} · ${result.score} 分<br>${result.first ? `获得 ${Math.floor(result.score * 1.5)} 金币、${result.score >= 85 ? 12 : 5} 星晶和 25 经验` : "今天已领取这个主题的奖励，明天再来赴约。"}</p><button class="primary-button wide" data-action="close">收藏这份闪耀</button>`,
  );
  sound(880);
}
function renderJournal() {
  refreshDay(save);
  const daily = journalTab === "daily",
    list = daily ? QUESTS : ACHIEVEMENTS,
    total = Math.ceil(list.length / 3);
  journalPage = Math.max(0, Math.min(journalPage, total - 1));
  content.innerHTML = `${title("每一页 · 都是你的故事", "冒险手帐", "今日委托每天更新；旅途成就会一直陪伴你。", `<span class="progress-chip">${icon("crown")} 星愿旅人 Lv. ${level(save)}</span>`)}<div class="journal-summary"><div><b>${save.totalExplores}</b><span>次秘境探索</span></div><div><b>${save.owned.length}<small> / ${ITEMS.length}</small></b><span>件心动收藏</span></div><div><b>${save.completed.length}<small> / ${STAGE_COUNT}</small></b><span>段童话故事</span></div><div><b>${save.xp % 100}<small> / 100</small></b><span>本级经验</span></div></div><div class="journal-tabs"><button aria-pressed="${daily}" class="${daily ? "active" : ""}" data-action="journal-tab" data-id="daily">今日心愿</button><button aria-pressed="${!daily}" class="${!daily ? "active" : ""}" data-action="journal-tab" data-id="achievements">旅途纪念章</button></div><h3 class="list-heading">${daily ? "今日的小小心愿" : "旅途中的纪念章"} <span>${daily ? "每天 00:00 更新" : "每一枚，都是成长的证明"}</span></h3><div class="quests-grid ${daily ? "" : "achievements"}">${list
    .slice(journalPage * 3, journalPage * 3 + 3)
    .map((q) => questCard(q, daily))
    .join("")}</div>${pages("journal-page", journalPage, total)}`;
}
function questCard(q: (typeof QUESTS)[number], daily: boolean) {
  const done = (daily ? save.daily.claimed : save.claims).includes(q.id),
    value = Math.min(q.value(save), q.target);
  return `<article class="quest-card" data-state="${done ? "claimed" : value >= q.target ? "ready" : "progress"}"><span class="quest-icon">${icon(q.id === "explore" || q.id === "traveler" ? "compass" : q.id === "style" ? "sparkles" : q.id === "craft" || q.id === "designer" ? "scissors" : daily ? "gift" : "crown")}</span><div><h3>${q.name}</h3><p>${q.description}</p><div class="quest-progress"><i style="width:${(value / q.target) * 100}%"></i></div><small>${value} / ${q.target} <span>奖励 ${q.coins} 金币 · ${q.gems} 星晶</span></small></div><button class="soft-button" data-action="claim" data-id="${q.id}" data-daily="${daily}" ${done || value < q.target ? "disabled" : ""}>${done ? "已领取" : value < q.target ? "进行中" : "领取"}</button></article>`;
}
function openModal(html: string) {
  releaseDirectionPad();
  modalId++;
  const body = document.querySelector<HTMLElement>("#modal-content")!;
  body.innerHTML = html;
  if (!dialog.open) dialog.showModal();
  // Start keyboard focus on the dialog's own first action, not the close button.
  body
    .querySelector<HTMLElement>("button:not(:disabled), [href], input")
    ?.focus();
  if (world) {
    world.paused = true;
    world.stop();
  }
}
function closeModal() {
  modalId++;
  dialog.close();
  if (world) world.paused = false;
}
function navigate(id: string) {
  if (run && !run.finished) {
    openModal(
      `<div class="modal-emblem">${icon("compass")}</div><h2 id="modal-title">暂时告别这片秘境？</h2><p>本次未完成的采集不会结算。已有衣橱和冒险进度会保留。</p><button class="primary-button wide" data-action="leave" data-id="${id}">返回${id === "map" ? "地图" : "城堡"}</button><button class="text-button" data-action="close">继续冒险</button>`,
    );
    return;
  }
  releaseDirectionPad();
  if (id !== "closet") endFitting();
  runwayEntry = null;
  screen = id;
  if (world && world.mode !== "closet") world.closet();
  run = null;
  near = null;
  render();
  window.scrollTo({ top: 0, behavior: "instant" });
}
function start(stage: number) {
  if (!world) {
    toast(
      modelStatus === "loading"
        ? "公主正在准备，请稍等片刻。"
        : "请先回到衣橱，重新加载公主。",
    );
    return;
  }
  const next = createRun(save, stage);
  if (!next) {
    toast("请先完成前面的故事");
    return;
  }
  endFitting();
  run = next;
  near = null;
  screen = "adventure";
  world.adventure(run);
  render();
  window.scrollTo({ top: 0, behavior: "instant" });
  renderHUD();
  requestAnimationFrame(() => requestAnimationFrame(renderHUD));
  sound(520);
  document.querySelector("#toast")!.classList.remove("show");
}
const hudMarkup = new WeakMap<Element, string>();
// The HUD skeleton (including the direction pad a finger may be holding) is
// built once per run; only the objective, labels and action are refreshed.
function renderHUD() {
  const hud = document.querySelector<HTMLElement>("#adventure-hud")!;
  if (!run) {
    hud.innerHTML = "";
    return;
  }
  if (!hud.querySelector(".dpad"))
    hud.innerHTML = `<div class="hud-top" style="display:contents"></div><div class="world-labels">${(["fairy", "rune", "portal"] as const).map((kind) => `<button class="world-label" data-world-point="${kind}" data-action="seek" data-kind="${kind}">${kind === "fairy" ? REGION_STORIES[regionOf(run!.stage)].npc.name : kind === "rune" ? "星光符文" : "星愿之门"} ${icon("chevron-right")}</button>`).join("")}</div><div class="adventure-controls"><div class="dpad" aria-label="方向控制"><button class="up" data-move="0,-1" aria-label="向上移动">${icon("arrow-up")}</button><button class="left" data-move="-1,0" aria-label="向左移动">${icon("arrow-left")}</button><button class="down" data-move="0,1" aria-label="向下移动">${icon("arrow-down")}</button><button class="right" data-move="1,0" aria-label="向右移动">${icon("arrow-right")}</button></div><span class="movement-help">点击物品或地面前往<br>WASD / 方向键移动 · E 互动</span><div class="adventure-actions"><button class="ability-button" data-action="magic" aria-label="施放魔杖共鸣，收集附近星晶">${icon("wand-sparkles")}<span>魔杖共鸣</span><small>采集附近星晶</small></button><div class="hud-action"></div></div></div>`;
  const ready = run.gems.length === 5 && run.puzzle && run.friend;
  const npc = REGION_STORIES[regionOf(run.stage)].npc;
  const labels = {
    rune: run.puzzle ? "符文已点亮" : "唤醒星光符文",
    fairy: run.friend ? "再聊一会儿" : `与${npc.name}交谈`,
    portal: ready ? "领取冒险奖励" : "查看传送门",
    gem: "采集星晶",
  };
  const set = (selector: string, html: string) => {
    const el = hud.querySelector<HTMLElement>(selector)!;
    if (hudMarkup.get(el) !== html) {
      hudMarkup.set(el, html);
      el.innerHTML = html;
    }
  };
  const goals = [
    {
      kind: "gem",
      icon: "gem",
      title: "星晶",
      progress: `${run.gems.length}/5`,
      done: run.gems.length === 5,
    },
    {
      kind: "fairy",
      icon: "heart",
      title: npc.name,
      progress: run.friend ? "已结识" : "去拜访",
      done: run.friend,
    },
    {
      kind: "rune",
      icon: "sparkles",
      title: "符文",
      progress: run.puzzle ? "已点亮" : "去点亮",
      done: run.puzzle,
    },
    {
      kind: "portal",
      icon: "compass",
      title: "归途",
      progress: ready ? "可通关" : "待开启",
      done: false,
    },
  ];
  set(
    ".hud-top",
    `<div class="adventure-top"><button class="soft-button" data-action="nav" data-id="map" aria-label="返回冒险地图">${icon("chevron-left")} 地图</button><div class="adventure-objective"><span class="eyebrow">${REGIONS[regionOf(run.stage)].name} · 第 ${run.stage + 1} 个故事</span><h2>${stageName(run.stage)}</h2><p class="adventure-affinity">步速 +${world?.abilities.speedBonus ?? 0}% · ${world?.abilities.resonance ? "裙装共鸣已生效" : "羽翼助你采集"}</p></div><button class="icon-button" data-action="help" aria-label="冒险帮助">${icon("info")}</button></div><div class="adventure-goals" aria-label="冒险目标，点击自动前往">${goals.map((g) => `<button class="adventure-goal ${g.done ? "done" : ""}" data-action="seek" data-kind="${g.kind}" ${g.done || (g.kind === "portal" && !ready) ? "disabled" : ""} aria-label="${g.done ? "已完成" : "前往"}${g.title}，${g.progress}">${icon(g.done ? "check" : g.icon)}<span><b>${g.title}</b><small>${g.progress}</small></span></button>`).join("")}</div>`,
  );
  set(
    ".hud-action",
    `${near ? `<button class="primary-button interact-button" data-action="interact" data-kind="${near.kind}">${icon(near.kind === "fairy" ? "heart" : "sparkles")} ${labels[near.kind]}</button>` : `<div class="adventure-hint">${ready ? "点击「归途」，前往星愿之门" : run.gems.length < 5 ? "点击上方目标，公主会走过去" : "拜访伙伴，再点亮星光符文"}</div>`}`,
  );
  positionWorldLabels();
}
function positionWorldLabels() {
  if (!world || !run || screen !== "adventure") return;
  const hud = document.querySelector<HTMLElement>("#adventure-hud")!;
  const box = hud.getBoundingClientRect();
  const goals = hud.querySelector(".adventure-goals")?.getBoundingClientRect();
  const controls = hud
    .querySelector(".adventure-controls")
    ?.getBoundingClientRect();
  for (const point of world.projectPoints()) {
    if (point.kind === "gem") continue;
    const label = hud.querySelector<HTMLElement>(
      `[data-world-point="${point.kind}"]`,
    );
    if (!label) continue;
    const top = point.labelY;
    label.hidden =
      !point.visible ||
      point.labelX < 50 ||
      point.labelX > box.width - 50 ||
      top < (goals?.bottom ?? box.top) - box.top + 6 ||
      top + 36 > (controls?.top ?? box.bottom) - box.top;
    label.style.left = `${point.labelX}px`;
    label.style.top = `${top}px`;
  }
  const magic = hud.querySelector<HTMLButtonElement>("[data-action=magic]");
  if (magic) {
    const remaining = Math.ceil(world.magicCooldown);
    magic.disabled = remaining > 0;
    magic.querySelector("small")!.textContent =
      `周围 ${world.abilities.spellRadius.toFixed(1)} 米${world.abilities.resonance ? " · 共鸣" : ""}`;
    magic.querySelector("span")!.textContent = remaining
      ? `星光恢复 ${remaining}s`
      : "魔杖共鸣";
  }
  hud.querySelectorAll<HTMLElement>(".adventure-goal").forEach((button) => {
    button.classList.toggle(
      "seeking",
      button.dataset.kind === world!.destination?.kind &&
        world!.avatar.position.distanceTo(world!.target) > 0.08,
    );
  });
}
function interact() {
  if (!run || !near) return;
  const npc = REGION_STORIES[regionOf(run.stage)].npc;
  if (near.kind === "fairy") {
    if (run.friend) {
      toast(`${npc.name}：${npc.farewell}`);
      return;
    }
    openModal(
      `<div class="fairy-portrait" style="--npc-color:${npc.color}">${icon(npc.icon)}</div><span class="eyebrow">${npc.title} · ${npc.name}</span><h2 id="modal-title">「${npc.greeting}」</h2><p>${npc.story}</p><div class="choice-buttons"><button class="choice" data-action="friend" data-id="share"><b>分给她一点温暖</b><small>${npc.share} · 额外获得 2 织梦丝</small></button><button class="choice" data-action="friend" data-id="listen"><b>坐下来，听她的故事</b><small>${npc.listen} · 额外获得 50 金币</small></button></div>`,
    );
  }
  if (near.kind === "rune") {
    if (run.puzzle) {
      toast("符文已经点亮，星光在轻轻歌唱。");
      return;
    }
    showPuzzle();
  }
  if (near.kind === "portal") {
    const result = finishRun(save, run);
    if (!result) {
      toast("还需要集齐 5 颗星晶、结识精灵，并点亮符文。");
      return;
    }
    if (run.choice === "listen") save.coins += 50;
    persist();
    sound(960);
    openModal(
      `<div class="reward-sparkles">✦ ✧ ✦</div><span class="eyebrow">A WISH COMES TRUE</span><h2 id="modal-title">又一段童话，被你点亮。</h2><p>${result.first ? "首次通关！新的旅程正在地图上等你。" : "再次相遇，也有新的收获。"}<br>${npc.name}：${npc.farewell}</p><div class="reward-grid"><span>${icon("coins")}<b>+${result.coins + (run.choice === "listen" ? 50 : 0)}</b><small>金币</small></span><span>${icon("gem")}<b>+${result.gems}</b><small>星晶</small></span><span>${icon("sparkles")}<b>+${result.thread}</b><small>织梦丝</small></span></div><div class="reward-level">搭配加成：+${result.bonus.coins} 金币 · +${result.bonus.thread} 织梦丝<br>星愿旅人 Lv. ${result.level} · ${result.first ? "+80" : "+40"} 经验</div><button class="primary-button wide" data-action="finish">继续星愿旅程 ${icon("chevron-right")}</button><button class="text-button" data-action="finish-closet">带着灵感，回到衣橱</button>`,
    );
    renderHUD();
  }
}
function puzzleSequence() {
  return memorySequence(run!.stage);
}
function showPuzzle() {
  if (puzzleKind(run!.stage) === "lights") {
    showLights();
    return;
  }
  if (puzzleKind(run!.stage) === "timing") {
    showTiming();
    return;
  }
  puzzleInput = [];
  puzzleReady = false;
  const symbols = ["✿", "☾", "✦", "◇"];
  const sequence = puzzleSequence();
  openModal(
    `<div class="modal-emblem">${icon("sparkles")}</div><span class="eyebrow">THE STARLIGHT MELODY</span><h2 id="modal-title">记住星光的顺序</h2><p id="puzzle-hint">留意下面的符文，稍后按相同顺序点亮它们。</p><div class="rune-sequence" id="rune-sequence">${sequence.map((n) => `<span>${symbols[n]}</span>`).join("")}</div><div class="rune-buttons">${symbols.map((s, i) => `<button data-action="rune" data-id="${i}" aria-label="符文 ${s}">${s}</button>`).join("")}</div><button class="text-button" data-action="puzzle-again">再看一次顺序 ${icon("refresh-cw")}</button>`,
  );
  const id = modalId;
  setTimeout(() => {
    if (id !== modalId || !dialog.open) return;
    puzzleReady = true;
    document.querySelector("#rune-sequence")!.innerHTML = sequence
      .map(() => '<span class="empty">·</span>')
      .join("");
    document.querySelector("#puzzle-hint")!.textContent =
      "轮到你了！按刚才的顺序点击符文。";
  }, 2400);
}
function rune(index: number) {
  if (!puzzleReady || !run) return;
  const seq = puzzleSequence();
  if (seq[puzzleInput.length] !== index) {
    puzzleInput = [];
    document.querySelector("#puzzle-hint")!.textContent =
      "星光轻轻散开了。没关系，再试一次，也可以重新看顺序。";
    document.querySelector("#rune-sequence")!.innerHTML = seq
      .map(() => '<span class="empty">·</span>')
      .join("");
    sound(260);
    return;
  }
  puzzleInput.push(index);
  sound(520 + index * 110);
  document.querySelector("#rune-sequence")!.innerHTML = seq
    .map(
      (n, i) =>
        `<span class="${i < puzzleInput.length ? "lit" : "empty"}">${i < puzzleInput.length ? ["✿", "☾", "✦", "◇"][n] : "·"}</span>`,
    )
    .join("");
  if (puzzleInput.length === seq.length) {
    run.puzzle = true;
    puzzleReady = false;
    document.querySelector("#puzzle-hint")!.textContent =
      "符文全部亮起了！你唤醒了沉睡的星光。";
    renderHUD();
    const id = modalId;
    setTimeout(() => {
      if (id === modalId) closeModal();
    }, 850);
  }
}
function completePuzzle(message: string) {
  if (!run || run.puzzle) return;
  run.puzzle = true;
  renderHUD();
  sound(980);
  document.querySelector("#puzzle-hint")!.textContent = message;
  const id = modalId;
  setTimeout(() => {
    if (id === modalId) closeModal();
  }, 1100);
}
function showLights() {
  lightState = createLights(run!.stage);
  openModal(
    `<div class="modal-emblem">${icon("sparkles")}</div><span class="eyebrow">FIVE LITTLE STARS</span><h2 id="modal-title">让五颗星，一起发光。</h2><p id="puzzle-hint">点击一颗星，会同时翻转它和左右相邻星星的亮暗。试着点亮全部五颗吧。</p><div class="light-puzzle" id="light-puzzle"></div><button class="text-button" data-action="light-hint">给我一点灵感 ${icon("sparkles")}</button>`,
  );
  renderLights();
}
function renderLights() {
  document.querySelector("#light-puzzle")!.innerHTML = lightState
    .map(
      (on, i) =>
        `<button class="${on ? "lit" : ""}" data-action="light" data-id="${i}" aria-label="星星 ${i + 1}${on ? "已点亮" : "未点亮"}">✦</button>`,
    )
    .join("");
}
function showTiming() {
  timingHits = 0;
  timingLast = 0;
  openModal(
    `<div class="modal-emblem">${icon("star")}</div><span class="eyebrow">CATCH A FALLING STAR</span><h2 id="modal-title">接住，划过心间的星光。</h2><p id="puzzle-hint">当星星进入中间的金色区域时，点击「接住星光」。成功三次就能唤醒符文，失误也不会扣分。</p><div class="timing-track"><span class="timing-zone"></span><span class="timing-star" id="timing-star">✦</span></div><div class="timing-score" id="timing-score">○ ○ ○</div><button class="primary-button wide" data-action="timing">接住星光 ${icon("star")}</button>`,
  );
  const id = modalId;
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  function frame(t: number) {
    if (id !== modalId || !dialog.open || run?.puzzle) return;
    timingPosition = 0.5 + Math.sin(t / (reduced ? 1600 : 950)) * 0.43;
    document.querySelector<HTMLElement>("#timing-star")!.style.left =
      `${timingPosition * 100}%`;
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}
function settings() {
  openModal(
    `<div class="modal-emblem">${icon("settings")}</div><h2 id="modal-title">你的小小世界</h2><p>进度仅保存在当前浏览器。更换设备前，可以导出存档，再在新设备导入。</p><div class="settings-list"><button data-action="sound">${icon(save.sound ? "volume-2" : "volume-x")} 游戏音效 <b>${save.sound ? "已开启" : "已关闭"}</b></button><button data-action="export">${icon("download")} 导出冒险存档 ${icon("chevron-right")}</button><button data-action="import">${icon("upload")} 导入已有存档 ${icon("chevron-right")}</button>${readBackup() ? `<button data-action="backup">${icon("download")} 下载读档失败时的备份 ${icon("chevron-right")}</button>` : ""}</div><p class="small-note">没有付费、广告或账户系统。你的衣橱与旅程属于你。</p>`,
  );
}
function download(url: string, name: string) {
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
}
function showSlots() {
  if (fitting.active) return;
  openModal(
    `<div class="modal-emblem">${icon("bookmark")}</div><h2 id="modal-title">收藏心动搭配</h2><p>留住今天的灵感，下次一键穿上。</p><div class="slot-list">${save.slots.map((o, i) => `<div><span><b>搭配 ${i + 1}</b><small>${o ? ITEM[o.dress].name : "还没有收藏"}</small></span><button class="soft-button" data-action="slot-save" data-id="${i}">保存</button><button class="primary-button" data-action="slot-load" data-id="${i}" ${o ? "" : "disabled"}>穿上</button></div>`).join("")}</div>`,
  );
}
function help() {
  openModal(
    `<div class="modal-emblem">${icon("compass")}</div><h2 id="modal-title">每一段旅程，都从心动开始。</h2><div class="help-steps"><p><b>01 · 我的衣橱</b>点击服饰换装，拖动公主旋转查看。点「套装」一键换齐六件。点未拥有的服饰或「试穿模式」可预览效果，试穿不保存，离开衣橱会恢复原搭配。也可以免费染色、收藏搭配和拍照留念。</p><p><b>02 · 星愿冒险</b>点击物品、地面或上方目标，公主就会走过去。也可以按方向键或左下角按钮移动。采集 5 颗星晶，点「魔杖共鸣」可采集附近星晶。靠近伙伴和符文台后点右下角互动，最后前往星愿之门。</p><p><b>03 · 制作与舞会</b>冒险奖励可制作新衣。按舞会主题搭配，登台走秀后领取奖励；每个主题每天可领一次。</p><p><b>04 · 持续成长</b>完成 20 个故事关卡、每日委托和收藏成就。旧关可重复探索，奖励持续获得。</p></div><button class="soft-button wide" data-action="abilities">查看我的服饰能力</button><button class="primary-button wide" data-action="close">开始我的童话 ${icon("sparkles")}</button>`,
  );
}
app.addEventListener("click", (e) => {
  const b = (e.target as HTMLElement).closest<HTMLButtonElement>(
    "[data-action]",
  );
  if (!b || b.disabled) return;
  handleAction(b);
  // Templates are re-rendered with innerHTML; keep keyboard focus on the
  // matching control instead of dropping it back to the page.
  if (!b.isConnected && !dialog.open) {
    const selector = `[data-action="${b.dataset.action}"]${b.dataset.id !== undefined ? `[data-id="${CSS.escape(b.dataset.id)}"]` : ""}`;
    app.querySelector<HTMLElement>(selector)?.focus({ preventScroll: true });
  }
});
function handleAction(b: HTMLButtonElement) {
  const a = b.dataset.action,
    id = b.dataset.id ?? "";
  switch (a) {
    case "nav":
      navigate(id);
      break;
    case "fitting":
      if (screen !== "closet") break;
      if (fitting.active) {
        endFitting();
      } else fitting.begin(save);
      refreshFitting();
      break;
    case "sets":
      closetSets = true;
      renderCloset();
      break;
    case "equip-set": {
      const set = COLLECTIONS[Number(id)];
      if (!set || screen !== "closet") break;
      if (
        fitting.active ||
        !set.items.every((item) => save.owned.includes(item))
      ) {
        fitting.tryCollection(save, Number(id));
        refreshFitting();
      } else if (equipCollection(save, Number(id))) {
        world?.updateOutfit(save);
        persist();
        renderCloset();
        updateCaption();
        toast(`已换上「${set.name}」六件套`);
      }
      sound(780);
      break;
    }
    case "set-craft":
      closeModal();
      navigate("craft");
      break;
    case "abilities":
      showAbilities();
      break;
    case "magic": {
      const count = world?.castMagic();
      if (count !== null && count !== undefined) {
        toast(
          count
            ? `星光回应了你，收集 ${count} 颗星晶！`
            : "附近还没有星晶，再靠近一点试试。",
        );
        sound(810);
      }
      break;
    }
    case "category":
      closetSets = false;
      category = id as Category;
      renderCloset();
      break;
    case "filter":
      filter = filter === "all" ? "owned" : "all";
      renderCloset();
      break;
    case "set-filter":
      setFilter = setFilter === "all" ? "owned" : "all";
      renderCloset();
      break;
    case "craft-page":
      craftPage = Number(id);
      renderCraft();
      break;
    case "journal-tab":
      journalTab = id;
      journalPage = 0;
      renderJournal();
      break;
    case "journal-page":
      journalPage = Number(id);
      renderJournal();
      break;
    case "equip":
      if (screen !== "closet" || !ITEM[id]) break;
      if (fitting.active || !save.owned.includes(id)) {
        fitting.tryItem(save, id);
        refreshFitting();
      } else if (equip(save, id)) {
        world?.updateOutfit(save);
        persist();
        render();
      }
      sound();
      break;
    case "dye":
      if (screen !== "closet") break;
      if (fitting.active) {
        fitting.dye(save, id === "reset" ? null : id);
        refreshFitting();
      } else {
        save.dye = id === "reset" ? null : id;
        world?.updateOutfit(save);
        persist();
        render();
      }
      break;
    case "rotate":
      if (world) {
        world.rotate = -0.13;
        world.zoom = 1;
      }
      break;
    case "retry-model":
      if (modelStatus === "error") void bootWorld();
      break;
    case "expression":
      if (world) {
        world.expression = (world.expression + 1) % expressionNames.length;
        world.happyUntil = 0;
        b.setAttribute(
          "aria-label",
          `切换表情，当前${expressionNames[world.expression]}`,
        );
        toast(`公主的表情：${expressionNames[world.expression]}`);
      }
      break;
    case "pose":
      if (world) world.pose = (world.pose + 1) % 3;
      toast(
        [
          "轻轻呼吸，听见星光。",
          "公主向你挥手：今天也要开心！",
          "让裙摆随着星光轻轻摇曳。 ",
        ][world?.pose ?? 0],
      );
      break;
    case "photo":
      if (world) {
        download(world.photo(), "星愿衣橱-心动瞬间.png");
        toast("照片已准备下载");
      }
      break;
    case "region":
      selectedRegion = Number(id);
      renderMap();
      break;
    case "start":
      start(Number(id));
      break;
    case "seek":
      world?.seek(b.dataset.kind as PointKind);
      break;
    case "interact":
      interact();
      break;
    case "friend":
      if (run && !run.friend) {
        run.friend = true;
        run.choice = id as "share" | "listen";
        closeModal();
        renderHUD();
        toast(
          `${REGION_STORIES[regionOf(run.stage)].npc.name}成为了你的旅途伙伴！额外礼物将在通关时领取。`,
        );
        sound(780);
      }
      break;
    case "rune":
      rune(Number(id));
      break;
    case "light":
      if (run && !run.puzzle) {
        lightState = toggleLights(lightState, Number(id));
        renderLights();
        sound(600 + Number(id) * 70);
        if (lightState.every(Boolean))
          completePuzzle("五颗星连成一片，沉睡的符文苏醒了！");
      }
      break;
    case "light-hint": {
      const moves = solveLights(lightState);
      if (moves.length)
        document.querySelector("#puzzle-hint")!.textContent =
          `试着点击第 ${moves[0] + 1} 颗星。每一步，都更接近光。`;
      break;
    }
    case "timing":
      if (run && !run.puzzle && performance.now() - timingLast > 550) {
        timingLast = performance.now();
        if (timingPosition >= 0.32 && timingPosition <= 0.68) {
          timingHits++;
          sound(680 + timingHits * 100);
          document.querySelector("#timing-score")!.textContent = Array.from(
            { length: 3 },
            (_, i) => (i < timingHits ? "✦" : "○"),
          ).join(" ");
          if (timingHits === 3)
            completePuzzle("你接住了三束星光，符文重新亮起来了！");
        } else
          document.querySelector("#puzzle-hint")!.textContent =
            "差一点点！等星星进入中间金色区域再点击，已经接住的星光会保留。";
      }
      break;
    case "puzzle-again":
      showPuzzle();
      break;
    case "leave":
      closeModal();
      run = null;
      near = null;
      world?.closet();
      navigate(id);
      break;
    case "finish":
    case "finish-closet":
      closeModal();
      run = null;
      near = null;
      world?.closet();
      navigate(a === "finish" ? "map" : "closet");
      break;
    case "craft":
      if (craft(save, id)) {
        persist();
        renderCraft();
        toast(`「${ITEM[id].name}」已加入衣橱！`);
        sound(880);
      } else toast("材料还不够。去冒险获得金币和织梦丝，或用星晶兑换。");
      break;
    case "exchange":
      if (exchange(save)) {
        persist();
        renderCraft();
        toast("已用 15 星晶换得 8 织梦丝");
      } else toast("需要 15 星晶。冒险和每日委托都能获得。");
      break;
    case "theme":
      selectedTheme = Number(id);
      renderContest();
      break;
    case "contest":
      startRunway();
      break;
    case "runway-skip":
      world?.finishRunway();
      break;
    case "runway-exit":
      navigate("contest");
      break;
    case "claim":
      if (claim(save, id, b.dataset.daily === "true")) {
        persist();
        renderJournal();
        toast("奖励已收进你的行囊！");
        sound(780);
      }
      break;
    case "login": {
      const already = save.loginDate === save.daily.date;
      if (!already) {
        login(save);
        persist();
      }
      openModal(
        `<div class="modal-emblem gold">${icon("gift")}</div><span class="eyebrow">A GIFT FOR TODAY</span><h2 id="modal-title">${already ? "今天的星愿，已经收下。" : "欢迎回来，星愿旅人。"}</h2><p>连续相遇第 ${save.streak} 天 · 每七天开启新的祝福</p><div class="login-days">${Array.from({ length: 7 }, (_, i) => `<span class="${i < save.streak ? "active" : ""}">${i < save.streak ? "✦" : i + 1}<small>DAY ${i + 1}</small></span>`).join("")}</div><div class="reward-grid"><span>${icon("coins")}<b>${100 + save.streak * 20}</b><small>金币</small></span><span>${icon("gem")}<b>10</b><small>星晶</small></span><span>${icon("sparkles")}<b>3</b><small>织梦丝</small></span></div><button class="primary-button wide" data-action="close">${already ? "明天也要闪闪发光" : "带着祝福，出发吧"}</button>`,
      );
      sound(740);
      break;
    }
    case "settings":
      settings();
      break;
    case "sound":
      save.sound = !save.sound;
      persist();
      settings();
      sound();
      break;
    case "export": {
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(save, null, 2)], { type: "application/json" }),
      );
      download(url, "starlight-atelier-save.json");
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast("冒险存档已准备下载");
      break;
    }
    case "backup": {
      const raw = readBackup();
      if (!raw) break;
      const url = URL.createObjectURL(
        new Blob([raw], { type: "application/json" }),
      );
      download(url, "starlight-atelier-backup.json");
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast("备份已准备下载，可在修复后导入");
      break;
    }
    case "import":
      (document.querySelector("#import-input") as HTMLInputElement).click();
      break;
    case "slots":
      showSlots();
      break;
    case "slot-save":
      if (fitting.active) break;
      save.slots[Number(id)] = { ...save.outfit };
      save.slotDyes[Number(id)] = save.dye;
      persist();
      showSlots();
      toast("搭配已收藏");
      break;
    case "slot-load":
      if (fitting.active) break;
      if (save.slots[Number(id)]) {
        save.outfit = { ...save.slots[Number(id)]! };
        save.dye = save.slotDyes[Number(id)];
        world?.updateOutfit(save);
        persist();
        closeModal();
        render();
      }
      break;
    case "help":
      help();
      break;
    case "close":
      closeModal();
      break;
  }
}
dialog.addEventListener("cancel", (e) => {
  e.preventDefault();
  closeModal();
});
const directionPointers = new Map<
  number,
  { x: number; z: number; button: HTMLElement }
>();
function updateDirectionPad() {
  let x = 0,
    z = 0;
  app
    .querySelectorAll("[data-move]")
    .forEach((b) => b.classList.remove("pressed"));
  for (const direction of directionPointers.values()) {
    x += direction.x;
    z += direction.z;
    direction.button.classList.add("pressed");
  }
  world?.setAxis(x, z);
}
function releaseDirectionPad() {
  directionPointers.clear();
  updateDirectionPad();
}
app.addEventListener("pointerdown", (e) => {
  const b = (e.target as HTMLElement).closest<HTMLElement>("[data-move]");
  if (!b || !world || world.paused || world.mode !== "adventure") return;
  e.preventDefault();
  const [x, z] = b.dataset.move!.split(",").map(Number);
  directionPointers.set(e.pointerId, { x, z, button: b });
  updateDirectionPad();
  b.setPointerCapture(e.pointerId);
});
for (const name of [
  "pointerup",
  "pointercancel",
  "lostpointercapture",
] as const)
  app.addEventListener(name, (e: PointerEvent) => {
    if (directionPointers.delete(e.pointerId)) updateDirectionPad();
  });
window.addEventListener("blur", releaseDirectionPad);
document.addEventListener("visibilitychange", () => {
  if (document.hidden) releaseDirectionPad();
});
window.addEventListener("keydown", (e) => {
  if (e.key.toLowerCase() === "e" && screen === "adventure" && !dialog.open)
    interact();
});
let resizeTimer = 0;
window.addEventListener("resize", () => {
  clearTimeout(resizeTimer);
  resizeTimer = window.setTimeout(() => {
    if (run) renderHUD();
    else if (screen === "craft" || screen === "journal") render();
  }, 150);
});
(document.querySelector("#import-input") as HTMLInputElement).addEventListener(
  "change",
  async (e) => {
    const input = e.target as HTMLInputElement,
      file = input.files?.[0];
    if (!file) return;
    try {
      if (file.size > 200000) throw new Error("存档文件过大");
      const candidate = validateSave(JSON.parse(await file.text()));
      openModal(
        `<div class="modal-emblem">${icon("upload")}</div><h2 id="modal-title">导入这段星愿旅程？</h2><p>新存档：Lv. ${level(candidate)} · ${candidate.owned.length} 件服饰 · ${candidate.completed.length} 个故事。<br>将替换此浏览器当前进度，建议先导出当前存档。</p><button class="primary-button wide" id="confirm-import">确认导入</button><button class="text-button" data-action="export">先导出当前存档</button>`,
      );
      document.querySelector("#confirm-import")!.addEventListener(
        "click",
        () => {
          fitting.end();
          save = candidate;
          run = null;
          near = null;
          world?.closet();
          world?.updateOutfit(save);
          persist();
          closeModal();
          screen = "closet";
          render();
          toast("你的星愿旅程，已经回到身边。");
        },
        { once: true },
      );
    } catch (error) {
      toast(
        error instanceof Error ? error.message : "存档无法读取，原有进度已保留",
      );
    }
    input.value = "";
  },
);
Object.defineProperty(window, "__STARLIGHT__", {
  value: {
    getState: () => structuredClone(save),
    getFitting: () => (fitting.active ? fitting.appearance(save) : null),
    getRun: () => (run ? structuredClone(run) : null),
    diagnostics: () => world?.diagnostics(),
    modelStatus: () => modelStatus,
  },
  writable: false,
});
onExternalSave((next) => {
  save = next;
  world?.updateOutfit(visibleSave());
  renderTop();
  // An adventure in progress keeps its own run; screens refresh on next render.
  if (screen !== "adventure" && screen !== "runway") render();
  toast("另一个标签页更新了进度，这里已同步。");
});
render();
if (storageWarning) toast(storageWarning);
setTimeout(() => {
  if (run) renderHUD();
}, 1000);
