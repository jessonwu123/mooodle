import { test } from "node:test";
import assert from "node:assert/strict";
import { creditTeacherFor, estimateCredits, readReportedUsage, type CreditPricing } from "./ai-credit-rules";
const pricing: CreditPricing = { cost_currency: "credits", input: { text: { tiers: [{ min: 0, max: 272000, cost: "0.00004" }, { min: 272000, cost: "0.00008" }], cache_read: { tiers: [{ min: 0, max: 272000, cost: "0.000004" }, { min: 272000, cost: "0.000008" }] } } }, output: { text: { tiers: [{ min: 0, max: 272000, cost: "0.0002" }, { min: 272000, cost: "0.0003" }] } } };
test("学生credits归创建账号的老师，教师本人归自己", () => {
  assert.equal(creditTeacherFor("student", true, "creator"), "creator");
  assert.equal(creditTeacherFor("teacher", false, "another"), "teacher");
  assert.equal(creditTeacherFor("self-registered", true, null), null);
});
test("缓存输入和输出分别计价，长上下文采用对应档位", () => {
  assert.equal(estimateCredits(readReportedUsage({ input_tokens: 1000, output_tokens: 100, input_tokens_details: { cached_tokens: 500 } }), pricing), 0.042);
  assert.equal(estimateCredits(readReportedUsage({ input_tokens: 272000, output_tokens: 100 }), pricing), 21.79);
});
test("缺少真实用量或价格时记未知，不能记零", () => {
  assert.equal(estimateCredits(null, pricing), null);
  assert.equal(estimateCredits(readReportedUsage({ input_tokens: 10, output_tokens: 5 }), null), null);
  assert.equal(readReportedUsage({ input_tokens: 1, output_tokens: 2, input_tokens_details: { cached_tokens: 2 } }), null);
});