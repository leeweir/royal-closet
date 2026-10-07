import "./style.css";
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
  STAGE_NAMES,
  THEMES,
  type Category,
} from "./simulation/data";
import {
  freshSave,
  validateSave,
  STORAGE_KEY,
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
import { World, type WorldPoint } from "./render/world";
import { icon, icons, itemArt } from "./ui";
let storageWarning = "";
let save: Save;
try {
  const raw = localStorage.getItem(STORAGE_KEY);
  save = raw ? validateSave(JSON.parse(raw)) : freshSave();
} catch {
  save = freshSave();
  storageWarning = "存档未能读取。你可以在设置中导入之前导出的存档。";
}
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
let audio: AudioContext | null = null;
const app = document.querySelector<HTMLDivElement>("#app")!;
app.innerHTML = `<div class="app-shell"><header class="topbar"><a class="brand" href="#" aria-label="星愿衣橱首页"><span class="brand-mark">${icon("crown")}</span><span><b>星愿衣橱</b><small>STARLIGHT ATELIER</small></span></a><div class="top-right"><div class="currencies" id="currencies"></div><button class="icon-button gift-button" data-action="login" aria-label="每日星愿礼物">${icon("gift")}<span class="notification-dot" id="gift-dot"></span></button><button class="icon-button" data-action="settings" aria-label="设置与存档">${icon("settings")}</button></div></header><div class="app-body"><nav class="sidebar" aria-label="游戏导航">${[
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
  )}<div class="sidebar-bottom"><span>✧</span><small>把童话<br>穿在身上</small></div></nav><main id="main"><div id="world-wrap" class="world-wrap"><div class="scene-heading"><span class="eyebrow">YOUR LITTLE FAIRYTALE</span><h1>今天，也要闪闪发光。</h1><p>换上心爱的裙装，去遇见新的故事。</p></div><div id="world"></div><div class="scene-tools"><button data-action="rotate" class="icon-button" aria-label="重置视角">${icon("rotate-ccw")}</button><button data-action="pose" class="icon-button" aria-label="切换公主姿势">${icon("heart")}</button><button data-action="photo" class="icon-button" aria-label="拍照下载">${icon("camera")}</button></div><div class="scene-caption" id="scene-caption"></div><div class="drag-hint">${icon("refresh-cw")} 拖动旋转 · 滚轮缩放</div><div id="adventure-hud"></div></div><section id="content"></section></main></div><footer class="footer"><span>✧ 每一份想象，都值得闪耀</span><span id="save-status">进度自动保存在此浏览器</span><button data-action="help">玩法指南 ${icon("info")}</button></footer></div><div id="toast" role="status" aria-live="polite"></div><dialog id="modal" aria-labelledby="modal-title"><button class="modal-close icon-button" data-action="close" aria-label="关闭">${icon("x")}</button><div id="modal-content"></div></dialog><input id="import-input" type="file" accept=".json,application/json" hidden>`;
let world: World | null = null;
try {
  world = new World(document.querySelector("#world")!, save);
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
  world.onError = () =>
    toast("3D 画面暂时中断，请在设置中导出进度后刷新页面。");
} catch {
  document.querySelector("#world")!.innerHTML =
    `<div class="webgl-fallback">${icon("sparkles")}<h2>需要开启 3D 图形加速</h2><p>请使用支持 WebGL 的浏览器，并开启硬件加速。衣橱、制作与搭配挑战仍然可用。</p></div>`;
}
const content = document.querySelector<HTMLElement>("#content")!,
  main = document.querySelector<HTMLElement>("#main")!,
  wrap = document.querySelector<HTMLElement>("#world-wrap")!,
  dialog = document.querySelector<HTMLDialogElement>("#modal")!;
function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(save));
    document.querySelector("#save-status")!.textContent = "进度已自动保存";
  } catch {
    document.querySelector("#save-status")!.textContent =
      "无法自动保存 · 请在设置导出存档";
  }
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
  icons();
}
function title(kicker: string, title: string, desc: string, extra = "") {
  return `<div class="section-heading"><div><span class="eyebrow">${kicker}</span><h2>${title}</h2><p>${desc}</p></div>${extra}</div>`;
}
function updateCaption() {
  const i = ITEM[save.outfit.dress];
  document.querySelector("#scene-caption")!.innerHTML =
    `<span class="tiny-label">今日的心动搭配</span><h2>${i.name}</h2><div class="stars">${"✦".repeat(i.rarity)}<span>${i.style} · ${save.dye ? "专属染色" : "星愿系列"}</span></div>`;
}
function render() {
  refreshDay(save);
  document
    .querySelectorAll<HTMLElement>(".nav-button")
    .forEach((b) => b.classList.toggle("active", b.dataset.id === screen));
  main.className = `screen-${screen}`;
  wrap.hidden = !["closet", "contest", "adventure"].includes(screen);
  content.hidden = screen === "adventure";
  if (screen === "closet") renderCloset();
  if (screen === "map") renderMap();
  if (screen === "craft") renderCraft();
  if (screen === "contest") renderContest();
  if (screen === "journal") renderJournal();
  updateCaption();
  renderTop();
  if (world) requestAnimationFrame(() => world!.resize());
  icons();
}
function renderCloset() {
  const list = ITEMS.filter(
    (i) =>
      i.category === category &&
      (filter === "all" || save.owned.includes(i.id)),
  );
  content.innerHTML = `<div class="wardrobe-header"><div><span class="eyebrow">MY WARDROBE</span><h2>我的衣橱 <span>${save.owned.length}<em> / ${ITEMS.length}</em></span></h2></div><button class="soft-button compact" data-action="slots">${icon("bookmark")} 搭配收藏</button></div><div class="category-tabs" role="group" aria-label="服饰分类">${categories.map((c) => `<button class="category ${category === c.id ? "active" : ""}" data-action="category" data-id="${c.id}">${icon(c.icon)}<span>${c.name}</span></button>`).join("")}</div><div class="wardrobe-filter"><span>一点心动，一点魔法</span><button data-action="filter">${filter === "all" ? "全部服饰" : "已拥有"} ${icon("chevron-right")}</button></div><div class="items-grid">${list
    .map((i) => {
      const owned = save.owned.includes(i.id),
        active = save.outfit[category] === i.id;
      return `<button class="item-card ${active ? "selected" : ""} ${owned ? "" : "locked"}" data-action="equip" data-id="${i.id}" aria-label="${i.name}${owned ? "" : "，未解锁"}" aria-pressed="${active}"><span class="item-status">${active ? icon("check") : !owned ? icon("lock") : ""}</span><div class="item-visual" style="--item-color:${i.color}">${itemArt(i)}</div><span class="item-name">${i.name}</span><span class="item-stars">${"✦".repeat(i.rarity)}<small>${i.style}</small></span>${!owned ? '<span class="unlock-label">工坊制作</span>' : ""}</button>`;
    })
    .join(
      "",
    )}</div><div class="dye-row"><span>${icon("palette")} 灵感染色</span>${["#b7a0df", "#eeb1c5", "#8abdab", "#83bfe0", "#f5e7c9", "#596eab"].map((c) => `<button class="swatch ${save.dye === c ? "active" : ""}" style="--swatch:${c}" data-action="dye" data-id="${c}" aria-label="染色 ${c}"></button>`).join("")}<button class="reset-dye" data-action="dye" data-id="reset" aria-label="恢复服装原色">${icon("rotate-ccw")}</button></div><button class="adventure-teaser" data-action="nav" data-id="map"><span class="teaser-icon">${icon("compass")}</span><span><b>衣橱之外，还有整个童话世界</b><small>前往秘境 · 寻找新装的灵感与材料</small></span>${icon("chevron-right")}</button>`;
}
function renderMap() {
  const current = nextStage(save),
    unlocked = regionUnlocked(save),
    reg = REGIONS[selectedRegion];
  content.innerHTML = `${title("A WORLD OF WISHES", "下一站，去往童话里。", "收集星光、结识精灵，寻找藏在远方的衣橱灵感。", `<span class="progress-chip">${icon("compass")} 故事进度 ${save.completed.length} / 20</span>`)}<div class="map-layout"><div class="kingdom-map"><div class="map-topline"><span>THE KINGDOM OF STARLIGHT</span><span>✧</span></div><div class="map-nodes">${REGIONS.map((r, i) => `<button class="map-node node-${i} ${selectedRegion === i ? "selected" : ""} ${i > unlocked ? "locked" : ""}" data-action="region" data-id="${i}"><span>${icon(i > unlocked ? "lock" : r.icon)}</span><b>${r.name}</b><small>${i > unlocked ? "等待探索" : `${save.completed.filter((s) => Math.floor(s / 4) === i).length}/4`}</small></button>`).join("")}</div><div class="map-note">五个国度，一场属于你的星愿旅程</div></div><div class="region-detail"><span class="region-badge" style="--region:${reg.color}">${icon(reg.icon)}</span><span class="eyebrow">CHAPTER 0${selectedRegion + 1}</span><h2>${reg.name}</h2><p>${reg.story}</p><div class="region-style">${icon("shirt")} 灵感风格 <b>${reg.style}</b></div><p class="affinity-note">每件同风格服饰 +8 金币，每两件 +1 织梦丝</p><div class="stage-list">${STAGE_NAMES.map(
    (name, i) => {
      const st = selectedRegion * 4 + i,
        done = save.completed.includes(st),
        locked = st > current;
      return `<button class="stage-button ${done ? "done" : ""}" data-action="start" data-id="${st}" ${locked ? "disabled" : ""}><span class="stage-number">${done ? icon("check") : String(i + 1).padStart(2, "0")}</span><span><b>${name}</b><small>${done ? "再次探索 · 仍可获得奖励" : locked ? "完成前一关解锁" : "采集 · 奇遇 · 符文解谜"}</small></span>${icon(locked ? "lock" : "chevron-right")}</button>`;
    },
  ).join(
    "",
  )}</div><div class="region-reward">${icon("gift")} 章节纪念：${reg.reward}</div>${current >= 20 ? '<button class="primary-button" data-action="start" data-id="20">无尽星愿 · 自由探索</button>' : ""}</div></div><div class="journey-notes"><span>${icon("gem")} 首次探索有额外星晶</span><span>${icon("heart")} 没有体力限制，随时出发</span><span>${icon("bookmark")} 每次完成自动记录旅程</span></div>`;
}
function renderCraft() {
  content.innerHTML = `${title("THE DREAM ATELIER", "把灵感，缝进裙摆。", "每件新装都有自己的故事。探索获得织梦丝，亲手制作你的收藏。", `<button class="soft-button" data-action="exchange">${icon("sparkles")} 织梦丝 ${save.thread} <span class="small-plus">＋</span></button>`)}<div class="craft-filters"><span class="progress-chip">${icon("wand-sparkles")} 已制作 ${save.totalCrafts} 件新装</span><span>星晶兑换：15 星晶 → 8 织梦丝</span></div><div class="craft-grid">${ITEMS.filter(
    (i) => i.shape >= 2,
  )
    .map((i) => {
      const owned = save.owned.includes(i.id),
        locked = i.region > regionUnlocked(save);
      return `<article class="craft-card"><div class="craft-art" style="--item-color:${i.color}">${itemArt(i)}<span class="item-stars">${"✦".repeat(i.rarity)}</span></div><div class="craft-info"><span class="tiny-label">${categories.find((c) => c.id === i.category)!.name} · ${i.style}</span><h3>${i.name}</h3><p>${locked ? `探索至${REGIONS[i.region].name}解锁图纸` : "一针一线，编织属于你的魔法"}</p><span class="cost">${icon("coins")} ${i.cost} <span>·</span> ${icon("sparkles")} ${i.material}</span><button class="${owned ? "soft-button" : "primary-button"}" data-action="craft" data-id="${i.id}" ${owned || locked ? "disabled" : ""}>${owned ? "已收藏" : locked ? "图纸未解锁" : "制作新装"} ${icon(owned ? "check" : "wand-sparkles")}</button></div></article>`;
    })
    .join("")}</div>`;
}
function renderContest() {
  const t = THEMES[selectedTheme];
  content.innerHTML = `${title("THE STARLIGHT BALL", "把今天，穿成一首诗。", "以当前搭配参加舞会，每个主题每天都能领取一次奖励。")}<div class="theme-tabs">${THEMES.map((t, i) => `<button class="${i === selectedTheme ? "active" : ""}" data-action="theme" data-id="${i}">${t.style}</button>`).join("")}</div><div class="contest-card"><span class="contest-emblem">${icon("sparkles")}</span><span class="eyebrow">TODAY’S INVITATION</span><h2>${t.name}</h2><p>${t.description}</p><div class="contest-tag">主题风格：${t.style}</div><div class="style-meter"><span>当前搭配契合度</span><b>${styleScore(save, t.style)}<small> / 100</small></b><div><i style="width:${styleScore(save, t.style)}%"></i></div></div><p class="contest-tip">每件服饰提供基础分；穿上「${t.style}」单品能获得额外加分。85 分以上可获得 S 评价。</p><button class="primary-button wide" data-action="contest">${icon("sparkles")} 参加搭配舞会</button><button class="text-button" data-action="nav" data-id="closet">回衣橱调整搭配 ${icon("chevron-right")}</button></div><div class="contest-reward">${icon("gift")} 最高可得 150 金币、12 星晶与 25 经验</div>`;
}
function renderJournal() {
  refreshDay(save);
  content.innerHTML = `${title("LITTLE MOMENTS, BIG MAGIC", "收藏每一次，小小的闪耀。", "今日委托每天更新；旅途成就会一直陪伴你。", `<span class="progress-chip">${icon("crown")} 星愿旅人 Lv. ${level(save)}</span>`)}<div class="journal-summary"><div><b>${save.totalExplores}</b><span>次秘境探索</span></div><div><b>${save.owned.length}<small> / 36</small></b><span>件心动收藏</span></div><div><b>${save.completed.length}<small> / 20</small></b><span>段童话故事</span></div><div><b>${save.xp % 100}<small> / 100</small></b><span>距离下一等级</span></div></div><h3 class="list-heading">今日的小小心愿 <span>每天 00:00 更新 · 本地时间</span></h3><div class="quests-grid">${QUESTS.map((q) => questCard(q, true)).join("")}</div><h3 class="list-heading">旅途中的纪念章 <span>每一枚，都是成长的证明</span></h3><div class="quests-grid achievements">${ACHIEVEMENTS.map((q) => questCard(q, false)).join("")}</div>`;
}
function questCard(q: (typeof QUESTS)[number], daily: boolean) {
  const done = (daily ? save.daily.claimed : save.claims).includes(q.id),
    value = Math.min(q.value(save), q.target);
  return `<article class="quest-card"><span class="quest-icon">${icon(daily ? "gift" : "crown")}</span><div><h3>${q.name}</h3><p>${q.description}</p><div class="quest-progress"><i style="width:${(value / q.target) * 100}%"></i></div><small>${value} / ${q.target} <span>奖励 ${q.coins} 金币 · ${q.gems} 星晶</span></small></div><button class="soft-button" data-action="claim" data-id="${q.id}" data-daily="${daily}" ${done || value < q.target ? "disabled" : ""}>${done ? "已领取" : value < q.target ? "进行中" : "领取"}</button></article>`;
}
function openModal(html: string) {
  modalId++;
  document.querySelector("#modal-content")!.innerHTML = html;
  if (!dialog.open) dialog.showModal();
  if (world) {
    world.paused = true;
    world.stop();
  }
  icons();
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
  screen = id;
  if (world && world.mode === "adventure") world.closet();
  run = null;
  near = null;
  render();
}
function start(stage: number) {
  if (!world) {
    toast("冒险需要支持 WebGL 的浏览器");
    return;
  }
  const next = createRun(save, stage);
  if (!next) {
    toast("请先完成前面的故事");
    return;
  }
  run = next;
  near = null;
  screen = "adventure";
  world.adventure(run);
  render();
  renderHUD();
  requestAnimationFrame(() => requestAnimationFrame(renderHUD));
  sound(520);
  toast("点击地面移动，靠近星晶即可采集。找到精灵与符文台，再进入传送门！");
}
function renderHUD() {
  const hud = document.querySelector("#adventure-hud")!;
  if (!run) {
    hud.innerHTML = "";
    return;
  }
  const ready = run.gems.length === 5 && run.puzzle && run.friend;
  const labels = {
    rune: run.puzzle ? "符文已点亮" : "唤醒星光符文",
    fairy: run.friend ? "已经结识精灵" : "与露露交谈",
    portal: ready ? "完成探索，领取奖励" : "查看传送门",
    gem: "采集星晶",
  };
  hud.innerHTML = `<div class="adventure-top"><button class="soft-button" data-action="nav" data-id="map">${icon("chevron-left")} 地图</button><div class="adventure-objective"><span class="eyebrow">${REGIONS[Math.min(4, Math.floor(run.stage / 4))].name}</span><h2>${STAGE_NAMES[run.stage % 4]}</h2><p class="adventure-affinity">服饰加成 +${adventureBonus(save, Math.floor(run.stage / 4)).coins} 金币</p><div><span class="${run.gems.length === 5 ? "done" : ""}">${icon("gem")} ${run.gems.length} / 5</span><span class="${run.friend ? "done" : ""}">${icon("heart")} 精灵 ${run.friend ? "✓" : "0/1"}</span><span class="${run.puzzle ? "done" : ""}">${icon("sparkles")} 符文 ${run.puzzle ? "✓" : "0/1"}</span></div></div><button class="icon-button" data-action="help" aria-label="冒险帮助">${icon("info")}</button></div><div class="world-labels">${world
    ?.diagnostics()
    .points.filter((p) => p.kind !== "gem")
    .map(
      (p) =>
        `<span class="world-label" style="left:${p.x - wrap.getBoundingClientRect().left}px;top:${p.y - wrap.getBoundingClientRect().top - 42}px">${p.kind === "fairy" ? "精灵露露" : p.kind === "rune" ? "星光符文" : "星愿之门"}</span>`,
    )
    .join(
      "",
    )}</div><div class="adventure-controls"><div class="dpad" aria-label="方向控制"><button class="up" data-move="0,-1" aria-label="向北移动">${icon("arrow-up")}</button><button class="left" data-move="-1,0" aria-label="向西移动">${icon("arrow-left")}</button><button class="down" data-move="0,1" aria-label="向南移动">${icon("arrow-down")}</button><button class="right" data-move="1,0" aria-label="向东移动">${icon("arrow-right")}</button></div><span class="movement-help">点击地面移动<br>也可使用 WASD / 方向键</span>${near ? `<button class="primary-button interact-button" data-action="interact" data-kind="${near.kind}">${icon(near.kind === "fairy" ? "heart" : "sparkles")} ${labels[near.kind]}</button>` : `<div class="adventure-hint">${ready ? "星光已经汇聚 · 前往北方传送门" : run.gems.length < 5 ? "寻找地面上的紫色星晶" : "去拜访精灵，点亮符文台"}</div>`}</div>`;
  icons();
}
function interact() {
  if (!run || !near) return;
  if (near.kind === "fairy") {
    if (run.friend) {
      toast("露露：愿每一束星光都为你而亮！");
      return;
    }
    openModal(
      `<div class="fairy-portrait">✧</div><span class="eyebrow">A LITTLE ENCOUNTER</span><h2 id="modal-title">「你也在寻找星光吗？」</h2><p>小精灵露露抱着一团暗淡的光，轻轻落在你的肩头。<br>「森林睡着了，可我还想再看一次花开。」</p><div class="choice-buttons"><button class="choice" data-action="friend" data-id="share"><b>分给她一点温暖</b><small>把裙摆的光借给露露 · 额外获得 2 织梦丝</small></button><button class="choice" data-action="friend" data-id="listen"><b>坐下来，听她的故事</b><small>知道更多关于星愿的秘密 · 额外获得 50 金币</small></button></div>`,
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
      `<div class="reward-sparkles">✦ ✧ ✦</div><span class="eyebrow">A WISH COMES TRUE</span><h2 id="modal-title">又一段童话，被你点亮。</h2><p>${result.first ? "首次通关！新的旅程正在地图上等你。" : "再次相遇，也有新的收获。"}<br>你和露露约定，下次还要一起看花开。</p><div class="reward-grid"><span>${icon("coins")}<b>+${result.coins + (run.choice === "listen" ? 50 : 0)}</b><small>金币</small></span><span>${icon("gem")}<b>+${result.gems}</b><small>星晶</small></span><span>${icon("sparkles")}<b>+${result.thread}</b><small>织梦丝</small></span></div><div class="reward-level">搭配加成：+${result.bonus.coins} 金币 · +${result.bonus.thread} 织梦丝<br>星愿旅人 Lv. ${result.level} · ${result.first ? "+80" : "+40"} 经验</div><button class="primary-button wide" data-action="finish">继续星愿旅程 ${icon("chevron-right")}</button><button class="text-button" data-action="finish-closet">带着灵感，回到衣橱</button>`,
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
    `<div class="modal-emblem">${icon("settings")}</div><h2 id="modal-title">你的小小世界</h2><p>进度仅保存在当前浏览器。更换设备前，可以导出存档，再在新设备导入。</p><div class="settings-list"><button data-action="sound">${icon(save.sound ? "volume-2" : "volume-x")} 游戏音效 <b>${save.sound ? "已开启" : "已关闭"}</b></button><button data-action="export">${icon("download")} 导出冒险存档 ${icon("chevron-right")}</button><button data-action="import">${icon("upload")} 导入已有存档 ${icon("chevron-right")}</button></div><p class="small-note">没有付费、广告或账户系统。你的衣橱与旅程属于你。</p>`,
  );
}
function download(url: string, name: string) {
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
}
function showSlots() {
  openModal(
    `<div class="modal-emblem">${icon("bookmark")}</div><h2 id="modal-title">收藏心动搭配</h2><p>留住今天的灵感，下次一键穿上。</p><div class="slot-list">${save.slots.map((o, i) => `<div><span><b>搭配 ${i + 1}</b><small>${o ? ITEM[o.dress].name : "还没有收藏"}</small></span><button class="soft-button" data-action="slot-save" data-id="${i}">保存</button><button class="primary-button" data-action="slot-load" data-id="${i}" ${o ? "" : "disabled"}>穿上</button></div>`).join("")}</div>`,
  );
}
function help() {
  openModal(
    `<div class="modal-emblem">${icon("compass")}</div><h2 id="modal-title">每一段旅程，都从心动开始。</h2><div class="help-steps"><p><b>01 · 我的衣橱</b>点击服饰换装，拖动公主旋转查看。免费染色，收藏搭配，拍照留念。</p><p><b>02 · 星愿冒险</b>选择关卡，点击地面或用方向键移动。采集 5 颗星晶，靠近精灵和符文台互动，最后进入北方传送门。</p><p><b>03 · 制作与舞会</b>冒险奖励可制作新衣。按舞会主题搭配，每个主题每天可领一次奖励。</p><p><b>04 · 持续成长</b>完成 20 个故事关卡、每日委托和收藏成就。旧关可重复探索，奖励持续获得。</p></div><button class="primary-button wide" data-action="close">开始我的童话 ${icon("sparkles")}</button>`,
  );
}
app.addEventListener("click", (e) => {
  const b = (e.target as HTMLElement).closest<HTMLButtonElement>(
    "[data-action]",
  );
  if (!b || b.disabled) return;
  const a = b.dataset.action,
    id = b.dataset.id ?? "";
  switch (a) {
    case "nav":
      navigate(id);
      break;
    case "category":
      category = id as Category;
      renderCloset();
      icons();
      break;
    case "filter":
      filter = filter === "all" ? "owned" : "all";
      renderCloset();
      icons();
      break;
    case "equip":
      if (equip(save, id)) {
        world?.updateOutfit(save);
        persist();
        render();
        sound();
      } else {
        screen = "craft";
        render();
        toast("在织梦工坊制作这件新装，就能加入衣橱。");
      }
      break;
    case "dye":
      save.dye = id === "reset" ? null : id;
      world?.updateOutfit(save);
      persist();
      render();
      break;
    case "rotate":
      if (world) {
        world.rotate = -0.13;
        world.zoom = 1;
      }
      break;
    case "pose":
      if (world) world.pose = (world.pose + 1) % 3;
      toast("换一个心情，定格今天的闪耀。");
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
      icons();
      break;
    case "start":
      start(Number(id));
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
        toast("露露成为了你的旅途伙伴！额外礼物将在通关时领取。");
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
        icons();
        toast(`「${ITEM[id].name}」已加入衣橱！`);
        sound(880);
      } else toast("材料还不够。去冒险获得金币和织梦丝，或用星晶兑换。");
      break;
    case "exchange":
      if (exchange(save)) {
        persist();
        renderCraft();
        icons();
        toast("已用 15 星晶换得 8 织梦丝");
      } else toast("需要 15 星晶。冒险和每日委托都能获得。");
      break;
    case "theme":
      selectedTheme = Number(id);
      renderContest();
      icons();
      break;
    case "contest": {
      const t = THEMES[selectedTheme],
        r = contest(save, selectedTheme, t.style);
      persist();
      openModal(
        `<div class="contest-grade">${r.score >= 85 ? "S" : r.score >= 65 ? "A" : "B"}</div><span class="eyebrow">YOUR MOMENT TO SHINE</span><h2 id="modal-title">${r.score >= 85 ? "今夜的星光，为你而亮。" : "你的风格，值得被看见。"}</h2><p>${t.name} · ${r.score} 分<br>${r.first ? `获得 ${Math.floor(r.score * 1.5)} 金币、${r.score >= 85 ? 12 : 5} 星晶和 25 经验` : "今天已领取这个主题的奖励，明天再来赴约。"}</p><button class="primary-button wide" data-action="close">收藏这份闪耀</button>`,
      );
      sound(880);
      break;
    }
    case "claim":
      if (claim(save, id, b.dataset.daily === "true")) {
        persist();
        renderJournal();
        icons();
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
    case "import":
      (document.querySelector("#import-input") as HTMLInputElement).click();
      break;
    case "slots":
      showSlots();
      break;
    case "slot-save":
      save.slots[Number(id)] = { ...save.outfit };
      save.slotDyes[Number(id)] = save.dye;
      persist();
      showSlots();
      toast("搭配已收藏");
      break;
    case "slot-load":
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
});
dialog.addEventListener("cancel", (e) => {
  e.preventDefault();
  closeModal();
});
app.addEventListener("pointerdown", (e) => {
  const b = (e.target as HTMLElement).closest<HTMLElement>("[data-move]");
  if (!b || !world || world.paused) return;
  e.preventDefault();
  const [x, z] = b.dataset.move!.split(",").map(Number);
  world.setAxis(x, z);
  b.setPointerCapture(e.pointerId);
});
for (const name of ["pointerup", "pointercancel", "lostpointercapture"])
  app.addEventListener(name, () => world?.setAxis(0, 0));
window.addEventListener("keydown", (e) => {
  if (e.key.toLowerCase() === "e" && screen === "adventure" && !dialog.open)
    interact();
});
let resizeTimer = 0;
window.addEventListener("resize", () => {
  clearTimeout(resizeTimer);
  resizeTimer = window.setTimeout(() => {
    if (run) renderHUD();
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
    getRun: () => (run ? structuredClone(run) : null),
    diagnostics: () => world?.diagnostics(),
  },
  writable: false,
});
render();
if (storageWarning) toast(storageWarning);
setTimeout(() => {
  if (run) renderHUD();
}, 1000);
