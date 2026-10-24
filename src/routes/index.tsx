import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Sparkles, UserRound, KeyRound } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { registerParentAccount } from "@/lib/self-register.functions";
import { toast } from "sonner";


export const Route = createFileRoute("/")({
  component: Index,
  validateSearch: (s: Record<string, unknown>): { next?: string } =>
    typeof s.next === "string" ? { next: s.next } : {},

  head: () => ({
    meta: [
      { title: "课堂档案 · 登录" },
      { name: "description", content: "学生或老师登录查看课堂档案" },
      { property: "og:title", content: "课堂档案 · 登录" },
      { property: "og:description", content: "家长和教师登录查看课堂档案、课程表与习题练习。" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function safeNext(next: string | undefined): string | null {
  if (!next) return null;
  if (!next.startsWith("/") || next.startsWith("//")) return null;
  return next;
}

function Index() {
  const navigate = useNavigate();
  const { session, isTeacher, loading } = useAuth();
  const { next } = Route.useSearch();
  const nextPath = safeNext(next);

  // 已登录：若有 next 则优先跳转 next，否则按角色跳转
  useEffect(() => {
    if (loading || !session) return;
    if (nextPath) {
      window.location.href = nextPath;
      return;
    }
    if (isTeacher) {
      navigate({ to: "/admin" });
      return;
    }
    supabase.rpc("get_my_student_profile").then(({ data }) => {
      const row = Array.isArray(data) ? data[0] : null;
      if (row?.id) navigate({ to: "/student/$id", params: { id: row.id } });
    });
  }, [session, isTeacher, loading, navigate, nextPath]);

  const [tab, setTab] = useState<"student" | "teacher">("student");

  // student form
  const [sUser, setSUser] = useState("");
  const [sPwd, setSPwd] = useState("");
  const [sBusy, setSBusy] = useState(false);
  // teacher form
  const [tAcct, setTAcct] = useState("");
  const [tPwd, setTPwd] = useState("");
  const [tBusy, setTBusy] = useState(false);
  // register dialog
  const [regOpen, setRegOpen] = useState(false);
  const [regRole, setRegRole] = useState<"parent" | "teacher">("parent");
  const [regUser, setRegUser] = useState("");
  const [regPwd, setRegPwd] = useState("");
  const [regBusy, setRegBusy] = useState(false);

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
    const { error } = await supabase.auth.signInWithPassword({ email, password: tPwd });
    setTBusy(false);
    if (error) toast.error("账号或密码错误");
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    const username = regUser.trim();
    if (!username || regPwd.length < 6) {
      toast.error("请填写用户名，密码至少 6 位");
      return;
    }
    setRegBusy(true);
    try {
      if (regRole === "teacher") {
        const email = username.includes("@")
          ? username
          : `${username.toLowerCase()}@teacher.local`;
        const { error } = await supabase.auth.signUp({
          email,
          password: regPwd,
          options: { emailRedirectTo: `${window.location.origin}/admin` },
        });
        if (error) throw new Error(error.message);
        await supabase.auth.signInWithPassword({ email, password: regPwd });
      } else {
        const res = await registerParentAccount({
          data: { username, password: regPwd },
        });
        const { error } = await supabase.auth.signInWithPassword({
          email: res.email,
          password: regPwd,
        });
        if (error) throw new Error(error.message);
      }
      setRegOpen(false);
      setRegUser("");
      setRegPwd("");
      toast.success("注册成功，正在登录...");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "注册失败");
    } finally {
      setRegBusy(false);
    }
  };


  return (
    <div className="flex min-h-screen flex-col bg-[var(--gradient-soft)]">
      <header className="border-b border-border/40 bg-background/60 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3 sm:px-6 sm:py-4" />
      </header>

      <main className="flex flex-1 items-center justify-center px-4 py-8 sm:px-6 sm:py-12">
        <div className="w-full max-w-md">
          <div className="mb-6 text-center sm:mb-8">
            <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-accent/60 px-3 py-1 text-xs font-medium text-accent-foreground">
              <Sparkles className="h-3.5 w-3.5" />
              欢迎登录
            </div>
            <h1 className="text-xl font-bold text-foreground sm:text-2xl">查看孩子的课堂表现</h1>
            <p className="mt-1 text-sm text-muted-foreground">请选择身份登录</p>
          </div>

          <Tabs value={tab} onValueChange={(v) => setTab(v as "student" | "teacher")}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="student" className="flex-row gap-1.5 whitespace-nowrap">
                <UserRound className="h-4 w-4 shrink-0" />
                <span>家长登录</span>
              </TabsTrigger>
              <TabsTrigger value="teacher" className="flex-row gap-1.5 whitespace-nowrap">
                <KeyRound className="h-4 w-4 shrink-0" />
                <span>教师登录</span>
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
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setRegRole("parent");
                    setRegOpen(true);
                  }}
                  className="h-11 w-full"
                >
                  注册
                </Button>
                <p className="text-center text-xs text-muted-foreground">
                  老师创建的账号初始密码为 000000；自行注册的家长账号为独立账号
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
                  {tBusy ? "处理中..." : "登录"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setRegRole("teacher");
                    setRegOpen(true);
                  }}
                  className="h-11 w-full"
                >
                  注册
                </Button>
              </form>
            </TabsContent>
          </Tabs>
        </div>
      </main>

      <Dialog open={regOpen} onOpenChange={setRegOpen}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle>注册账号</DialogTitle>
            <DialogDescription>
              自行创建的家长账号为独立账号，不与任何教师账号关联；如需关联请联系管理员。
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleRegister} className="space-y-4">
            <div className="space-y-2">
              <Label>账号类型</Label>
              <RadioGroup
                value={regRole}
                onValueChange={(v) => setRegRole(v as "parent" | "teacher")}
                className="flex gap-4"
              >
                <label className="flex items-center gap-2 text-sm">
                  <RadioGroupItem value="parent" id="reg-parent" />
                  家长
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <RadioGroupItem value="teacher" id="reg-teacher" />
                  教师
                </label>
              </RadioGroup>
            </div>
            <div className="space-y-2">
              <Label htmlFor="reg-user">用户名</Label>
              <Input
                id="reg-user"
                value={regUser}
                onChange={(e) => setRegUser(e.target.value)}
                placeholder="请输入用户名"
                maxLength={50}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="reg-pwd">密码</Label>
              <Input
                id="reg-pwd"
                type="password"
                minLength={6}
                value={regPwd}
                onChange={(e) => setRegPwd(e.target.value)}
                placeholder="至少 6 位"
              />
            </div>
            <DialogFooter>
              <Button
                type="submit"
                disabled={regBusy || !regUser.trim() || regPwd.length < 6}
                className="h-11 w-full bg-green-500 text-primary-foreground hover:bg-green-600"
              >
                {regBusy ? "注册中..." : "注册并登录"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

