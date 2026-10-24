import { createFileRoute } from "@tanstack/react-router";
import { HomeworkBuilder } from "@/components/homework-builder";

export const Route = createFileRoute("/admin/homework")({
  component: HomeworkBuilder,
  head: () => ({
    meta: [
      { title: "布置作业 · 教师端" },
      { name: "description", content: "按题库和知识点筛选题目，组成作业并导出 PDF。" },
      { property: "og:title", content: "布置作业 · 教师端" },
      { property: "og:description", content: "按题库和知识点筛选题目，组成作业并导出 PDF。" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});
