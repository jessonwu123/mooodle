import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, ChevronRight, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/admin/teachers/$teacherId")({
  component: TeacherStudentsPage,
});

interface TeacherStudent {
  id: string;
  name: string;
  created_at: string;
  rating_count: number;
}

function TeacherStudentsPage() {
  const { teacherId } = Route.useParams();
  const [teacherEmail, setTeacherEmail] = useState<string>("");
  const [students, setStudents] = useState<TeacherStudent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const [{ data: list }, { data: teachers }] = await Promise.all([
        (supabase.rpc as any)("list_teacher_students", { _teacher_id: teacherId }),
        (supabase.rpc as any)("list_all_teachers"),
      ]);
      const t = (teachers as { user_id: string; email: string }[] | null)?.find(
        (x) => x.user_id === teacherId,
      );
      setTeacherEmail(t?.email ?? "");
      setStudents(
        ((list ?? []) as TeacherStudent[]).map((s) => ({
          ...s,
          rating_count: Number(s.rating_count ?? 0),
        })),
      );
      setLoading(false);
    })();
  }, [teacherId]);

  return (
    <div>
      <Link
        to="/admin/teachers"
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        返回教师列表
      </Link>

      <div className="mb-8">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Users className="h-4 w-4" />
          教师学生档案
        </div>
        <h1 className="mt-1 text-3xl font-bold tracking-tight text-foreground">
          {teacherEmail || "该老师"} 的学生
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          作为管理员，你可以点击任意学生进入详情，查看并修改其课堂评分与综合素质。
        </p>
      </div>

      {loading ? (
        <div className="rounded-2xl border border-border bg-card p-10 text-center text-sm text-muted-foreground">
          加载中...
        </div>
      ) : students.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card/50 p-10 text-center text-sm text-muted-foreground">
          这位老师还没有创建任何学生
          <div className="mt-4">
            <Link to="/admin/teachers">
              <Button variant="outline" size="sm">返回</Button>
            </Link>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {students.map((s) => (
            <Link
              key={s.id}
              to="/admin/student/$id"
              params={{ id: s.id }}
              className="flex items-center gap-4 rounded-xl border border-border bg-card p-4 shadow-[var(--shadow-card)] transition-shadow hover:shadow-[var(--shadow-soft)]"
            >
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-accent/60 text-base font-semibold text-accent-foreground">
                {s.name.slice(0, 1)}
              </div>
              <div className="flex-1">
                <div className="font-medium text-foreground">{s.name}</div>
                <div className="text-xs text-muted-foreground">
                  {s.rating_count} 节课记录
                </div>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
