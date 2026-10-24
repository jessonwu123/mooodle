import { test } from "node:test";
import assert from "node:assert/strict";
import { latestAttemptPerQuestion } from "./accuracy";

test("同一道题多次作答只保留最新一次（输入按时间倒序）", () => {
  const logs = [
    { question_id: "q1", is_correct: true }, // 最新
    { question_id: "q2", is_correct: false },
    { question_id: "q1", is_correct: false }, // 较早，应被丢弃
  ];
  const out = latestAttemptPerQuestion(logs);
  assert.equal(out.length, 2);
  assert.equal(out.find((l) => l.question_id === "q1")?.is_correct, true);
});

test("每题只做一次时结果不变", () => {
  const logs = [
    { question_id: "q1", is_correct: true },
    { question_id: "q2", is_correct: false },
  ];
  assert.equal(latestAttemptPerQuestion(logs).length, 2);
});
