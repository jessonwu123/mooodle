import { test } from "node:test";
import assert from "node:assert/strict";
import { formatMcpTimestamp, formatMeetingTranscript } from "./meeting-mcp";

test("formatMcpTimestamp formats under an hour as mm:ss", () => {
  assert.equal(formatMcpTimestamp(6950), "00:06");
  assert.equal(formatMcpTimestamp(10470), "00:10");
  assert.equal(formatMcpTimestamp(59 * 60 * 1000 + 59000), "59:59");
});

test("formatMcpTimestamp formats over an hour as h:mm:ss", () => {
  assert.equal(formatMcpTimestamp(3600 * 1000), "1:00:00");
  assert.equal(formatMcpTimestamp(2 * 3600 * 1000 + 26 * 1000), "2:00:26");
});

test("formatMcpTimestamp clamps negative values to zero", () => {
  assert.equal(formatMcpTimestamp(-5), "00:00");
});

test("formatMeetingTranscript joins sentences and words into speaker-timestamped lines", () => {
  const text = formatMeetingTranscript([
    {
      start_time: 6950,
      speaker: { user_name: "吴老师" },
      sentences: [{ words: [{ text: "Ok 我已开启文字转写。" }] }],
    },
    {
      start_time: 9619,
      speaker: { user_name: "赵旦" },
      sentences: [{ words: [{ text: "这是啥呀。" }] }, { words: [{ text: "对。" }] }],
    },
  ]);
  assert.equal(text, "吴老师 00:06 Ok 我已开启文字转写。\n赵旦 00:09 这是啥呀。对。");
});

test("formatMeetingTranscript skips empty paragraphs and falls back to 未知发言人", () => {
  const text = formatMeetingTranscript([
    { start_time: 0, speaker: {}, sentences: [{ words: [{ text: "你好" }] }] },
    { start_time: 1000, speaker: { user_name: "吴老师" }, sentences: [] },
  ]);
  assert.equal(text, "未知发言人 00:00 你好");
});

test("formatMeetingTranscript returns empty string for no paragraphs", () => {
  assert.equal(formatMeetingTranscript([]), "");
});
