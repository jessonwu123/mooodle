import { test } from "node:test";
import assert from "node:assert/strict";
import { parsePracticeCount } from "./practice-count";

test("custom quantities accept whole numbers within the existing practice limits", () => {
  assert.equal(parsePracticeCount("7", 50), 7);
  assert.equal(parsePracticeCount("50", 50), 50);
  assert.equal(parsePracticeCount("20", 20), 20);
  for (const value of ["", "0", "-1", "1.5", "51", "abc"]) {
    assert.equal(parsePracticeCount(value, 50), null);
  }
  assert.equal(parsePracticeCount("21", 20), null);
});