export const RATING_DIMENSIONS = ["focus", "interaction", "discipline", "accuracy"] as const;
export type RatingDimension = (typeof RATING_DIMENSIONS)[number];
export interface PluginRatingInput {
  scores: Partial<Record<RatingDimension, number>>;
  overall?: number;
  overallProgress?: number;
  items: { item_name: string; percentage: number }[];
}
/** Same defaults as the in-app rating form, used only when a new rating has to be created. */
export const NEW_RATING_DEFAULTS = { focus: 5, interaction: 5, discipline: 5, accuracy: 5, overall_assessment: 5, overall_progress: 80 };

const star = (v: unknown, label: string) => {
  if (v === undefined || v === null || v === "") return undefined;
  const n = Number(v);
  if (!Number.isInteger(n) || n < 1 || n > 5) throw new Error(`${label}需为 1–5 星`);
  return n;
};
const pct = (v: unknown, label: string) => {
  if (v === undefined || v === null || v === "") return undefined;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0 || n > 100) throw new Error(`${label}需为 0–100`);
  return Math.round(n);
};

/** Validates the optional rating fields sent by the plugin; every field may be omitted. */
export function parsePluginRating(raw: unknown): PluginRatingInput {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const labels: Record<RatingDimension, string> = { focus: "专注力", interaction: "互动性", discipline: "课堂纪律", accuracy: "做题准确率" };
  const scores: PluginRatingInput["scores"] = {};
  for (const d of RATING_DIMENSIONS) { const v = star(r[d], labels[d]); if (v !== undefined) scores[d] = v; }
  const rawItems = Array.isArray(r.items) ? r.items : [];
  if (rawItems.length > 30) throw new Error("知识点最多 30 个");
  const items = rawItems.map((it, i) => {
    const o = (it ?? {}) as Record<string, unknown>;
    const name = typeof o.item_name === "string" ? o.item_name.trim() : "";
    if (name.length > 100) throw new Error("知识点名称过长");
    return { item_name: name, percentage: pct(o.percentage, `第${i + 1}个知识点进度`) ?? 80 };
  }).filter(it => it.item_name);
  return { scores, overall: star(r.overall, "整体表现评估"), overallProgress: pct(r.overallProgress, "整体吸收程度"), items };
}
