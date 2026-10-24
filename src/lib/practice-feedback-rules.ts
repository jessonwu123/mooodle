export const DAILY_AI_LIMIT = 10;
export function practiceUsageDay(date = new Date()): string {
  return new Date(date.getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}
export function remainingPracticeAnalyses(used: number): number {
  return Math.max(0, DAILY_AI_LIMIT - used);
}
export function needsMistakeAnalysis(results: Array<{ is_correct: boolean }>): boolean {
  return results.some((result) => !result.is_correct);
}