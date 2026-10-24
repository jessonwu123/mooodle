import { describe, it as test } from "node:test";
import assert from "node:assert/strict";
import { isMethodOnlyHint } from "./practice-hint";

describe("纯解题思路提示", () => {
  test("不允许具体数值及计算", () => {
    assert.equal(isMethodOnlyHint("先算 44÷11，再相加。"), false);
    assert.equal(isMethodOnlyHint("面积等于四十五。"), false);
    assert.equal(isMethodOnlyHint("x＝y＋z"), false);
    assert.equal(isMethodOnlyHint("将分数分别约分，再转成小数相加。"), true);
  });
  test("不允许泄露最终答案或正确选项", () => {
    assert.equal(isMethodOnlyHint("正确答案为 C。"), false);
    assert.equal(isMethodOnlyHint("结果为七。"), false);
    assert.equal(isMethodOnlyHint("按条件分类讨论，排除不满足要求的情况。"), true);
  });
});