import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { UPGRADE_MESSAGE, UPGRADE_WECHAT } from "@/lib/student-access-rules";
import { toast } from "sonner";

export function UpgradeDialog({ message, onClose }: { message: string | null; onClose: () => void }) {
  return (
    <Dialog open={!!message} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Lock className="h-4 w-4 text-primary" />功能受限</DialogTitle>
          <DialogDescription>{message}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            onClick={async () => {
              try { await navigator.clipboard.writeText(UPGRADE_WECHAT); toast.success("微信号已复制"); } catch { /* ignore */ }
              onClose();
            }}
          >
            复制微信号 {UPGRADE_WECHAT}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function UpgradeNotice({ text }: { text?: string }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border bg-card/50 p-10 text-center text-sm text-muted-foreground">
      <Lock className="h-5 w-5 text-primary" />
      <p>{text ?? "自主注册账号暂不支持查看具体统计数据。"}</p>
      <p className="font-medium text-foreground">{UPGRADE_MESSAGE}</p>
    </div>
  );
}
