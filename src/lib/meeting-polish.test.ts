import { test } from "node:test";
import assert from "node:assert/strict";
import { validateMeetingPolishText, canPolishMeeting, validateMeetingPolishLanguage, validateMeetingPolishImages, validateMeetingPolishTranscript, withMeetingPolishLanguage, MEETING_POLISH_IMAGE_LIMIT } from "./meeting-polish";
import { meetingPolishInstructions, meetingPolishTranscriptNote } from "./meeting-polish";

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

test("课堂笔记图片可选，旧版请求默认无图片", () => {
  assert.deepEqual(validateMeetingPolishImages(undefined), []);
  assert.deepEqual(validateMeetingPolishImages([]), []);
});

test("课堂笔记图片仅接受限定格式与数量的 data URL", () => {
  const jpeg = "data:image/jpeg;base64," + "A".repeat(100);
  const png = "data:image/png;base64," + "B".repeat(100);
  const webp = "data:image/webp;base64," + "C".repeat(100);
  assert.deepEqual(validateMeetingPolishImages([jpeg, png, webp]), [jpeg, png, webp]);
  assert.throws(() => validateMeetingPolishImages("not-an-array"));
  assert.throws(() => validateMeetingPolishImages(["https://example.com/a.png"]));
  assert.throws(() => validateMeetingPolishImages(["data:image/gif;base64,AAAA"]));
  assert.throws(() => validateMeetingPolishImages(["data:image/jpeg;base64," + "A".repeat(5_600_000)]));
  assert.throws(() => validateMeetingPolishImages(Array(MEETING_POLISH_IMAGE_LIMIT + 1).fill(jpeg)));
});

test("逐字稿可选，旧版请求默认无逐字稿", () => {
  assert.equal(validateMeetingPolishTranscript(undefined), "");
  assert.equal(validateMeetingPolishTranscript(null), "");
  assert.equal(validateMeetingPolishTranscript(""), "");
});

test("逐字稿仅接受限定长度的字符串", () => {
  assert.equal(validateMeetingPolishTranscript(" 老师：我们先看这道题 "), "老师：我们先看这道题");
  assert.equal(validateMeetingPolishTranscript("字".repeat(100000)).length, 100000);
  assert.throws(() => validateMeetingPolishTranscript("字".repeat(100001)));
  assert.throws(() => validateMeetingPolishTranscript(123));
  assert.throws(() => validateMeetingPolishTranscript(["老师：你好"]));
});
test("提示词要求老师讲解优先、术语沿用老师说法、AI 仅作补充", () => {
  assert.ok(meetingPolishTranscriptNote.includes("优先于模型自行归纳的思路逻辑"));
  assert.ok(meetingPolishTranscriptNote.includes("一律采用老师课上使用的说法"));
  assert.ok(meetingPolishTranscriptNote.includes("只作为老师提及内容的补充和优化"));
});

test("提示词要求语气像老师与家长当面交流", () => {
  assert.ok(meetingPolishInstructions.includes("语气要求"));
  assert.ok(meetingPolishInstructions.includes("当面交流"));
});
