/**
 * 正确率统计规则：题库中的同一道题无论做几次，只计算最新一次的结果。
 * 输入必须按 attempted_at 倒序（最新在前），返回每题保留最新一次的记录。
 */
export function latestAttemptPerQuestion<T extends { question_id: string }>(logs: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const log of logs) {
    if (seen.has(log.question_id)) continue;
    seen.add(log.question_id);
    out.push(log);
  }
  return out;
}
