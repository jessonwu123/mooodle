import { expect, test } from "bun:test";
import { isWholePaperAttempt, practiceAccuracy, validateHintQuestions } from "./exam-practice-stats";

test("整卷统计只计入完整题目集合，不计自定义子集或重复题目", () => {
  expect(isWholePaperAttempt(["b", "a", "c"], ["a", "b", "c"])).toBe(true);
  expect(isWholePaperAttempt(["a", "b"], ["a", "b", "c"])).toBe(false);
  expect(isWholePaperAttempt(["a", "a", "c"], ["a", "b", "c"])).toBe(false);
});
test("每卷正确率为答对题数除以整卷总题数", () => {
  expect(practiceAccuracy(20, 25)).toBe(80);
  expect(practiceAccuracy(0, 25)).toBe(0);
});
test("提示只能标记本次提交且确实有提示的题目", () => {
  expect(validateHintQuestions(["a"], ["a", "b"], ["a"])).toEqual(["a"]);
  expect(() => validateHintQuestions(["c"], ["a", "b"], ["c"])).toThrow();
  expect(() => validateHintQuestions(["b"], ["a", "b"], ["a"])).toThrow();
});