import { describe, expect, test } from "bun:test";
import { isMethodOnlyHint } from "./practice-hint";

describe("纯解题思路提示", () => {
  test("不允许具体数值及计算", () => {
    expect(isMethodOnlyHint("先算 44÷11，再相加。")).toBe(false);
    expect(isMethodOnlyHint("面积等于四十五。")).toBe(false);
    expect(isMethodOnlyHint("x＝y＋z")).toBe(false);
    expect(isMethodOnlyHint("将分数分别约分，再转成小数相加。")).toBe(true);
  });
  test("不允许泄露最终答案或正确选项", () => {
    expect(isMethodOnlyHint("正确答案为 C。")).toBe(false);
    expect(isMethodOnlyHint("结果为七。")).toBe(false);
    expect(isMethodOnlyHint("按条件分类讨论，排除不满足要求的情况。")).toBe(true);
  });
});