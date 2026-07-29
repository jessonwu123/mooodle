// Xingniu (灵犀 CRM) HTTP integration — server-only helpers.
// Called from src/lib/xngj.functions.ts inside authenticated server functions.

const BASE = "https://crm.xngj.com";

export interface XngjLoginResult {
  accessToken: string;
  userId: string;
}

export interface XngjLesson {
  lesson_date: string; // YYYY-MM-DD
  start_time: string; // HH:mm:ss
  end_time: string; // HH:mm:ss
  class_name: string;
}

export async function xngjLogin(
  username: string,
  password: string,
  tenantName = "犀牛教育",
): Promise<XngjLoginResult> {
  const res = await fetch(`${BASE}/admin-api/system/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ tenantName, username, password, rememberMe: true }),
  });
  if (!res.ok) throw new Error(`登录失败：HTTP ${res.status}`);
  const json = (await res.json()) as {
    code: number;
    msg?: string;
    data?: { accessToken: string; userId: string };
  };
  if (json.code !== 0 || !json.data?.accessToken) {
    throw new Error(json.msg || "登录失败：账号或密码错误");
  }
  return { accessToken: json.data.accessToken, userId: json.data.userId };
}

function normalizeTime(t: string): string {
  // "9:00" -> "09:00:00", "19:00" -> "19:00:00"
  const [h, m = "0"] = t.trim().split(":");
  return `${h.padStart(2, "0")}:${m.padStart(2, "0")}:00`;
}

function parseTimes(times: string | null | undefined): { start: string; end: string } | null {
  if (!times) return null;
  // e.g. "19:00-20:30"
  const m = times.match(/(\d{1,2}:\d{2})\s*[-~至]\s*(\d{1,2}:\d{2})/);
  if (!m) return null;
  return { start: normalizeTime(m[1]), end: normalizeTime(m[2]) };
}

export async function xngjFetchLessons(
  accessToken: string,
  xngjUserId: string,
  startDate: string,
  endDate: string,
): Promise<XngjLesson[]> {
  const results: XngjLesson[] = [];
  const pageSize = 100;
  const MAX_PAGES = 100;
  for (let pageNo = 1; pageNo <= MAX_PAGES; pageNo++) {
    const res = await fetch(
      `${BASE}/admin-api/lms/class-schedule-server/arrange-lesson-page`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          schoolAndArea: [],
          startDate,
          endDate,
          arrangeLessonStatus: "",
          arrangeLessonStatusList: [3],
          eliminateStatus: "",
          eliminateStatusList: [],
          feedbackStatus: "",
          isClose: "",
          isTrial: "",
          judgeTrialResult: "",
          pageNo,
          pageSize,
          userId: xngjUserId,
        }),
      },
    );
    if (!res.ok) throw new Error(`拉取课表失败：HTTP ${res.status}`);
    const json = (await res.json()) as {
      code: number;
      msg?: string;
      data?: { list?: Array<Record<string, unknown>>; total?: number };
    };
    if (json.code !== 0) throw new Error(json.msg || "拉取课表失败");
    const list = json.data?.list ?? [];
    for (const item of list) {
      const arrangeDate = (item.arrangeDate as string | undefined) ?? "";
      const times = (item.times as string | undefined) ?? "";
      const parsed = parseTimes(times);
      if (!arrangeDate || !parsed) continue;
      const className =
        (item.className as string | undefined) ||
        (item.lessonName as string | undefined) ||
        "(未命名课程)";
      results.push({
        lesson_date: arrangeDate,
        start_time: parsed.start,
        end_time: parsed.end,
        class_name: className.trim(),
      });
    }
    if (list.length < pageSize) break;
  }
  return results;
}

export function computeSyncWindow(): { startDate: string; endDate: string } {
  const now = new Date();
  const start = new Date(now);
  start.setMonth(start.getMonth() - 1);
  const end = new Date(now);
  end.setMonth(end.getMonth() + 6);
  const fmt = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return { startDate: fmt(start), endDate: fmt(end) };
}

export function lessonKey(l: {
  lesson_date: string;
  start_time: string;
  end_time: string;
  class_name: string;
}): string {
  return `${l.lesson_date}|${l.start_time}|${l.end_time}|${l.class_name}`;
}
