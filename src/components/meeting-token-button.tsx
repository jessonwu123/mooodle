import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Video } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { deleteMeetingMcpToken, getMeetingMcpTokenStatus, saveMeetingMcpToken } from "@/lib/meeting-mcp.functions";
import tokenGuide from "@/assets/tencent-token-guide.png.asset.json";

type Status = { configured: boolean; updatedAt: string | null } | null;

export function MeetingTokenButton() {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<Status>(null);
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const getFn = useServerFn(getMeetingMcpTokenStatus);
  const saveFn = useServerFn(saveMeetingMcpToken);
  const delFn = useServerFn(deleteMeetingMcpToken);

  const load = async () => { try { setStatus(await getFn()); } catch { setStatus(null); } };

  const save = async () => {
    setBusy(true);
    try {
      await saveFn({ data: { token } });
      setToken("");
      await load();
      toast.success("Token 已验证并保存");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Token 保存失败"); } finally { setBusy(false); }
  };

  const remove = async () => {
    if (!window.confirm("确认删除已保存的腾讯会议 Token？")) return;
    try { await delFn(); setStatus({ configured: false, updatedAt: null }); toast.success("Token 已删除"); } catch { toast.error("删除失败，请重试"); }
  };

  return (
    <>
      <Button variant="outline" size="sm" className="gap-1.5" onClick={() => { setOpen(true); void load(); }}>
        <Video className="h-4 w-4" />腾讯会议 Token
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>腾讯会议 Token</DialogTitle>
            <DialogDescription>保存后可在「会议纪要存档」页面自动读取 AI 纪要和文字转写，一键生成课堂反馈。仅支持个人版/专业版账号。</DialogDescription>
          </DialogHeader>
          <div className="rounded-md border bg-muted/40 p-3 text-sm">
            <p className="mb-2 font-medium">获取教程</p>
            <ol className="list-decimal space-y-1 pl-5 text-muted-foreground">
              <li>打开 <a className="text-primary underline" href="https://meeting.tencent.com/ai-skill.html" target="_blank" rel="noreferrer">腾讯会议 Skill 页面</a>，用上课的个人/专业版腾讯会议账号登录。</li>
              <li>在页面第 2 步「复制 Token」处点击右侧「复制」（不用复制第 1 步的安装指令）。
                <img src={tokenGuide.url} alt="腾讯会议 Skill 页面：第 2 步 Token 右侧的复制按钮" className="mt-2 w-full rounded border" />
              </li>
              <li>粘贴到下方输入框，点击「验证并保存」。</li>
              <li>上课时在腾讯会议「录制」菜单开启【文字转写】和【元宝纪要】（免费，无需录屏）。</li>
              <li>课后打开 <a className="text-primary underline" href="/meeting-import">会议纪要存档</a> 页面，选日期即可读取并生成反馈。</li>
            </ol>
            <p className="mt-2 text-xs text-muted-foreground">Token 只保存在你的账号下，其他人看不到。更换账号或失效时重新粘贴即可覆盖。</p>
          </div>
          <div className="text-sm">
            当前状态：{status === null ? "读取中…" : status.configured ? `已保存${status.updatedAt ? `（${new Date(status.updatedAt).toLocaleString("zh-CN")}）` : ""}` : "未保存"}
          </div>
          <div className="flex gap-2">
            <Input type="password" value={token} onChange={(e) => setToken(e.target.value)} placeholder="粘贴腾讯会议 Token" aria-label="腾讯会议 Token" />
            <Button disabled={busy || token.trim().length < 10} onClick={save}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "验证并保存"}</Button>
          </div>
          {status?.configured && <div className="flex justify-between"><Button variant="ghost" size="sm" onClick={remove}>删除已保存的 Token</Button><Button size="sm" variant="outline" asChild><a href="/meeting-import">去生成课堂反馈</a></Button></div>}
        </DialogContent>
      </Dialog>
    </>
  );
}
