import { WEEKDAYS, formatClock, formatPrice } from "@/lib/format";
import type { Dentist, Service } from "@/lib/supabase";
import { Panel } from "../ui";

export default function ClinicView({ services, dentists }: { services: Service[]; dentists: Dentist[] }) {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Panel title={`Services (${services.length})`}>
        <ul className="divide-y divide-slate-100">
          {services.map((s) => (
            <li key={s.id} className="flex items-start justify-between gap-4 px-5 py-3">
              <div>
                <p className="font-medium text-slate-900">
                  {s.name} {!s.is_active && <span className="text-xs text-slate-400">(hidden)</span>}
                </p>
                <p className="text-sm text-slate-500">{s.description}</p>
              </div>
              <div className="text-right text-sm">
                <p className="font-semibold text-slate-900">{formatPrice(s.price)}</p>
                <p className="text-slate-500">{s.duration_min} min</p>
              </div>
            </li>
          ))}
        </ul>
      </Panel>

      <Panel title={`Dentists (${dentists.length})`}>
        <ul className="divide-y divide-slate-100">
          {dentists.map((d) => (
            <li key={d.id} className="px-5 py-3">
              <p className="font-medium text-slate-900">
                {d.full_name} {!d.is_active && <span className="text-xs text-slate-400">(inactive)</span>}
              </p>
              <p className="text-sm text-slate-500">{d.specialty}</p>
              <ul className="mt-2 grid grid-cols-1 gap-x-4 text-xs text-slate-600 sm:grid-cols-2">
                {[...d.working_hours]
                  .sort((a, b) => ((a.weekday + 6) % 7) - ((b.weekday + 6) % 7) || a.start_time.localeCompare(b.start_time))
                  .map((h) => (
                    <li key={`${h.weekday}-${h.start_time}`}>
                      <span className="inline-block w-9 font-medium">{WEEKDAYS[h.weekday]}</span>
                      {formatClock(h.start_time)} – {formatClock(h.end_time)}
                    </li>
                  ))}
              </ul>
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}
