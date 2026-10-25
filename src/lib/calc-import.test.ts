import { test } from "node:test";
import assert from "node:assert/strict";
import { calcRowFromCells, parseCalcLines } from "./calc-import";

test("absolute values stay in the stem and never become tags", () => {
  assert.deepEqual(parseCalcLines("$|-5|+|-8|$ | $13$ | 有理数计算"), [
    { stem: "$|-5|+|-8|$", answer: "$13$", tags: ["有理数计算"] },
  ]);
});
test("Excel cells preserve absolute values without re-splitting", () => {
  assert.deepEqual(calcRowFromCells(["|-5|", "5", "有理数计算"]),
    { stem: "|-5|", answer: "5", tags: ["有理数计算"] });
});
test("tab columns preserve unwrapped absolute values", () => {
  assert.equal(parseCalcLines("|-5|\t5\t有理数计算")[0]?.stem, "|-5|");
});
test("ambiguous extra columns and unclosed math are rejected", () => {
  assert.throws(() => parseCalcLines("|-5| | 5 | 有理数计算"));
  assert.throws(() => parseCalcLines("$|-5| | 5 | 有理数计算"));
});
test("ordinary formulas and multiple tags still import", () => {
  assert.deepEqual(parseCalcLines("题干|答案|知识点\n$2x+3=7$|$x=2$|一元一次方程,⭐")[0]?.tags,
    ["一元一次方程", "⭐"]);
});