import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, BookOpen } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/admin/question-bank/$paperId")({
  component: PaperDetailPage,
});

interface PaperRow {
  id: string;
  year: number;
  name: string;
  question_count: number;
}

interface QuestionRow {
  id: string;
  question_number: number;
  stem: string;
  option_a: string | null;
  option_b: string | null;
  option_c: string | null;
  option_d: string | null;
  option_e: string | null;
  correct_answer: string | null;
  image_path: string | null;
  options_image_path: string | null;
  stem_render_mode: "text" | "image";
  options_render_mode: "text" | "image";
  tags: string[];
}

function PaperDetailPage() {
  const { paperId } = Route.useParams();
  const [paper, setPaper] = useState<PaperRow | null>(null);
  const [questions, setQuestions] = useState<QuestionRow[]>([]);
  const [imageUrls, setImageUrls] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const [{ data: p }, { data: qs }] = await Promise.all([
        supabase.from("math_papers").select("id, year, name, question_count").eq("id", paperId).single(),
        supabase
          .from("math_questions")
          .select(
            "id, question_number, stem, option_a, option_b, option_c, option_d, option_e, correct_answer, image_path, options_image_path, stem_render_mode, options_render_mode, tags",
          )
          .eq("paper_id", paperId)
          .order("question_number"),
      ]);
      if (!p) {
        toast.error("试卷不存在");
        setLoading(false);
        return;
      }
      setPaper(p as PaperRow);
      const list = (qs ?? []) as QuestionRow[];
      setQuestions(list);

      // sign image URLs (stem + options)
      const paths = list
        .flatMap((q) => [q.image_path, q.options_image_path])
        .filter(Boolean) as string[];
      if (paths.length) {
        const { data: signed } = await supabase.storage
          .from("math-question-images")
          .createSignedUrls(paths, 3600);
        const map: Record<string, string> = {};
        signed?.forEach((s) => {
          if (s.path && s.signedUrl) map[s.path] = s.signedUrl;
        });
        setImageUrls(map);
      }
      setLoading(false);
    })();
  }, [paperId]);

  if (loading) {
    return <div className="rounded-xl border bg-card p-8 text-center text-sm text-muted-foreground">加载中...</div>;
  }
  if (!paper) return null;

  return (
    <div>
      <div className="mb-6 flex items-center gap-3">
        <Link to="/admin/question-bank">
          <Button variant="ghost" size="sm" className="gap-1.5">
            <ArrowLeft className="h-4 w-4" />
            返回题库
          </Button>
        </Link>
        <div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <BookOpen className="h-4 w-4" />
            {paper.year} 试卷详情
          </div>
          <h1 className="mt-1 text-2xl font-bold text-foreground">{paper.name}</h1>
        </div>
      </div>
      <div className="space-y-3">
        {questions.map((q) => {
          const stemImg = q.image_path ? imageUrls[q.image_path] : null;
          const optionsImg = q.options_image_path ? imageUrls[q.options_image_path] : null;
          const stemAsImage = q.stem_render_mode === "image" && stemImg;
          const optionsAsImage = q.options_render_mode === "image" && optionsImg;
          return (
            <div key={q.id} className="rounded-lg border bg-card p-4 text-sm">
              <div className="font-medium">
                第 {q.question_number} 题
                {q.correct_answer && (
                  <span className="ml-2 rounded bg-green-100 px-1.5 py-0.5 text-xs text-green-700">
                    答案 {q.correct_answer}
                  </span>
                )}
                {stemAsImage && (
                  <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] text-amber-700">
                    题干图片模式
                  </span>
                )}
                {optionsAsImage && (
                  <span className="ml-1 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] text-amber-700">
                    选项图片模式
                  </span>
                )}
              </div>

              {stemAsImage ? (
                <div className="mt-2">
                  <img
                    src={stemImg}
                    alt={`第 ${q.question_number} 题题干`}
                    className="max-h-80 rounded border"
                  />
                  {q.stem && (
                    <div className="mt-1 text-[10px] text-muted-foreground">
                      文本备份：{q.stem}
                    </div>
                  )}
                </div>
              ) : (
                <>
                  <div className="mt-1 whitespace-pre-wrap text-muted-foreground">{q.stem}</div>
                  {stemImg && (
                    <div className="mt-2">
                      <div className="mb-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                        题干截图（备份）
                      </div>
                      <img
                        src={stemImg}
                        alt={`第 ${q.question_number} 题题干`}
                        className="max-h-64 rounded border"
                      />
                    </div>
                  )}
                </>
              )}

              {optionsAsImage ? (
                <div className="mt-3">
                  <img
                    src={optionsImg}
                    alt={`第 ${q.question_number} 题选项`}
                    className="max-h-64 rounded border"
                  />
                </div>
              ) : (
                <>
                  <div className="mt-2 grid grid-cols-1 gap-1 text-xs text-muted-foreground sm:grid-cols-2">
                    {(["a", "b", "c", "d", "e"] as const).map((k) => {
                      const v = q[`option_${k}` as const] as string | null;
                      if (!v) return null;
                      return (
                        <div key={k}>
                          <span className="font-semibold">{k.toUpperCase()}.</span> {v}
                        </div>
                      );
                    })}
                  </div>
                  {optionsImg && (
                    <div className="mt-2">
                      <div className="mb-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                        选项截图（备份）
                      </div>
                      <img
                        src={optionsImg}
                        alt={`第 ${q.question_number} 题选项`}
                        className="max-h-56 rounded border"
                      />
                    </div>
                  )}
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
