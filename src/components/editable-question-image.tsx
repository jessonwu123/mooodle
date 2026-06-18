import { useRef, useState } from "react";
import { Upload, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type Field = "image_path" | "options_image_path";

export function EditableQuestionImage({
  questionId,
  field,
  signedUrl,
  alt,
  className,
  onUpdated,
  emptyHint = "暂无原题截图，可上传一张",
}: {
  questionId: string;
  field: Field;
  signedUrl: string | null;
  alt: string;
  className?: string;
  onUpdated?: (newPath: string, newUrl: string) => void;
  emptyHint?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const pick = () => inputRef.current?.click();

  const handleFile = async (file: File) => {
    setBusy(true);
    try {
      const ext = (file.name.split(".").pop() || "png").toLowerCase();
      const path = `replacements/${questionId}/${field}-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("math-question-images")
        .upload(path, file, { contentType: file.type || "image/png", upsert: true });
      if (upErr) throw upErr;
      const { error: dbErr } = await supabase
        .from("math_questions")
        .update({ [field]: path })
        .eq("id", questionId);
      if (dbErr) throw dbErr;
      const { data: signed, error: sErr } = await supabase.storage
        .from("math-question-images")
        .createSignedUrl(path, 3600);
      if (sErr) throw sErr;
      toast.success("已更新原题截图");
      onUpdated?.(path, signed?.signedUrl ?? "");
    } catch (e: any) {
      toast.error(e?.message ?? "上传失败");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div className="relative inline-block w-full">
      {signedUrl ? (
        <img src={signedUrl} alt={alt} className={className} />
      ) : (
        <div className="flex flex-col items-center justify-center gap-2 rounded-md border border-dashed bg-muted/30 px-4 py-8 text-xs text-muted-foreground">
          {emptyHint}
        </div>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
        }}
      />
      <Button
        type="button"
        variant="secondary"
        size="sm"
        className="absolute right-2 top-2 gap-1 shadow"
        disabled={busy}
        onClick={pick}
      >
        {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
        {busy ? "上传中..." : signedUrl ? "替换截图" : "上传截图"}
      </Button>
    </div>
  );
}
