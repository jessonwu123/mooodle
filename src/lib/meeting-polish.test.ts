import { test } from "node:test";
import assert from "node:assert/strict";
import { validateMeetingPolishText, canPolishMeeting } from "./meeting-polish";

test("仅教师和管理员能生成课堂反馈", () => {
  assert.equal(canPolishMeeting(["teacher"]), true);
  assert.equal(canPolishMeeting(["admin"]), true);
  assert.equal(canPolishMeeting([]), false);
  assert.equal(canPolishMeeting(["student"]), false);
});
test("生成前拒绝空纪要及超长纪要", () => {
  assert.throws(() => validateMeetingPolishText("  "));
  assert.throws(() => validateMeetingPolishText("字".repeat(100001)));
  assert.equal(validateMeetingPolishText("字".repeat(100000)).length, 100000);
});