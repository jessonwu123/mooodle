import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  Coins,
  Upload,
  CalendarPlus,
  Filter,
} from "lucide-react";
import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  type CourseInfo,
  type ScheduleSlot,
  generateLessonOccurrences,
  WEEKDAY_LABELS,
  lessonKey,
  lessonFee,
} from "@/lib/course-schedule";
import { toast } from "sonner";
import {
  LessonEditorDialog,
  type SingleLessonRow,
} from "@/components/lesson-editor-dialog";
import { XngjSyncButton } from "@/components/xngj-sync-dialog";
import {
  OrgRateButton,
  DEFAULT_ORG_RATES,
  importedLessonFee,
  type OrgRates,
} from "@/components/org-rate-dialog";
import {
  ScheduleExportDialog,
  type ExportEntry,
} from "@/components/schedule-export-dialog";

export const Route = createFileRoute("/admin/schedule")({
  component: SchedulePage,
});

interface StudentRow extends CourseInfo {
  id: string;
  name: string;
}

interface ImportedLesson {
  id: string;
  lesson_date: string;
  start_time: string;
  end_time: string;
  class_name: string;
}

type OccurrenceKind = "recurring" | "single" | "imported";

interface Occurrence {
  kind: "recurring";
  date: Date;
  slot: ScheduleSlot;
  student: StudentRow;
}

interface SingleOccurrence {
  kind: "single";
  date: Date;
  end: Date;
  row: SingleLessonRow;
  studentName: string | null;
}

interface ImportedOccurrence {
  kind: "imported";
  date: Date;
  start: string;
  end: string;
  className: string;
  id: string;
}

type AnyOccurrence = Occurrence | SingleOccurrence | ImportedOccurrence;

interface ParsedRow {
  lesson_date: string;
  start_time: string;
  end_time: string;
  class_name: string;
}


const IMPORTED_KEY = "__imported__";
const OTHER_KEY = "__other__";

function startOfWeek(d: Date) {

  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() - x.getDay());
  return x;
}
function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function sameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function toDateString(v: unknown): string | null {
  if (v == null || v === "") return null;
  if (v instanceof Date) {
    const y = v.getFullYear();
    const m = String(v.getMonth() + 1).padStart(2, "0");
    const d = String(v.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  if (typeof v === "number") {
    // Excel serial date
    const d = XLSX.SSF.parse_date_code(v);
    if (!d) return null;
    return `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}`;
  }
  const s = String(v).trim();
  // Support 2026-12-27, 2026/12/27, 2026.12.27
  const m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  return null;
}

function parseTimeRange(v: unknown): { start: string; end: string } | null {
  if (v == null) return null;
  const s = String(v).trim();
  const m = s.match(/(\d{1,2}):(\d{2})\s*[-—~至]\s*(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const pad = (a: string) => a.padStart(2, "0");
  return {
    start: `${pad(m[1])}:${m[2]}:00`,
    end: `${pad(m[3])}:${m[4]}:00`,
  };
}

function parseWorkbook(file: File): Promise<ParsedRow[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("读取文件失败"));
    reader.onload = () => {
      try {
        const wb = XLSX.read(reader.result, { type: "array", cellDates: true });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const rows: Record<string, unknown>[] = XLSX.utils.sheet_to_json(sheet, {
          defval: "",
        });
        const parsed: ParsedRow[] = [];
        for (const row of rows) {
          const date = toDateString(row["上课日期"]);
          const time = parseTimeRange(row["上课时段"]);
          const cls = String(row["班级名称"] ?? "").trim();
          if (!date || !time || !cls) continue;
          parsed.push({
            lesson_date: date,
            start_time: time.start,
            end_time: time.end,
            class_name: cls,
          });
        }
        resolve(parsed);
      } catch (err) {
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    };
    reader.readAsArrayBuffer(file);
  });
}

function SchedulePage() {
  const { session } = useAuth();
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [cancelled, setCancelled] = useState<Set<string>>(new Set());
  const [imported, setImported] = useState<ImportedLesson[]>([]);
  const [singles, setSingles] = useState<SingleLessonRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"week" | "month">("week");
  const [anchor, setAnchor] = useState(new Date());
  const [hidden, setHidden] = useState<Set<string>>(new Set());



  const [importOpen, setImportOpen] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importPreview, setImportPreview] = useState<ParsedRow[] | null>(null);
  const [importBusy, setImportBusy] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [editorOpen, setEditorOpen] = useState(false);
  const [editingLesson, setEditingLesson] = useState<SingleLessonRow | null>(null);
  const [detailFor, setDetailFor] = useState<AnyOccurrence | null>(null);

  const load = useCallback(async () => {
    if (!session?.user.id) return;
    setLoading(true);
    const [{ data: studs }, { data: cancels }, { data: imps }, { data: sngs }] =
      await Promise.all([
        supabase
          .from("students")
          .select(
            "id, name, total_hours, hours_per_lesson, hourly_rate, schedule_start_date, schedule_slots, schedule_frequency_weeks, schedule_weekday, schedule_start_time, schedule_end_time",
          )
          .eq("created_by", session.user.id),
        supabase.from("cancelled_lessons").select("student_id, lesson_at"),
        supabase
          .from("imported_lessons")
          .select("id, lesson_date, start_time, end_time, class_name")
          .eq("created_by", session.user.id),
        supabase
          .from("single_lessons")
          .select("*")
          .eq("created_by", session.user.id),
      ]);
    setStudents((studs ?? []) as unknown as StudentRow[]);
    const set = new Set<string>();
    for (const c of cancels ?? []) {
      set.add(
        `${c.student_id}|${new Date(c.lesson_at as string).toISOString()}`,
      );
    }
    setCancelled(set);
    setImported((imps ?? []) as ImportedLesson[]);
    setSingles((sngs ?? []) as SingleLessonRow[]);
    setLoading(false);
  }, [session?.user.id]);

  useEffect(() => {
    load();
  }, [load]);

  const occurrences: Occurrence[] = useMemo(() => {
    const out: Occurrence[] = [];
    for (const s of students) {
      for (const o of generateLessonOccurrences(s)) {
        const key = `${s.id}|${lessonKey(o.date)}`;
        if (cancelled.has(key)) continue;
        out.push({ kind: "recurring", date: o.date, slot: o.slot, student: s });
      }
    }
    return out.sort((a, b) => a.date.getTime() - b.date.getTime());
  }, [students, cancelled]);

  const singleOccurrences: SingleOccurrence[] = useMemo(() => {
    const nameById = new Map(students.map((s) => [s.id, s.name] as const));
    return singles
      .map((row) => {
        const [y, m, d] = row.lesson_date.split("-").map((n) => parseInt(n, 10));
        const [h, mm] = row.start_time.split(":").map((n) => parseInt(n, 10));
        const [eh, em] = row.end_time.split(":").map((n) => parseInt(n, 10));
        const date = new Date(y, (m ?? 1) - 1, d ?? 1, h ?? 0, mm ?? 0);
        const end = new Date(y, (m ?? 1) - 1, d ?? 1, eh ?? 0, em ?? 0);
        return {
          kind: "single" as const,
          date,
          end,
          row,
          studentName: row.student_id ? nameById.get(row.student_id) ?? null : null,
        };
      })
      .sort((a, b) => a.date.getTime() - b.date.getTime());
  }, [singles, students]);

  const importedOccurrences: ImportedOccurrence[] = useMemo(() => {
    return imported
      .map((row) => {
        const [y, m, d] = row.lesson_date.split("-").map((n) => parseInt(n, 10));
        const [h, mm] = row.start_time.split(":").map((n) => parseInt(n, 10));
        const date = new Date(y, (m ?? 1) - 1, d ?? 1, h ?? 0, mm ?? 0);
        return {
          kind: "imported" as const,
          id: row.id,
          date,
          start: row.start_time.slice(0, 5),
          end: row.end_time.slice(0, 5),
          className: row.class_name,
        };
      })
      .sort((a, b) => a.date.getTime() - b.date.getTime());
  }, [imported]);

  const { rangeStart, rangeEnd, label } = useMemo(() => {
    if (view === "week") {
      const s = startOfWeek(anchor);
      const e = new Date(s);
      e.setDate(s.getDate() + 7);
      return {
        rangeStart: s,
        rangeEnd: e,
        label: `${s.getFullYear()}年${s.getMonth() + 1}月${s.getDate()}日 起的一周`,
      };
    }
    const s = startOfMonth(anchor);
    const e = new Date(s.getFullYear(), s.getMonth() + 1, 1);
    return {
      rangeStart: s,
      rangeEnd: e,
      label: `${s.getFullYear()}年${s.getMonth() + 1}月`,
    };
  }, [view, anchor]);

  const inRange = occurrences.filter(
    (o) =>
      o.date >= rangeStart && o.date < rangeEnd && !hidden.has(o.student.id),
  );
  const singleInRange = singleOccurrences.filter(
    (o) =>
      o.date >= rangeStart &&
      o.date < rangeEnd &&
      !hidden.has(o.row.student_id ?? OTHER_KEY),
  );
  const importedInRange = importedOccurrences.filter(
    (o) => o.date >= rangeStart && o.date < rangeEnd && !hidden.has(IMPORTED_KEY),
  );


  const monthlyIncome = useMemo(() => {
    const recurring = inRange.reduce((sum, o) => {
      return sum + lessonFee(o.student.hours_per_lesson, o.student.hourly_rate);
    }, 0);
    const single = singleInRange.reduce((sum, o) => {
      return sum + lessonFee(o.row.hours_per_lesson, o.row.hourly_rate);
    }, 0);
    return Math.round((recurring + single) * 100) / 100;
  }, [inRange, singleInRange]);

  const totalHours = useMemo(() => {
    let sum = 0;
    for (const o of inRange) {
      if (o.student.hours_per_lesson) {
        sum += Number(o.student.hours_per_lesson);
      } else if (o.slot.end_time) {
        const [sh, sm] = o.slot.start_time.split(":").map(Number);
        const [eh, em] = o.slot.end_time.split(":").map(Number);
        sum += (eh * 60 + em - sh * 60 - sm) / 60;
      }
    }
    for (const o of singleInRange) {
      if (o.row.hours_per_lesson != null) {
        sum += Number(o.row.hours_per_lesson);
      } else {
        sum += (o.end.getTime() - o.date.getTime()) / 3600000;
      }
    }
    for (const o of importedInRange) {
      const [sh, sm] = o.start.split(":").map(Number);
      const [eh, em] = o.end.split(":").map(Number);
      sum += (eh * 60 + em - sh * 60 - sm) / 60;
    }
    return Math.round(sum * 100) / 100;
  }, [inRange, singleInRange, importedInRange]);

  const exportEntries: ExportEntry[] = useMemo(() => {
    const fmt = (d: Date) =>
      `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
    const out: ExportEntry[] = [];
    for (const o of occurrences) {
      out.push({
        date: o.date,
        timeLabel: `${o.slot.start_time.slice(0, 5)}${o.slot.end_time ? "-" + o.slot.end_time.slice(0, 5) : ""}`,
        title: o.student.name,
        groupKey: o.student.id,
        groupLabel: o.student.name,
      });
    }
    for (const o of singleOccurrences) {
      out.push({
        date: o.date,
        timeLabel: `${fmt(o.date)}-${fmt(o.end)}`,
        title: o.row.class_name ?? o.studentName ?? "单次课",
        groupKey: o.row.student_id ?? OTHER_KEY,
        groupLabel: o.studentName ?? "其他单次课",
      });
    }
    for (const o of importedOccurrences) {
      out.push({
        date: o.date,
        timeLabel: `${o.start}-${o.end}`,
        title: o.className,
        groupKey: IMPORTED_KEY,
        groupLabel: "导入课表",
      });
    }
    return out;
  }, [occurrences, singleOccurrences, importedOccurrences]);

  function toISODate(d: Date) {
    const p = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  }

  const shift = (dir: -1 | 1) => {
    const d = new Date(anchor);
    if (view === "week") d.setDate(d.getDate() + dir * 7);
    else d.setMonth(d.getMonth() + dir);
    setAnchor(d);
  };

  const handleDeleteSingle = async (row: SingleLessonRow) => {
    if (!confirm("确认删除此课次？")) return;
    const { error } = await supabase.from("single_lessons").delete().eq("id", row.id);
    if (error) {
      toast.error("删除失败：" + error.message);
      return;
    }
    toast.success("已删除");
    setDetailFor(null);
    await load();
  };

  const handleDeleteImported = async (id: string) => {
    if (!confirm("确认删除此导入课次？")) return;
    const { error } = await supabase.from("imported_lessons").delete().eq("id", id);
    if (error) {
      toast.error("删除失败：" + error.message);
      return;
    }
    toast.success("已删除");
    setDetailFor(null);
    await load();
  };

  const handleCancelLesson = async (o: Occurrence) => {
    const { error } = await supabase.from("cancelled_lessons").insert({
      student_id: o.student.id,
      lesson_at: o.date.toISOString(),
      created_by: session?.user.id ?? null,
    });
    if (error) {
      toast.error("删除失败：" + error.message);
      return;
    }
    toast.success("已删除该节课");
    setCancelled((prev) =>
      new Set(prev).add(`${o.student.id}|${lessonKey(o.date)}`),
    );
    setDetailFor(null);
  };


  const handleFileChange = async (file: File | null) => {
    setImportFile(file);
    setImportPreview(null);
    setImportError(null);
    if (!file) return;
    try {
      const rows = await parseWorkbook(file);
      if (rows.length === 0) {
        setImportError("未能解析到任何有效课次，请检查 Excel 是否包含 上课日期 / 上课时段 / 班级名称 三列。");
        return;
      }
      setImportPreview(rows);
    } catch (err) {
      setImportError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleConfirmImport = async () => {
    if (!session?.user.id || !importPreview) return;
    setImportBusy(true);
    // 先删除该老师之前导入的所有课次
    const { error: delErr } = await supabase
      .from("imported_lessons")
      .delete()
      .eq("created_by", session.user.id);
    if (delErr) {
      setImportBusy(false);
      toast.error("清理旧课表失败：" + delErr.message);
      return;
    }
    // 分批插入
    const rows = importPreview.map((r) => ({
      created_by: session.user.id,
      lesson_date: r.lesson_date,
      start_time: r.start_time,
      end_time: r.end_time,
      class_name: r.class_name,
    }));
    const CHUNK = 500;
    for (let i = 0; i < rows.length; i += CHUNK) {
      const chunk = rows.slice(i, i + CHUNK);
      const { error } = await supabase.from("imported_lessons").insert(chunk);
      if (error) {
        setImportBusy(false);
        toast.error("导入失败：" + error.message);
        return;
      }
    }
    toast.success(`已导入 ${rows.length} 节课，并已替换旧课表`);
    setImportOpen(false);
    setImportFile(null);
    setImportPreview(null);
    setImportBusy(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
    await load();
  };

  const handleClearImport = async () => {
    if (!session?.user.id) return;
    if (!confirm("确认清空全部通过 Excel 导入的课次？")) return;
    const { error } = await supabase
      .from("imported_lessons")
      .delete()
      .eq("created_by", session.user.id);
    if (error) {
      toast.error("清空失败：" + error.message);
      return;
    }
    toast.success("已清空导入的课表");
    await load();
  };

  const days: Date[] = [];
  if (view === "week") {
    for (let i = 0; i < 7; i++) {
      const d = new Date(rangeStart);
      d.setDate(rangeStart.getDate() + i);
      days.push(d);
    }
  } else {
    const gridStart = startOfWeek(rangeStart);
    for (let i = 0; i < 42; i++) {
      const d = new Date(gridStart);
      d.setDate(gridStart.getDate() + i);
      days.push(d);
      if (i >= 27 && d >= rangeEnd && d.getDay() === 6) break;
    }
  }

  return (
    <div>
      <Link
        to="/admin"
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        返回学生列表
      </Link>

      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <CalendarDays className="h-4 w-4" />
            课程表
          </div>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-foreground">
            {label}
          </h1>
          

          <div className="mt-1 text-sm text-muted-foreground">
            {view === "week" ? "本周" : "本月"}总课时 <span className="font-semibold text-foreground">{totalHours}</span> 小时
          </div>
          <div className="mt-1 flex items-center gap-1.5 text-sm font-medium text-emerald-600">
            <Coins className="h-3.5 w-3.5" />
            预计收入 ¥{monthlyIncome}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            onClick={() => {
              setEditingLesson(null);
              setEditorOpen(true);
            }}
            className="gap-1.5"
          >
            <CalendarPlus className="h-4 w-4" />
            增加课次
          </Button>
          <XngjSyncButton onDone={load} />
          <ScheduleExportDialog
            entries={exportEntries}
            defaultStart={toISODate(rangeStart)}
            defaultEnd={toISODate(new Date(rangeEnd.getTime() - 86400000))}
          />
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="gap-1.5">
                <Filter className="h-4 w-4" />
                筛选
                {hidden.size > 0 && (
                  <span className="rounded bg-primary/10 px-1 text-[10px] text-primary">
                    已筛选
                  </span>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-64 p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm font-medium">显示内容</span>
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs"
                    onClick={() => setHidden(new Set())}
                  >
                    全选
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs"
                    onClick={() =>
                      setHidden(
                        new Set([
                          ...students.map((s) => s.id),
                          OTHER_KEY,
                          IMPORTED_KEY,
                        ]),
                      )
                    }
                  >
                    清空
                  </Button>
                </div>
              </div>
              <div className="max-h-72 space-y-1.5 overflow-y-auto">
                {[
                  ...students.map((s) => ({ key: s.id, label: s.name })),
                  { key: OTHER_KEY, label: "未关联学生的单次课" },
                  { key: IMPORTED_KEY, label: "导入的课表" },
                ].map((opt) => (
                  <label
                    key={opt.key}
                    className="flex cursor-pointer items-center gap-2 rounded-md px-1 py-1 text-sm hover:bg-muted/60"
                  >
                    <Checkbox
                      checked={!hidden.has(opt.key)}
                      onCheckedChange={(v) =>
                        setHidden((prev) => {
                          const next = new Set(prev);
                          if (v) next.delete(opt.key);
                          else next.add(opt.key);
                          return next;
                        })
                      }
                    />
                    <span className="truncate">{opt.label}</span>
                  </label>
                ))}
              </div>
            </PopoverContent>
          </Popover>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setImportOpen(true)}
            className="gap-1.5"
          >
            <Upload className="h-4 w-4" />
            导入课表
          </Button>
          {imported.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClearImport}
              className="text-muted-foreground hover:text-destructive"
            >
              清空导入
            </Button>
          )}
          <Tabs value={view} onValueChange={(v) => setView(v as "week" | "month")}>
            <TabsList>
              <TabsTrigger value="week">周视图</TabsTrigger>
              <TabsTrigger value="month">月视图</TabsTrigger>
            </TabsList>
          </Tabs>
          <Button variant="outline" size="icon" onClick={() => shift(-1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => setAnchor(new Date())}>
            今天
          </Button>
          <Button variant="outline" size="icon" onClick={() => shift(1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="rounded-2xl border border-border bg-card p-10 text-center text-sm text-muted-foreground">
          加载中...
        </div>
      ) : (
        <div className="-mx-4 overflow-x-auto px-4"><div className="grid min-w-[770px] grid-cols-[repeat(7,minmax(110px,1fr))] gap-2">
          {WEEKDAY_LABELS.map((w) => (
            <div
              key={w}
              className="px-2 py-1 text-center text-xs font-medium text-muted-foreground"
            >
              {w}
            </div>
          ))}
          {days.map((d, i) => {
            const dayItems: Array<
              | { t: number; kind: "r"; o: Occurrence }
              | { t: number; kind: "s"; o: SingleOccurrence }
              | { t: number; kind: "i"; o: ImportedOccurrence }
            > = [
              ...inRange
                .filter((o) => sameDay(o.date, d))
                .map((o) => ({ t: o.date.getTime(), kind: "r" as const, o })),
              ...singleInRange
                .filter((o) => sameDay(o.date, d))
                .map((o) => ({ t: o.date.getTime(), kind: "s" as const, o })),
              ...importedInRange
                .filter((o) => sameDay(o.date, d))
                .map((o) => ({ t: o.date.getTime(), kind: "i" as const, o })),
            ].sort((a, b) => a.t - b.t);
            const inCurrentRange = d >= rangeStart && d < rangeEnd;
            const isToday = sameDay(d, new Date());
            return (
              <div
                key={i}
                className={`min-h-[100px] rounded-xl border p-2 ${
                  inCurrentRange
                    ? "border-border bg-card"
                    : "border-border/40 bg-muted/20 text-muted-foreground"
                } ${isToday ? "ring-2 ring-primary" : ""}`}
              >
                <div className="mb-1 text-xs font-medium">{d.getDate()}</div>
                <div className="space-y-1">
                  {dayItems.map((item, j) => {
                    if (item.kind === "r") {
                      const o = item.o;
                      const time = `${o.slot.start_time?.slice(0, 5) ?? ""}${o.slot.end_time ? "-" + o.slot.end_time.slice(0, 5) : ""}`;
                      return (
                        <button
                          key={`r-${j}`}
                          type="button"
                          onClick={() => setDetailFor(o)}
                          className="block w-full rounded-md bg-primary/10 px-1.5 py-1 text-left text-[11px] text-primary hover:bg-primary/20"
                          title={`${o.student.name} ${time}`}
                        >
                          <div className="font-medium whitespace-nowrap">{time}</div>
                          <div className="truncate">{o.student.name}</div>
                        </button>
                      );
                    }
                    if (item.kind === "s") {
                      const o = item.o;
                      const time = `${o.row.start_time.slice(0, 5)}-${o.row.end_time.slice(0, 5)}`;
                      return (
                        <button
                          key={`s-${o.row.id}`}
                          type="button"
                          onClick={() => setDetailFor(o)}
                          className="block w-full rounded-md bg-sky-100 px-1.5 py-1 text-left text-[11px] text-sky-800 hover:bg-sky-200"
                          title={`${o.studentName ?? o.row.class_name ?? ""} ${time}`}
                        >
                          <div className="font-medium whitespace-nowrap">{time}</div>
                          <div className="truncate">
                            {o.studentName ?? o.row.class_name}
                          </div>
                        </button>
                      );
                    }
                    const o = item.o;
                    return (
                      <button
                        key={`i-${o.id}`}
                        type="button"
                        onClick={() => setDetailFor(o)}
                        className="block w-full rounded-md bg-amber-100 px-1.5 py-1 text-left text-[11px] text-amber-800 hover:bg-amber-200"
                        title={`${o.className} ${o.start}-${o.end}`}
                      >
                        <div className="font-medium whitespace-nowrap">
                          {o.start}-{o.end}
                        </div>
                        <div className="truncate">{o.className}</div>
                      </button>
                    );
                  })}

                </div>

              </div>
            );
          })}
        </div></div>

      )}

      {!loading &&
        (inRange.length > 0 || singleInRange.length > 0 || importedInRange.length > 0) && (
          <div className="mt-8">
            <h2 className="mb-3 text-base font-semibold text-foreground">课程列表</h2>
            <div className="space-y-2">
              {([
                ...inRange.map((o) => ({ t: o.date.getTime(), kind: "r" as const, o })),
                ...singleInRange.map((o) => ({ t: o.date.getTime(), kind: "s" as const, o })),
                ...importedInRange.map((o) => ({ t: o.date.getTime(), kind: "i" as const, o })),
              ])
                .sort((a, b) => a.t - b.t)
                .map((item, idx) => {
                  if (item.kind === "r") {
                    const o = item.o;
                    return (
                      <button
                        key={`r-${idx}`}
                        type="button"
                        onClick={() => setDetailFor(o)}
                        className="flex w-full items-center justify-between rounded-xl border border-border bg-card px-4 py-3 text-left shadow-[var(--shadow-card)] hover:shadow-[var(--shadow-soft)]"
                      >
                        <div className="flex-1">
                          <div className="text-sm font-medium text-foreground">
                            {o.student.name}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {o.date.toLocaleDateString("zh-CN", {
                              month: "long",
                              day: "numeric",
                              weekday: "short",
                            })}{" "}
                            · {o.slot.start_time?.slice(0, 5)}
                            {o.slot.end_time ? "-" + o.slot.end_time.slice(0, 5) : ""}
                          </div>
                        </div>
                      </button>
                    );
                  }
                  if (item.kind === "s") {
                    const o = item.o;
                    return (
                      <button
                        key={`s-${o.row.id}`}
                        type="button"
                        onClick={() => setDetailFor(o)}
                        className="flex w-full items-center justify-between rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-left hover:bg-sky-100"
                      >
                        <div className="flex-1">
                          <div className="text-sm font-medium text-sky-900">
                            {o.studentName ?? o.row.class_name}
                            <span className="ml-2 rounded bg-sky-200 px-1.5 py-0.5 text-[10px] text-sky-800">
                              单次
                            </span>
                          </div>
                          <div className="text-xs text-sky-700">
                            {o.date.toLocaleDateString("zh-CN", {
                              month: "long",
                              day: "numeric",
                              weekday: "short",
                            })}{" "}
                            · {o.row.start_time.slice(0, 5)}-{o.row.end_time.slice(0, 5)}
                          </div>
                        </div>
                      </button>
                    );
                  }
                  const o = item.o;
                  return (
                    <button
                      key={`i-${o.id}`}
                      type="button"
                      onClick={() => setDetailFor(o)}
                      className="flex w-full items-center justify-between rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-left hover:bg-amber-100"
                    >
                      <div className="flex-1">
                        <div className="text-sm font-medium text-amber-900">
                          {o.className}
                          <span className="ml-2 rounded bg-amber-200 px-1.5 py-0.5 text-[10px] text-amber-800">
                            导入
                          </span>
                        </div>
                        <div className="text-xs text-amber-700">
                          {o.date.toLocaleDateString("zh-CN", {
                            month: "long",
                            day: "numeric",
                            weekday: "short",
                          })}{" "}
                          · {o.start}-{o.end}
                        </div>
                      </div>
                    </button>
                  );
                })}
            </div>
          </div>
        )}


      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>导入课表 (Excel)</DialogTitle>
            <DialogDescription>
              上传 .xlsx 文件，系统会读取「上课日期 / 上课时段 / 班级名称」三列。
              <br />
              重新上传会替换你之前通过 Excel 导入的全部课次（旧课表中存在而新课表中不存在的会被删除）。
              这些课次不会出现在学生列表里。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls"
              onChange={(e) => handleFileChange(e.target.files?.[0] ?? null)}
              className="block w-full text-sm text-muted-foreground file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-2 file:text-sm file:font-medium file:text-primary-foreground hover:file:bg-primary/90"
            />
            {importError && (
              <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {importError}
              </div>
            )}
            {importPreview && (
              <div className="rounded-md border border-border bg-muted/30 p-3 text-sm">
                <div className="font-medium text-foreground">
                  已识别 {importPreview.length} 节课
                </div>
                <div className="mt-2 max-h-56 space-y-1 overflow-y-auto text-xs text-muted-foreground">
                  {importPreview.slice(0, 20).map((r, i) => (
                    <div key={i} className="flex justify-between gap-2">
                      <span>
                        {r.lesson_date} {r.start_time.slice(0, 5)}-{r.end_time.slice(0, 5)}
                      </span>
                      <span className="truncate text-right">{r.class_name}</span>
                    </div>
                  ))}
                  {importPreview.length > 20 && (
                    <div className="pt-1 text-center">
                      ...（仅预览前 20 行）
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setImportOpen(false)}
              disabled={importBusy}
            >
              取消
            </Button>
            <Button
              onClick={handleConfirmImport}
              disabled={!importPreview || importBusy}
            >
              {importBusy ? "导入中..." : "确认导入并替换"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {session?.user.id && (
        <LessonEditorDialog
          open={editorOpen}
          onOpenChange={setEditorOpen}
          createdBy={session.user.id}
          studentOptions={students.map((s) => ({ id: s.id, name: s.name }))}
          editing={editingLesson}
          onSaved={load}
        />
      )}

      {session?.user.id && detailFor && (() => {
        const fmtDate = (d: Date) =>
          `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

        if (detailFor.kind === "single") {
          return (
            <LessonEditorDialog
              open={true}
              onOpenChange={(v) => {
                if (!v) setDetailFor(null);
              }}
              createdBy={session.user.id}
              studentOptions={students.map((s) => ({ id: s.id, name: s.name }))}
              editing={detailFor.row}
              title="课次详情（可编辑）"
              onDelete={async () => {
                await handleDeleteSingle(detailFor.row);
              }}
              onSaved={load}
            />
          );
        }

        if (detailFor.kind === "recurring") {
          const occ = detailFor;
          return (
            <LessonEditorDialog
              open={true}
              onOpenChange={(v) => {
                if (!v) setDetailFor(null);
              }}
              createdBy={session.user.id}
              studentOptions={students.map((s) => ({ id: s.id, name: s.name }))}
              initialValues={{
                student_id: occ.student.id,
                class_name: null,
                lesson_date: fmtDate(occ.date),
                start_time: occ.slot.start_time,
                end_time: occ.slot.end_time ?? "16:00:00",
                hours_per_lesson: occ.student.hours_per_lesson,
                hourly_rate: occ.student.hourly_rate,
                notes: null,
              }}
              title="课次详情（可编辑，将覆盖本次固定课程）"
              beforeSave={async () => {
                // Cancel the original recurring instance so the new single lesson replaces it
                const { error } = await supabase.from("cancelled_lessons").insert({
                  student_id: occ.student.id,
                  lesson_at: occ.date.toISOString(),
                  created_by: session.user.id,
                });
                if (error) {
                  toast.error("保存失败：" + error.message);
                  return false;
                }
                setCancelled((prev) =>
                  new Set(prev).add(`${occ.student.id}|${lessonKey(occ.date)}`),
                );
                return true;
              }}
              onDelete={async () => {
                await handleCancelLesson(occ);
              }}
              onSaved={load}
            />
          );
        }

        // imported
        const imp = detailFor;
        return (
          <LessonEditorDialog
            open={true}
            onOpenChange={(v) => {
              if (!v) setDetailFor(null);
            }}
            createdBy={session.user.id}
            studentOptions={students.map((s) => ({ id: s.id, name: s.name }))}
            initialValues={{
              student_id: null,
              class_name: imp.className,
              lesson_date: fmtDate(imp.date),
              start_time: `${imp.start}:00`,
              end_time: `${imp.end}:00`,
              hours_per_lesson: null,
              hourly_rate: null,
              notes: null,
            }}
            title="课次详情（可编辑，将从导入课表移出）"
            beforeSave={async () => {
              const { error } = await supabase
                .from("imported_lessons")
                .delete()
                .eq("id", imp.id);
              if (error) {
                toast.error("保存失败：" + error.message);
                return false;
              }
              return true;
            }}
            onDelete={async () => {
              await handleDeleteImported(imp.id);
            }}
            onSaved={load}
          />
        );
      })()}
    </div>
  );
}
