import eggImg from "@/assets/pets/egg.png";
import baize1 from "@/assets/pets/baize_1.png";
import baize2 from "@/assets/pets/baize_2.png";
import dijiang1 from "@/assets/pets/dijiang_1.png";
import dijiang2 from "@/assets/pets/dijiang_2.png";
import jiuweihu1 from "@/assets/pets/jiuweihu_1.png";
import jiuweihu2 from "@/assets/pets/jiuweihu_2.png";
import jingwei1 from "@/assets/pets/jingwei_1.png";
import jingwei2 from "@/assets/pets/jingwei_2.png";
import zhuyin1 from "@/assets/pets/zhuyin_1.png";
import zhuyin2 from "@/assets/pets/zhuyin_2.png";
import qilin1 from "@/assets/pets/qilin_1.png";
import qilin2 from "@/assets/pets/qilin_2.png";
import qinglong1 from "@/assets/pets/qinglong_1.png";
import qinglong2 from "@/assets/pets/qinglong_2.png";
import baihu1 from "@/assets/pets/baihu_1.png";
import baihu2 from "@/assets/pets/baihu_2.png";
import zhuque1 from "@/assets/pets/zhuque_1.png";
import zhuque2 from "@/assets/pets/zhuque_2.png";
import xuanwu1 from "@/assets/pets/xuanwu_1.png";
import xuanwu2 from "@/assets/pets/xuanwu_2.png";

export const EGG_IMG = eggImg;

export type PetSpecies =
  | "baize"
  | "dijiang"
  | "jiuweihu"
  | "jingwei"
  | "zhuyin"
  | "qilin"
  | "qinglong"
  | "baihu"
  | "zhuque"
  | "xuanwu";

export const PET_LIST: { key: PetSpecies; name: string }[] = [
  { key: "baize", name: "白泽" },
  { key: "dijiang", name: "帝江" },
  { key: "jiuweihu", name: "九尾狐" },
  { key: "jingwei", name: "精卫" },
  { key: "zhuyin", name: "烛阴" },
  { key: "qilin", name: "麒麟" },
  { key: "qinglong", name: "青龙" },
  { key: "baihu", name: "白虎" },
  { key: "zhuque", name: "朱雀" },
  { key: "xuanwu", name: "玄武" },
];

export const PET_NAME: Record<PetSpecies, string> = Object.fromEntries(
  PET_LIST.map((p) => [p.key, p.name]),
) as Record<PetSpecies, string>;

const PET_IMAGES: Record<PetSpecies, [string, string]> = {
  baize: [baize1, baize2],
  dijiang: [dijiang1, dijiang2],
  jiuweihu: [jiuweihu1, jiuweihu2],
  jingwei: [jingwei1, jingwei2],
  zhuyin: [zhuyin1, zhuyin2],
  qilin: [qilin1, qilin2],
  qinglong: [qinglong1, qinglong2],
  baihu: [baihu1, baihu2],
  zhuque: [zhuque1, zhuque2],
  xuanwu: [xuanwu1, xuanwu2],
};

/** 第几张图：1-9 级用幼年图，10+ 用成年图 */
export function petImage(species: PetSpecies, level: number): string {
  return PET_IMAGES[species][level >= 10 ? 1 : 0];
}

/** 形象清晰度：等级越高越清晰。返回 CSS filter 值 */
export function petFilter(level: number): string {
  if (level <= 0) return "none";
  // 1-9: 模糊 4 → 0；10-20: 模糊 3 → 0；>20: 无模糊
  let blur = 0;
  if (level < 10) blur = Math.max(0, 4 - (level - 1) * 0.5);
  else if (level < 20) blur = Math.max(0, 3 - (level - 10) * 0.3);
  const saturate = Math.min(1.4, 1 + level * 0.02);
  return `blur(${blur.toFixed(2)}px) saturate(${saturate.toFixed(2)})`;
}

/** 升到下一级所需经验：当前 level → level+1 需要 level*10 */
export function xpForNext(level: number): number {
  return Math.max(10, level * 10);
}

/** 孵化所需经验 */
export const HATCH_XP = 10;

export type FoodTier = "normal" | "quality" | "elixir";
export const FOOD_INFO: Record<FoodTier, { name: string; xp: number; emoji: string }> = {
  normal: { name: "普通粮", xp: 1, emoji: "🍚" },
  quality: { name: "优质粮", xp: 2, emoji: "🍱" },
  elixir: { name: "灵丹", xp: 5, emoji: "✨" },
};

/** 根据本轮得分判断食物等级 */
export function foodTierForScore(score: number): FoodTier {
  if (score >= 8) return "elixir";
  if (score >= 4) return "quality";
  return "normal";
}

export function pickRandomSpecies(): PetSpecies {
  return PET_LIST[Math.floor(Math.random() * PET_LIST.length)].key;
}
