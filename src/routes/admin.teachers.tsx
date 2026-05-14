import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, UserPlus, Trash2, ShieldCheck } from "lucide-react";
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
}

function TeachersPage() {
  const { session } = useAuth();
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc("list_admin_users");
    if (error) {
      toast.error("加载失败：" + error.message);
      setLoading(false);
      return;
    }
    setTeachers((data ?? []) as Teacher[]);
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
        toast.info("该账号已经是教师");
      } else {
        toast.error("授权失败：" + insErr.message);
      }
      return;
    }
    toast.success("已授予教师权限");
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
    toast.success("已撤销教师权限");
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
          授予其他注册用户教师权限后，对方即可登录管理后台、管理学生档案与评分。
        </p>
      </div>

      <form
        onSubmit={handleGrant}
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
            {busy ? "处理中..." : "授予权限"}
          </Button>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          提示：对方需先在登录页用该邮箱完成注册，然后你才能在此处授权。
        </p>
      </form>

      <div className="mb-3 text-sm font-medium text-foreground">
        当前教师列表
      </div>
      {loading ? (
        <div className="rounded-2xl border border-border bg-card p-10 text-center text-sm text-muted-foreground">
          加载中...
        </div>
      ) : teachers.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card/50 p-10 text-center text-sm text-muted-foreground">
          暂无教师账号
        </div>
      ) : (
        <div className="space-y-2">
          {teachers.map((t) => {
            const isSelf = t.user_id === session?.user.id;
            return (
              <div
                key={t.user_id}
                className="flex items-center justify-between rounded-xl border border-border bg-card p-4 shadow-[var(--shadow-card)]"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-accent/60 text-accent-foreground">
                    <ShieldCheck className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="text-sm font-medium text-foreground">
                      {t.email}
                      {isSelf && (
                        <span className="ml-2 rounded-md bg-accent/60 px-1.5 py-0.5 text-xs text-accent-foreground">
                          你自己
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      授权时间：{new Date(t.created_at).toLocaleString("zh-CN")}
                    </div>
                  </div>
                </div>
                {!isSelf && (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>
                          撤销「{t.email}」的教师权限？
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                          撤销后该账号将无法再访问管理后台。账号本身不会被删除。
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
