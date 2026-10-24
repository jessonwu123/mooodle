import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Copy, KeyRound, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { getMyInviteCode, regenerateMyInviteCode } from "@/lib/access.functions";

export function InviteCodeButton() {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const getFn = useServerFn(getMyInviteCode);
  const regenFn = useServerFn(regenerateMyInviteCode);

  const run = async (fn: () => Promise<{ code: string }>) => {
    setBusy(true);
    try { setCode((await fn()).code); } catch (e) { toast.error(e instanceof Error ? e.message : "加载失败"); } finally { setBusy(false); }
  };

  return (
    <>
      <Button variant="outline" size="sm" className="gap-1.5" onClick={() => { setOpen(true); if (!code) void run(() => getFn()); }}>
        <KeyRound className="h-4 w-4" />邀请码
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>我的教师邀请码</DialogTitle>
            <DialogDescription>新教师注册时需填写此邀请码，管理员可在后台看到是谁邀请的。</DialogDescription>
          </DialogHeader>
          <div className="flex items-center justify-center py-4 font-mono text-4xl font-bold tracking-[0.3em] text-primary">
            {busy ? <Loader2 className="h-8 w-8 animate-spin" /> : code ?? "——"}
          </div>
          <div className="flex justify-center gap-2">
            <Button size="sm" disabled={!code || busy} className="gap-1.5" onClick={async () => { try { await navigator.clipboard.writeText(code!); toast.success("邀请码已复制"); } catch { toast.error("复制失败"); } }}>
              <Copy className="h-4 w-4" />复制
            </Button>
            <Button size="sm" variant="outline" disabled={busy} className="gap-1.5" onClick={() => { if (window.confirm("重新生成后旧邀请码将失效，确定吗？")) void run(() => regenFn()); }}>
              <RefreshCw className="h-4 w-4" />重新生成
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
