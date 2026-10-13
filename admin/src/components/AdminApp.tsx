"use client";

import type { Session } from "@supabase/supabase-js";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import Dashboard from "./Dashboard";
import Login from "./Login";

type Access = "checking" | "staff" | "not-staff";

export default function AdminApp() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  // Remember which user the staff check was for, so switching accounts re-checks
  const [checked, setChecked] = useState<{ userId: string; access: Access } | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => data.subscription.unsubscribe();
  }, []);

  const userId = session?.user.id;
  const access: Access = checked && checked.userId === userId ? checked.access : "checking";
  useEffect(() => {
    if (!userId) return;
    supabase
      .from("staff")
      .select("user_id")
      .eq("user_id", userId)
      .maybeSingle()
      .then(({ data }) => setChecked({ userId, access: data ? "staff" : "not-staff" }));
  }, [userId]);

  if (session === undefined || (session && access === "checking")) {
    return <FullScreenMessage title="Loading…" />;
  }
  if (!session) return <Login />;
  if (access === "not-staff") {
    return (
      <FullScreenMessage
        title="No access yet"
        body={`You are signed in as ${session.user.email}, but this account is not on the clinic's staff list. Ask the clinic owner to add it.`}
        action={
          <button onClick={() => supabase.auth.signOut()} className="mt-6 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white">
            Sign out
          </button>
        }
      />
    );
  }
  return <Dashboard email={session.user.email ?? ""} />;
}

function FullScreenMessage({ title, body, action }: { title: string; body?: string; action?: React.ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="max-w-sm text-center">
        <h1 className="text-lg font-semibold text-slate-900">{title}</h1>
        {body && <p className="mt-2 text-sm text-slate-600">{body}</p>}
        {action}
      </div>
    </main>
  );
}
