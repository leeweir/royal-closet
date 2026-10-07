export type Category = "dress" | "hair" | "crown" | "shoes" | "wings" | "wand";
export type Style = "优雅" | "甜美" | "自然" | "梦幻";
export type Item = {
  id: string;
  name: string;
  category: Category;
  color: string;
  accent: string;
  style: Style;
  rarity: number;
  shape: number;
  cost: number;
  material: number;
  region: number;
};
export const categories: { id: Category; name: string; icon: string }[] = [
  { id: "dress", name: "裙装", icon: "shirt" },
  { id: "hair", name: "发型", icon: "scissors" },
  { id: "crown", name: "冠饰", icon: "crown" },
  { id: "shoes", name: "鞋履", icon: "footprints" },
  { id: "wings", name: "羽翼", icon: "feather" },
  { id: "wand", name: "魔杖", icon: "wand-sparkles" },
];
const palettes = [
  ["#b7a0df", "#fff5dc"],
  ["#eeb1c5", "#fff4e7"],
  ["#8abdab", "#ebffe9"],
  ["#83bfe0", "#f0f8ff"],
  ["#596eab", "#e4d1ff"],
  ["#e8c275", "#fff8ea"],
];
const names: Record<Category, string[]> = {
  dress: [
    "月光序曲",
    "蔷薇来信",
    "森之精灵",
    "冰湖圆舞曲",
    "星夜咏叹",
    "晨曦加冕",
  ],
  hair: [
    "银月长发",
    "蜜桃双马尾",
    "森林编发",
    "冰蓝长卷",
    "暮色短发",
    "金色诗篇",
  ],
  crown: ["星愿王冠", "蔷薇花环", "新叶桂冠", "水晶冠冕", "月之环", "日光王冠"],
  shoes: [
    "月光舞鞋",
    "蔷薇缎鞋",
    "精灵短靴",
    "琉璃舞鞋",
    "星夜长靴",
    "金色足音",
  ],
  wings: [
    "微光蝶翼",
    "花间蝶梦",
    "新叶之羽",
    "冰晶羽翼",
    "星河之翼",
    "曙光天使",
  ],
  wand: [
    "星愿魔杖",
    "玫瑰手杖",
    "森林枝语",
    "冰晶法杖",
    "月轮之杖",
    "太阳权杖",
  ],
};
export const ITEMS: Item[] = categories.flatMap(({ id }) =>
  names[id].map((name, i) => ({
    id: `${id}-${i}`,
    name,
    category: id,
    color: palettes[i][0],
    accent: palettes[i][1],
    style: (["梦幻", "甜美", "自然", "优雅", "梦幻", "优雅"] as Style[])[i],
    rarity: i < 2 ? 3 : i < 4 ? 4 : 5,
    shape: i,
    cost: 100 + i * 85 + (id === "dress" ? 100 : 0),
    material: 3 + i * 2,
    region: Math.max(0, i - 1),
  })),
);
export const ITEM = Object.fromEntries(ITEMS.map((i) => [i.id, i])) as Record<
  string,
  Item
>;
export const REGIONS = [
  {
    name: "花语森林",
    subtitle: "让每一朵花，记起自己的名字",
    style: "自然",
    color: "#99b8a5",
    ground: "#dce8d0",
    leaf: "#c0a4d0",
    icon: "flower-2",
    story: "森林的花朵失去了光彩。小精灵露露相信，你能找回散落的星光。",
    reward: "森之精灵图纸",
  },
  {
    name: "蔷薇庭院",
    subtitle: "赴一场迟到了百年的茶会",
    style: "甜美",
    color: "#d797ae",
    ground: "#f0dce5",
    leaf: "#e7a6bd",
    icon: "heart",
    story: "沉睡的蔷薇钟楼即将敲响。收集星光，为茶会点亮第一盏灯。",
    reward: "冰湖圆舞曲图纸",
  },
  {
    name: "琉璃海岸",
    subtitle: "海风藏着未寄出的情书",
    style: "优雅",
    color: "#83aeca",
    ground: "#dfebee",
    leaf: "#9ecbd3",
    icon: "waves",
    story: "潮汐把星光带到了岸边。听说，只要让水晶共鸣，就能听见人鱼的歌。",
    reward: "星夜咏叹图纸",
  },
  {
    name: "月影雪原",
    subtitle: "在漫长的夜里，成为一束光",
    style: "梦幻",
    color: "#9d9bc4",
    ground: "#e5e4f0",
    leaf: "#bebadb",
    icon: "snowflake",
    story: "月亮遗落了自己的影子。沿着雪原前进，用温柔的魔法照亮归途。",
    reward: "晨曦加冕图纸",
  },
  {
    name: "星穹王城",
    subtitle: "属于你的童话，由此开始",
    style: "优雅",
    color: "#c4ac76",
    ground: "#efe7d2",
    leaf: "#dbca93",
    icon: "castle",
    story:
      "最后的星愿正在王城等待。让五个国度的光芒重新汇合，开启永不落幕的旅程。",
    reward: "星愿守护者称号",
  },
] as const;
export const STAGE_NAMES = [
  "迷途的星光",
  "精灵的邀约",
  "失落的花园",
  "星愿的回响",
];
export const THEMES: { name: string; style: Style; description: string }[] = [
  {
    name: "仲夏森林茶会",
    style: "自然",
    description: "把森林的清新，穿成一封邀请函。",
  },
  {
    name: "蔷薇少女的午后",
    style: "甜美",
    description: "像草莓奶油一样，柔软又明亮。",
  },
  {
    name: "月下的加冕舞会",
    style: "优雅",
    description: "每一步舞步，都闪着你的光。",
  },
  {
    name: "穿越星河的旅人",
    style: "梦幻",
    description: "用星光和想象力，写下新的童话。",
  },
];
export const INITIAL_OWNED = ITEMS.filter((i) => i.shape < 2).map((i) => i.id);
export const GEM_POSITIONS = [
  [-4, 3],
  [3, 2],
  [-3, -1],
  [4, -3],
  [0, -5],
];
export const STAGES_PER_REGION = STAGE_NAMES.length;
export const STAGE_COUNT = REGIONS.length * STAGES_PER_REGION;
/** Region a stage belongs to; endless free play (stage 20+) stays in the last. */
export const regionOf = (stage: number) =>
  Math.min(REGIONS.length - 1, Math.floor(stage / STAGES_PER_REGION));
/** Half-width of the walkable square in an adventure stage. */
export const WORLD_BOUNDS = 7.8;
export const GEM_PICKUP_RADIUS = 0.78;
export const INTERACT_RADIUS = 1.5;
