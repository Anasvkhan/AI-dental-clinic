import { useMemo, useState } from "react";
import { formatDate, formatDateTime, formatPrice, formatTime, karachiDay, timeAgo } from "@/lib/format";
import type { Appointment } from "@/lib/supabase";
import { Empty, Panel, StatusBadge, highlight } from "../ui";

const FILTERS = [
  { id: "upcoming", label: "Upcoming" },
  { id: "today", label: "Today" },
  { id: "past", label: "Past" },
  { id: "changed", label: "Cancelled & rescheduled" },
  { id: "all", label: "All" },
] as const;
type Filter = (typeof FILTERS)[number]["id"];

type Props = { appointments: Appointment[]; now: number; changedIds: Set<string> };

export default function AppointmentsView({ appointments, now, changedIds }: Props) {
  const [filter, setFilter] = useState<Filter>("upcoming");
  const [query, setQuery] = useState("");

  const byId = useMemo(() => new Map(appointments.map((a) => [a.id, a])), [appointments]);

  const rows = useMemo(() => {
    const today = karachiDay(new Date(now));
    const q = query.trim().toLowerCase();
    const digits = q.replace(/\D/g, "");
    return appointments
      .filter((a) => {
        const start = new Date(a.starts_at).getTime();
        switch (filter) {
          case "upcoming":
            return a.status === "booked" && start >= now;
          case "today":
            return karachiDay(a.starts_at) === today;
          case "past":
            return start < now && a.status !== "cancelled" && a.status !== "rescheduled";
          case "changed":
            return a.status === "cancelled" || a.status === "rescheduled";
          default:
            return true;
        }
      })
      .filter((a) => {
        if (!q) return true;
        const name = a.patient?.full_name.toLowerCase() ?? "";
        const phone = a.patient?.phone.replace(/\D/g, "") ?? "";
        return name.includes(q) || (digits.length > 2 && phone.includes(digits)) || (a.service?.name.toLowerCase() ?? "").includes(q);
      })
      .sort((a, b) =>
        filter === "upcoming" || filter === "today" ? a.starts_at.localeCompare(b.starts_at) : b.starts_at.localeCompare(a.starts_at),
      );
  }, [appointments, filter, query, now]);

  return (
    <Panel
      title={`Appointments (${rows.length})`}
      action={
        <input
          type="search"
          placeholder="Search name, phone or service"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-56 rounded-lg border border-slate-300 px-3 py-1.5 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-200"
        />
      }
    >
      <div className="flex gap-2 overflow-x-auto border-b border-slate-100 px-5 py-3">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={`whitespace-nowrap rounded-full px-3 py-1 text-sm font-medium ${
              filter === f.id ? "bg-teal-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {rows.length === 0 ? (
        <Empty text="No appointments match." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-5 py-2 font-semibold">When</th>
                <th className="px-5 py-2 font-semibold">Patient</th>
                <th className="px-5 py-2 font-semibold">Service</th>
                <th className="px-5 py-2 font-semibold">Dentist</th>
                <th className="px-5 py-2 font-semibold">Status</th>
                <th className="px-5 py-2 font-semibold">Booked</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((a) => {
                const previous = a.rescheduled_from ? byId.get(a.rescheduled_from) : undefined;
                return (
                  <tr key={a.id} className={`align-top ${highlight(changedIds.has(a.id))}`}>
                    <td className="px-5 py-3">
                      <p className="font-medium text-slate-900">{formatDate(a.starts_at)}</p>
                      <p className="text-slate-500">{formatTime(a.starts_at)} – {formatTime(a.ends_at)}</p>
                    </td>
                    <td className="px-5 py-3">
                      <p className="font-medium text-slate-900">{a.patient?.full_name}</p>
                      <p className="tabular-nums text-slate-500">{a.patient?.phone}</p>
                    </td>
                    <td className="px-5 py-3">
                      <p className="text-slate-900">{a.service?.name}</p>
                      <p className="text-slate-500">{formatPrice(a.service?.price ?? null)}</p>
                      {a.notes && <p className="mt-1 max-w-xs text-xs text-slate-500">“{a.notes}”</p>}
                    </td>
                    <td className="px-5 py-3 text-slate-700">{a.dentist?.full_name}</td>
                    <td className="px-5 py-3">
                      <StatusBadge status={a.status} />
                      {previous && <p className="mt-1 text-xs text-amber-700">Moved from {formatDateTime(previous.starts_at)}</p>}
                    </td>
                    <td className="px-5 py-3 text-slate-500">
                      <p>{timeAgo(a.created_at, now)}</p>
                      <p className="text-xs capitalize">via {a.source}</p>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}
