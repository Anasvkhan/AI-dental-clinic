import { useState } from "react";
import { formatDateTime, formatDuration, timeAgo } from "@/lib/format";
import type { CallLog } from "@/lib/supabase";
import { Empty, Panel, highlight } from "../ui";

type Props = { calls: CallLog[]; now: number; changedIds: Set<string> };

export default function CallsView({ calls, now, changedIds }: Props) {
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <Panel title={`Call logs (${calls.length})`}>
      {calls.length === 0 ? (
        <Empty text="No calls yet. Every call with Ayesha is saved here when it ends." />
      ) : (
        <ul className="divide-y divide-slate-100">
          {calls.map((c) => {
            const open = openId === c.id;
            return (
              <li key={c.id} className={highlight(changedIds.has(c.id))}>
                <button
                  onClick={() => setOpenId(open ? null : c.id)}
                  aria-expanded={open}
                  className="flex w-full items-start gap-4 px-5 py-4 text-left hover:bg-slate-50"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span className="font-medium text-slate-900">{c.patient?.full_name ?? c.phone ?? "Website call"}</span>
                      <span className="text-xs text-slate-500">{formatDateTime(c.started_at ?? c.created_at)}</span>
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{formatDuration(c.duration_sec)}</span>
                      {c.ended_reason && <span className="text-xs text-slate-400">{c.ended_reason.replaceAll("-", " ")}</span>}
                    </div>
                    <p className={`mt-1 text-sm text-slate-600 ${open ? "" : "line-clamp-2"}`}>{c.summary ?? "No summary."}</p>
                  </div>
                  <span className="text-xs text-slate-400">{timeAgo(c.created_at, now)}</span>
                </button>
                {open && (
                  <div className="space-y-3 px-5 pb-5">
                    {c.recording_url && (
                      <audio controls preload="none" src={c.recording_url} className="w-full max-w-md">
                        <a href={c.recording_url}>Download recording</a>
                      </audio>
                    )}
                    {c.transcript ? (
                      <pre className="max-h-96 overflow-y-auto whitespace-pre-wrap rounded-xl bg-slate-50 p-4 font-sans text-sm leading-relaxed text-slate-700">
                        {c.transcript}
                      </pre>
                    ) : (
                      <p className="text-sm text-slate-400">No transcript.</p>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}
