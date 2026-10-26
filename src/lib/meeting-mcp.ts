// 腾讯会议 MCP 数据格式化（客户端安全，纯函数）
export interface McpTranscriptWord { text?: string }
export interface McpTranscriptSentence { words?: McpTranscriptWord[] }
export interface McpTranscriptParagraph {
  start_time?: number;
  speaker?: { user_name?: string };
  sentences?: McpTranscriptSentence[];
}

export interface MeetingRecordItem {
  recordFileId: string;
  meetingId: string;
  meetingCode: string;
  subject: string;
  startTime: string;
  endTime: string;
  recordType: string;
}

export function formatMcpTimestamp(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

// 把 MCP 转写段落整理成「名字 时间 文本」逐行格式，与插件提取的逐字稿风格一致
export function formatMeetingTranscript(paragraphs: McpTranscriptParagraph[]): string {
  return paragraphs
    .map((p) => {
      const name = p.speaker?.user_name?.trim() || "未知发言人";
      const time = formatMcpTimestamp(typeof p.start_time === "number" ? p.start_time : 0);
      const text = (p.sentences ?? [])
        .flatMap((s) => (s.words ?? []).map((w) => w.text ?? ""))
        .join("")
        .trim();
      return text ? `${name} ${time} ${text}` : null;
    })
    .filter((line): line is string => Boolean(line))
    .join("\n");
}
