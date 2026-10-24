import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ChevronRight, GraduationCap, History, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
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
import {
  listStudentAccounts,
  deleteStudentAccount,
} from "@/lib/student-account.functions";
import { setStudentAccessLevel } from "@/lib/access.functions";
import { useAuth } from "@/hooks/use-auth";

interface StudentAccount {
  id: string;
  name: string;
  username: string | null;
  auth_user_id: string | null;
  created_at: string;
  created_by_email: string | null;
  last_sign_in_at: string | null;
  access_level: string;
}

interface LoginEvent {
  occurred_at: string;
  action: string | null;
  ip_address: string | null;
}

function actionLabel(action: string | null): string {
  switch (action) {
    case "login":
      return "登录";
    case "logout":
      return "登出";
    case "token_refreshed":
      return "刷新会话";
    case "user_signedup":
      return "注册";
    case "user_recovery_requested":
      return "申请重置密码";
    case "user_modified":
      return "账号变更";
    default:
      return action ?? "—";
  }
}

export function StudentAccountsPanel() {
  const [rows, setRows] = useState<StudentAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirmDel, setConfirmDel] = useState<StudentAccount | null>(null);
  const [historyFor, setHistoryFor] = useState<StudentAccount | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyRows, setHistoryRows] = useState<LoginEvent[]>([]);
  const { isAdmin } = useAuth();
  const changeLevel = async (s: StudentAccount, level: "full" | "limited") => {
    try {
      await setStudentAccessLevel({ data: { studentId: s.id, level } });
      toast.success(level === "full" ? "已变更为教师注册学生权限" : "已恢复为自主注册受限权限");
      void load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "修改失败");
    }
  };

  const load = async () => {
    setLoading(true);
    try {
      const data = await listStudentAccounts();
      setRows(data as StudentAccount[]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "加载失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const openHistory = async (s: StudentAccount) => {
    setHistoryFor(s);
    setHistoryRows([]);
    if (!s.auth_user_id) return;
    setHistoryLoading(true);
    const { data, error } = await (supabase.rpc as any)("list_user_login_history", {
      _user_id: s.auth_user_id,
      _limit: 100,
    });
    if (error) {
      toast.error("加载登录日志失败：" + error.message);
      setHistoryLoading(false);
      return;
    }
    setHistoryRows((data ?? []) as LoginEvent[]);
    setHistoryLoading(false);
  };

  const handleDelete = async (s: StudentAccount) => {
    try {
      await deleteStudentAccount({ data: { studentId: s.id } });
      toast.success("已删除学生账号");
      void load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "删除失败");
    }
  };

  return (
    <div>
      <div className="mb-3 text-sm font-medium text-foreground">全部学生账号</div>
      {loading ? (
        <div className="rounded-2xl border border-border bg-card p-10 text-center text-sm text-muted-foreground">
          加载中...
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card/50 p-10 text-center text-sm text-muted-foreground">
          暂无学生账号
        </div>
      ) : (
        <div className="space-y-2">
          {rows.map((s) => (
            <div
              key={s.id}
              className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card p-4 shadow-[var(--shadow-card)] transition-shadow hover:shadow-[var(--shadow-soft)]"
            >
              <Link
                to="/admin/student/$id"
                params={{ id: s.id }}
                className="flex flex-1 items-center gap-3 min-w-0"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-accent/60 text-accent-foreground">
                  <GraduationCap className="h-5 w-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 text-sm font-medium text-foreground">
                    <span className="truncate">{s.name}</span>
                    {s.username ? (
                      <span className="rounded-md bg-accent/60 px-1.5 py-0.5 text-xs text-accent-foreground">
                        账号：{s.username}
                      </span>
                    ) : (
                      <span className="rounded-md bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                        未开通登录
                      </span>
                    )}
                    {s.access_level === "limited" && (
                      <span className="rounded-md bg-destructive/10 px-1.5 py-0.5 text-xs text-destructive">
                        自主注册·受限
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                    <span>创建教师：{s.created_by_email ?? "—"}</span>
                    <span>·</span>
                    <span>创建：{new Date(s.created_at).toLocaleString("zh-CN")}</span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        void openHistory(s);
                      }}
                      className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-2 py-0.5 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground"
                      title="查看登录日志"
                    >
                      <History className="h-3 w-3" />
                      登录日志
                    </button>
                    <span className="text-[11px]">
                      最近登录：
                      {s.last_sign_in_at
                        ? new Date(s.last_sign_in_at).toLocaleString("zh-CN")
                        : "—"}
                    </span>
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </Link>
              {isAdmin && s.access_level === "limited" && (
                <Button variant="outline" size="sm" onClick={() => { if (window.confirm(`将「${s.name}」变更为教师注册学生权限？`)) void changeLevel(s, "full"); }}>
                  变更为教师注册权限
                </Button>
              )}
              {isAdmin && s.access_level === "full" && !s.created_by_email && (
                <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => void changeLevel(s, "limited")}>
                  恢复受限
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                className="gap-1 text-muted-foreground hover:text-destructive"
                onClick={() => setConfirmDel(s)}
              >
                <Trash2 className="h-3.5 w-3.5" />
                删除账号
              </Button>
            </div>
          ))}
        </div>
      )}

      <AlertDialog open={!!confirmDel} onOpenChange={(o) => !o && setConfirmDel(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除「{confirmDel?.name}」的账号？</AlertDialogTitle>
            <AlertDialogDescription>
              将同时删除该学生的档案、课堂评分记录与登录账号，且无法恢复。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async () => {
                const target = confirmDel;
                setConfirmDel(null);
                if (target) await handleDelete(target);
              }}
            >
              确认删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog
        open={!!historyFor}
        onOpenChange={(o) => {
          if (!o) {
            setHistoryFor(null);
            setHistoryRows([]);
          }
        }}
      >
        <DialogContent className="max-w-2xl w-[95vw] max-h-[85vh] overflow-auto">
          <DialogHeader>
            <DialogTitle>登录日志 · {historyFor?.name}</DialogTitle>
          </DialogHeader>
          {!historyFor?.auth_user_id ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              该学生尚未开通登录账号
            </div>
          ) : historyLoading ? (
            <div className="py-8 text-center text-sm text-muted-foreground">加载中...</div>
          ) : historyRows.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">暂无登录记录</div>
          ) : (
            <div className="overflow-hidden rounded-md border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-xs text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">时间</th>
                    <th className="px-3 py-2 text-left font-medium">事件</th>
                    <th className="px-3 py-2 text-left font-medium">IP</th>
                  </tr>
                </thead>
                <tbody>
                  {historyRows.map((r, i) => (
                    <tr key={i} className="border-t">
                      <td className="px-3 py-2 whitespace-nowrap">
                        {new Date(r.occurred_at).toLocaleString("zh-CN")}
                      </td>
                      <td className="px-3 py-2">{actionLabel(r.action)}</td>
                      <td className="px-3 py-2 text-muted-foreground">{r.ip_address ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
