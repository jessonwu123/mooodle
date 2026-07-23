import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { CalendarPlus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  LessonEditorDialog,
  type SingleLessonRow,
} from "./lesson-editor-dialog";

interface Props {
  studentId: string;
}

export function SingleLessonsPanel({ studentId }: Props) {
  const { session } = useAuth();
  const [rows, setRows] = useState<SingleLessonRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<SingleLessonRow | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("single_lessons")
      .select("*")
      .eq("student_id", studentId)
      .order("lesson_date", { ascending: false });
    setRows((data ?? []) as SingleLessonRow[]);
    setLoading(false);
  }, [studentId]);

  useEffect(() => {
    load();
  }, [load]);

  const handleDelete = async (id: string) => {
    if (!confirm("确认删除此课次？")) return;
    const { error } = await supabase.from("single_lessons").delete().eq("id", id);
    if (error) {
      toast.error("删除失败：" + error.message);
      return;
    }
    toast.success("已删除");
    load();
  };

  return (
    <section className="rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-card)]">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CalendarPlus className="h-4 w-4 text-primary" />
          <h3 className="text-base font-semibold text-foreground">课次管理</h3>
        </div>
        {session?.user.id && (
          <Button
            size="sm"
            onClick={() => {
              setEditing(null);
              setOpen(true);
            }}
            className="gap-1.5"
          >
            <CalendarPlus className="h-4 w-4" />
            新增课次
          </Button>
        )}
      </div>

      {loading ? (
        <div className="text-sm text-muted-foreground">加载中...</div>
      ) : rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
          暂无单次课程。点击右上角"新增课次"添加。
        </div>
      ) : (
        <div className="space-y-2">
          {rows.map((r) => (
            <div
              key={r.id}
              className="flex items-center justify-between rounded-lg border border-border bg-muted/20 px-3 py-2"
            >
              <div className="min-w-0">
                <div className="text-sm font-medium text-foreground">
                  {new Date(r.lesson_date).toLocaleDateString("zh-CN", {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                    weekday: "short",
                  })}{" "}
                  · {r.start_time.slice(0, 5)}-{r.end_time.slice(0, 5)}
                </div>
                {r.notes && (
                  <div className="mt-0.5 truncate text-xs text-muted-foreground">
                    {r.notes}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    setEditing(r);
                    setOpen(true);
                  }}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => handleDelete(r.id)}
                  className="text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {session?.user.id && (
        <LessonEditorDialog
          open={open}
          onOpenChange={setOpen}
          createdBy={session.user.id}
          lockedStudentId={studentId}
          editing={editing}
          onSaved={load}
        />
      )}
    </section>
  );
}
