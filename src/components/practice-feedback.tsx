import { useEffect, useRef, useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { MathText } from "@/components/math-text";

export function PracticeFeedback({ sessionId }: { sessionId: string }) {
  const [content, setContent] = useState("");
  const [message, setMessage] = useState("");
  const [remaining, setRemaining] = useState<number | null>(null);
  const [busy, setBusy] = useState(true);
  const abortRef = useRef<AbortController | null>(null);
  useEffect(() => {
    const abort = new AbortController();
    abortRef.current = abort;
    const run = async () => {
      try {
        const { data } = await supabase.auth.getSession();
        if (!data.session) throw new Error("请先登录");
        const response = await fetch("/api/practice-feedback", { method: "POST", signal: abort.signal, headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session.access_token}` }, body: JSON.stringify({ sessionId }) });
        if (!response.headers.get("Content-Type")?.includes("ndjson")) {
          const result = await response.json();
          setContent(result.content ?? ""); setMessage(result.error ?? result.message ?? ""); setRemaining(result.remaining ?? null);
          return;
        }
        const reader = response.body?.getReader();
        if (!reader) throw new Error("分析内容暂不可用");
        const decoder = new TextDecoder(); let pending = "";
        for (;;) {
          const { value, done } = await reader.read();
          pending += decoder.decode(value, { stream: !done });
          const lines = pending.split("\n"); pending = lines.pop() ?? "";
          for (const line of lines) {
            if (!line.trim()) continue;
            const event = JSON.parse(line);
            if (event.type === "start") setRemaining(event.remaining);
            if (event.type === "text") setContent((previous) => previous + event.text);
            if (event.type === "error") setMessage(event.message);
          }
          if (done) break;
        }
      } catch (error) {
        if (!abort.signal.aborted) setMessage(error instanceof Error ? error.message : "AI 分析暂不可用，逐题批改结果不受影响。");
      } finally { if (!abort.signal.aborted) setBusy(false); }
    };
    run();
    return () => abort.abort();
  }, [sessionId]);
  return <section className="space-y-3 border-y border-border py-5" aria-label="AI 错因分析">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h3 className="flex items-center gap-2 font-semibold"><Sparkles className="h-4 w-4 text-primary" />AI 错因分析</h3>
      {remaining !== null && <span className="text-sm text-muted-foreground">今日剩余 {remaining}/10 次</span>}
    </div>
    {busy && <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />正在分析本次错题…<Button size="sm" variant="ghost" onClick={() => { abortRef.current?.abort(); setBusy(false); setMessage("分析已停止，逐题批改结果已保留。"); }}>停止</Button></div>}
    {content && <MathText block text={content} className="block whitespace-pre-wrap break-words text-sm leading-7" />}
    {message && <p role="status" className="text-sm text-muted-foreground">{message}</p>}
  </section>;
}