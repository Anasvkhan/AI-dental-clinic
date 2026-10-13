import { useMemo, useState } from "react";
import { formatDateTime, timeAgo } from "@/lib/format";
import type { ClinicData } from "@/lib/useLiveClinicData";
import { Empty, Panel, highlight } from "../ui";

type Props = { data: ClinicData; now: number; changedIds: Set<string> };

export default function PatientsView({ data, now, changedIds }: Props) {
  const [query, setQuery] = useState("");

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const digits = q.replace(/\D/g, "");
    return data.patients
      .filter((p) => !q || p.full_name.toLowerCase().includes(q) || (digits.length > 2 && p.phone.replace(/\D/g, "").includes(digits)))
      .map((p) => {
        const theirs = data.appointments.filter((a) => a.patient?.id === p.id);
        const next = theirs
          .filter((a) => a.status === "booked" && new Date(a.starts_at).getTime() >= now)
          .sort((a, b) => a.starts_at.localeCompare(b.starts_at))[0];
        const visits = theirs.filter((a) => a.status !== "rescheduled").length;
        const calls = data.calls.filter((c) => c.patient_id === p.id).length;
        return { patient: p, next, visits, calls };
      });
  }, [data, query, now]);

  return (
    <Panel
      title={`Patients (${rows.length})`}
      action={
        <input
          type="search"
          placeholder="Search name or phone"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-52 rounded-lg border border-slate-300 px-3 py-1.5 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-200"
        />
      }
    >
      {rows.length === 0 ? (
        <Empty text="No patients yet." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[680px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-5 py-2 font-semibold">Patient</th>
                <th className="px-5 py-2 font-semibold">Phone</th>
                <th className="px-5 py-2 font-semibold">Appointments</th>
                <th className="px-5 py-2 font-semibold">Next visit</th>
                <th className="px-5 py-2 font-semibold">Added</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map(({ patient, next, visits, calls }) => (
                <tr key={patient.id} className={highlight(changedIds.has(patient.id))}>
                  <td className="px-5 py-3 font-medium text-slate-900">{patient.full_name}</td>
                  <td className="px-5 py-3 tabular-nums text-slate-700">{patient.phone}</td>
                  <td className="px-5 py-3 text-slate-700">
                    {visits}
                    {calls > 0 && <span className="text-slate-400"> · {calls} call{calls > 1 ? "s" : ""}</span>}
                  </td>
                  <td className="px-5 py-3 text-slate-700">
                    {next ? `${formatDateTime(next.starts_at)} · ${next.service?.name}` : <span className="text-slate-400">None</span>}
                  </td>
                  <td className="px-5 py-3 text-slate-500">{timeAgo(patient.created_at, now)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}
