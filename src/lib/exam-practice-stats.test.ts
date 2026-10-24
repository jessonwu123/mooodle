import { test } from "node:test";
import assert from "node:assert/strict";
import { isWholePaperAttempt, practiceAccuracy, validateHintQuestions } from "./exam-practice-stats";

test("整卷统计只计入完整题目集合，不计自定义子集或重复题目", () => {
  assert.equal(isWholePaperAttempt(["b", "a", "c"], ["a", "b", "c"]), true);
  assert.equal(isWholePaperAttempt(["a", "b"], ["a", "b", "c"]), false);
  assert.equal(isWholePaperAttempt(["a", "a", "c"], ["a", "b", "c"]), false);
});
test("每卷正确率为答对题数除以整卷总题数", () => {
  assert.equal(practiceAccuracy(20, 25), 80);
  assert.equal(practiceAccuracy(0, 25), 0);
});
test("提示只能标记本次提交且确实有提示的题目", () => {
  assert.deepEqual(validateHintQuestions(["a"], ["a", "b"], ["a"]), ["a"]);
  assert.throws(() => validateHintQuestions(["c"], ["a", "b"], ["c"]));
  assert.throws(() => validateHintQuestions(["b"], ["a", "b"], ["a"]));
});