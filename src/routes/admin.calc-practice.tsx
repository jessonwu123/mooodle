import { createFileRoute } from "@tanstack/react-router";
import { ClassifiedBankView } from "@/components/classified-bank-view";

export const Route = createFileRoute("/admin/calc-practice")({
  component: CalcPracticePage,
  head: () => ({
    meta: [
      { title: "计算练习 · 后台" },
      { name: "description", content: "按知识点标签管理和筛选计算题。" },
      { property: "og:title", content: "计算练习 · 后台" },
      { property: "og:description", content: "按知识点标签管理和筛选计算题。" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function CalcPracticePage() {
  return <ClassifiedBankView variant="calc" />;
}
