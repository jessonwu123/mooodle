import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, UserPlus, ShieldCheck, ChevronRight, Users, Shield, History } from "lucide-react";
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
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/teachers/")({
  component: TeachersPage,
});

interface Teacher {
  user_id: string;
  email: string;
  created_at: string;
  last_sign_in_at: string | null;
  is_admin: boolean;
  is_teacher: boolean;
  student_count: number;
}

interface LoginEvent {
  occurred_at: string;
  action: string | null;
  ip_address: string | null;
}

function TeachersPage() {
  const { session } = useAuth();
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<{
    open: boolean;
    title: string;
    desc: string;
    action: () => Promise<void>;
  } | null>(null);

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

  const grantRole = async (uid: string, role: "teacher" | "admin") => {
    const { error } = await supabase
      .from("user_roles")
      .insert({ user_id: uid, role });
    if (error) {
      if (error.code === "23505") {
        toast.info(role === "admin" ? "该账号已经是管理员" : "该账号已经是教师");
      } else {
        toast.error("操作失败：" + error.message);
      }
      return false;
    }
    return true;
  };

  const revokeRole = async (uid: string, role: "teacher" | "admin") => {
    const { error } = await supabase
      .from("user_roles")
      .delete()
      .eq("user_id", uid)
      .eq("role", role);
    if (error) {
      toast.error("撤销失败：" + error.message);
      return false;
    }
    return true;
  };

  const handleGrantTeacher = async (e: React.FormEvent) => {
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
    const ok = await grantRole(uid as string, "teacher");
    setBusy(false);
    if (ok) {
      toast.success("已授予教师权限");
      setEmail("");
      load();
    }
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
          下方列出系统中全部账号。点击任意账号可查看该老师创建的学生档案；管理员可在此处授予 / 撤销教师与管理员权限。
          <br />
          <span className="text-xs">
            · 教师：登录管理后台，仅能管理自己创建的学生
            <br />
            · 管理员：可查看并修改所有老师创建的学生
          </span>
        </p>
      </div>

      <form
        onSubmit={handleGrantTeacher}
        className="mb-8 rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-card)]"
      >
        <Label htmlFor="email" className="mb-2 block">
          授予教师权限（按邮箱）
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
            {busy ? "处理中..." : "授予教师权限"}
          </Button>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          提示：对方需先在登录页用该邮箱完成注册。新注册账号默认即为教师，因此一般情况下无需在此手动授权。
        </p>
      </form>

      <div className="mb-3 text-sm font-medium text-foreground">
        全部账号
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
                className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card p-4 shadow-[var(--shadow-card)] transition-shadow hover:shadow-[var(--shadow-soft)]"
              >
                <Link
                  to="/admin/teachers/$teacherId"
                  params={{ teacherId: t.user_id }}
                  className="flex flex-1 items-center gap-3 min-w-0"
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-accent/60 text-accent-foreground">
                    {t.is_admin ? <ShieldCheck className="h-5 w-5" /> : <Users className="h-5 w-5" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 text-sm font-medium text-foreground">
                      <span className="truncate">{t.email}</span>
                      {t.is_admin && (
                        <span className="rounded-md bg-primary/15 px-1.5 py-0.5 text-xs text-primary">
                          管理员
                        </span>
                      )}
                      {t.is_teacher && (
                        <span className="rounded-md bg-accent/60 px-1.5 py-0.5 text-xs text-accent-foreground">
                          教师
                        </span>
                      )}
                      {!t.is_teacher && !t.is_admin && (
                        <span className="rounded-md bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                          无权限
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
                <div className="flex items-center gap-1">
                  {!t.is_admin ? (
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1"
                      disabled={isSelf}
                      onClick={() =>
                        setConfirm({
                          open: true,
                          title: `授予「${t.email}」管理员权限？`,
                          desc: "管理员可以查看和修改所有老师的学生档案及综合素质。",
                          action: async () => {
                            const ok = await grantRole(t.user_id, "admin");
                            if (ok) {
                              toast.success("已授予管理员");
                              load();
                            }
                          },
                        })
                      }
                    >
                      <Shield className="h-3.5 w-3.5" />
                      升为管理员
                    </Button>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1"
                      disabled={isSelf}
                      onClick={() =>
                        setConfirm({
                          open: true,
                          title: `撤销「${t.email}」的管理员权限？`,
                          desc: "撤销后该账号将变成普通教师，仅能管理自己创建的学生。",
                          action: async () => {
                            const ok = await revokeRole(t.user_id, "admin");
                            if (ok) {
                              toast.success("已撤销管理员");
                              load();
                            }
                          },
                        })
                      }
                    >
                      撤销管理员
                    </Button>
                  )}
                  {t.is_teacher && !isSelf && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-muted-foreground hover:text-destructive"
                      onClick={() =>
                        setConfirm({
                          open: true,
                          title: `撤销「${t.email}」的教师权限？`,
                          desc:
                            "撤销后该账号将无法登录管理后台。已创建的学生档案不会被删除，但需要管理员或重新授予教师权限才能继续管理。",
                          action: async () => {
                            const ok = await revokeRole(t.user_id, "teacher");
                            if (ok) {
                              toast.success("已撤销教师权限");
                              load();
                            }
                          },
                        })
                      }
                    >
                      撤销教师
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <AlertDialog
        open={!!confirm?.open}
        onOpenChange={(o) => !o && setConfirm(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirm?.title}</AlertDialogTitle>
            <AlertDialogDescription>{confirm?.desc}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                await confirm?.action();
                setConfirm(null);
              }}
            >
              确认
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
