import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, UserPlus, Trash2, ShieldCheck, ChevronRight, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

export const Route = createFileRoute("/admin/teachers")({
  component: TeachersPage,
});

interface Teacher {
  user_id: string;
  email: string;
  created_at: string;
  is_admin: boolean;
  student_count: number;
}

function TeachersPage() {
  const { session } = useAuth();
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data, error } = await (supabase.rpc as any)("list_all_teachers");
    if (error) {
      toast.error("加载失败：" + error.message);
      setLoading(false);
      return;
    }
    setTeachers(((data ?? []) as Teacher[]).map((t) => ({
      ...t,
      student_count: Number(t.student_count ?? 0),
    })));
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const handleGrant = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = email.trim();
    if (!trimmed) return;
    setBusy(true);
    const { data: uid, error: lookupErr } = await supabase.rpc(
      "find_user_id_by_email",
      { _email: trimmed },
    );
    if (lookupErr) {
      toast.error("查询失败：" + lookupErr.message);
      setBusy(false);
      return;
    }
    if (!uid) {
      toast.error(`未找到邮箱为「${trimmed}」的用户，请先让对方完成注册`);
      setBusy(false);
      return;
    }
    const { error: insErr } = await supabase
      .from("user_roles")
      .insert({ user_id: uid as string, role: "admin" });
    setBusy(false);
    if (insErr) {
      if (insErr.code === "23505") {
        toast.info("该账号已经是管理员");
      } else {
        toast.error("授权失败：" + insErr.message);
      }
      return;
    }
    toast.success("已授予管理员权限");
    setEmail("");
    load();
  };

  const handleRevoke = async (userId: string) => {
    const { error } = await supabase
      .from("user_roles")
      .delete()
      .eq("user_id", userId)
      .eq("role", "admin");
    if (error) {
      toast.error("撤销失败：" + error.message);
      return;
    }
    toast.success("已撤销管理员权限");
    load();
  };

  return (
    <div>
      <Link
        to="/admin"
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        返回学生列表
      </Link>

      <div className="mb-8">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <ShieldCheck className="h-4 w-4" />
          权限管理
        </div>
        <h1 className="mt-1 text-3xl font-bold tracking-tight text-foreground">
          教师管理
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          下方列出系统中全部已注册账号。点击任意账号可查看该老师创建的学生档案；管理员可在此处授予或撤销其他账号的管理员权限。
        </p>
      </div>

      <form
        onSubmit={handleGrant}
        className="mb-8 rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-card)]"
      >
        <Label htmlFor="email" className="mb-2 block">
          授予管理员权限（按邮箱）
        </Label>
        <div className="flex flex-col gap-3 sm:flex-row">
          <Input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="teacher@example.com"
            className="flex-1"
            maxLength={255}
          />
          <Button
            type="submit"
            disabled={busy || !email.trim()}
            className="gap-1.5 bg-green-500 text-primary-foreground hover:bg-green-600"
          >
            <UserPlus className="h-4 w-4" />
            {busy ? "处理中..." : "授予权限"}
          </Button>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          提示：管理员可以查看和修改所有老师的学生档案；普通教师账号仅可管理自己创建的学生。
        </p>
      </form>

      <div className="mb-3 text-sm font-medium text-foreground">
        全部教师账号
      </div>
      {loading ? (
        <div className="rounded-2xl border border-border bg-card p-10 text-center text-sm text-muted-foreground">
          加载中...
        </div>
      ) : teachers.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card/50 p-10 text-center text-sm text-muted-foreground">
          暂无注册账号
        </div>
      ) : (
        <div className="space-y-2">
          {teachers.map((t) => {
            const isSelf = t.user_id === session?.user.id;
            return (
              <div
                key={t.user_id}
                className="flex items-center gap-2 rounded-xl border border-border bg-card p-4 shadow-[var(--shadow-card)] transition-shadow hover:shadow-[var(--shadow-soft)]"
              >
                <Link
                  to="/admin/teachers/$teacherId"
                  params={{ teacherId: t.user_id }}
                  className="flex flex-1 items-center gap-3"
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-accent/60 text-accent-foreground">
                    {t.is_admin ? <ShieldCheck className="h-5 w-5" /> : <Users className="h-5 w-5" />}
                  </div>
                  <div className="flex-1">
                    <div className="flex flex-wrap items-center gap-2 text-sm font-medium text-foreground">
                      {t.email}
                      {t.is_admin && (
                        <span className="rounded-md bg-primary/15 px-1.5 py-0.5 text-xs text-primary">
                          管理员
                        </span>
                      )}
                      {isSelf && (
                        <span className="rounded-md bg-accent/60 px-1.5 py-0.5 text-xs text-accent-foreground">
                          你自己
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      创建学生 {t.student_count} 人 · 注册时间：
                      {new Date(t.created_at).toLocaleString("zh-CN")}
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </Link>
                {t.is_admin && !isSelf && (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-muted-foreground hover:text-destructive"
                        title="撤销管理员"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>
                          撤销「{t.email}」的管理员权限？
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                          撤销后，该账号将变成普通教师，仅能管理自己创建的学生。账号本身不会被删除。
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>取消</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => handleRevoke(t.user_id)}
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                          确认撤销
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
