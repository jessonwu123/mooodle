import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { fetchMeetingSessions, type MeetingSession } from "@/lib/meeting-sessions";
import { mergeMeetingNotes } from "@/lib/meeting-notes";
import { LessonRatingDialog } from "@/components/lesson-rating-dialog";
import { Button } from "@/components/ui/button";
import { canConnectMeetingPlugin } from "@/lib/meeting-connection";
import { MeetingMcpPanel } from "@/components/meeting-mcp-panel";

export const Route = createFileRoute("/meeting-import")({
  head: () => ({ meta: [{title:"mooodle · 会议纪要存档"},{name:"description",content:"连接课堂纪要插件，核对课次并存入学生课堂总结。"},{property:"og:title",content:"mooodle · 会议纪要存档"},{property:"og:description",content:"核对腾讯会议纪要与学生课次，保存课堂总结。"},{property:"og:type",content:"website"},{name:"twitter:card",content:"summary"}] }),
  component: MeetingImport,
});
function MeetingImport() {
  const {session, loading, isTeacher} = useAuth();
  const [connected,setConnected] = useState(true);
  const [status,setStatus] = useState("已自动连接");
  const [pending,setPending] = useState<{lesson:MeetingSession;text:string;nonce:string} | null>(null);
  useEffect(() => {
    if (!canConnectMeetingPlugin(loading, Boolean(session), isTeacher, connected)) return;
    let busy = false;
    const receive = async (event:MessageEvent) => {
      if (event.source !== window || event.origin !== location.origin) return;
      const msg = event.data;
      if (msg?.type !== "CLASSROOM_EXTENSION_REQUEST" || typeof msg.nonce !== "string" || msg.nonce.length > 100) return;
      const reply = (result:unknown) => window.postMessage({type:"CLASSROOM_EXTENSION_RESPONSE",nonce:msg.nonce,result},location.origin);
      if (msg.action === "ready") { reply({ready:true}); return; }
      if (busy) { reply({error:"有操作正在进行，请稍后"}); return; }
      busy = true;
      try {
        const sessions = await fetchMeetingSessions(msg.date);
        if (msg.action === "list") reply({sessions});
        else if (msg.action === "save") {
          const lesson = sessions.find(s => s.id === msg.sessionId);
          if (!lesson || lesson.ambiguousDay) throw new Error("同一学生当天有多节课，目前不能按课次独立存档，请到学生档案确认后手动保存");
          const text = mergeMeetingNotes("", msg.text, "replace");
          if (!window.confirm(`将纪要追加到 ${lesson.date} ${lesson.time} · ${lesson.name}（${lesson.studentName}）的课堂总结？不会修改已有评分。`)) throw new Error("已取消存档");
          const {data:rating,error} = await supabase.from("ratings").select("id,summary").eq("student_id",lesson.studentId).eq("lesson_date",lesson.date).maybeSingle();
          if (error) throw error;
          if (!rating) {
            setPending({lesson,text,nonce:msg.nonce});
            setStatus("该课节还没有评分，请核对评分后保存，纪要已填入。");
            reply({pending:true,message:"该课节尚无评分，请在 mooodle 连接页面确认并保存评分"});
          } else {
            let query = supabase.from("ratings").update({summary:mergeMeetingNotes(rating.summary || "",text,"append")}).eq("id",rating.id);
            query = rating.summary === null ? query.is("summary",null) : query.eq("summary",rating.summary);
            const {data:saved,error:saveError} = await query.select("id").single();
            if (saveError || !saved) throw new Error("保存失败或总结已被其他页面修改，请重新读取后重试");
            const {data:readback,error:readError} = await supabase.from("ratings").select("summary").eq("id",rating.id).single();
            if (readError || readback.summary !== mergeMeetingNotes(rating.summary || "",text,"append")) throw new Error("保存回读未确认，请查看学生档案，不要重复提交");
            setStatus(`已保存 ${lesson.date} ${lesson.name} 的课堂总结`); reply({saved:true,message:"课堂总结已保存并回读确认"});
          }
        } else throw new Error("不支持的操作");
      } catch(error) { reply({error:error instanceof Error ? error.message : "读取或保存失败，请重试"}); }
      finally { busy = false; }
    };
    window.addEventListener("message",receive);
    return () => window.removeEventListener("message",receive);
  },[connected,session,isTeacher,loading]);
  return <main className="mx-auto max-w-2xl space-y-6 px-6 py-12">
    <h1 className="text-2xl font-semibold">会议纪要存档</h1>
    {loading ? <p>确认登录状态中…</p> : !session || !isTeacher ? <><p>请先登录 mooodle 教师账号，再返回此页面。</p><Button asChild><Link to="/login">登录 mooodle</Link></Button></> : <>
      <MeetingMcpPanel />
      <h2 className="text-lg font-semibold">插件存档</h2>
      <p className="text-muted-foreground">{status}</p>
      <Button onClick={() => {setConnected(v => !v);setStatus(connected ? "连接已关闭" : "已自动连接");}}>{connected ? "断开插件连接" : "重新连接插件"}</Button>
      {pending && <LessonRatingDialog open onOpenChange={open => {if (!open) setPending(null);}} studentId={pending.lesson.studentId} lessonDate={pending.lesson.date} editable initialSummary={pending.text} onSaved={() => {setStatus("课堂总结和评分已保存");setPending(null);}} />}
    </>}
  </main>;
}