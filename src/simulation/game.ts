import {
  ITEM,
  ITEMS,
  INITIAL_OWNED,
  categories,
  REGIONS,
  type Category,
  type Style,
} from "./data";
export type Outfit = Record<Category, string>;
export interface Save {
  version: 1;
  coins: number;
  gems: number;
  thread: number;
  xp: number;
  owned: string[];
  outfit: Outfit;
  dye: string | null;
  completed: number[];
  best: Record<string, number>;
  daily: {
    date: string;
    explores: number;
    crafted: number;
    styled: number;
    claimed: string[];
  };
  loginDate: string;
  streak: number;
  claims: string[];
  slots: (Outfit | null)[];
  slotDyes: (string | null)[];
  totalExplores: number;
  totalCrafts: number;
  totalEquips: number;
  sound: boolean;
}
export const STORAGE_KEY = "starlight-atelier-save-v1";
export function dateKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
export function freshSave(): Save {
  return {
    version: 1,
    coins: 360,
    gems: 25,
    thread: 8,
    xp: 0,
    owned: [...INITIAL_OWNED],
    outfit: Object.fromEntries(
      categories.map((c) => [c.id, `${c.id}-0`]),
    ) as Outfit,
    dye: null,
    completed: [],
    best: {},
    daily: { date: dateKey(), explores: 0, crafted: 0, styled: 0, claimed: [] },
    loginDate: "",
    streak: 0,
    claims: [],
    slots: [null, null, null],
    slotDyes: [null, null, null],
    totalExplores: 0,
    totalCrafts: 0,
    totalEquips: 0,
    sound: false,
  };
}
export function level(s: Save) {
  return 1 + Math.floor(s.xp / 100);
}
export function regionUnlocked(s: Save) {
  return Math.min(4, Math.floor(nextStage(s) / 4));
}
export function nextStage(s: Save) {
  for (let i = 0; i < 20; i++) if (!s.completed.includes(i)) return i;
  return 20;
}
export function refreshDay(s: Save, date = dateKey()) {
  if (s.daily.date !== date)
    s.daily = { date, explores: 0, crafted: 0, styled: 0, claimed: [] };
}
const finite = (x: unknown, max = 1e9) =>
  typeof x === "number" && Number.isFinite(x) && x >= 0 && x <= max;
export function validateSave(raw: unknown): Save {
  if (!raw || typeof raw !== "object") throw new Error("这不是有效的星愿存档");
  const x = raw as Save;
  if (
    x.version !== 1 ||
    ![
      "coins",
      "gems",
      "thread",
      "xp",
      "streak",
      "totalExplores",
      "totalCrafts",
      "totalEquips",
    ].every((k) => finite((x as unknown as Record<string, unknown>)[k])) ||
    !Array.isArray(x.owned) ||
    !x.owned.every((id) => !!ITEM[id]) ||
    !x.outfit ||
    !categories.every(
      (c) =>
        x.owned.includes(x.outfit[c.id]) &&
        ITEM[x.outfit[c.id]].category === c.id,
    ) ||
    !Array.isArray(x.completed) ||
    !x.completed.every((n) => Number.isInteger(n) && n >= 0 && n < 20)
  )
    throw new Error("存档内容不完整，原有进度已保留");
  if (
    !x.daily ||
    typeof x.daily.date !== "string" ||
    !["explores", "crafted", "styled"].every((k) =>
      finite((x.daily as unknown as Record<string, unknown>)[k]),
    ) ||
    !Array.isArray(x.daily.claimed) ||
    !x.daily.claimed.every((v) => typeof v === "string") ||
    !Array.isArray(x.claims) ||
    !x.claims.every((v) => typeof v === "string") ||
    typeof x.loginDate !== "string" ||
    !x.best ||
    typeof x.best !== "object" ||
    Array.isArray(x.best) ||
    !Object.values(x.best).every((n) => finite(n, 100)) ||
    !Array.isArray(x.slots) ||
    x.slots.length !== 3 ||
    !x.slots.every(
      (o) =>
        o === null ||
        (typeof o === "object" &&
          categories.every(
            (c) => x.owned.includes(o[c.id]) && ITEM[o[c.id]].category === c.id,
          )),
    ) ||
    (x.dye !== null && !/^#[0-9a-f]{6}$/i.test(x.dye))
  )
    throw new Error("存档格式不正确，原有进度已保留");
  if (
    x.slotDyes !== undefined &&
    (!Array.isArray(x.slotDyes) ||
      x.slotDyes.length !== 3 ||
      !x.slotDyes.every(
        (c) =>
          c === null || (typeof c === "string" && /^#[0-9a-f]{6}$/i.test(c)),
      ))
  )
    throw new Error("收藏搭配的染色数据不正确");
  const result = structuredClone(x);
  result.slotDyes ??= [null, null, null];
  result.owned = [...new Set(result.owned)];
  result.completed = [...new Set(result.completed)];
  result.sound = !!x.sound;
  refreshDay(result);
  return result;
}
export function equip(s: Save, id: string) {
  const i = ITEM[id];
  if (!i || !s.owned.includes(id)) return false;
  s.outfit[i.category] = id;
  if (i.category === "dress") s.dye = null;
  s.totalEquips++;
  return true;
}
export function craft(s: Save, id: string) {
  const i = ITEM[id];
  if (
    !i ||
    s.owned.includes(id) ||
    regionUnlocked(s) < i.region ||
    s.coins < i.cost ||
    s.thread < i.material
  )
    return false;
  s.coins -= i.cost;
  s.thread -= i.material;
  s.owned.push(id);
  s.totalCrafts++;
  refreshDay(s);
  s.daily.crafted++;
  s.xp += 30;
  return true;
}
export function styleScore(s: Save, style: Style) {
  return Math.min(
    100,
    Object.values(s.outfit).reduce(
      (n, id) => n + 5 + ITEM[id].rarity + (ITEM[id].style === style ? 8 : 0),
      0,
    ),
  );
}
export function contest(s: Save, theme: number, style: Style) {
  refreshDay(s);
  const score = styleScore(s, style);
  const key = `${s.daily.date}:${theme}`;
  const first = s.best[key] === undefined;
  s.best[key] = Math.max(score, s.best[key] ?? 0);
  if (first) {
    s.coins += Math.floor(score * 1.5);
    s.gems += score >= 85 ? 12 : 5;
    s.xp += 25;
    s.daily.styled++;
  }
  return { score, first };
}
export function login(s: Save, date = dateKey()) {
  refreshDay(s, date);
  if (s.loginDate === date) return false;
  const yesterday = new Date(`${date}T12:00:00`);
  yesterday.setDate(yesterday.getDate() - 1);
  s.streak = s.loginDate === dateKey(yesterday) ? (s.streak % 7) + 1 : 1;
  s.loginDate = date;
  s.coins += 100 + s.streak * 20;
  s.gems += 10;
  s.thread += 3;
  return true;
}
export const QUESTS = [
  {
    id: "explore",
    name: "向童话出发",
    description: "完成 2 次秘境探索",
    target: 2,
    value: (s: Save) => s.daily.explores,
    coins: 160,
    gems: 10,
  },
  {
    id: "style",
    name: "今日闪耀时刻",
    description: "参加 1 次搭配挑战",
    target: 1,
    value: (s: Save) => s.daily.styled,
    coins: 100,
    gems: 8,
  },
  {
    id: "craft",
    name: "亲手编织星光",
    description: "制作 1 件新装",
    target: 1,
    value: (s: Save) => s.daily.crafted,
    coins: 150,
    gems: 10,
  },
];
export const ACHIEVEMENTS = [
  {
    id: "first",
    name: "第一束星光",
    description: "完成第一次冒险",
    target: 1,
    value: (s: Save) => s.totalExplores,
    coins: 150,
    gems: 15,
  },
  {
    id: "collector",
    name: "衣橱里的小宇宙",
    description: "收集 18 件服饰",
    target: 18,
    value: (s: Save) => s.owned.length,
    coins: 300,
    gems: 30,
  },
  {
    id: "traveler",
    name: "远方的来信",
    description: "完成 8 个不同关卡",
    target: 8,
    value: (s: Save) => s.completed.length,
    coins: 400,
    gems: 40,
  },
  {
    id: "designer",
    name: "星愿裁缝师",
    description: "制作 6 件服饰",
    target: 6,
    value: (s: Save) => s.totalCrafts,
    coins: 350,
    gems: 30,
  },
  {
    id: "guardian",
    name: "星愿守护者",
    description: "完成全部 20 个故事关卡",
    target: 20,
    value: (s: Save) => s.completed.length,
    coins: 1000,
    gems: 100,
  },
  {
    id: "all",
    name: "童话收藏家",
    description: "收藏全部 36 件服饰",
    target: ITEMS.length,
    value: (s: Save) => s.owned.length,
    coins: 1000,
    gems: 100,
  },
];
export function claim(s: Save, id: string, daily: boolean) {
  refreshDay(s);
  const q = (daily ? QUESTS : ACHIEVEMENTS).find((x) => x.id === id);
  const list = daily ? s.daily.claimed : s.claims;
  if (!q || q.value(s) < q.target || list.includes(id)) return false;
  list.push(id);
  s.coins += q.coins;
  s.gems += q.gems;
  return true;
}
export interface Run {
  stage: number;
  gems: number[];
  puzzle: boolean;
  friend: boolean;
  finished: boolean;
  choice: "share" | "listen" | null;
}
export function createRun(s: Save, stage: number): Run | null {
  if (!Number.isInteger(stage) || stage < 0 || stage > nextStage(s))
    return null;
  return {
    stage,
    gems: [],
    puzzle: false,
    friend: false,
    finished: false,
    choice: null,
  };
}
export function collect(run: Run, index: number) {
  if (
    run.finished ||
    !Number.isInteger(index) ||
    index < 0 ||
    index > 4 ||
    run.gems.includes(index)
  )
    return false;
  run.gems.push(index);
  return true;
}
export function adventureBonus(s: Save, region: number) {
  const matches = Object.values(s.outfit).filter(
    (id) => ITEM[id].style === REGIONS[Math.min(4, region)].style,
  ).length;
  return { matches, coins: matches * 8, thread: Math.floor(matches / 2) };
}
export function finishRun(s: Save, run: Run) {
  if (run.finished || run.gems.length < 5 || !run.puzzle || !run.friend)
    return null;
  run.finished = true;
  const first = run.stage < 20 && !s.completed.includes(run.stage);
  if (first) s.completed.push(run.stage);
  const region = Math.min(4, Math.floor(run.stage / 4));
  const bonus = adventureBonus(s, region);
  const coins = 100 + region * 30 + (first ? 100 : 0) + bonus.coins;
  const gems = 8 + region * 2 + (first ? 12 : 0);
  const thread = 4 + region + (run.choice === "share" ? 2 : 0) + bonus.thread;
  s.coins += coins;
  s.gems += gems;
  s.thread += thread;
  s.xp += first ? 80 : 40;
  s.totalExplores++;
  refreshDay(s);
  s.daily.explores++;
  return { coins, gems, thread, first, level: level(s), bonus };
}
export function exchange(s: Save) {
  if (s.gems < 15) return false;
  s.gems -= 15;
  s.thread += 8;
  return true;
}
