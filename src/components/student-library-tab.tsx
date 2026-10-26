import { useCallback, useEffect, useState } from "react";
import { Folder, FileText, ChevronRight, Download, Eye, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  getStudentLibrary,
  getStudentPaperUrl,
  type FolderPermLevel,
} from "@/lib/folder-permissions.functions";
import { sortLibraryPapersByYear } from "@/lib/library-sort";

interface LibFolder {
  id: string;
  parent_id: string | null;
  name: string;
  level: FolderPermLevel;
  is_ancestor: boolean;
}
interface LibPaper {
  id: string;
  year: number | null;
  name: string;
  kind: "paper" | "answer";
  created_at: string;
  question_count: number;
}

const order: Record<FolderPermLevel, number> = {
  none: 0, read: 1, download: 2, upload: 3, manage: 4,
};

export function StudentLibraryTab({ studentId }: { studentId: string }) {
  const [folderId, setFolderId] = useState<string | null>(null);
  const [breadcrumb, setBreadcrumb] = useState<Array<{ id: string; name: string }>>([]);
  const [subfolders, setSubfolders] = useState<LibFolder[]>([]);
  const [papers, setPapers] = useState<LibPaper[]>([]);
  const [currentLevel, setCurrentLevel] = useState<FolderPermLevel>("read");
  const [loading, setLoading] = useState(true);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewName, setPreviewName] = useState("");
  const [busyId, setBusyId] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getStudentLibrary({ data: { studentId, folderId } });
      setSubfolders(res.subfolders);
      setPapers(sortLibraryPapersByYear(res.papers));
      setCurrentLevel(res.currentLevel);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, [studentId, folderId]);

  useEffect(() => {
    void load();
  }, [load]);

  const goInto = (f: LibFolder) => {
    setBreadcrumb((bc) => [...bc, { id: f.id, name: f.name }]);
    setFolderId(f.id);
  };

  const goTo = (index: number) => {
    if (index < 0) {
      setBreadcrumb([]);
      setFolderId(null);
    } else {
      const nb = breadcrumb.slice(0, index + 1);
      setBreadcrumb(nb);
      setFolderId(nb[nb.length - 1].id);
    }
  };

  const handlePreview = async (p: LibPaper) => {
    setBusyId(p.id);
    try {
      const res = await getStudentPaperUrl({
        data: { studentId, paperId: p.id, wantDownload: false },
      });
      setPreviewUrl(res.url);
      setPreviewName(res.name);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "无法预览");
    } finally {
      setBusyId("");
    }
  };

  const handleDownload = async (p: LibPaper) => {
    setBusyId(p.id);
    try {
      const res = await getStudentPaperUrl({
        data: { studentId, paperId: p.id, wantDownload: true },
      });
      const a = document.createElement("a");
      a.href = res.url;
      a.download = `${res.name}-${res.kind === "paper" ? "试卷" : "答案"}.pdf`;
      a.target = "_blank";
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "下载失败");
    } finally {
      setBusyId("");
    }
  };

  const canDownload = order[currentLevel] >= order.download;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-1 text-sm text-muted-foreground flex-wrap">
        <button onClick={() => goTo(-1)} className="hover:text-foreground hover:underline">
          资料库
        </button>
        {breadcrumb.map((f, i) => (
          <span key={f.id} className="flex items-center gap-1">
            <ChevronRight className="h-3 w-3" />
            <button
              onClick={() => goTo(i)}
              className="hover:text-foreground hover:underline"
            >
              {f.name}
            </button>
          </span>
        ))}
      </div>

      {loading ? (
        <div className="rounded-2xl border bg-card p-10 text-center text-sm text-muted-foreground">
          加载中...
        </div>
      ) : subfolders.length === 0 && papers.length === 0 ? (
        <div className="rounded-2xl border border-dashed bg-card/50 p-10 text-center text-sm text-muted-foreground">
          {folderId === null ? "暂未授权访问任何资料" : "这里没有可访问的内容"}
        </div>
      ) : (
        <div className="space-y-2">
          {subfolders.map((f) => (
            <button
              key={f.id}
              onClick={() => goInto(f)}
              className="flex w-full items-center gap-3 rounded-xl border bg-card p-4 text-left hover:bg-accent/40 transition"
            >
              <Folder className="h-5 w-5 text-amber-500" />
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">{f.name}</div>
                {f.is_ancestor && (
                  <div className="text-[11px] text-muted-foreground">仅作为目录浏览</div>
                )}
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </button>
          ))}
          {papers.map((p) => (
            <div
              key={p.id}
              className="flex flex-col gap-3 rounded-xl border bg-card p-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 font-medium">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  <span className="truncate">{p.name}</span>
                  <span
                    className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] ${
                      p.kind === "paper"
                        ? "bg-blue-100 text-blue-700"
                        : "bg-purple-100 text-purple-700"
                    }`}
                  >
                    {p.kind === "paper" ? "试卷" : "答案"}
                  </span>
                </div>
                <div className="text-xs text-muted-foreground">
                  {p.year ? `${p.year} · ` : ""}
                  上传于 {new Date(p.created_at).toLocaleDateString()}
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => handlePreview(p)}
                  disabled={busyId === p.id}
                >
                  {busyId === p.id ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Eye className="h-3.5 w-3.5" />
                  )}
                  预览
                </Button>
                {canDownload && (
                  <Button
                    variant="secondary"
                    size="sm"
                    className="gap-1.5"
                    onClick={() => handleDownload(p)}
                    disabled={busyId === p.id}
                  >
                    <Download className="h-3.5 w-3.5" />
                    下载
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={!!previewUrl} onOpenChange={(o) => !o && setPreviewUrl(null)}>
        <DialogContent className="max-w-5xl w-[95vw] h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="truncate">{previewName}</DialogTitle>
          </DialogHeader>
          {previewUrl && (
            <iframe
              src={previewUrl}
              className="flex-1 w-full rounded-md border"
              title={previewName}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
