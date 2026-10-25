import { createFileRoute } from "@tanstack/react-router";
import { ClassifiedBankView } from "@/components/classified-bank-view";

export const Route = createFileRoute("/admin/classified-bank")({
  component: ClassifiedBankPage,
  head: () => ({ meta: [{ title: "mooodle · 分类题库" }, { name: "description", content: "按知识点浏览和筛选数学题目。" }, { property: "og:title", content: "mooodle · 分类题库" }, { property: "og:description", content: "按知识点浏览和筛选数学题目。" }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
});

function ClassifiedBankPage() {
  return <ClassifiedBankView variant="exam" />;
}
