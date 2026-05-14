import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, Calendar, GraduationCap, TrendingUp } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { StarRating } from "@/components/star-rating";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/student/$id")({
  component: StudentProfile,
});

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
}

const dimensions = [
  { key: "focus" as const, label: "专注力" },
  { key: "interaction" as const, label: "互动性" },
  { key: "discipline" as const, label: "课堂纪律" },
  { key: "accuracy" as const, label: "做题准确率" },
];

function StudentProfile() {
  const { id } = Route.useParams();
  const [student, setStudent] = useState<{ name: string } | null>(null);
  const [ratings, setRatings] = useState<Rating[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound404, setNotFound] = useState(false);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data: s } = await supabase
        .from("students")
        .select("name")
        .eq("id", id)
        .maybeSingle();
      if (!s) {
        setNotFound(true);
        setLoading(false);
        return;
      }
      setStudent(s);
      const { data: r } = await supabase
        .from("ratings")
        .select("id, lesson_date, focus, interaction, discipline, accuracy")
        .eq("student_id", id)
        .order("lesson_date", { ascending: false });
      setRatings(r ?? []);
      setLoading(false);
    })();
  }, [id]);

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
          <Link to="/" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" />
            返回
          </Link>
          <div className="flex items-center gap-2">
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

        {ratings.length > 0 && (
          <section className="mb-10 rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-card)]">
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
                  <div className="mb-4 flex items-center gap-2 text-sm font-medium text-foreground">
                    <Calendar className="h-4 w-4 text-primary" />
                    {new Date(r.lesson_date).toLocaleDateString("zh-CN", {
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                      weekday: "short",
                    })}
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
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
