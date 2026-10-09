import {
  ITEM,
  ITEM_DRESS_IDS,
  REGIONS,
  categories,
  type Category,
} from "./data";
import type { Outfit, Save } from "./game";
export type GroundPoint = { x: number; z: number };
// Derived from the wardrobe itself: adding a set to the data file adds it to
// the set tab, the fitting room and the atelier with no second list to update.
export const COLLECTIONS = ITEM_DRESS_IDS.map((id, index) => ({
  id: index,
  name: ITEM[id].name,
  items: categories.map((c) => `${c.id}-${index}`),
  style: ITEM[id].style,
}));
/** Sets change atomically; an incomplete collection never replaces part of a look. */
export function equipCollection(save: Save, index: number) {
  const set = COLLECTIONS[index];
  if (!set || !set.items.every((id) => save.owned.includes(id))) return false;
  save.outfit = Object.fromEntries(
    set.items.map((id) => [ITEM[id].category, id]),
  ) as Outfit;
  save.dye = null;
  save.totalEquips++;
  return true;
}
export const REGION_STORIES = [
  {
    stages: ["迷途的星光", "花蕊的邀约", "蘑菇环的秘密", "森林的回响"],
    npc: {
      name: "露露",
      title: "花语精灵",
      kind: "fairy",
      icon: "flower-2",
      color: "#d5b0db",
      greeting: "你也在寻找星光吗？",
      story: "露露抱着一朵还没睡醒的小花。她想借一点星光，让森林再开一次花。",
      share: "把裙摆的光借给小花",
      listen: "听一听森林的悄悄话",
      farewell: "下次一起等花开吧！",
    },
    landmark: "蘑菇花环",
  },
  {
    stages: ["迟到的茶会", "蔷薇钟声", "甜点迷藏", "花园的晚灯"],
    npc: {
      name: "绵绵",
      title: "茶会兔管家",
      kind: "rabbit",
      icon: "heart",
      color: "#e2a8bb",
      greeting: "茶已经温好了，就等你啦。",
      story:
        "兔管家绵绵铺好了蕾丝桌布，却发现茶会的灯全都睡着了。帮她把星光带回蔷薇亭吧。",
      share: "为茶会点亮一盏花灯",
      listen: "听百年前的茶会故事",
      farewell: "下一杯花茶为你留着。",
    },
    landmark: "蔷薇茶亭",
  },
  {
    stages: ["贝壳里的歌", "潮汐来信", "珍珠小径", "海风的约定"],
    npc: {
      name: "汐汐",
      title: "人鱼歌者",
      kind: "mermaid",
      icon: "waves",
      color: "#82c5cf",
      greeting: "你听见贝壳的歌了吗？",
      story:
        "人鱼汐汐坐在珍珠贝上。海风吹散了她的旋律，只有岸边的星晶还记得每一个音符。",
      share: "把一束星光送给海浪",
      listen: "听一首潮汐的歌",
      farewell: "让海风把我的歌带给你。",
    },
    landmark: "珍珠贝湾",
  },
  {
    stages: ["雪地的脚印", "月灯初亮", "冰晶回廊", "极光归途"],
    npc: {
      name: "霜霜",
      title: "月灯雪狐",
      kind: "fox",
      icon: "snowflake",
      color: "#b7bfeb",
      greeting: "跟着月灯，就不会迷路。",
      story:
        "雪狐霜霜守着最后一盏月灯。她想为晚归的小动物们，照亮穿过雪原的路。",
      share: "给月灯添一点暖光",
      listen: "听极光下的秘密",
      farewell: "愿每一条归途都有灯亮着。",
    },
    landmark: "月灯冰阵",
  },
  {
    stages: ["王城的请柬", "星盘苏醒", "云端花园", "星愿加冕"],
    npc: {
      name: "奥莉",
      title: "王城星使",
      kind: "owl",
      icon: "crown",
      color: "#dfbd77",
      greeting: "欢迎，带着五国星光的旅人。",
      story:
        "猫头鹰星使奥莉打开了星愿名册。王城的星盘还缺最后几束光，而你的名字就在邀请函上。",
      share: "把星光交给王城星盘",
      listen: "听五个国度的故事",
      farewell: "你的童话，才刚刚开始。",
    },
    landmark: "王城星盘",
  },
] as const;
export function stageName(stage: number) {
  return REGION_STORIES[Math.min(4, Math.floor(stage / 4))].stages[stage % 4];
}
const point = (x: number, z: number) => ({ x, z });
const layouts = [
  {
    spawn: point(0, 6),
    gems: [
      point(-4, 3),
      point(3, 2),
      point(-3, -1),
      point(4, -3),
      point(0, -5),
    ],
    npc: point(5, 5),
    rune: point(-5, -4),
    portal: point(0, -7.2),
    path: [point(0, 6), point(-2, 2), point(2, -2), point(0, -7.2)],
  },
  {
    spawn: point(-4.5, 4.5),
    gems: [
      point(-4, 1),
      point(-2, -3),
      point(2, -4.5),
      point(4.5, -1),
      point(3, 3.5),
    ],
    npc: point(0, 4),
    rune: point(0, -5.8),
    portal: point(5.5, 3),
    path: [
      point(-4.5, 4.5),
      point(-4, 0),
      point(0, -5),
      point(5, 0),
      point(5.5, 3),
    ],
  },
  {
    spawn: point(-5, 4),
    gems: [
      point(-3.5, 2),
      point(-1.5, -1),
      point(1, 1),
      point(3, -2.5),
      point(1.9, -4.8),
    ],
    npc: point(3, 4.5),
    rune: point(-4, -3.5),
    portal: point(5.4, -4.8),
    path: [
      point(-5, 4),
      point(-3.5, 0),
      point(0, -1),
      point(2.5, -1),
      point(5.4, -4.8),
    ],
  },
  {
    spawn: point(4.5, 4.5),
    gems: [
      point(2.5, 3),
      point(-1, 2),
      point(-4, 0),
      point(-2, -3),
      point(1, -4.5),
    ],
    npc: point(-4.5, 3.8),
    rune: point(3, -4.5),
    portal: point(0, -7.2),
    path: [
      point(4.5, 4.5),
      point(-3, 2),
      point(-4, -1),
      point(1, -4.5),
      point(0, -7.2),
    ],
  },
  {
    spawn: point(0, 6.5),
    gems: [
      point(-3.8, 3.2),
      point(3.8, 3.2),
      point(-3.8, -2.5),
      point(3.8, -2.5),
      point(0, -4.5),
    ],
    npc: point(4.5, 0),
    rune: point(-4.5, 0),
    portal: point(0, -7.2),
    path: [
      point(0, 6.5),
      point(0, 0),
      point(-4.5, 0),
      point(0, 0),
      point(4.5, 0),
      point(0, 0),
      point(0, -7.2),
    ],
  },
];
/** Each chapter has its own route; its four stories turn that route as a whole. */
export function stageLayout(stage: number) {
  const region = Math.min(4, Math.floor(stage / 4));
  const base = layouts[region];
  const angle = ((stage % 4) * Math.PI) / 2;
  const turn = (p: GroundPoint) =>
    point(
      p.x * Math.cos(angle) - p.z * Math.sin(angle),
      p.x * Math.sin(angle) + p.z * Math.cos(angle),
    );
  return {
    spawn: turn(base.spawn),
    gems: base.gems.map(turn),
    npc: turn(base.npc),
    rune: turn(base.rune),
    portal: turn(base.portal),
    path: base.path.map(turn),
    angle,
  };
}
/** Per-silhouette adventure tuning, indexed by item.shape; one entry per set. */
const SHOE_SPEED = [0, 8, 18, 12, 23, 15, 10, 8, 6, 16, 14, 26, 4, 18, 12];
const WING_PICKUP = [
  0.9, 1.05, 1.15, 1.25, 1.45, 1.35, 1.2, 1.4, 1.2, 1.5, 1.25, 1.5, 1.3, 1.3,
  1.35,
];
export function adventureAbilities(outfit: Outfit, region: number) {
  const shoe = ITEM[outfit.shoes].shape,
    wing = ITEM[outfit.wings].shape,
    wand = ITEM[outfit.wand].shape;
  const resonance =
    region >= 0 && ITEM[outfit.dress].style === REGIONS[region].style;
  const speedBonus = SHOE_SPEED[shoe];
  const pickupRadius = WING_PICKUP[wing];
  return {
    speed: 2.6 * (1 + speedBonus / 100),
    speedBonus,
    pickupRadius,
    spellRadius: 2.1 + wand * 0.16 + (resonance ? 0.6 : 0),
    cooldown: resonance ? 5 : 7,
    resonance,
    style: ITEM[outfit.dress].style,
  };
}
export function itemAbility(category: Category, id: string) {
  const item = ITEM[id];
  if (category === "dress") return `${item.style}地区：魔法更广，恢复更快`;
  // These read from the same tables the adventure uses, so a new shoe or
  // wing can never show a value the game does not actually apply.
  if (category === "shoes") return `步速 +${SHOE_SPEED[item.shape]}%`;
  if (category === "wings")
    return `靠近 ${WING_PICKUP[item.shape].toFixed(2)} 米自动采晶`;
  if (category === "wand")
    return `共鸣采晶范围 ${(2.1 + item.shape * 0.16).toFixed(1)} 米`;
  return `${item.style}搭配：舞会加分与地区奖励`;
}
