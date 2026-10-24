import { useEffect, useRef, useState } from "react";
import { Download, ClipboardPaste } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { mergeMeetingNotes } from "@/lib/meeting-notes";
import { toast } from "sonner";

export function MeetingNotesImport({ summary, onImport, disabled = false }: { summary: string; onImport: (text: string) => void; disabled?: boolean }) {
  const [draft, setDraft] = useState<string | null>(null);
  const [waiting, setWaiting] = useState(false);
  const request = useRef<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (event.source !== window || event.origin !== window.location.origin || !request.current) return;
      const message = event.data;
      if (message?.type !== "CLASSROOM_MEETING_DRAFT" || message.nonce !== request.current) return;
      request.current = null;
      if (timer.current) clearTimeout(timer.current);
      setWaiting(false);
      if (typeof message.text !== "string" || !message.text.trim() || message.text.length > 100000) { toast.error(message.error || "请先在插件中读取纪要并点击准备存档"); return; }
      setDraft(message.text);
    };
    window.addEventListener("message", receive);
    return () => { window.removeEventListener("message", receive); if (timer.current) clearTimeout(timer.current); request.current = null; };
  }, []);
  const fetchDraft = () => {
    request.current = crypto.randomUUID(); setWaiting(true);
    window.postMessage({ type: "CLASSROOM_REQUEST_MEETING_DRAFT", nonce: request.current }, window.location.origin);
    timer.current = setTimeout(() => { request.current = null; setWaiting(false); toast.error("未检测到插件，请安装后刷新页面；预览未连接时请使用已发布网站"); }, 3000);
  };
  const apply = (mode: "append" | "replace") => {
    if (draft === null || disabled) return;
    if (mode === "replace" && summary.trim() && !window.confirm("确认替换当前课节的课堂总结？原内容将被替换，保存前仍可修改。")) return;
    try { onImport(mergeMeetingNotes(summary, draft, mode)); setDraft(null); toast.success("已填入课堂总结，请确认课节后保存"); } catch { toast.error("请检查纪要内容"); }
  };
  const download = async () => {
    try {
      const response = await fetch("/meeting-notes-extension.zip");
      if (!response.ok) throw new Error();
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a"); link.href = url; link.download = "课堂纪要存档插件.zip"; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch { toast.error("插件下载失败，请重试"); }
  };
  return <div className="space-y-2">
    <div className="flex flex-wrap gap-2">
      <Button type="button" size="sm" variant="outline" disabled={disabled || waiting} onClick={fetchDraft}><ClipboardPaste className="h-4 w-4" />{waiting ? "读取中…" : "导入会议纪要"}</Button>
      <Button type="button" size="sm" variant="ghost" onClick={download}><Download className="h-4 w-4" />下载插件</Button>
    </div>
    {draft !== null && <div className="space-y-2 border-l-2 border-primary pl-3">
      <Textarea aria-label="待导入会议纪要" value={draft} rows={8} onChange={(event) => setDraft(event.target.value)} />
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" disabled={disabled || !draft.trim()} onClick={() => apply("append")}>{summary.trim() ? "追加到总结" : "填入总结"}</Button>
        {summary.trim() && <Button type="button" size="sm" variant="outline" disabled={disabled || !draft.trim()} onClick={() => apply("replace")}>替换原总结</Button>}
        <Button type="button" size="sm" variant="ghost" onClick={() => setDraft(null)}>取消</Button>
      </div>
    </div>}
  </div>;
}