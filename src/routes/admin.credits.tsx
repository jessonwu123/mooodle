import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, ChevronRight, ChevronLeft, RefreshCw, Coins } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getCreditSummary, getCreditDetails, type CreditSummary } from "@/lib/credit-usage.functions";
import { CREDIT_FEATURES } from "@/lib/ai-credit-rules";

export const Route = createFileRoute("/admin/credits")({
  component: CreditsPage,
  head: () => ({ meta: [{ title: "mooodle · Credits 使用记录" }, { name: "description", content: "按教师查看 AI credits 用量及学生和功能明细。" }, { property: "og:title", content: "mooodle · Credits 使用记录" }, { property: "og:description", content: "管理员查看教师及其学生的 AI 使用明细。" }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
});
const amount = (n: number | null) => n === null ? "未知" : Number(n).toLocaleString("zh-CN", { maximumFractionDigits: 5 });
const day = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const statusName: Record<string, string> = { running: "处理中", completed: "完成", failed: "失败", aborted: "已停止", incomplete: "未完成" };
type Teacher = CreditSummary["teachers"][number];

function CreditsPage() {
  const { isAdmin, loading } = useAuth();
  const [from, setFrom] = useState(() => day().slice(0, 7) + "-01");
  const [to, setTo] = useState(day);
  const [selected, setSelected] = useState<Teacher | null>(null);
  const [page, setPage] = useState(0);
  const [actor, setActor] = useState("all");
  const [feature, setFeature] = useState("all");
  const fetchSummary = useServerFn(getCreditSummary), fetchDetails = useServerFn(getCreditDetails);
  const valid = !!from && !!to && from <= to && Date.parse(to) - Date.parse(from) < 366 * 86400000;
  const range = { from: from ? new Date(`${from}T00:00:00+08:00`).toISOString() : "", to: to ? new Date(Date.parse(`${to}T00:00:00+08:00`) + 86400000).toISOString() : "" };
  const summary = useQuery({ queryKey: ["credit-usage", from, to], queryFn: () => fetchSummary({ data: range }), enabled: isAdmin && valid });
  const details = useQuery({ queryKey: ["credit-details", from, to, selected?.teacher_user_id, page, actor, feature], queryFn: () => fetchDetails({ data: { ...range, teacherId: selected?.teacher_user_id ?? null, page, ...(actor !== "all" ? { actorId: actor } : {}), ...(feature !== "all" ? { feature } : {}) } }), enabled: isAdmin && !!selected && valid });
  if (loading) return <div className="text-muted-foreground">加载中…</div>;
  if (!isAdmin) return <div className="text-muted-foreground">仅管理员可查看 credits 用量。</div>;
  const teachers = summary.data?.teachers ?? [];
  const credits = teachers.reduce((n, t) => n + Number(t.credits), 0);
  const unknown = teachers.reduce((n, t) => n + Number(t.unknown_requests), 0);
  const actors = summary.data?.actors.filter(a => a.teacher_user_id === selected?.teacher_user_id) ?? [];
  const features = summary.data?.features.filter(f => f.teacher_user_id === selected?.teacher_user_id) ?? [];
  const open = (t: Teacher) => { setSelected(t); setPage(0); setActor("all"); setFeature("all"); };
  return <div className="space-y-6">
    <Link to="/admin/teachers" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground"><ArrowLeft className="h-4 w-4" />返回管理后台</Link>
    <div className="flex flex-wrap items-center justify-between gap-4"><div><h1 className="flex items-center gap-2 text-2xl font-semibold text-foreground"><Coins className="h-6 w-6 text-primary" />Credits 使用记录</h1><p className="mt-2 text-sm text-muted-foreground">AI 使用记录 · 北京时间</p></div><Button variant="outline" size="sm" onClick={() => { void summary.refetch(); if (selected) void details.refetch(); }} disabled={summary.isFetching || !valid}><RefreshCw className="mr-2 h-4 w-4" />刷新</Button></div>
    <div className="flex flex-wrap items-end gap-3"><div><Label htmlFor="credits-from">开始日期</Label><Input id="credits-from" type="date" value={from} onChange={e => { setFrom(e.target.value); setSelected(null); }} className="mt-1 w-44" /></div><div><Label htmlFor="credits-to">结束日期</Label><Input id="credits-to" type="date" value={to} onChange={e => { setTo(e.target.value); setSelected(null); }} className="mt-1 w-44" /></div>{!valid && <span className="text-sm text-destructive">请选择有效日期范围（最多366天）</span>}</div>
    <div className="grid grid-cols-1 gap-4 border-y border-border py-5 sm:grid-cols-3"><div><p className="text-sm text-muted-foreground">估算 credits</p><p className="mt-1 text-3xl font-semibold tabular-nums text-foreground">{amount(credits)}</p></div><div><p className="text-sm text-muted-foreground">AI 请求次数</p><p className="mt-1 text-3xl font-semibold tabular-nums text-foreground">{teachers.reduce((n, t) => n + Number(t.requests), 0)}</p></div><div><p className="text-sm text-muted-foreground">用量未知 / 处理中</p><p className="mt-1 text-3xl font-semibold tabular-nums text-foreground">{unknown}</p></div></div>
    <p className="text-xs leading-relaxed text-muted-foreground">按 AI 返回的输入、缓存和输出用量及当次工作区价格估算，不等同于账单实际扣费；未知用量未计入汇总。学生用量归创建登录账号的老师，自主注册且无老师的账号单列。历史未记录的请求不补算。{summary.data?.recording_since ? ` 首条记录：${new Date(summary.data.recording_since).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })}。` : ""}</p>
    {summary.error ? <p role="alert" className="text-destructive">{summary.error.message}</p> : summary.isPending ? <p className="text-muted-foreground">{valid ? "读取用量中…" : "请调整日期"}</p> : !teachers.length ? <p className="py-10 text-center text-muted-foreground">所选日期暂无 AI 使用记录</p> : <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="border-b border-border text-left text-muted-foreground"><tr><th className="py-3 font-medium">归属老师</th><th className="px-3 py-3 text-right font-medium">本人</th><th className="px-3 py-3 text-right font-medium">学生</th><th className="px-3 py-3 text-right font-medium">合计 credits</th><th className="px-3 py-3 text-right font-medium">请求 / 未知</th><th><span className="sr-only">查看明细</span></th></tr></thead><tbody>{teachers.map(t => <tr key={t.teacher_user_id ?? "unassigned"} className="border-b border-border"><td className="py-4"><Button variant="link" className="h-auto max-w-64 justify-start whitespace-normal p-0 text-left" onClick={() => open(t)}>{t.teacher_name}</Button>{t.teacher_email && t.teacher_email !== t.teacher_name && <p className="text-xs text-muted-foreground">{t.teacher_email}</p>}</td><td className="px-3 text-right tabular-nums">{amount(t.teacher_credits)}</td><td className="px-3 text-right tabular-nums">{amount(t.student_credits)}</td><td className="px-3 text-right font-semibold tabular-nums">{amount(t.credits)}</td><td className="px-3 text-right tabular-nums">{t.requests} / {t.unknown_requests}</td><td><Button variant="ghost" size="icon" aria-label={`查看${t.teacher_name}的用量明细`} onClick={() => open(t)}><ChevronRight className="h-4 w-4" /></Button></td></tr>)}</tbody></table></div>}
    <Dialog open={!!selected} onOpenChange={v => { if (!v) setSelected(null); }}><DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl"><DialogHeader><DialogTitle className="break-all">用量明细 · {selected?.teacher_name}</DialogTitle></DialogHeader>
      <div className="grid gap-5 sm:grid-cols-2"><section><h2 className="mb-2 font-medium">使用者</h2><div className="space-y-2">{actors.map(a => <div key={a.actor_user_id} className="flex justify-between gap-3 border-b border-border py-2 text-sm"><span className="min-w-0 break-all">{a.actor_kind === "student" ? "学生 · " : "老师 · "}{a.actor_name}<span className="block text-xs text-muted-foreground">{a.requests} 次 · {a.unknown_requests} 次用量未知</span></span><span className="shrink-0 tabular-nums">{amount(a.credits)}</span></div>)}</div></section><section><h2 className="mb-2 font-medium">功能</h2><div className="space-y-2">{features.map(f => <div key={f.feature} className="flex justify-between gap-3 border-b border-border py-2 text-sm"><span>{CREDIT_FEATURES[f.feature] ?? f.feature}<span className="block text-xs text-muted-foreground">{f.requests} 次 · {f.unknown_requests} 次用量未知</span></span><span className="tabular-nums">{amount(f.credits)}</span></div>)}</div></section></div>
      <div className="flex flex-wrap items-center gap-2"><Select value={actor} onValueChange={v => { setActor(v); setPage(0); }}><SelectTrigger className="w-52" aria-label="筛选使用者"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">全部使用者</SelectItem>{actors.map(a => <SelectItem key={a.actor_user_id} value={a.actor_user_id}>{a.actor_name}</SelectItem>)}</SelectContent></Select><Select value={feature} onValueChange={v => { setFeature(v); setPage(0); }}><SelectTrigger className="w-48" aria-label="筛选功能"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">全部功能</SelectItem>{features.map(f => <SelectItem key={f.feature} value={f.feature}>{CREDIT_FEATURES[f.feature] ?? f.feature}</SelectItem>)}</SelectContent></Select></div>
      {details.error ? <p role="alert" className="text-destructive">{details.error.message}</p> : details.isPending ? <p>读取明细中…</p> : <><div className="overflow-x-auto"><table className="w-full text-xs"><thead className="border-b border-border text-left text-muted-foreground"><tr>{["时间 / 使用者", "功能 / 状态", "输入 / 缓存 / 输出", "估算 credits"].map(h => <th key={h} className="px-2 py-3 font-medium">{h}</th>)}</tr></thead><tbody>{details.data?.rows.map(r => <tr key={r.id} className="border-b border-border"><td className="px-2 py-3"><div className="whitespace-nowrap">{new Date(r.started_at).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })}</div><div className="mt-1 max-w-44 break-all text-muted-foreground">{r.actor_name}</div></td><td className="px-2 py-3">{CREDIT_FEATURES[r.feature] ?? r.feature}<p className="mt-1 text-muted-foreground">{statusName[r.status] ?? r.status}</p></td><td className="px-2 py-3 tabular-nums">{r.input_tokens ?? "—"} / {r.cached_input_tokens ?? "—"} / {r.output_tokens ?? "—"}</td><td className="px-2 py-3 text-right tabular-nums" title={r.gateway_run_id ? `请求标识：${r.gateway_run_id}` : undefined}>{amount(r.estimated_credits)}</td></tr>)}</tbody></table>{!details.data?.rows.length && <p className="py-6 text-center text-muted-foreground">暂无匹配明细</p>}</div><div className="flex items-center justify-between text-sm text-muted-foreground"><span>{details.data?.count ?? 0} 条 · 第 {page + 1} 页</span><div className="flex gap-2"><Button variant="outline" size="icon" aria-label="上一页" disabled={page === 0 || details.isFetching} onClick={() => setPage(n => n - 1)}><ChevronLeft className="h-4 w-4" /></Button><Button variant="outline" size="icon" aria-label="下一页" disabled={(page + 1) * 50 >= (details.data?.count ?? 0) || details.isFetching} onClick={() => setPage(n => n + 1)}><ChevronRight className="h-4 w-4" /></Button></div></div></>}
    </DialogContent></Dialog>
  </div>;
}