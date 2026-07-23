import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Upload } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  currentName: string;
  currentAvatarUrl: string | null;
  onSaved: () => void;
}

export function ProfileEditDialog({ open, onOpenChange, userId, currentName, currentAvatarUrl, onSaved }: Props) {
  const [name, setName] = useState(currentName);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(currentAvatarUrl);
  const [avatarPath, setAvatarPath] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setName(currentName);
      setAvatarUrl(currentAvatarUrl);
      setAvatarPath(null);
    }
  }, [open, currentName, currentAvatarUrl]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error("文件不能超过 5MB");
      return;
    }
    setUploading(true);
    try {
      const ext = file.name.split(".").pop() || "png";
      const path = `${userId}/avatar-${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from("avatars").upload(path, file, { upsert: true });
      if (error) throw error;
      const { data: signed, error: signErr } = await supabase.storage.from("avatars").createSignedUrl(path, 60 * 60 * 24 * 365);
      if (signErr) throw signErr;
      setAvatarPath(path);
      setAvatarUrl(signed.signedUrl);
      toast.success("头像已上传，点击保存生效");
    } catch (err) {
      console.error(err);
      toast.error("上传失败：" + (err as Error).message);
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const data: Record<string, unknown> = { display_name: name };
      if (avatarPath) {
        data.avatar_path = avatarPath;
        data.avatar_url = avatarUrl;
      }
      const { error } = await supabase.auth.updateUser({ data });
      if (error) throw error;
      toast.success("已保存");
      onSaved();
      onOpenChange(false);
    } catch (err) {
      console.error(err);
      toast.error("保存失败：" + (err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const initial = (name || "T").trim().charAt(0).toUpperCase();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>编辑个人资料</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex flex-col items-center gap-3">
            <Avatar className="h-20 w-20">
              {avatarUrl ? <AvatarImage src={avatarUrl} alt={name} /> : null}
              <AvatarFallback>{initial}</AvatarFallback>
            </Avatar>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
            <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={uploading}>
              {uploading ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Upload className="mr-1.5 h-4 w-4" />}
              更换头像
            </Button>
          </div>
          <div className="space-y-2">
            <Label htmlFor="teacher-name">教师姓名</Label>
            <Input id="teacher-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="请输入姓名" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>取消</Button>
          <Button onClick={handleSave} disabled={saving || uploading}>
            {saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            保存
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
