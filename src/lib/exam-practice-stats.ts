export function isWholePaperAttempt(questionIds: string[], paperQuestionIds: string[]) {
  const actual = new Set(questionIds);
  return paperQuestionIds.length > 0 && actual.size === questionIds.length && actual.size === paperQuestionIds.length && paperQuestionIds.every((id) => actual.has(id));
}

export function practiceAccuracy(correct: number, total: number) {
  return total > 0 ? Math.round(correct / total * 1000) / 10 : 0;
}

export function validateHintQuestions(ids: string[], submittedIds: string[], availableHintIds: string[]) {
  const submitted = new Set(submittedIds);
  const available = new Set(availableHintIds);
  if (new Set(ids).size !== ids.length || ids.some((id) => !submitted.has(id) || !available.has(id))) throw new Error("提示记录与本次题目不匹配");
  return ids;
}