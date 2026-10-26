import { describe, expect, it } from "vitest";
import { formatMcpTimestamp, formatMeetingTranscript } from "./meeting-mcp";

describe("formatMcpTimestamp", () => {
  it("formats under an hour as mm:ss", () => {
    expect(formatMcpTimestamp(6950)).toBe("00:06");
    expect(formatMcpTimestamp(10470)).toBe("00:10");
    expect(formatMcpTimestamp(59 * 60 * 1000 + 59000)).toBe("59:59");
  });
  it("formats over an hour as h:mm:ss", () => {
    expect(formatMcpTimestamp(3600 * 1000)).toBe("1:00:00");
    expect(formatMcpTimestamp(2 * 3600 * 1000 + 26 * 1000)).toBe("2:00:26");
  });
  it("clamps negative values to zero", () => {
    expect(formatMcpTimestamp(-5)).toBe("00:00");
  });
});

describe("formatMeetingTranscript", () => {
  it("joins sentences and words into speaker-timestamped lines", () => {
    const text = formatMeetingTranscript([
      {
        start_time: 6950,
        speaker: { user_name: "吴老师" },
        sentences: [{ words: [{ text: "Ok 我已开启文字转写。" }] }],
      },
      {
        start_time: 9619,
        speaker: { user_name: "赵旦" },
        sentences: [
          { words: [{ text: "这是啥呀。" }] },
          { words: [{ text: "对。" }] },
        ],
      },
    ]);
    expect(text).toBe("吴老师 00:06 Ok 我已开启文字转写。\n赵旦 00:09 这是啥呀。对。");
  });
  it("skips empty paragraphs and falls back to 未知发言人", () => {
    const text = formatMeetingTranscript([
      { start_time: 0, speaker: {}, sentences: [{ words: [{ text: "你好" }] }] },
      { start_time: 1000, speaker: { user_name: "吴老师" }, sentences: [] },
    ]);
    expect(text).toBe("未知发言人 00:00 你好");
  });
  it("returns empty string for no paragraphs", () => {
    expect(formatMeetingTranscript([])).toBe("");
  });
});
