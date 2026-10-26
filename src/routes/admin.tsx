import { createFileRoute, Outlet, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import { GraduationCap, LogOut, Pencil } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ProfileEditDialog } from "@/components/profile-edit-dialog";
import { InviteCodeButton } from "@/components/invite-code-button";
import { MeetingTokenButton } from "@/components/meeting-token-button";

export const Route = createFileRoute("/admin")({
  component: AdminLayout,
});

function AdminLayout() {
  const navigate = useNavigate();
  const { session, isTeacher, loading } = useAuth();
  const [editOpen, setEditOpen] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  const refreshProfile = useCallback(async () => {
    const { data } = await supabase.auth.getUser();
    const meta = (data.user?.user_metadata ?? {}) as Record<string, unknown>;
    setDisplayName((meta.display_name as string) || "");
    const path = meta.avatar_path as string | undefined;
    if (path) {
      const { data: signed } = await supabase.storage.from("avatars").createSignedUrl(path, 60 * 60 * 24);
      setAvatarUrl(signed?.signedUrl ?? null);
    } else {
      setAvatarUrl(null);
    }
  }, []);

  useEffect(() => {
    if (!loading && (!session || !isTeacher)) {
      navigate({ to: "/" });
    }
  }, [session, isTeacher, loading, navigate]);

  useEffect(() => {
    if (session?.user) void refreshProfile();
  }, [session?.user?.id, refreshProfile]);

  if (loading || !session || !isTeacher) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground">
        加载中...
      </div>
    );
  }

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/" });
  };

  const shownName = displayName || session.user.email || "教师";
  const initial = shownName.trim().charAt(0).toUpperCase();

  return (
    <div className="min-h-screen bg-[var(--gradient-soft)]">
      <header className="border-b border-border/40 bg-background/60 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setEditOpen(true)}
              className="group flex items-center gap-2 rounded-lg px-1 py-1 transition hover:bg-muted/60"
              title="编辑个人资料"
            >
              <div className="relative">
                <Avatar className="h-9 w-9">
                  {avatarUrl ? <AvatarImage src={avatarUrl} alt={shownName} /> : null}
                  <AvatarFallback className="bg-[var(--gradient-hero)] text-primary-foreground">
                    {avatarUrl ? initial : <GraduationCap className="h-5 w-5" />}
                  </AvatarFallback>
                </Avatar>
                <span className="absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-background text-muted-foreground opacity-0 shadow group-hover:opacity-100 transition">
                  <Pencil className="h-2.5 w-2.5" />
                </span>
              </div>
              <div className="text-left">
                <div className="text-sm font-semibold text-foreground">{shownName}</div>
                <div className="text-xs text-muted-foreground">{session.user.email}</div>
              </div>
            </button>
            <Link to="/admin/teachers" className="ml-2 text-xs text-muted-foreground hover:text-foreground">
              管理后台
            </Link>
          </div>
          <div className="flex items-center gap-2">
            <MeetingTokenButton />
            <InviteCodeButton />
            <Button variant="ghost" size="sm" onClick={handleLogout} className="gap-1.5">
              <LogOut className="h-4 w-4" />
              退出
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-6 py-10">
        <Outlet />
      </main>
      <ProfileEditDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        userId={session.user.id}
        currentName={displayName}
        currentAvatarUrl={avatarUrl}
        onSaved={refreshProfile}
      />
    </div>
  );
}
