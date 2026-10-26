import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, RefreshCw, Trash2, Upload, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { fetchMeetingSessions, todayShanghai, type MeetingSession } from "@/lib/meeting-sessions";
import { mergeMeetingNotes } from "@/lib/meeting-notes";
import type { MeetingRecordItem } from "@/lib/meeting-mcp";
import {
  deleteMeetingMcpToken,
  fetchMeetingMaterials,
  getMeetingMcpTokenStatus,
  listMeetingRecordings,
  saveMeetingMcpToken,
} from "@/lib/meeting-mcp.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { LessonRatingDialog } from "@/components/lesson-rating-dialog";

const MAX_IMAGES = 12;
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

async function readImages(files: FileList): Promise<string[]> {
  const images: string[] = [];
  for (const file of Array.from(files)) {
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) throw new Error("仅支持 JPG/PNG/WebP 图片");
    if (file.size > MAX_IMAGE_BYTES) throw new Error(`图片 ${file.name} 超过 4MB，请压缩后再上传`);
    images.push(await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error("图片读取失败"));
      reader.readAsDataURL(file);
    }));
  }
  return images;
}

export function MeetingMcpPanel() {
  const [tokenStatus, setTokenStatus] = useState<{ configured: boolean; updatedAt: string | null } | null>(null);
  const [tokenInput, setTokenInput] = useState("");
  const [savingToken, setSavingToken] = useState(false);
  const [date, setDate] = useState(todayShanghai());
  const [records, setRecords] = useState<MeetingRecordItem[] | null>(null);
  const [loadingRecords, setLoadingRecords] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [minutes, setMinutes] = useState("");
  const [transcript, setTranscript] = useState("");
  const [loadingMaterials, setLoadingMaterials] = useState(false);
  const [images, setImages] = useState<string[]>([]);
  const [language, setLanguage] = useState<"zh" | "en">("zh");
  const [feedback, setFeedback] = useState("");
  const [generating, setGenerating] = useState(false);
  const [sessions, setSessions] = useState<MeetingSession[]>([]);
  const [sessionId, setSessionId] = useState("");
  const [saving, setSaving] = useState(false);
  const [pendingRating, setPendingRating] = useState<{ lesson: MeetingSession; text: string } | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const getStatus = useServerFn(getMeetingMcpTokenStatus);
  const saveToken = useServerFn(saveMeetingMcpToken);
  const removeToken = useServerFn(deleteMeetingMcpToken);
  const listRecords = useServerFn(listMeetingRecordings);
  const fetchMaterials = useServerFn(fetchMeetingMaterials);

  useEffect(() => {
    getStatus().then(setTokenStatus).catch(() => setTokenStatus(null));
  }, []);

  useEffect(() => {
    fetchMeetingSessions(date).then(setSessions).catch(() => setSessions([]));
  }, [date]);

  const onSaveToken = async () => {
    setSavingToken(true);
    try {
      await saveToken({ data: { token: tokenInput } });
      setTokenInput("");
      setTokenStatus(await getStatus());
      toast.success("Token 已验证并保存");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Token 保存失败");
    } finally { setSavingToken(false); }
  };

  const onDeleteToken = async () => {
    if (!window.confirm("确认删除已保存的腾讯会议 Token？")) return;
    try {
      await removeToken();
      setTokenStatus({ configured: false, updatedAt: null });
      toast.success("Token 已删除");
    } catch { toast.error("删除失败，请重试"); }
  };

  const onListRecords = async () => {
    setLoadingRecords(true);
    setRecords(null);
    setSelected(null);
    try {
      const { records: list } = await listRecords({ data: { date } });
      setRecords(list);
      if (list.length === 0) toast.error("当天没有找到录制，请确认会中开启了文字转写或云录制");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "录制列表读取失败");
    } finally { setLoadingRecords(false); }
  };

  const onFetchMaterials = async () => {
    if (!selected) return;
    setLoadingMaterials(true);
    try {
      const { minutes: m, transcript: t } = await fetchMaterials({ data: { recordFileId: selected } });
      setMinutes(m);
      setTranscript(t);
      toast.success(`已读取：纪要 ${m.length} 字，逐字稿 ${t.length} 字`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "纪要读取失败");
    } finally { setLoadingMaterials(false); }
  };

  const onUploadImages = async (files: FileList | null) => {
    if (!files?.length) return;
    try {
      const added = await readImages(files);
      setImages((prev) => {
        if (prev.length + added.length > MAX_IMAGES) { toast.error(`最多上传 ${MAX_IMAGES} 张图片`); return prev; }
        return [...prev, ...added];
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "图片读取失败");
    }
  };

  const onGenerate = async () => {
    if (!minutes.trim()) { toast.error("请先读取会议纪要"); return; }
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { toast.error("登录已失效，请重新登录"); return; }
    setGenerating(true);
    setFeedback("");
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const res = await fetch("/api/public/meeting-polish", {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ text: minutes, language, transcript: transcript || undefined, images: images.length ? images : undefined }),
        signal: controller.signal,
      });
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `生成失败（${res.status}）`);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const event = JSON.parse(line) as { type: string; text?: string; message?: string };
          if (event.type === "text" && event.text) setFeedback((prev) => prev + event.text);
          if (event.type === "error") throw new Error(event.message || "生成失败");
        }
      }
    } catch (error) {
      if ((error as Error).name !== "AbortError") toast.error(error instanceof Error ? error.message : "生成失败，请重试");
    } finally { setGenerating(false); abortRef.current = null; }
  };

  const onSave = async () => {
    const lesson = sessions.find((s) => s.id === sessionId);
    if (!lesson) { toast.error("请选择要存档的课次"); return; }
    if (!feedback.trim()) { toast.error("请先生成或填写反馈内容"); return; }
    if (lesson.ambiguousDay) { toast.error("同一学生当天有多节课，请到学生档案手动保存"); return; }
    setSaving(true);
    try {
      const text = mergeMeetingNotes("", feedback, "replace");
      const { data: rating, error } = await supabase.from("ratings").select("id,summary").eq("student_id", lesson.studentId).eq("lesson_date", lesson.date).maybeSingle();
      if (error) throw error;
      if (!rating) {
        setPendingRating({ lesson, text });
        return;
      }
      if (!window.confirm(`将反馈追加到 ${lesson.date} ${lesson.time} · ${lesson.name}（${lesson.studentName}）的课堂总结？不会修改已有评分。`)) return;
      const merged = mergeMeetingNotes(rating.summary || "", text, "append");
      let query = supabase.from("ratings").update({ summary: merged }).eq("id", rating.id);
      query = rating.summary === null ? query.is("summary", null) : query.eq("summary", rating.summary);
      const { data: saved, error: saveError } = await query.select("id").single();
      if (saveError || !saved) throw new Error("保存失败或总结已被其他页面修改，请重新读取后重试");
      const { data: readback, error: readError } = await supabase.from("ratings").select("summary").eq("id", rating.id).single();
      if (readError || readback.summary !== merged) throw new Error("保存回读未确认，请查看学生档案，不要重复提交");
      toast.success("课堂反馈已保存并回读确认");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "保存失败，请重试");
    } finally { setSaving(false); }
  };

  return (
    <section className="space-y-4 rounded-lg border p-4">
      <div>
        <h2 className="text-lg font-semibold">网页直连（免插件）</h2>
        <p className="text-sm text-muted-foreground">通过腾讯会议官方接口直接读取录制、纪要和逐字稿，无需打开腾讯会议网页。</p>
      </div>

      <div className="space-y-2">
        {tokenStatus?.configured ? (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-muted-foreground">腾讯会议 Token 已保存{tokenStatus.updatedAt ? `（${new Date(tokenStatus.updatedAt).toLocaleString("zh-CN")}）` : ""}</span>
            <Button type="button" size="sm" variant="ghost" onClick={onDeleteToken}><Trash2 className="h-4 w-4" />删除</Button>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              首次使用：在 <a className="underline" href="https://meeting.tencent.com/ai-skill.html" target="_blank" rel="noreferrer">腾讯会议 Skill 页面</a> 登录个人账号复制 Token，粘贴到下面。Token 仅保存在你的账号下，不会展示给任何人。
            </p>
            <div className="flex gap-2">
              <Input type="password" value={tokenInput} onChange={(e) => setTokenInput(e.target.value)} placeholder="粘贴腾讯会议 Token" aria-label="腾讯会议 Token" />
              <Button type="button" disabled={savingToken || !tokenInput.trim()} onClick={onSaveToken}>
                {savingToken && <Loader2 className="h-4 w-4 animate-spin" />}保存并验证
              </Button>
            </div>
          </div>
        )}
      </div>

      {tokenStatus?.configured && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-end gap-2">
            <label className="text-sm">日期 <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="mt-1" /></label>
            <Button type="button" variant="outline" disabled={loadingRecords} onClick={onListRecords}>
              {loadingRecords ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}查询录制
            </Button>
          </div>

          {records && records.length > 0 && (
            <div className="space-y-2">
              {records.map((r) => (
                <label key={r.recordFileId} className="flex items-center gap-2 rounded border p-2 text-sm">
                  <input type="radio" name="meeting-record" checked={selected === r.recordFileId} onChange={() => setSelected(r.recordFileId)} />
                  <span className="font-medium">{r.subject}</span>
                  <span className="text-muted-foreground">{r.startTime.slice(11, 16)} · {r.recordType}</span>
                </label>
              ))}
              <Button type="button" size="sm" disabled={!selected || loadingMaterials} onClick={onFetchMaterials}>
                {loadingMaterials && <Loader2 className="h-4 w-4 animate-spin" />}读取纪要和逐字稿
              </Button>
            </div>
          )}

          {(minutes || transcript) && (
            <div className="space-y-2">
              <Textarea aria-label="会议纪要" value={minutes} onChange={(e) => setMinutes(e.target.value)} rows={8} />
              {transcript && <Textarea aria-label="发言逐字稿" value={transcript} onChange={(e) => setTranscript(e.target.value)} rows={6} />}
            </div>
          )}

          {minutes && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <Button type="button" size="sm" variant="outline" asChild>
                  <label>
                    <Upload className="h-4 w-4" />笔记图片（{images.length}/{MAX_IMAGES}）
                    <input type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={(e) => { void onUploadImages(e.target.files); e.target.value = ""; }} />
                  </label>
                </Button>
                <select aria-label="反馈语言" className="h-9 rounded-md border bg-background px-2 text-sm" value={language} onChange={(e) => setLanguage(e.target.value as "zh" | "en")}>
                  <option value="zh">中文反馈</option>
                  <option value="en">English feedback</option>
                </select>
                {generating ? (
                  <Button type="button" size="sm" variant="destructive" onClick={() => abortRef.current?.abort()}>停止生成</Button>
                ) : (
                  <Button type="button" size="sm" onClick={onGenerate}><Wand2 className="h-4 w-4" />生成课堂反馈</Button>
                )}
              </div>
              {(feedback || generating) && (
                <Textarea aria-label="课堂反馈" value={feedback} onChange={(e) => setFeedback(e.target.value)} rows={10} placeholder="反馈生成中…" />
              )}
              {feedback && !generating && (
                <div className="flex flex-wrap items-end gap-2">
                  <label className="text-sm">存档到课次
                    <select aria-label="存档课次" className="mt-1 block h-9 rounded-md border bg-background px-2 text-sm" value={sessionId} onChange={(e) => setSessionId(e.target.value)}>
                      <option value="">选择课次</option>
                      {sessions.map((s) => <option key={s.id} value={s.id}>{s.time} · {s.name}（{s.studentName}）</option>)}
                    </select>
                  </label>
                  <Button type="button" size="sm" disabled={saving || !sessionId} onClick={onSave}>
                    {saving && <Loader2 className="h-4 w-4 animate-spin" />}存入课堂总结
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {pendingRating && (
        <LessonRatingDialog
          open
          onOpenChange={(open) => { if (!open) setPendingRating(null); }}
          studentId={pendingRating.lesson.studentId}
          lessonDate={pendingRating.lesson.date}
          editable
          initialSummary={pendingRating.text}
          onSaved={() => { toast.success("课堂总结和评分已保存"); setPendingRating(null); }}
        />
      )}
    </section>
  );
}
