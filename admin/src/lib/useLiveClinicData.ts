"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase, type Appointment, type CallLog, type Dentist, type Patient, type Service } from "./supabase";

export type ClinicData = {
  appointments: Appointment[];
  patients: Patient[];
  calls: CallLog[];
  services: Service[];
  dentists: Dentist[];
};

export type LiveEvent = { id: number; text: string };

const EMPTY: ClinicData = { appointments: [], patients: [], calls: [], services: [], dentists: [] };

async function fetchAll(): Promise<ClinicData> {
  const [appointments, patients, calls, services, dentists] = await Promise.all([
    supabase
      .from("appointments")
      .select(
        "id, starts_at, ends_at, status, notes, source, vapi_call_id, rescheduled_from, created_at, updated_at," +
          " patient:patients(id, full_name, phone), dentist:dentists(full_name), service:services(name, price)",
      )
      .order("starts_at", { ascending: false })
      .limit(1000),
    supabase.from("patients").select("id, full_name, phone, email, created_at").order("created_at", { ascending: false }),
    supabase
      .from("call_logs")
      .select(
        "id, patient_id, vapi_call_id, phone, started_at, ended_at, duration_sec, ended_reason, summary, transcript, recording_url, created_at, patient:patients(full_name)",
      )
      .order("created_at", { ascending: false })
      .limit(300),
    supabase.from("services").select("id, name, description, duration_min, price, is_active").order("name"),
    supabase
      .from("dentists")
      .select("id, full_name, specialty, is_active, working_hours(weekday, start_time, end_time)")
      .order("full_name"),
  ]);

  const firstError = [appointments, patients, calls, services, dentists].find((r) => r.error)?.error;
  if (firstError) throw firstError;

  return {
    appointments: (appointments.data ?? []) as unknown as Appointment[],
    patients: (patients.data ?? []) as Patient[],
    calls: (calls.data ?? []) as unknown as CallLog[],
    services: (services.data ?? []) as Service[],
    dentists: (dentists.data ?? []) as unknown as Dentist[],
  };
}

// Loads everything once, then refetches whenever Supabase Realtime reports a change
export function useLiveClinicData() {
  const [data, setData] = useState<ClinicData>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [live, setLive] = useState(false);
  const [events, setEvents] = useState<LiveEvent[]>([]);
  const [changedIds, setChangedIds] = useState<Set<string>>(new Set());
  const refetchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const eventId = useRef(0);

  const refresh = useCallback(
    () =>
      fetchAll()
        .then((next) => {
          setData(next);
          setError(null);
        })
        .catch((err) => setError(err instanceof Error ? err.message : "Could not load data"))
        .finally(() => setLoading(false)),
    [],
  );

  const pushEvent = useCallback((text: string) => {
    const id = ++eventId.current;
    setEvents((prev) => [...prev, { id, text }]);
    setTimeout(() => setEvents((prev) => prev.filter((e) => e.id !== id)), 6000);
  }, []);

  const markChanged = useCallback((id: string | undefined) => {
    if (!id) return;
    setChangedIds((prev) => new Set(prev).add(id));
    setTimeout(
      () =>
        setChangedIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        }),
      8000,
    );
  }, []);

  useEffect(() => {
    refresh();

    // Several rows change at once during a reschedule, so batch refetches
    const scheduleRefetch = () => {
      if (refetchTimer.current) clearTimeout(refetchTimer.current);
      refetchTimer.current = setTimeout(refresh, 400);
    };

    // A reschedule arrives as cancel + insert + two updates in one transaction, so
    // classify a short burst of appointment changes together before announcing it
    let burst: { type: string; status?: string; rescheduledFrom?: string | null }[] = [];
    let burstTimer: ReturnType<typeof setTimeout> | null = null;
    const flushBurst = () => {
      if (burst.some((c) => c.status === "rescheduled" || c.rescheduledFrom)) pushEvent("Appointment rescheduled");
      else if (burst.some((c) => c.type === "INSERT")) pushEvent("New appointment booked");
      else if (burst.some((c) => c.status === "cancelled")) pushEvent("Appointment cancelled");
      burst = [];
    };

    const channel = supabase
      .channel("admin-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "appointments" }, (payload) => {
        const row = payload.new as { id?: string; status?: string; rescheduled_from?: string | null };
        markChanged(row.id);
        burst.push({ type: payload.eventType, status: row.status, rescheduledFrom: row.rescheduled_from });
        if (burstTimer) clearTimeout(burstTimer);
        burstTimer = setTimeout(flushBurst, 600);
        scheduleRefetch();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "patients" }, (payload) => {
        if (payload.eventType === "INSERT") pushEvent("New patient added");
        markChanged((payload.new as { id?: string }).id);
        scheduleRefetch();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "call_logs" }, (payload) => {
        if (payload.eventType === "INSERT") pushEvent("New call logged");
        markChanged((payload.new as { id?: string }).id);
        scheduleRefetch();
      })
      .subscribe((status) => setLive(status === "SUBSCRIBED"));

    return () => {
      if (refetchTimer.current) clearTimeout(refetchTimer.current);
      if (burstTimer) clearTimeout(burstTimer);
      supabase.removeChannel(channel);
    };
  }, [refresh, pushEvent, markChanged]);

  return { data, loading, error, live, events, changedIds, refresh };
}
