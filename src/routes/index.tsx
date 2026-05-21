import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Sparkles, UserRound, KeyRound } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";

export const Route = createFileRoute("/")({
  component: Index,
  head: () => ({
    meta: [
      { title: "课堂档案 · 登录" },
      { name: "description", content: "学生或老师登录查看课堂档案" },
    ],
  }),
});

function Index() {
  const navigate = useNavigate();
  const { session, isTeacher, loading } = useAuth();

  // 已登录的老师直接进入后台
  useEffect(() => {
    if (!loading && session && isTeacher) {
      navigate({ to: "/admin" });
    }
  }, [session, isTeacher, loading, navigate]);

  // 已登录的学生：跳到自己的档案
  useEffect(() => {
    if (!loading && session && !isTeacher) {
      supabase
        .from("students")
        .select("id")
        .eq("auth_user_id", session.user.id)
        .maybeSingle()
        .then(({ data }) => {
          if (data) navigate({ to: "/student/$id", params: { id: data.id } });
        });
    }
  }, [session, isTeacher, loading, navigate]);

  const [tab, setTab] = useState<"student" | "teacher">("student");

  // student form
  const [sUser, setSUser] = useState("");
  const [sPwd, setSPwd] = useState("");
  const [sBusy, setSBusy] = useState(false);
  // teacher form
  const [tAcct, setTAcct] = useState("");
  const [tPwd, setTPwd] = useState("");
  const [tMode, setTMode] = useState<"signin" | "signup">("signin");
  const [tBusy, setTBusy] = useState(false);

  const handleStudentLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const username = sUser.trim();
    if (!username || !sPwd) return;
    setSBusy(true);
    const { data: email, error: lookupErr } = await supabase.rpc(
      "student_login_email",
      { _username: username },
    );
    if (lookupErr || !email) {
      setSBusy(false);
      toast.error("用户名或密码错误");
      return;
    }
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password: sPwd,
    });
    setSBusy(false);
    if (error) {
      toast.error("用户名或密码错误");
      return;
    }
    // 登录成功后自动跳转由上面的 useEffect 处理
  };

  const handleTeacherSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTBusy(true);
    const trimmed = tAcct.trim();
    const email = trimmed.includes("@") ? trimmed : `${trimmed.toLowerCase()}@teacher.local`;
    if (tMode === "signup") {
      const { error } = await supabase.auth.signUp({
        email,
        password: tPwd,
        options: { emailRedirectTo: `${window.location.origin}/admin` },
      });
      if (error) {
        toast.error(error.message);
        setTBusy(false);
        return;
      }
      toast.success("注册成功，正在登录...");
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password: tPwd });
      if (error) {
        toast.error("账号或密码错误");
        setTBusy(false);
        return;
      }
    }
    setTBusy(false);
  };

  return (
    <div className="flex min-h-screen flex-col bg-[var(--gradient-soft)]">
      <header className="border-b border-border/40 bg-background/60 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4" />
      </header>

      <main className="flex flex-1 items-center justify-center px-6 py-12">
        <div className="w-full max-w-md">
          <div className="mb-8 text-center">
            <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-accent/60 px-3 py-1 text-xs font-medium text-accent-foreground">
              <Sparkles className="h-3.5 w-3.5" />
              欢迎登录
            </div>
            <h1 className="text-2xl font-bold text-foreground">查看孩子的课堂表现</h1>
            <p className="mt-1 text-sm text-muted-foreground">请选择身份登录</p>
          </div>

          <Tabs value={tab} onValueChange={(v) => setTab(v as "student" | "teacher")}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="student" className="gap-1.5">
                <UserRound className="h-4 w-4" />
                家长登录
              </TabsTrigger>
              <TabsTrigger value="teacher" className="gap-1.5">
                <KeyRound className="h-4 w-4" />
                教师登录
              </TabsTrigger>
            </TabsList>

            <TabsContent value="student">
              <form
                onSubmit={handleStudentLogin}
                className="mt-4 space-y-4 rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-card)]"
              >
                <div className="space-y-2">
                  <Label htmlFor="s-user">用户名（学生姓名）</Label>
                  <Input
                    id="s-user"
                    value={sUser}
                    onChange={(e) => setSUser(e.target.value)}
                    placeholder="请输入学生姓名"
                    maxLength={50}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="s-pwd">密码</Label>
                  <Input
                    id="s-pwd"
                    type="password"
                    value={sPwd}
                    onChange={(e) => setSPwd(e.target.value)}
                    placeholder="初始密码为 000000"
                  />
                </div>
                <Button
                  type="submit"
                  disabled={sBusy || !sUser.trim() || !sPwd}
                  className="h-11 w-full bg-green-500 text-primary-foreground shadow-[var(--shadow-soft)] hover:bg-green-600"
                >
                  {sBusy ? "登录中..." : "登录"}
                </Button>
                <p className="text-center text-xs text-muted-foreground">
                  账号由老师创建，初始密码为 000000
                </p>
              </form>
            </TabsContent>

            <TabsContent value="teacher">
              <form
                onSubmit={handleTeacherSubmit}
                className="mt-4 space-y-4 rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-card)]"
              >
                <div className="space-y-2">
                  <Label htmlFor="t-acct">账号</Label>
                  <Input
                    id="t-acct"
                    value={tAcct}
                    onChange={(e) => setTAcct(e.target.value)}
                    placeholder="可使用邮箱或自定义账号名"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="t-pwd">密码</Label>
                  <Input
                    id="t-pwd"
                    type="password"
                    minLength={6}
                    value={tPwd}
                    onChange={(e) => setTPwd(e.target.value)}
                    placeholder="至少 6 位"
                  />
                </div>
                <Button
                  type="submit"
                  disabled={tBusy || !tAcct.trim() || !tPwd}
                  className="h-11 w-full bg-green-500 text-primary-foreground shadow-[var(--shadow-soft)] hover:bg-green-600"
                >
                  {tBusy ? "处理中..." : tMode === "signin" ? "登录" : "注册并登录"}
                </Button>
                <button
                  type="button"
                  onClick={() => setTMode(tMode === "signin" ? "signup" : "signin")}
                  className="block w-full text-center text-xs text-muted-foreground hover:text-foreground"
                >
                  {tMode === "signin" ? "首次使用？注册教师账号" : "已有账号？前往登录"}
                </button>
              </form>
            </TabsContent>
          </Tabs>
        </div>
      </main>
    </div>
  );
}
