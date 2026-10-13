import { formatDateTime, formatDuration, formatTime, karachiDay, timeAgo } from "@/lib/format";
import type { ClinicData } from "@/lib/useLiveClinicData";
import type { TabId } from "../Dashboard";
import { Empty, Panel, StatCard, StatusBadge, highlight } from "../ui";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

type Props = { data: ClinicData; now: number; changedIds: Set<string>; onOpen: (tab: TabId) => void };

export default function OverviewView({ data, now, changedIds, onOpen }: Props) {
  const today = karachiDay(new Date(now));
  const todays = data.appointments
    .filter((a) => karachiDay(a.starts_at) === today && a.status !== "rescheduled")
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  const upcomingWeek = data.appointments.filter((a) => {
    const t = new Date(a.starts_at).getTime();
    return a.status === "booked" && t > now && t < now + WEEK_MS;
  });
  const callsToday = data.calls.filter((c) => karachiDay(c.created_at) === today);
  const newPatients = data.patients.filter((p) => now - new Date(p.created_at).getTime() < WEEK_MS);
  const latestBookings = [...data.appointments].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 6);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Today's appointments" value={todays.filter((a) => a.status === "booked" || a.status === "completed").length} />
        <StatCard label="Booked, next 7 days" value={upcomingWeek.length} />
        <StatCard label="Calls today" value={callsToday.length} />
        <StatCard label="New patients, 7 days" value={newPatients.length} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Today's schedule" action={<LinkButton onClick={() => onOpen("appointments")}>All appointments</LinkButton>}>
          {todays.length === 0 ? (
            <Empty text="No appointments today." />
          ) : (
            <ul className="divide-y divide-slate-100">
              {todays.map((a) => (
                <li key={a.id} className={`flex items-center gap-4 px-5 py-3 ${highlight(changedIds.has(a.id))}`}>
                  <span className="w-20 text-sm font-semibold tabular-nums text-slate-900">{formatTime(a.starts_at)}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-900">{a.patient?.full_name ?? "Unknown patient"}</p>
                    <p className="truncate text-xs text-slate-500">{a.service?.name} · {a.dentist?.full_name}</p>
                  </div>
                  <StatusBadge status={a.status} />
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Latest bookings" action={<LinkButton onClick={() => onOpen("appointments")}>View all</LinkButton>}>
          {latestBookings.length === 0 ? (
            <Empty text="No bookings yet. They will appear here the moment Ayesha books one." />
          ) : (
            <ul className="divide-y divide-slate-100">
              {latestBookings.map((a) => (
                <li key={a.id} className={`flex items-center gap-4 px-5 py-3 ${highlight(changedIds.has(a.id))}`}>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-900">
                      {a.patient?.full_name} <span className="font-normal text-slate-500">· {a.service?.name}</span>
                    </p>
                    <p className="truncate text-xs text-slate-500">For {formatDateTime(a.starts_at)} · booked {timeAgo(a.created_at, now)}</p>
                  </div>
                  <StatusBadge status={a.status} />
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <Panel title="Recent calls" action={<LinkButton onClick={() => onOpen("calls")}>All calls</LinkButton>}>
        {data.calls.length === 0 ? (
          <Empty text="No calls logged yet." />
        ) : (
          <ul className="divide-y divide-slate-100">
            {data.calls.slice(0, 5).map((c) => (
              <li key={c.id} className={`px-5 py-3 ${highlight(changedIds.has(c.id))}`}>
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="font-medium text-slate-900">{c.patient?.full_name ?? c.phone ?? "Web call"}</span>
                  <span className="text-xs text-slate-500">{timeAgo(c.created_at, now)} · {formatDuration(c.duration_sec)}</span>
                </div>
                {c.summary && <p className="mt-1 line-clamp-2 text-sm text-slate-600">{c.summary}</p>}
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}

function LinkButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className="text-sm font-medium text-teal-700 hover:text-teal-900">
      {children}
    </button>
  );
}
