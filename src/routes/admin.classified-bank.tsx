import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, BookOpen, FolderTree, Tags } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export const Route = createFileRoute("/admin/classified-bank")({
  component: ClassifiedBankPage,
  head: () => ({
    meta: [{ title: "分类题库 · 后台" }],
  }),
});

function ClassifiedBankPage() {
  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-6 flex items-center gap-3">
        <Link to="/admin">
          <Button variant="ghost" size="sm" className="gap-1.5">
            <ArrowLeft className="h-4 w-4" />
            返回
          </Button>
        </Link>
        <div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <BookOpen className="h-4 w-4" />
            分类题库
          </div>
          <h1 className="mt-1 text-2xl font-bold text-foreground">分类题库</h1>
        </div>
      </div>

      <Card className="p-8 space-y-6">
        <div className="space-y-2">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <FolderTree className="h-5 w-5 text-primary" />
            按年份归档
          </h2>
          <p className="text-sm text-muted-foreground">
            从「原始题库」AI 抽取出的题目，会自动按年份分类放入这里。
          </p>
        </div>

        <div className="space-y-2">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Tags className="h-5 w-5 text-primary" />
            知识点 Tag（规划中）
          </h2>
          <p className="text-sm text-muted-foreground">
            后续将支持 AI 自动给每道题打知识点标签，并按知识点二次分类。
          </p>
        </div>

        <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
          模块开发中，请先在「原始题库」抽取题目后回到此处查看。
        </div>
      </Card>
    </div>
  );
}
