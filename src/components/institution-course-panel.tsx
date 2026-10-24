import {useEffect,useState} from "react";
import {supabase} from "@/integrations/supabase/client";
import {Button} from "@/components/ui/button";
import {LessonRatingDialog} from "@/components/lesson-rating-dialog";
import {toast} from "sonner";
type Lesson = {id:string;class_name:string;lesson_date:string;start_time:string;end_time:string};
export function InstitutionCoursePanel({studentId,schedule=false}:{studentId:string;schedule?:boolean}) {
 const [lessons,setLessons]=useState<Lesson[]>([]);
 const [loading,setLoading]=useState(true);
 const [date,setDate]=useState<string|null>(null);
 useEffect(()=>{let active=true;void supabase.from("imported_lessons").select("id,class_name,lesson_date,start_time,end_time").eq("archive_student_id",studentId).order("lesson_date").order("start_time").then(({data,error})=>{if(!active)return;if(error)toast.error("机构课表读取失败");setLessons(data||[]);setLoading(false);});return()=>{active=false;};},[studentId]);
 const hours=lessons.reduce((sum,l)=>{const [h,m]=l.start_time.split(":").map(Number);const [eh,em]=l.end_time.split(":").map(Number);return sum+Math.max(0,eh*60+em-h*60-m)/60;},0);
 if(loading)return <p className="text-muted-foreground">加载中…</p>;
 return <section className="space-y-4">
  {!schedule&&<dl className="grid gap-4 sm:grid-cols-3"><div><dt className="text-sm text-muted-foreground">机构班级</dt><dd className="font-medium break-words">{lessons[0]?.class_name||"暂无导入课次"}</dd></div><div><dt className="text-sm text-muted-foreground">导入课次</dt><dd>{lessons.length} 节 · {Number(hours.toFixed(2))} 小时</dd></div><div><dt className="text-sm text-muted-foreground">课程日期</dt><dd>{lessons[0]?.lesson_date||"—"} 至 {lessons.at(-1)?.lesson_date||"—"}</dd></div></dl>}
  {!lessons.length?<p className="text-muted-foreground">暂无机构课次</p>:<div className="divide-y divide-border">{lessons.map(l=><div key={l.id} className="flex flex-wrap items-center justify-between gap-3 py-3"><div><span className="font-medium">{l.lesson_date}</span><span className="ml-3 text-muted-foreground">{l.start_time.slice(0,5)}–{l.end_time.slice(0,5)}</span></div>{schedule&&<Button variant="outline" size="sm" onClick={()=>setDate(l.lesson_date)}>课堂评分</Button>}</div>)}</div>}
  {date&&<LessonRatingDialog open studentId={studentId} lessonDate={date} editable onOpenChange={open=>{if(!open)setDate(null);}} />}
 </section>;
}