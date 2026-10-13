import { createClient } from "@supabase/supabase-js";

// Browser client. Patient data is only returned for signed-in users listed in public.staff (RLS).
export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
);

export type AppointmentStatus = "booked" | "cancelled" | "completed" | "no_show" | "rescheduled";

export type Appointment = {
  id: string;
  starts_at: string;
  ends_at: string;
  status: AppointmentStatus;
  notes: string | null;
  source: string;
  vapi_call_id: string | null;
  rescheduled_from: string | null;
  created_at: string;
  updated_at: string;
  patient: { id: string; full_name: string; phone: string } | null;
  dentist: { full_name: string } | null;
  service: { name: string; price: number | null } | null;
};

export type Patient = {
  id: string;
  full_name: string;
  phone: string;
  email: string | null;
  created_at: string;
};

export type CallLog = {
  id: string;
  patient_id: string | null;
  vapi_call_id: string | null;
  phone: string | null;
  started_at: string | null;
  ended_at: string | null;
  duration_sec: number | null;
  ended_reason: string | null;
  summary: string | null;
  transcript: string | null;
  recording_url: string | null;
  created_at: string;
  patient: { full_name: string } | null;
};

export type Service = {
  id: string;
  name: string;
  description: string | null;
  duration_min: number;
  price: number | null;
  is_active: boolean;
};

export type Dentist = {
  id: string;
  full_name: string;
  specialty: string | null;
  is_active: boolean;
  working_hours: { weekday: number; start_time: string; end_time: string }[];
};
