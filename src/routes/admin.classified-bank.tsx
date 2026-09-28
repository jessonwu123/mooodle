import { createFileRoute } from "@tanstack/react-router";
import { ClassifiedBankView } from "@/components/classified-bank-view";

export const Route = createFileRoute("/admin/classified-bank")({
  component: ClassifiedBankPage,
  head: () => ({ meta: [{ title: "分类题库 · 后台" }] }),
});

function ClassifiedBankPage() {
  return <ClassifiedBankView variant="exam" />;
}
