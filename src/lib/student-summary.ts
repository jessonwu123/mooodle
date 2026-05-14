import { supabase } from "@/integrations/supabase/client";

const CATEGORY_LABEL: Record<string, string> = {
  knowledge: "知识点评估",
  thinking: "核心思维能力评估",
  learning_quality: "学习品质",
};

const dimLabels: Record<string, string> = {
  focus: "专注力",
  interaction: "互动性",
  discipline: "课堂纪律",
  accuracy: "做题准确率",
};

function fmtDate(s: string) {
  return new Date(s).toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export async function buildStudentMonthlySummary(
  studentId: string,
  studentName: string,
): Promise<string> {
  const since = new Date();
  since.setDate(since.getDate() - 30);
  const sinceISO = since.toISOString().slice(0, 10);

  const [{ data: ratings }, { data: items }, { data: histories }] = await Promise.all([
    supabase
      .from("ratings")
      .select(
        "id, lesson_date, lesson_name, summary, overall_assessment, focus, interaction, discipline, accuracy, overall_progress, progress_items(item_name, percentage, sort_order)",
      )
      .eq("student_id", studentId)
      .gte("lesson_date", sinceISO)
      .order("lesson_date", { ascending: false }),
    supabase
      .from("assessment_items")
      .select("id, category, item_name, rating, comment, updated_at, sort_order")
      .eq("student_id", studentId)
      .order("category")
      .order("sort_order"),
    supabase
      .from("assessment_item_history")
      .select("item_id, rating, comment, created_at")
      .eq("student_id", studentId)
      .gte("created_at", since.toISOString())
      .order("created_at", { ascending: true }),
  ]);

  const lines: string[] = [];
  lines.push(`【${studentName}】最近一个月学习总结`);
  lines.push(`统计区间：${sinceISO} 至今`);
  lines.push("");

  // 课堂记录
  lines.push(`一、课堂记录（共 ${ratings?.length ?? 0} 节）`);
  if (!ratings || ratings.length === 0) {
    lines.push("  暂无课堂记录。");
  } else {
    ratings.forEach((r, idx) => {
      const date = fmtDate(r.lesson_date);
      lines.push(
        `${idx + 1}. ${date}${r.lesson_name ? `｜${r.lesson_name}` : ""}`,
      );
      const dimStr = (Object.keys(dimLabels) as (keyof typeof dimLabels)[])
        .map((k) => `${dimLabels[k]} ${(r as any)[k]}星`)
        .join("、");
      lines.push(`   学生表现：${dimStr}`);
      if (r.overall_assessment != null) {
        lines.push(`   整体表现评估：${r.overall_assessment} 星`);
      }
      const pis = ((r as any).progress_items ?? [])
        .slice()
        .sort((a: any, b: any) => a.sort_order - b.sort_order);
      if (pis.length > 0 || r.overall_progress != null) {
        const pStr = pis
          .map((p: any) => `${p.item_name} ${p.percentage}%`)
          .join("、");
        if (pStr) lines.push(`   授课进度：${pStr}`);
        if (r.overall_progress != null) {
          lines.push(`   整体吸收程度：${r.overall_progress}%`);
        }
      }
      if (r.summary) {
        lines.push(`   课堂总结：${r.summary}`);
      }
      lines.push("");
    });
  }

  // 综合素质变化（基于最近一个月的保存历史）
  lines.push(`二、综合素质变化（最近一个月）`);
  const histByItem = new Map<string, { rating: number | null; comment: string | null; created_at: string }[]>();
  (histories ?? []).forEach((h) => {
    const list = histByItem.get(h.item_id) ?? [];
    list.push({ rating: h.rating, comment: h.comment, created_at: h.created_at });
    histByItem.set(h.item_id, list);
  });

  const itemsWithHistory = (items ?? []).filter((it) => histByItem.has(it.id));
  if (itemsWithHistory.length === 0) {
    lines.push("  最近一个月综合素质无更新。");
  } else {
    const grouped: Record<string, typeof itemsWithHistory> = {};
    itemsWithHistory.forEach((it) => {
      const k = it.category as string;
      (grouped[k] ||= [] as any).push(it);
    });
    Object.keys(grouped).forEach((cat) => {
      lines.push(`  · ${CATEGORY_LABEL[cat] ?? cat}`);
      grouped[cat].forEach((it) => {
        const hist = histByItem.get(it.id) ?? [];
        const first = hist[0];
        const last = hist[hist.length - 1];
        const fromR = first.rating != null ? `${first.rating}星` : "未评分";
        const toR = last.rating != null ? `${last.rating}星` : "未评分";
        const arrow = fromR === toR ? `保持 ${toR}` : `${fromR} → ${toR}`;
        lines.push(
          `    - ${it.item_name}：${arrow}（共 ${hist.length} 次更新）`,
        );
        hist.forEach((h) => {
          const date = new Date(h.created_at).toLocaleDateString("zh-CN", {
            month: "numeric",
            day: "numeric",
          });
          const r = h.rating != null ? `${h.rating}星` : "未评分";
          lines.push(
            `        · ${date} ${r}${h.comment ? `（${h.comment}）` : ""}`,
          );
        });
      });
    });
  }

  return lines.join("\n");
}
