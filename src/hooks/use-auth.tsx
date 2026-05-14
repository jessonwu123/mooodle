import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Session } from "@supabase/supabase-js";

export function useAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // 先注册监听器
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, sess) => {
      setSession(sess);
      if (sess?.user) {
        // 延迟查询避免死锁
        setTimeout(() => {
          supabase
            .from("user_roles")
            .select("role")
            .eq("user_id", sess.user.id)
            .eq("role", "admin")
            .maybeSingle()
            .then(({ data }) => {
              setIsAdmin(!!data);
            });
        }, 0);
      } else {
        setIsAdmin(false);
      }
    });

    // 然后获取已有 session
    supabase.auth.getSession().then(({ data: { session: sess } }) => {
      setSession(sess);
      if (sess?.user) {
        supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", sess.user.id)
          .eq("role", "admin")
          .maybeSingle()
          .then(({ data }) => {
            setIsAdmin(!!data);
            setLoading(false);
          });
      } else {
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  return { session, isAdmin, loading };
}
