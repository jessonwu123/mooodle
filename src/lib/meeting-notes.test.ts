import { test } from "node:test";
import assert from "node:assert/strict";
import { mergeMeetingNotes } from "./meeting-notes";

test("append preserves the existing classroom summary", () => {
  assert.equal(mergeMeetingNotes("原课堂总结", "会议纪要", "append"), "原课堂总结\n\n会议纪要");
});
test("replace only applies when explicitly selected", () => {
  assert.equal(mergeMeetingNotes("原课堂总结", "会议纪要", "replace"), "会议纪要");
});
test("empty imports cannot erase a classroom summary", () => {
  assert.throws(() => mergeMeetingNotes("原课堂总结", "  ", "replace"));
});