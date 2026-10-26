// 腾讯会议官方 MCP 服务端客户端（个人版/专业版通道）
// 协议：JSON-RPC 2.0 POST 到 baseUrl，请求头携带 X-Tencent-Meeting-Token
import { formatMeetingTranscript, type MeetingRecordItem, type McpTranscriptParagraph } from "./meeting-mcp";

const MCP_BASE_URL = "https://mcp.meeting.tencent.com/mcp/wemeet-open/v1";
const SKILL_VERSION = "v1.0.15";
const TRANSCRIPT_MAX_CHARS = 100000;
const TRANSCRIPT_PAGE_LIMIT = 200;
const TRANSCRIPT_MAX_PAGES = 100;

async function callMcp(token: string, method: string, params: Record<string, unknown>): Promise<unknown> {
  const res = await fetch(MCP_BASE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Tencent-Meeting-Token": token,
      "X-Skill-Version": SKILL_VERSION,
    },
    body: JSON.stringify({ jsonrpc: "2.0", method, params, id: 1 }),
  });
  if (!res.ok) throw new Error(`腾讯会议服务暂时不可用（${res.status}），请稍后重试`);
  const data = (await res.json().catch(() => null)) as {
    error?: { message?: string };
    result?: { content?: Array<{ type: string; text?: string }>; isError?: boolean };
  } | null;
  if (!data) throw new Error("腾讯会议返回了无法识别的响应");
  if (data.error) throw new Error(normalizeMcpError(data.error.message));
  // tools/list 等方法直接返回 result 对象；tools/call 的结果在 result.content[0].text 里
  if (data.result && !data.result.content) return data.result;
  const text = data.result?.content?.find((c) => c.type === "text")?.text;
  if (!text) throw new Error(data.result?.isError ? "腾讯会议拒绝了这次请求" : "腾讯会议返回了空结果");
  const inner = JSON.parse(text) as { status_code?: number; body?: string; message?: string };
  if (inner.status_code && inner.status_code >= 400) throw new Error(normalizeMcpError(inner.message));
  if (typeof inner.body !== "string") return inner;
  try { return JSON.parse(inner.body); } catch { return inner.body; }
}

function normalizeMcpError(message?: string): string {
  if (!message) return "腾讯会议请求失败，请重试";
  if (/token|auth|登录|凭证|unauthor/i.test(message)) return "腾讯会议 Token 已失效，请重新获取并保存";
  return `腾讯会议：${message}`;
}

export async function validateMeetingMcpToken(token: string): Promise<void> {
  await callMcp(token, "tools/list", {});
}

export async function listMeetingRecordings(token: string, date: string): Promise<MeetingRecordItem[]> {
  const out: MeetingRecordItem[] = [];
  let pageToken = "";
  for (let page = 0; page < 10; page++) {
    const data = (await callMcp(token, "tools/call", {
      name: "get_records_list",
      arguments: {
        start_time: `${date}T00:00:00+08:00`,
        end_time: `${date}T23:59:59+08:00`,
        page_size: 30,
        ...(pageToken ? { page_token: pageToken } : {}),
      },
    })) as {
      has_more?: boolean;
      next_page_token?: string;
      record_meetings?: Array<{
        meeting_id?: string; meeting_code?: string; subject?: string; record_type?: string;
        media_start_time?: string;
        record_files?: Array<{ record_file_id?: string; record_start_time?: string; record_end_time?: string }>;
      }>;
    };
    for (const meeting of data.record_meetings ?? []) {
      for (const file of meeting.record_files ?? []) {
        if (!file.record_file_id) continue;
        out.push({
          recordFileId: file.record_file_id,
          meetingId: meeting.meeting_id ?? "",
          meetingCode: meeting.meeting_code ?? "",
          subject: meeting.subject ?? "未命名会议",
          startTime: file.record_start_time ?? meeting.media_start_time ?? "",
          endTime: file.record_end_time ?? "",
          recordType: meeting.record_type ?? "",
        });
      }
    }
    if (!data.has_more || !data.next_page_token) break;
    pageToken = data.next_page_token;
  }
  return out.sort((a, b) => a.startTime.localeCompare(b.startTime));
}

export async function fetchMeetingSmartMinutes(token: string, recordFileId: string): Promise<string> {
  const data = (await callMcp(token, "tools/call", {
    name: "get_smart_minutes",
    arguments: { record_file_id: recordFileId },
  })) as { meeting_minute?: { minute?: string } };
  return data.meeting_minute?.minute?.trim() ?? "";
}

export async function fetchMeetingTranscript(token: string, recordFileId: string): Promise<string> {
  const paragraphs: McpTranscriptParagraph[] = [];
  let pid = "0";
  for (let page = 0; page < TRANSCRIPT_MAX_PAGES; page++) {
    const data = (await callMcp(token, "tools/call", {
      name: "get_transcripts_details",
      arguments: { record_file_id: recordFileId, pid, limit: TRANSCRIPT_PAGE_LIMIT },
    })) as { minutes?: { paragraphs?: McpTranscriptParagraph[] } };
    const batch = data.minutes?.paragraphs ?? [];
    if (batch.length === 0) break;
    paragraphs.push(...batch);
    if (batch.length < TRANSCRIPT_PAGE_LIMIT) break;
    const last = batch[batch.length - 1] as McpTranscriptParagraph & { pid?: string };
    const nextPid = Number(last.pid);
    if (!Number.isFinite(nextPid)) break;
    pid = String(nextPid + 1);
  }
  return formatMeetingTranscript(paragraphs).slice(0, TRANSCRIPT_MAX_CHARS);
}
