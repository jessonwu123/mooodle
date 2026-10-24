import { expect, test } from "bun:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { fetchMeetingSessions } from "./meeting-sessions";

test("所选日期包含当前教师已关联档案的机构课次，不包含其他日期或其他教师", async () => {
  const tables: Record<string, Record<string, unknown>[]> = {
    user_roles: [{ user_id: "teacher-a", role: "teacher" }],
    students: [{ id: "class-a", name: "机构班级", created_by: "teacher-a" }],
    single_lessons: [], cancelled_lessons: [],
    imported_lessons: [
      { id: "selected", created_by: "teacher-a", archive_student_id: "class-a", class_name: "机构班级", lesson_date: "2026-10-24", start_time: "09:30:00" },
      { id: "other-date", created_by: "teacher-a", archive_student_id: "class-a", class_name: "机构班级", lesson_date: "2026-10-25", start_time: "09:30:00" },
      { id: "other-owner", created_by: "teacher-b", archive_student_id: "class-a", class_name: "机构班级", lesson_date: "2026-10-24", start_time: "09:30:00" },
      { id: "unlinked", created_by: "teacher-a", archive_student_id: null, class_name: "无档案班级", lesson_date: "2026-10-24", start_time: "10:00:00" },
    ],
  };
  const client = {
    from(table: string) {
      let rows = tables[table] || [];
      const query = {
        select() { return query; },
        eq(field: string, value: unknown) { rows = rows.filter(row => row[field] === value); return query; },
        then(resolve: (result: { data: typeof rows; error: null }) => unknown) { return Promise.resolve({ data: rows, error: null }).then(resolve); },
      };
      return query;
    },
  } as unknown as SupabaseClient<Database>;
  const sessions = await fetchMeetingSessions("2026-10-24", { client, uid: "teacher-a" });
  expect(sessions.map(s => s.id)).toEqual(["imported:selected"]);
  expect(sessions[0]?.date).toBe("2026-10-24");
  expect(sessions[0]?.time).toBe("09:30");
});