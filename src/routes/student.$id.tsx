import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, Calendar, GraduationCap, TrendingUp, Settings, LogOut } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { StarRating } from "@/components/star-rating";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ComprehensiveAssessment } from "@/components/comprehensive-assessment";
import { PetTab } from "@/components/pet-tab";
import { StudentLibraryTab } from "@/components/student-library-tab";
import { PracticeTab } from "@/components/practice-tab";
import { type AssessmentTimestamps, isUnread } from "@/lib/assessment-updates";
import { updateStudentUsername, updateStudentPassword } from "@/lib/student-account.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/student/$id")({
  component: StudentProfile,
});


interface ProgressItem {
  id: string;
  item_name: string;
  percentage: number;
  sort_order: number;
}

interface Rating {
  id: string;
  lesson_date: string;
  lesson_name: string | null;
  summary: string | null;
  overall_assessment: number | null;
  focus: number;
  interaction: number;
  discipline: number;
  accuracy: number;
  overall_progress: number | null;
  progress_items: ProgressItem[];
}

const dimensions = [
  { key: "focus" as const, label: "专注力" },
  { key: "interaction" as const, label: "互动性" },
  { key: "discipline" as const, label: "课堂纪律" },
  { key: "accuracy" as const, label: "做题准确率" },
];

function StudentProfile() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const { session } = useAuth();
  const [student, setStudent] = useState<{ name: string; username: string | null; auth_user_id: string | null } | null>(null);
  const [ratings, setRatings] = useState<Rating[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound404, setNotFound] = useState(false);
  const [timestamps, setTimestamps] = useState<AssessmentTimestamps>({
    knowledge: null,
    thinking: null,
    learning_quality: null,
  });
  const [activeTab, setActiveTab] = useState("lessons");
  const [acctOpen, setAcctOpen] = useState(false);
  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [acctBusy, setAcctBusy] = useState(false);

  useEffect(() => {
    (async () => {
      setLoading(true);
      let { data: s } = await supabase
        .from("students")
        .select(
          "name, username, auth_user_id, knowledge_updated_at, thinking_updated_at, learning_quality_updated_at",
        )
        .eq("id", id)
        .maybeSingle();
      if (!s) {
        // Student self-access path: RLS hides the row, fetch via safe RPC.
        const { data: rpcRows } = await supabase.rpc("get_my_student_profile");
        const mine = Array.isArray(rpcRows) ? rpcRows.find((r: any) => r.id === id) : null;
        if (mine) s = mine as any;
      }
      if (!s) {
        setNotFound(true);
        setLoading(false);
        return;
      }
      setStudent({ name: s.name, username: s.username, auth_user_id: s.auth_user_id });
      setNewUsername(s.username ?? "");

      setTimestamps({
        knowledge: s.knowledge_updated_at,
        thinking: s.thinking_updated_at,
        learning_quality: s.learning_quality_updated_at,
      });
      const { data: r } = await supabase
        .from("ratings")
        .select(
          "id, lesson_date, lesson_name, summary, overall_assessment, focus, interaction, discipline, accuracy, overall_progress, progress_items(id, item_name, percentage, sort_order)",
        )
        .eq("student_id", id)
        .order("lesson_date", { ascending: false });
      const normalized = ((r ?? []) as unknown as Rating[]).map((row) => ({
        ...row,
        progress_items: (row.progress_items ?? []).slice().sort(
          (a, b) => a.sort_order - b.sort_order,
        ),
      }));
      setRatings(normalized);
      setLoading(false);
    })();
  }, [id]);

  const hasUnread =
    isUnread(id, "knowledge", timestamps.knowledge) ||
    isUnread(id, "thinking", timestamps.thinking) ||
    isUnread(id, "learning_quality", timestamps.learning_quality);

  const isOwner = !!(student?.auth_user_id && session?.user.id === student.auth_user_id);



  const handleTabChange = (v: string) => {
    setActiveTab(v);
  };

  const avg = (key: keyof Rating) => {
    if (ratings.length === 0) return 0;
    const numericRatings = ratings.map((r) => r[key] as number);
    return numericRatings.reduce((a, b) => a + b, 0) / ratings.length;
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground">
        加载中...
      </div>
    );
  }

  if (notFound404) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-4">
        <p className="text-muted-foreground">未找到该学生</p>
        <Link to="/">
          <Button variant="outline">返回首页</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--gradient-soft)] pb-16">
      <header className="border-b border-border/40 bg-background/60 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          {isOwner ? (
            <div />
          ) : (
            <Link to="/" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
              <ArrowLeft className="h-4 w-4" />
              返回
            </Link>
          )}
          <div className="flex items-center gap-2">
            {isOwner && (
              <>
                <Dialog open={acctOpen} onOpenChange={setAcctOpen}>
                  <DialogTrigger asChild>
                    <Button variant="ghost" size="sm" className="gap-1.5">
                      <Settings className="h-4 w-4" />
                      账号设置
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>账号设置</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-5">
                      <div className="space-y-2">
                        <Label htmlFor="new-username">修改用户名</Label>
                        <div className="flex gap-2">
                          <Input
                            id="new-username"
                            value={newUsername}
                            onChange={(e) => setNewUsername(e.target.value)}
                            maxLength={50}
                            placeholder="新用户名"
                          />
                          <Button
                            type="button"
                            disabled={
                              acctBusy ||
                              !newUsername.trim() ||
                              newUsername.trim() === (student?.username ?? "")
                            }
                            onClick={async () => {
                              setAcctBusy(true);
                              try {
                                const res = await updateStudentUsername({
                                  data: { newUsername: newUsername.trim() },
                                });
                                setStudent((p) => (p ? { ...p, username: res.username } : p));
                                toast.success("用户名已更新");
                              } catch (e) {
                                toast.error(e instanceof Error ? e.message : "更新失败");
                              } finally {
                                setAcctBusy(false);
                              }
                            }}
                          >
                            保存
                          </Button>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          当前用户名：{student?.username ?? "-"}
                        </p>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="new-password">修改密码</Label>
                        <div className="flex gap-2">
                          <Input
                            id="new-password"
                            type="password"
                            value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                            minLength={6}
                            placeholder="新密码（至少 6 位）"
                          />
                          <Button
                            type="button"
                            disabled={acctBusy || newPassword.length < 6}
                            onClick={async () => {
                              setAcctBusy(true);
                              try {
                                await updateStudentPassword({
                                  data: { newPassword },
                                });
                                setNewPassword("");
                                toast.success("密码已更新");
                              } catch (e) {
                                toast.error(e instanceof Error ? e.message : "更新失败");
                              } finally {
                                setAcctBusy(false);
                              }
                            }}
                          >
                            保存
                          </Button>
                        </div>
                      </div>
                    </div>
                    <DialogFooter />
                  </DialogContent>
                </Dialog>
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-1.5"
                  onClick={async () => {
                    await supabase.auth.signOut();
                    navigate({ to: "/" });
                  }}
                >
                  <LogOut className="h-4 w-4" />
                  退出
                </Button>
              </>
            )}
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--gradient-hero)] text-primary-foreground shadow-[var(--shadow-soft)]">
              <GraduationCap className="h-5 w-5" />
            </div>
          </div>
        </div>
      </header>


      <main className="mx-auto max-w-4xl px-6 py-10">
        <div className="mb-8">
          <div className="text-sm text-muted-foreground">学生档案</div>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-foreground md:text-4xl">
            {student?.name}
          </h1>
          <div className="mt-2 text-sm text-muted-foreground">
            共 {ratings.length} 节课记录
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
          <TabsList className="mb-6 grid w-full max-w-3xl grid-cols-5">
            <TabsTrigger value="lessons">课堂记录</TabsTrigger>
            <TabsTrigger value="comprehensive" className="relative">
              <span className={hasUnread ? "animate-pulse font-semibold text-red-600" : undefined}>
                综合素质
              </span>
              {hasUnread && (
                <span className="ml-2 flex h-2.5 w-2.5">
                  <span className="absolute inline-flex h-2.5 w-2.5 animate-ping rounded-full bg-red-500 opacity-75" />
                  <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-red-500" />
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="library">资料库</TabsTrigger>
            <TabsTrigger value="practice">习题练习</TabsTrigger>
            <TabsTrigger value="pet">养宠物</TabsTrigger>
          </TabsList>

          <TabsContent value="lessons" className="space-y-8">
            {ratings.length > 0 && (
              <section className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-card)]">
                <div className="mb-4 flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-primary" />
                  <h2 className="text-base font-semibold text-foreground">总体平均</h2>
                </div>
                <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-4">
                  {dimensions.map((d) => {
                    const a = avg(d.key);
                    return (
                      <div key={d.key} className="rounded-xl bg-muted/50 p-4">
                        <div className="mb-2 text-xs font-medium text-muted-foreground">
                          {d.label}
                        </div>
                        <div className="mb-1.5 text-2xl font-bold text-foreground">
                          {a.toFixed(1)}
                        </div>
                        <StarRating value={Math.round(a)} size="sm" readOnly />
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            <section>
              <h2 className="mb-4 text-base font-semibold text-foreground">课堂记录</h2>
              {ratings.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border bg-card/50 p-10 text-center text-sm text-muted-foreground">
                  暂无课堂记录
                </div>
              ) : (
                <div className="space-y-3">
                  {ratings.map((r) => (
                    <article
                      key={r.id}
                      className="rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-card)]"
                    >
                      <div className="mb-3">
                        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                          <Calendar className="h-4 w-4 text-primary" />
                          {new Date(r.lesson_date).toLocaleDateString("zh-CN", {
                            year: "numeric",
                            month: "long",
                            day: "numeric",
                            weekday: "short",
                          })}
                        </div>
                        {r.lesson_name && (
                          <div className="mt-1 text-base font-semibold text-foreground">
                            {r.lesson_name}
                          </div>
                        )}
                      </div>
                      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        学生表现
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2">
                        {dimensions.map((d) => (
                          <div
                            key={d.key}
                            className="flex items-center justify-between rounded-lg bg-muted/40 px-3 py-2"
                          >
                            <span className="text-sm text-muted-foreground">
                              {d.label}
                            </span>
                            <StarRating value={r[d.key]} size="sm" readOnly />
                          </div>
                        ))}
                        {r.overall_assessment != null && (
                          <div className="flex items-center justify-between rounded-lg bg-primary/10 px-3 py-2 sm:col-span-2">
                            <span className="text-sm font-semibold text-foreground">
                              整体表现
                            </span>
                            <StarRating value={r.overall_assessment} size="sm" readOnly />
                          </div>
                        )}
                      </div>
                      {(r.progress_items.length > 0 || r.overall_progress != null) && (
                        <>
                          <div className="mt-4 mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            授课进度
                          </div>
                          <div className="space-y-2">
                            {r.progress_items.map((p) => (
                              <div
                                key={p.id}
                                className="flex items-center justify-between rounded-lg bg-muted/40 px-3 py-2"
                              >
                                <span className="text-sm text-foreground">{p.item_name}</span>
                                <span className="text-sm font-semibold text-primary">
                                  {p.percentage}%
                                </span>
                              </div>
                            ))}
                            {r.overall_progress != null && (
                              <div className="flex items-center justify-between rounded-lg bg-primary/10 px-3 py-2">
                                <span className="text-sm font-semibold text-foreground">
                                  整体吸收程度
                                </span>
                                <span className="text-sm font-bold text-primary">
                                  {r.overall_progress}%
                                </span>
                              </div>
                            )}
                          </div>
                        </>
                      )}
                      {r.summary && (
                        <div className="mt-3 whitespace-pre-wrap rounded-lg bg-muted/40 px-3 py-2 text-sm text-foreground">
                          <div className="mb-1 text-xs font-medium text-muted-foreground">课堂总结</div>
                          {r.summary}
                        </div>
                      )}
                    </article>
                  ))}
                </div>
              )}
            </section>
          </TabsContent>

          <TabsContent value="comprehensive">
            <ComprehensiveAssessment
              studentId={id}
              editable={false}
              timestamps={timestamps}
            />
          </TabsContent>

          <TabsContent value="library">
            <StudentLibraryTab studentId={id} />
          </TabsContent>

          <TabsContent value="practice">
            <PracticeTab studentId={id} />
          </TabsContent>

          <TabsContent value="pet">
            <PetTab studentId={id} editable={isOwner} />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
