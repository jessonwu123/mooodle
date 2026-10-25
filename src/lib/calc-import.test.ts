import { test } from "node:test";
import assert from "node:assert/strict";
import { calcRowFromCells, parseCalcCsv, parseCalcLines, validateCalcMath } from "./calc-import";

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
test("CSV pipes never trigger spreadsheet delimiter guessing", () => {
  assert.deepEqual(parseCalcCsv('$|(-2.5)\\times(-4)|$ | $10$ | 有理数计算'), [
    { stem: '$|(-2.5)\\times(-4)|$', answer: '$10$', tags: ['有理数计算'] },
  ]);
});
test("UTF-8 CSV preserves Chinese, quoted commas, multiline math and absolute values", () => {
  assert.deepEqual(parseCalcCsv('\uFEFF题干,答案,知识点\r\n"$|-5|+|-8|$",$13$,"有理数计算,⭐"')[0],
    { stem: '$|-5|+|-8|$', answer: '$13$', tags: ['有理数计算', '⭐'] });
  assert.equal(parseCalcCsv('"题目第一行\n$|-5|$",$5$,有理数计算')[0]?.stem, '题目第一行\n$|-5|$');
});
test("split spreadsheet fragments and extra columns cannot silently import", () => {
  assert.throws(() => calcRowFromCells(['$', '-5', '$', '5', '有理数计算']));
  assert.throws(() => calcRowFromCells(['$\\left', '-5', '$']));
  assert.throws(() => parseCalcCsv('题干,答案,知识点\n"$|-5|$,5,有理数计算'));
  assert.throws(() => validateCalcMath('$\\left'));
  assert.doesNotThrow(() => validateCalcMath('$$|-5|$$'));
});