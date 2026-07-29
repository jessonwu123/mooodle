import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { RefreshCw, Loader2, KeyRound } from "lucide-react";
import { toast } from "sonner";
import {
  getXngjCredentials,
  saveXngjCredentials,
  runXngjSync,
  type SyncResult,
} from "@/lib/xngj.functions";

interface Props {
  onDone: () => void | Promise<void>;
}

function LessonList({ rows }: { rows: SyncResult["added"] }) {
  if (rows.length === 0) return <p className="text-sm text-muted-foreground py-2">（无）</p>;
  const sorted = [...rows].sort((a, b) =>
    `${a.lesson_date} ${a.start_time}`.localeCompare(`${b.lesson_date} ${b.start_time}`),
  );
  return (
    <div className="max-h-72 overflow-auto rounded border">
      <table className="w-full text-xs">
        <thead className="bg-muted/50 sticky top-0">
          <tr>
            <th className="px-2 py-1.5 text-left font-medium">日期</th>
            <th className="px-2 py-1.5 text-left font-medium">时段</th>
            <th className="px-2 py-1.5 text-left font-medium">课程</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((r, i) => (
            <tr key={i} className="border-t">
              <td className="px-2 py-1.5 whitespace-nowrap">{r.lesson_date}</td>
              <td className="px-2 py-1.5 whitespace-nowrap">
                {r.start_time.slice(0, 5)}-{r.end_time.slice(0, 5)}
              </td>
              <td className="px-2 py-1.5">{r.class_name}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function XngjSyncButton({ onDone }: Props) {
  const getCreds = useServerFn(getXngjCredentials);
  const saveCreds = useServerFn(saveXngjCredentials);
  const runSync = useServerFn(runXngjSync);

  const [busy, setBusy] = useState(false);
  const [credOpen, setCredOpen] = useState(false);
  const [afterSave, setAfterSave] = useState<"sync" | "close">("close");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);

  const [resultOpen, setResultOpen] = useState(false);
  const [result, setResult] = useState<SyncResult | null>(null);

  const doSync = async () => {
    setBusy(true);
    try {
      const r = await runSync();
      setResult(r);
      setResultOpen(true);
      toast.success(`同步完成：新增 ${r.added.length} · 删除 ${r.deleted.length}`);
      await onDone();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error("同步失败：" + msg);
      if (msg.includes("请先绑定")) openCred("sync");
    } finally {
      setBusy(false);
    }
  };

  const openCred = async (after: "sync" | "close") => {
    setAfterSave(after);
    try {
      const c = await getCreds();
      setUsername(c.username ?? "");
    } catch {
      setUsername("");
    }
    setPassword("");
    setCredOpen(true);
  };

  const handleSync = async () => {
    setBusy(true);
    try {
      const c = await getCreds();
      if (!c.configured) {
        setBusy(false);
        openCred("sync");
        return;
      }
      await doSync();
    } catch (err) {
      setBusy(false);
      toast.error(err instanceof Error ? err.message : String(err));
    }
  };

  const handleSaveCred = async () => {
    if (!username.trim() || !password) {
      toast.error("请填写用户名和密码");
      return;
    }
    setSaving(true);
    try {
      await saveCreds({ data: { username: username.trim(), password } });
      toast.success("账号已保存");
      setCredOpen(false);
      setPassword("");
      if (afterSave === "sync") await doSync();
    } catch (err) {
      toast.error("保存失败：" + (err instanceof Error ? err.message : String(err)));
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Button variant="default" size="sm" onClick={handleSync} disabled={busy} className="gap-1.5">
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
        一键更新
      </Button>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => openCred("close")}
        title="修改灵犀账号"
        disabled={busy}
      >
        <KeyRound className="h-4 w-4" />
      </Button>

      <Dialog open={credOpen} onOpenChange={setCredOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>绑定灵犀 CRM 账号</DialogTitle>
            <DialogDescription>
              账号密码仅用于同步你自己的课表，安全存储且只有你本人可访问。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>用户名</Label>
              <Input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="灵犀 CRM 登录用户名"
                autoComplete="off"
              />
            </div>
            <div className="space-y-1.5">
              <Label>密码</Label>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="灵犀 CRM 登录密码"
                autoComplete="new-password"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCredOpen(false)} disabled={saving}>
              取消
            </Button>
            <Button onClick={handleSaveCred} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}
              {afterSave === "sync" ? "保存并同步" : "保存"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={resultOpen} onOpenChange={setResultOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>同步完成</DialogTitle>
            <DialogDescription>
              范围 {result?.startDate} ~ {result?.endDate}
            </DialogDescription>
          </DialogHeader>
          {result && (
            <>
              <div className="flex flex-wrap gap-3 text-sm">
                <span className="rounded bg-green-100 text-green-800 px-3 py-1.5">
                  新增 <strong>{result.added.length}</strong> 节
                </span>
                <span className="rounded bg-red-100 text-red-800 px-3 py-1.5">
                  删除 <strong>{result.deleted.length}</strong> 节
                </span>
                <span className="rounded bg-muted px-3 py-1.5">
                  保留 <strong>{result.keptCount}</strong> 节
                </span>
              </div>
              <Accordion
                type="multiple"
                defaultValue={
                  [
                    result.added.length > 0 ? "added" : "",
                    result.deleted.length > 0 ? "deleted" : "",
                  ].filter(Boolean) as string[]
                }
              >
                <AccordionItem value="added">
                  <AccordionTrigger>新增课次明细 ({result.added.length})</AccordionTrigger>
                  <AccordionContent>
                    <LessonList rows={result.added} />
                  </AccordionContent>
                </AccordionItem>
                <AccordionItem value="deleted">
                  <AccordionTrigger>删除课次明细 ({result.deleted.length})</AccordionTrigger>
                  <AccordionContent>
                    <LessonList rows={result.deleted} />
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </>
          )}
          <DialogFooter>
            <Button onClick={() => setResultOpen(false)}>关闭</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
