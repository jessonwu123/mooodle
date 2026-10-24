import { useEffect, useState } from "react";
import { Download, FileText, Loader2, Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { HomeworkBuilder } from "@/components/homework-builder";
import { listPracticeDownloads } from "@/lib/practice-download.functions";
import { getStudentPaperUrl } from "@/lib/folder-permissions.functions";
import { deliverFile } from "@/lib/download-file";

type Paper = { id: string; name: string; year: number | null; pdf_path: string | null };

function OriginalPaperDownloads({ studentId }: { studentId: string }) {
  const [papers, setPapers] = useState<Paper[]>([]);
  const [loading, setLoading] = useState(true);
  const [keyword, setKeyword] = useState("");
  const [busyId, setBusyId] = useState("");
  const [ready, setReady] = useState<Record<string, { blob: Blob; filename: string }>>({});
  useEffect(() => {
    let alive = true;
    setLoading(true);
    setReady({});
    void listPracticeDownloads({ data: { studentId } }).then((result) => {
      if (alive) setPapers(result.papers.filter((p) => Boolean(p.pdf_path)));
    }).catch((error) => toast.error(error instanceof Error ? error.message : "试卷加载失败"))
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [studentId]);

  const prepare = async (paper: Paper) => {
    setBusyId(paper.id);
    try {
      const result = await getStudentPaperUrl({ data: { studentId, paperId: paper.id, wantDownload: true } });
      const response = await fetch(result.url);
      if (!response.ok) throw new Error("原文件读取失败，请重试");
      const bytes = await response.arrayBuffer();
      if (bytes.byteLength === 0 || new TextDecoder().decode(bytes.slice(0, 5)) !== "%PDF-") throw new Error("文件不是有效的 PDF");
      setReady((prev) => ({ ...prev, [paper.id]: { blob: new Blob([bytes], { type: "application/pdf" }), filename: `${paper.name}.pdf` } }));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "下载失败");
    } finally {
      setBusyId("");
    }
  };

  const filtered = papers.filter((p) => `${p.name} ${p.year ?? ""}`.toLowerCase().includes(keyword.trim().toLowerCase()));
  return <div className="space-y-4">
    <div className="relative max-w-md">
      <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
      <Input aria-label="搜索历年真题" placeholder="搜索试卷名称或年份" value={keyword} onChange={(event) => setKeyword(event.target.value)} className="pl-9" />
    </div>
    {loading ? <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin" /></div> : !filtered.length ?
      <p className="py-8 text-center text-sm text-muted-foreground">暂无可下载的真题原文件</p> :
      <div className="grid gap-3 sm:grid-cols-2">
        {filtered.map((paper) => <article key={paper.id} className="flex min-w-0 items-center gap-3 rounded-lg border border-border bg-card p-4">
          <FileText className="h-5 w-5 shrink-0 text-primary" />
          <div className="min-w-0 flex-1"><h3 className="break-words text-sm font-semibold">{paper.name}</h3><p className="mt-1 text-xs text-muted-foreground">{paper.year ?? "历年真题"} · PDF 原文件</p></div>
          <Button size="sm" variant="outline" className="shrink-0 gap-1.5" disabled={Boolean(busyId)} onClick={() => {
            const file = ready[paper.id];
            if (file) void deliverFile(file.blob, file.filename);
            else void prepare(paper);
          }}>
            {busyId === paper.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            {ready[paper.id] ? "下载原卷" : busyId === paper.id ? "准备中" : "准备原卷"}
          </Button>
        </article>)}
      </div>}
  </div>;
}

export function PracticeDownloadTab({ studentId }: { studentId: string }) {
  return <Tabs defaultValue="original" className="space-y-4">
    <TabsList className="h-auto max-w-full flex-wrap">
      <TabsTrigger value="original" className="whitespace-nowrap">历年真题原文件</TabsTrigger>
      <TabsTrigger value="questions" className="whitespace-nowrap">练习题下载</TabsTrigger>
    </TabsList>
    <TabsContent value="original"><OriginalPaperDownloads studentId={studentId} /></TabsContent>
    <TabsContent value="questions"><HomeworkBuilder studentId={studentId} /></TabsContent>
  </Tabs>;
}