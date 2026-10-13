"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useLiveClinicData } from "@/lib/useLiveClinicData";
import AppointmentsView from "./views/AppointmentsView";
import CallsView from "./views/CallsView";
import ClinicView from "./views/ClinicView";
import OverviewView from "./views/OverviewView";
import PatientsView from "./views/PatientsView";

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "appointments", label: "Appointments" },
  { id: "patients", label: "Patients" },
  { id: "calls", label: "Call logs" },
  { id: "clinic", label: "Clinic" },
] as const;

export type TabId = (typeof TABS)[number]["id"];

export default function Dashboard({ email }: { email: string }) {
  const { data, loading, error, live, events, changedIds, refresh } = useLiveClinicData();
  const [tab, setTab] = useState<TabId>("overview");
  // Ticks every 30s so "today" and "x min ago" stay current
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-teal-700">Airways Dental Clinic</p>
            <h1 className="text-lg font-bold text-slate-900">Admin panel</h1>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${
                live ? "bg-emerald-50 text-emerald-700 ring-emerald-200" : "bg-slate-100 text-slate-500 ring-slate-200"
              }`}
              title={live ? "Updates appear automatically" : "Connecting to live updates"}
            >
              <span className={`h-2 w-2 rounded-full ${live ? "animate-pulse bg-emerald-500" : "bg-slate-400"}`} />
              {live ? "Live" : "Connecting"}
            </span>
            <span className="hidden text-slate-500 sm:inline">{email}</span>
            <button onClick={() => supabase.auth.signOut()} className="rounded-lg px-3 py-1.5 font-medium text-slate-600 hover:bg-slate-100">
              Sign out
            </button>
          </div>
        </div>
        <nav className="mx-auto flex max-w-7xl gap-1 overflow-x-auto px-4 sm:px-6" aria-label="Sections">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              aria-current={tab === t.id ? "page" : undefined}
              className={`whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium ${
                tab === t.id ? "border-teal-600 text-teal-700" : "border-transparent text-slate-500 hover:text-slate-800"
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        {error && (
          <div className="mb-4 flex items-center justify-between rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700 ring-1 ring-rose-200">
            <span>Could not load data: {error}</span>
            <button onClick={refresh} className="font-semibold underline">Retry</button>
          </div>
        )}
        {loading ? (
          <p className="py-20 text-center text-sm text-slate-400">Loading clinic data…</p>
        ) : (
          <>
            {tab === "overview" && <OverviewView data={data} now={now} changedIds={changedIds} onOpen={setTab} />}
            {tab === "appointments" && <AppointmentsView appointments={data.appointments} now={now} changedIds={changedIds} />}
            {tab === "patients" && <PatientsView data={data} now={now} changedIds={changedIds} />}
            {tab === "calls" && <CallsView calls={data.calls} now={now} changedIds={changedIds} />}
            {tab === "clinic" && <ClinicView services={data.services} dentists={data.dentists} />}
          </>
        )}
      </main>

      <div className="pointer-events-none fixed bottom-4 right-4 z-30 flex flex-col gap-2" aria-live="polite">
        {events.map((e) => (
          <div key={e.id} className="rounded-xl bg-slate-900 px-4 py-3 text-sm font-medium text-white shadow-lg">
            {e.text}
          </div>
        ))}
      </div>
    </div>
  );
}
