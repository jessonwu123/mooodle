import { test } from "node:test";
import assert from "node:assert/strict";
import { DAILY_AI_LIMIT, practiceUsageDay, remainingPracticeAnalyses, needsMistakeAnalysis } from "./practice-feedback-rules";
test("each student has at most ten analyses daily", () => {
  assert.equal(DAILY_AI_LIMIT, 10);
  assert.equal(remainingPracticeAnalyses(9), 1);
  assert.equal(remainingPracticeAnalyses(10), 0);
  assert.equal(remainingPracticeAnalyses(11), 0);
});
test("daily allowance resets at Shanghai midnight", () => {
  assert.equal(practiceUsageDay(new Date("2026-10-24T15:59:59Z")), "2026-10-24");
  assert.equal(practiceUsageDay(new Date("2026-10-24T16:00:00Z")), "2026-10-25");
});
test("perfect submissions do not consume mistake analysis", () => {
  assert.equal(needsMistakeAnalysis([{ is_correct: true }]), false);
  assert.equal(needsMistakeAnalysis([{ is_correct: false }]), true);
});