import { test } from "node:test";
import assert from "node:assert/strict";
import { validateMeetingPolishText, canPolishMeeting, validateMeetingPolishLanguage, withMeetingPolishLanguage } from "./meeting-polish";

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

test("反馈仅支持中文或英文，旧版请求默认中文", () => {
  assert.equal(validateMeetingPolishLanguage(undefined), "zh");
  assert.equal(validateMeetingPolishLanguage("zh"), "zh");
  assert.equal(validateMeetingPolishLanguage("en"), "en");
  for (const value of [null, "fr", "", 1, { language: "en" }]) {
    assert.throws(() => validateMeetingPolishLanguage(value));
  }
});

test("语言切换保留全部原有诊断提示词，中文不附加修改", () => {
  const original = "案例→能力薄弱点→可能原因→巩固建议\n不编造课堂事实";
  assert.equal(withMeetingPolishLanguage(original, "zh"), original);
  const english = withMeetingPolishLanguage(original, "en");
  assert.equal(english.slice(0, original.length), original);
  assert.ok(english.length > original.length);
  assert.notEqual(english, withMeetingPolishLanguage(original, "zh"));
});