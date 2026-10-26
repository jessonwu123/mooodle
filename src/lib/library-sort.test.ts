import { test } from "node:test";
import assert from "node:assert/strict";
import { sortLibraryPapersByYear } from "./library-sort";

const paper = (id: string, year: number | null, name: string, kind: "paper" | "answer" = "paper") =>
  ({ id, year, name, kind });

test("library papers are ordered from the earliest year to the latest", () => {
  const sorted = sortLibraryPapersByYear([
    paper("c", 2013, "2013 AMC8"),
    paper("a", 2003, "2003 AMC8"),
    paper("b", 2008, "2008 AMC8"),
  ]);
  assert.deepEqual(sorted.map((p) => p.id), ["a", "b", "c"]);
});

test("papers without a year are listed after every dated paper", () => {
  const sorted = sortLibraryPapersByYear([
    paper("no-year", null, "历年真题汇编"),
    paper("late", 2019, "2019 AMC8"),
    paper("early", 2001, "2001 AMC8"),
  ]);
  assert.deepEqual(sorted.map((p) => p.id), ["early", "late", "no-year"]);
});

test("within one year the exam comes before its answer key", () => {
  const sorted = sortLibraryPapersByYear([
    paper("answer", 2010, "2010 AMC8 答案", "answer"),
    paper("exam", 2010, "2010 AMC8 试卷"),
  ]);
  assert.deepEqual(sorted.map((p) => p.id), ["exam", "answer"]);
});
