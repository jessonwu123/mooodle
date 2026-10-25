export type CreditPricing = {
  cost_currency: string;
  input: { text: { tiers: PriceTier[]; cache_read?: { tiers: PriceTier[] } } };
  output: { text: { tiers: PriceTier[] } };
};
type PriceTier = { min: number; max?: number; cost: string };
export type ReportedUsage = { input_tokens: number; output_tokens: number; input_tokens_details?: { cached_tokens?: number } };

export function readReportedUsage(value: unknown): ReportedUsage | null {
  if (!value || typeof value !== "object") return null;
  const v = value as ReportedUsage;
  const cached = v.input_tokens_details?.cached_tokens ?? 0;
  if (![v.input_tokens, v.output_tokens, cached].every(n => Number.isSafeInteger(n) && n >= 0) || cached > v.input_tokens) return null;
  return { input_tokens: v.input_tokens, output_tokens: v.output_tokens, input_tokens_details: { cached_tokens: cached } };
}

export function estimateCredits(usage: ReportedUsage | null, pricing: CreditPricing | null): number | null {
  if (!usage || !pricing || pricing.cost_currency !== "credits") return null;
  const rate = (tiers: PriceTier[] | undefined) => {
    const tier = tiers?.find(t => usage.input_tokens >= t.min && (t.max === undefined || usage.input_tokens < t.max));
    const n = tier ? Number(tier.cost) : NaN;
    return Number.isFinite(n) && n >= 0 ? n : null;
  };
  const cached = usage.input_tokens_details?.cached_tokens ?? 0;
  const input = rate(pricing.input?.text?.tiers), output = rate(pricing.output?.text?.tiers);
  const cache = cached ? rate(pricing.input?.text?.cache_read?.tiers) : 0;
  if (input === null || output === null || cache === null) return null;
  return Number(((usage.input_tokens - cached) * input + cached * cache + usage.output_tokens * output).toFixed(10));
}

export function creditTeacherFor(actorId: string, isStudent: boolean, accountCreator: string | null): string | null {
  return isStudent ? accountCreator : actorId;
}

export const CREDIT_FEATURES: Record<string, string> = {
  meeting_feedback: "插件课堂反馈", practice_feedback: "练习错因分析", learning_analytics: "学习分析",
  paper_extract: "试卷题目提取", solution_extract: "解析提取", solution_translate: "解析翻译",
  paper_tags: "试卷知识点标注", bank_tags: "题库知识点标注",
};