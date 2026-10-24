import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Plus, Users, ChevronRight, Trash2, ShieldCheck, FileText, Copy, CalendarDays, BookOpen } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Textarea } from "@/components/ui/textarea";
import { buildStudentMonthlySummary } from "@/lib/student-summary";
import { ensureStudentAccount } from "@/lib/student-account.functions";
import {canCreateStudentLogin,isInstitutionClass} from "@/lib/institution-class-rules";



export const Route = createFileRoute("/admin/")({
  head:()=>({meta:[{title:"学生与机构班级档案 · mooodle"},{name:"description",content:"管理学生及导入机构班级的课堂记录和学习档案。"},{property:"og:title",content:"学生与机构班级档案 · mooodle"},{property:"og:description",content:"查看学生与机构班级课堂档案。"},{property:"og:type",content:"website"},{name:"twitter:card",content:"summary"}]}),
  component: AdminHome,
});

interface Student {
  id: string;
  name: string;
  username?: string | null;
  ratingCount?: number;
  archiveKind?: string;
}


function AdminHome() {
  const { session, isAdmin } = useAuth();
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);
  const [summaryFor, setSummaryFor] = useState<Student | null>(null);
  const [summaryText, setSummaryText] = useState("");
  const [summaryLoading, setSummaryLoading] = useState(false);



  const openSummary = async (s: Student) => {
    setSummaryFor(s);
    setSummaryText("");
    setSummaryLoading(true);
    try {
      const text = await buildStudentMonthlySummary(s.id, s.name);
      setSummaryText(text);
    } catch (e) {
      toast.error("生成总结失败");
    } finally {
      setSummaryLoading(false);
    }
  };

  const copySummary = async () => {
    try {
      await navigator.clipboard.writeText(summaryText);
      toast.success("已复制到剪贴板");
    } catch {
      toast.error("复制失败，请手动选择文本");
    }
  };

  const load = async () => {
    if (!session?.user.id) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("students")
      .select("id, name, username, auth_user_id, archive_kind, ratings(count)")
      .eq("created_by", session.user.id)
      .order("created_at", { ascending: false });
    if (error) {
      toast.error("加载失败");
      setLoading(false);
      return;
    }
    const rows = (data ?? []) as Array<{
      id: string;
      name: string;
      username: string | null;
      auth_user_id: string | null;
      archive_kind: string;
      ratings: { count: number }[];
    }>;
    setStudents(
      rows.map((s) => ({
        id: s.id,
        name: s.name,
        username: s.username,
        ratingCount: s.ratings?.[0]?.count ?? 0,
        archiveKind: s.archive_kind,
      })),
    );
    setLoading(false);
    // 为缺少登录账号的旧学生自动补建
    const missing = rows.filter((s) => !s.auth_user_id && canCreateStudentLogin(s.archive_kind));
    for (const s of missing) {
      try {
        await ensureStudentAccount({ data: { studentId: s.id } });
      } catch (e) {
        console.error("ensureStudentAccount failed", s.id, e);
      }
    }
    if (missing.length > 0) {
      // reload to display updated usernames
      const { data: data2 } = await supabase
        .from("students")
        .select("id, name, username, archive_kind, ratings(count)")
        .eq("created_by", session.user.id)
        .order("created_at", { ascending: false });
      setStudents(
        ((data2 ?? []) as Array<{
          id: string;
          name: string;
          username: string | null;
          archive_kind: string;
          ratings: { count: number }[];
        }>).map((s) => ({
          id: s.id,
          name: s.name,
          username: s.username,
          ratingCount: s.ratings?.[0]?.count ?? 0,
          archiveKind: s.archive_kind,
        })),
      );
    }
  };


  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user.id]);

  // 管理员：为系统中所有缺少登录账号的学生补建
  useEffect(() => {
    if (!isAdmin) return;
    (async () => {
      const { data } = await supabase
        .from("students")
        .select("id")
        .eq("archive_kind", "student")
        .is("auth_user_id", null);
      const list = (data ?? []) as Array<{ id: string }>;
      for (const s of list) {
        try {
          await ensureStudentAccount({ data: { studentId: s.id } });
        } catch (e) {
          console.error("admin backfill failed", s.id, e);
        }
      }
    })();
  }, [isAdmin]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newName.trim();
    if (!trimmed) return;
    setBusy(true);
    const { data: created, error } = await supabase
      .from("students")
      .insert({ name: trimmed })
      .select("id")
      .single();
    if (error || !created) {
      setBusy(false);
      toast.error("创建失败：" + (error?.message ?? ""));
      return;
    }
    try {
      const res = await ensureStudentAccount({ data: { studentId: created.id } });
      toast.success(`已创建学生档案（登录账号：${res.username}，初始密码：000000）`);
    } catch (e) {
      toast.warning("学生已创建，但登录账号创建失败：" + (e instanceof Error ? e.message : ""));
    }
    setBusy(false);
    setNewName("");
    setOpen(false);
    load();
  };


  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("students").delete().eq("id", id);
    if (error) {
      toast.error("删除失败");
      return;
    }
    toast.success("已删除");
    load();
  };



  return (
    <div>
      <div className="mb-8 flex items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Users className="h-4 w-4" />
            学生管理
          </div>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-foreground">
            学生档案
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <Link to="/admin/schedule">
            <Button variant="outline" size="sm" className="gap-1.5">
              <CalendarDays className="h-4 w-4" />
              课程表
            </Button>
          </Link>
          <Link to="/admin/homework">
            <Button variant="outline" size="sm" className="gap-1.5">
              <FileText className="h-4 w-4" />
              布置作业
            </Button>
          </Link>
          {isAdmin && (
            <Link to="/admin/question-bank">
              <Button variant="outline" size="sm" className="gap-1.5">
                <BookOpen className="h-4 w-4" />
                原始题库
              </Button>
            </Link>
          )}
          {isAdmin && (
            <Link to="/admin/classified-bank">
              <Button variant="outline" size="sm" className="gap-1.5">
                <BookOpen className="h-4 w-4" />
                分类题库
              </Button>
            </Link>
          )}
          {isAdmin && (
            <Link to="/admin/calc-practice">
              <Button variant="outline" size="sm" className="gap-1.5">
                <BookOpen className="h-4 w-4" />
                计算练习
              </Button>
            </Link>
          )}
          {isAdmin && (
            <Link to="/admin/teachers">
              <Button variant="outline" size="sm" className="gap-1.5">
                <ShieldCheck className="h-4 w-4" />
                用户管理
              </Button>
            </Link>
          )}
          <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="gap-1.5 bg-green-500 text-primary-foreground shadow-[var(--shadow-soft)] hover:bg-green-600">
              <Plus className="h-4 w-4" />
              新增学生
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>新增学生档案</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">学生姓名</Label>
                <Input
                  id="name"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="请输入学生姓名"
                  maxLength={50}
                  autoFocus
                />
              </div>
              <DialogFooter>
                <Button type="submit" disabled={busy || !newName.trim()}>
                  {busy ? "创建中..." : "创建"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
        </div>
      </div>

      {loading ? (
        <div className="rounded-2xl border border-border bg-card p-10 text-center text-sm text-muted-foreground">
          加载中...
        </div>
      ) : students.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card/50 p-10 text-center">
          <p className="mb-4 text-sm text-muted-foreground">还没有学生档案</p>
          <Button onClick={() => setOpen(true)} variant="outline" className="gap-1.5">
            <Plus className="h-4 w-4" />
            创建第一个学生
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          {students.map((s) => (
            <div
              key={s.id}
              className="flex items-center justify-between rounded-xl border border-border bg-card p-4 shadow-[var(--shadow-card)] transition-shadow hover:shadow-[var(--shadow-soft)]"
            >
              <Link
                to="/admin/student/$id"
                params={{ id: s.id }}
                className="flex flex-1 items-center gap-4"
              >
                <div className="flex h-11 w-11 items-center justify-center rounded-full bg-accent/60 text-base font-semibold text-accent-foreground">
                  {s.name.slice(0, 1)}
                </div>
                <div className="flex-1">
                  <div className="font-medium text-foreground break-words">{s.name}{isInstitutionClass(s.archiveKind)&&<span className="ml-2 text-xs text-primary">机构班级</span>}</div>
                  <div className="text-xs text-muted-foreground">
                    {s.ratingCount} 节课记录
                    {s.username && (
                      <span className="ml-2 text-muted-foreground/80">
                        · 登录账号：{s.username}
                      </span>
                    )}
                  </div>
                </div>

                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </Link>
              {!isInstitutionClass(s.archiveKind) && <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="ghost" size="icon" className="ml-2 text-muted-foreground hover:text-destructive">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>删除「{s.name}」？</AlertDialogTitle>
                    <AlertDialogDescription>
                      该学生的所有课堂评分记录也将被删除，且无法恢复。
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>取消</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => handleDelete(s.id)}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                      确认删除
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>}
              <Button
                variant="ghost"
                size="icon"
                className="ml-1 text-muted-foreground hover:text-primary"
                title="导出最近一个月总结"
                onClick={() => openSummary(s)}
              >
                <FileText className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      )}

      <Dialog
        open={!!summaryFor}
        onOpenChange={(v) => {
          if (!v) {
            setSummaryFor(null);
            setSummaryText("");
          }
        }}
      >
        <DialogContent className="max-h-[85vh] max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {summaryFor?.name} · 最近一个月学习总结
            </DialogTitle>
          </DialogHeader>
          {summaryLoading ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              生成中...
            </div>
          ) : (
            <>
              <Textarea
                readOnly
                value={summaryText}
                rows={18}
                className="font-mono text-xs"
                onFocus={(e) => e.currentTarget.select()}
              />
              <DialogFooter>
                <Button onClick={copySummary} className="gap-1.5">
                  <Copy className="h-4 w-4" />
                  一键复制
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

    </div>
  );
}

