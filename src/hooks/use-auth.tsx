import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Session } from "@supabase/supabase-js";

type AuthSnapshot = {
  session: Session | null;
  isAdmin: boolean;
  isTeacher: boolean;
  loading: boolean;
};

const listeners = new Set<() => void>();
const roleCache = new Map<string, { isAdmin: boolean; isTeacher: boolean }>();
const roleRequests = new Map<string, Promise<void>>();

let initialized = false;
let snapshot: AuthSnapshot = {
  session: null,
  isAdmin: false,
  isTeacher: false,
  loading: true,
};

function updateSnapshot(patch: Partial<AuthSnapshot>) {
  snapshot = { ...snapshot, ...patch };
  listeners.forEach((listener) => listener());
}

function loadRoles(uid: string) {
  const cached = roleCache.get(uid);
  if (cached) {
    updateSnapshot({ ...cached, loading: false });
    return Promise.resolve();
  }

  const existing = roleRequests.get(uid);
  if (existing) return existing;

  const request = (async () => {
    const { data, error } = await supabase.from("user_roles").select("role").eq("user_id", uid);
    if (error) throw error;
    const roles = (data ?? []).map((r) => r.role as string);
    const nextRoles = {
      isAdmin: roles.includes("admin"),
      isTeacher: roles.includes("teacher") || roles.includes("admin"),
    };
    roleCache.set(uid, nextRoles);
    if (snapshot.session?.user.id === uid) {
      updateSnapshot({ ...nextRoles, loading: false });
    }
  })()
    .catch((error: unknown) => {
      console.error("load roles failed", error);
      if (snapshot.session?.user.id === uid) {
        updateSnapshot({ isAdmin: false, isTeacher: false, loading: false });
      }
    })
    .finally(() => {
      roleRequests.delete(uid);
    });

  roleRequests.set(uid, request);
  return request;
}

function handleSession(sess: Session | null) {
  if (!sess?.user) {
    updateSnapshot({ session: null, isAdmin: false, isTeacher: false, loading: false });
    return;
  }

  const cached = roleCache.get(sess.user.id);
  updateSnapshot({
    session: sess,
    ...(cached ?? { isAdmin: false, isTeacher: false }),
    loading: !cached,
  });
  void loadRoles(sess.user.id);
}

function ensureAuthSubscription() {
  if (initialized) return;
  initialized = true;

  supabase.auth.onAuthStateChange((_event, sess) => {
    handleSession(sess);
  });

  supabase.auth
    .getSession()
    .then(({ data: { session: sess } }) => handleSession(sess))
    .catch((error) => {
      console.error("get session failed", error);
      updateSnapshot({ session: null, isAdmin: false, isTeacher: false, loading: false });
    });
}

export function useAuth() {
  const [state, setState] = useState<AuthSnapshot>(snapshot);

  useEffect(() => {
    ensureAuthSubscription();
    const listener = () => setState(snapshot);
    listeners.add(listener);
    listener();
    return () => {
      listeners.delete(listener);
    };
  }, []);

  return state;
}
