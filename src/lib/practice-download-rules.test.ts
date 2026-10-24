import { test, expect } from "bun:test";
import { canDownloadFolder, chooseRandomQuestions } from "./practice-download-rules";

test("only folders with download permission can supply downloadable exams", () => {
  expect(canDownloadFolder("read")).toBe(false);
  expect(canDownloadFolder("none")).toBe(false);
  expect(canDownloadFolder("download")).toBe(true);
  expect(canDownloadFolder("upload")).toBe(true);
  expect(canDownloadFolder("manage")).toBe(true);
  expect(canDownloadFolder("download", true)).toBe(false);
});

test("random selection adds the requested number without selecting duplicates", () => {
  const picked = chooseRandomQuestions(["a", "b", "c", "d", "d"], ["a"], 2);
  expect(picked.length).toBe(2);
  expect(new Set(picked).size).toBe(2);
  expect(picked.includes("a")).toBe(false);
});

test("insufficient results select only the remaining available questions", () => {
  expect(chooseRandomQuestions(["a", "b"], ["a"], 10)).toEqual(["b"]);
});