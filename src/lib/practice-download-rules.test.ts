import { test } from "node:test";
import assert from "node:assert/strict";
import { canDownloadFolder, chooseRandomQuestions } from "./practice-download-rules";

test("only folders with download permission can supply downloadable exams", () => {
  assert.equal(canDownloadFolder("read"), false);
  assert.equal(canDownloadFolder("none"), false);
  assert.equal(canDownloadFolder("download"), true);
  assert.equal(canDownloadFolder("upload"), true);
  assert.equal(canDownloadFolder("manage"), true);
  assert.equal(canDownloadFolder("download", true), false);
});

test("random selection adds the requested number without selecting duplicates", () => {
  const picked = chooseRandomQuestions(["a", "b", "c", "d", "d"], ["a"], 2);
  assert.equal(picked.length, 2);
  assert.equal(new Set(picked).size, 2);
  assert.equal(picked.includes("a"), false);
});

test("insufficient results select only the remaining available questions", () => {
  assert.deepEqual(chooseRandomQuestions(["a", "b"], ["a"], 10), ["b"]);
});