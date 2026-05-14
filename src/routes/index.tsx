import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { GraduationCap, Search, Sparkles, Lock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

export const Route = createFileRoute("/")({
  component: Index,
  head: () => ({
    meta: [
      { title: "学生课堂表现档案" },
      { name: "description", content: "查看孩子每节课的课堂表现评分" },
    ],
  }),
});

function Index() {
  const [name, setName] = useState("");
  const [searching, setSearching] = useState(false);
  const navigate = useNavigate();

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    setSearching(true);
    const { data, error } = await supabase
      .from("students")
      .select("id, name")
      .ilike("name", trimmed)
      .maybeSingle();
    setSearching(false);
    if (error) {
      toast.error("查询失败，请稍后再试");
      return;
    }
    if (!data) {
      toast.error(`未找到名为「${trimmed}」的学生`);
      return;
    }
    navigate({ to: "/student/$id", params: { id: data.id } });
  };

  return (
    <div className="min-h-screen bg-[var(--gradient-soft)]">
      <header className="border-b border-border/40 bg-background/60 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--gradient-hero)] text-primary-foreground shadow-[var(--shadow-soft)]">
              <GraduationCap className="h-5 w-5" />
            </div>
            <span className="font-semibold text-foreground">课堂档案</span>
          </div>
          <Link to="/login">
            <Button variant="ghost" size="sm" className="gap-1.5">
              <Lock className="h-4 w-4" />
              老师登录
            </Button>
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-16 md:py-24">
        <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-accent/60 px-3 py-1 text-xs font-medium text-accent-foreground">
          <Sparkles className="h-3.5 w-3.5" />
          家长查看入口
        </div>
        <h1 className="mb-4 text-4xl font-bold tracking-tight text-foreground md:text-5xl">
          查看孩子的<br className="md:hidden" />课堂表现
        </h1>
        <p className="mb-10 max-w-xl text-base text-muted-foreground md:text-lg">
          输入学生姓名，即可查看每节课的专注力、互动性、课堂纪律和做题准确率评分。
        </p>

        <form
          onSubmit={handleSearch}
          className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-card)] md:p-8"
        >
          <label className="mb-2 block text-sm font-medium text-foreground">
            学生姓名
          </label>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="请输入学生姓名"
              className="h-12 flex-1 text-base"
              maxLength={50}
            />
            <Button
              type="submit"
              disabled={searching || !name.trim()}
              size="lg"
              className="h-12 gap-2 bg-[var(--gradient-hero)] text-primary-foreground shadow-[var(--shadow-soft)] hover:opacity-90"
            >
              <Search className="h-4 w-4" />
              {searching ? "查找中..." : "查看档案"}
            </Button>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            提示：请输入与老师登记一致的姓名。
          </p>
        </form>

        <div className="mt-12 grid gap-4 sm:grid-cols-2">
          {[
            { title: "专注力", desc: "课堂上的注意力集中程度" },
            { title: "互动性", desc: "回答问题与师生互动情况" },
            { title: "课堂纪律", desc: "遵守课堂规则的表现" },
            { title: "做题准确率", desc: "练习与作业的正确程度" },
          ].map((item) => (
            <div
              key={item.title}
              className="rounded-xl border border-border/60 bg-card/60 p-4"
            >
              <div className="mb-1 text-sm font-semibold text-foreground">
                {item.title}
              </div>
              <div className="text-xs text-muted-foreground">{item.desc}</div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
