import type { AppointmentStatus } from "@/lib/supabase";

const STATUS_STYLES: Record<AppointmentStatus, string> = {
  booked: "bg-teal-50 text-teal-800 ring-teal-200",
  completed: "bg-slate-100 text-slate-700 ring-slate-200",
  cancelled: "bg-rose-50 text-rose-700 ring-rose-200",
  rescheduled: "bg-amber-50 text-amber-800 ring-amber-200",
  no_show: "bg-orange-50 text-orange-800 ring-orange-200",
};

const STATUS_LABELS: Record<AppointmentStatus, string> = {
  booked: "Booked",
  completed: "Completed",
  cancelled: "Cancelled",
  rescheduled: "Rescheduled",
  no_show: "No-show",
};

export function StatusBadge({ status }: { status: AppointmentStatus }) {
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ${STATUS_STYLES[status]}`}>
      {STATUS_LABELS[status]}
    </span>
  );
}

export function StatCard({ label, value, hint }: { label: string; value: number | string; hint?: string }) {
  return (
    <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-1 text-3xl font-bold tabular-nums text-slate-900">{value}</p>
      {hint && <p className="mt-1 text-xs text-slate-400">{hint}</p>}
    </div>
  );
}

export function Panel({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-3">
        <h2 className="font-semibold text-slate-900">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export function Empty({ text }: { text: string }) {
  return <p className="px-5 py-10 text-center text-sm text-slate-400">{text}</p>;
}

export function highlight(changed: boolean) {
  return changed ? "bg-teal-50 transition-colors duration-1000" : "transition-colors duration-1000";
}
