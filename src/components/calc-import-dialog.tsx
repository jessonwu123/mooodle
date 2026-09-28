import { useRef, useState } from "react";
import { FileSpreadsheet, Upload, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { MathText } from "@/components/math-text";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { importCalcQuestions } from "@/lib/math-papers.functions";

export function CalcImportDialog({ onImported }: { onImported?: () => void }) {
  type CalcRow = { stem: string; answer: string; tags: string[] };
  const [calcOpen, setCalcOpen] = useState(false);
  const [calcText, setCalcText] = useState("");
  const [calcRows, setCalcRows] = useState<CalcRow[]>([]);
  const [calcImporting, setCalcImporting] = useState(false);
  const calcFileRef = useRef<HTMLInputElement | null>(null);

  const parseCalcLines = (text: string): CalcRow[] => {
    const rows: CalcRow[] = [];
    for (const raw of text.split(/\r?\n/)) {
      const line = raw.trim();
      if (!line) continue;
      const parts = line.split(/\||｜|\t/).map((s) => s.trim());
      const stem = parts[0] ?? "";
      if (!stem || stem === "题干" || stem === "题目") continue;
      rows.push({
        stem,
        answer: parts[1] ?? "",
        tags: (parts[2] ?? "")
          .split(/[,，、;；]/)
          .map((s) => s.trim())
          .filter(Boolean),
      });
    }
    return rows;
  };

  const handleCalcTextChange = (text: string) => {
    setCalcText(text);
    setCalcRows(parseCalcLines(text));
  };

  const handleCalcFile = async (file: File) => {
    try {
      const XLSX = await import("xlsx");
      const wb = XLSX.read(await file.arrayBuffer());
      const sheet = wb.Sheets[wb.SheetNames[0]!];
      const grid = XLSX.utils.sheet_to_json<(string | number | null)[]>(sheet, {
        header: 1,
        defval: "",
      });
      const lines = grid
        .map((r) => r.map((c) => String(c ?? "").trim()).join("|"))
        .join("\n");
      setCalcText(lines);
      setCalcRows(parseCalcLines(lines));
      toast.success(`已读取 ${file.name}`);
    } catch (err) {
      toast.error("文件读取失败：" + (err instanceof Error ? err.message : ""));
    }
  };

  const handleCalcImport = async () => {
    if (calcRows.length === 0) return toast.error("没有可导入的题目");
    setCalcImporting(true);
    try {
      const { count } = await importCalcQuestions({
        data: {
          folderId: null,
          questions: calcRows.map((r) => ({
            stem: r.stem,
            answer: r.answer || null,
            tags: r.tags,
          })),
        },
      });
      toast.success(`已导入 ${count} 道计算题`);
      setCalcOpen(false);
      setCalcText("");
      setCalcRows([]);
      onImported?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "导入失败");
    } finally {
      setCalcImporting(false);
    }
  };
  return (
          <Dialog open={calcOpen} onOpenChange={setCalcOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" className="gap-1.5">
                <FileSpreadsheet className="h-4 w-4" /> 导入计算题
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>批量导入计算题</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                    onClick={() => calcFileRef.current?.click()}
                  >
                    <Upload className="h-3.5 w-3.5" /> 从 Excel / CSV 读取
                  </Button>
                  <input
                    ref={calcFileRef}
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void handleCalcFile(f);
                      e.target.value = "";
                    }}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  每行一道题，格式：<span className="font-mono">题干 | 答案 | 知识点1,知识点2</span>
                  （答案和知识点可省略）。公式用 LaTeX，如 <span className="font-mono">$\frac{"{1}"}{"{2}"}+\frac{"{1}"}{"{3}"}$</span>。
                  Excel 三列依次为：题干、答案、知识点。
                </p>
                <Textarea
                  value={calcText}
                  onChange={(e) => handleCalcTextChange(e.target.value)}
                  placeholder={"计算：$0.25 \\times 4 + 1.5$ | 2.5 | 小数计算\n解方程：$2x + 3 = 7$ | $x = 2$ | 一元一次方程"}
                  className="min-h-32 font-mono text-xs"
                />
                {calcRows.length > 0 && (
                  <div className="rounded-lg border">
                    <div className="border-b px-3 py-2 text-xs text-muted-foreground">
                      共解析出 {calcRows.length} 道题（预览前 20 道）
                    </div>
                    <div className="max-h-64 overflow-y-auto divide-y">
                      {calcRows.slice(0, 20).map((r, i) => (
                        <div key={i} className="flex items-start gap-3 px-3 py-2 text-sm">
                          <div className="min-w-0 flex-1">
                            <MathText text={r.stem} />
                          </div>
                          {r.answer && (
                            <span className="shrink-0 text-xs text-muted-foreground">
                              答案：<MathText text={r.answer} />
                            </span>
                          )}
                          {r.tags.length > 0 && (
                            <span className="shrink-0 text-xs text-muted-foreground">
                              {r.tags.join("、")}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              <DialogFooter>
                <Button
                  onClick={handleCalcImport}
                  disabled={calcImporting || calcRows.length === 0}
                >
                  {calcImporting ? (
                    <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                  ) : null}
                  {calcImporting ? "导入中..." : `导入 ${calcRows.length} 道题`}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
  );
}
