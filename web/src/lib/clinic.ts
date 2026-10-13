import { createClient } from "@supabase/supabase-js";
import { cacheLife } from "next/cache";

export type Service = {
  id: string;
  name: string;
  description: string | null;
  duration_min: number;
  price: number | null;
};

export type Dentist = {
  id: string;
  full_name: string;
  specialty: string | null;
};

export type WorkingHours = {
  dentist_id: string;
  weekday: number;
  start_time: string;
  end_time: string;
};

export type ClinicData = {
  name: string;
  address: string | null;
  phone: string | null;
  services: Service[];
  dentists: (Dentist & { hours: WorkingHours[] })[];
  openingHours: { day: string; ranges: string[] }[];
};

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

// Only public, non-sensitive tables are readable with the publishable key (see migration 008)
export async function getClinicData(): Promise<ClinicData> {
  "use cache";
  cacheLife("minutes");

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { auth: { persistSession: false } },
  );

  const [settings, services, dentists, hours] = await Promise.all([
    supabase.from("clinic_settings").select("clinic_name, address, phone").single(),
    supabase.from("services").select("id, name, description, duration_min, price").order("price"),
    supabase.from("dentists").select("id, full_name, specialty").order("full_name"),
    supabase.from("working_hours").select("dentist_id, weekday, start_time, end_time"),
  ]);

  const allHours = (hours.data ?? []) as WorkingHours[];

  return {
    name: settings.data?.clinic_name ?? "Airways Dental Clinic",
    address: settings.data?.address ?? null,
    phone: settings.data?.phone ?? null,
    services: (services.data ?? []) as Service[],
    dentists: ((dentists.data ?? []) as Dentist[]).map((d) => ({
      ...d,
      hours: allHours.filter((h) => h.dentist_id === d.id),
    })),
    openingHours: buildOpeningHours(allHours),
  };
}

// Clinic is open whenever at least one dentist works; merge overlapping shifts per day
function buildOpeningHours(hours: WorkingHours[]) {
  const order = [1, 2, 3, 4, 5, 6, 0];
  return order.map((weekday) => {
    const shifts = hours
      .filter((h) => h.weekday === weekday)
      .map((h) => [toMinutes(h.start_time), toMinutes(h.end_time)] as [number, number])
      .sort((a, b) => a[0] - b[0]);

    const merged: [number, number][] = [];
    for (const [start, end] of shifts) {
      const last = merged[merged.length - 1];
      if (last && start <= last[1]) last[1] = Math.max(last[1], end);
      else merged.push([start, end]);
    }
    return {
      day: DAYS[weekday],
      ranges: merged.map(([s, e]) => `${formatTime(s)} – ${formatTime(e)}`),
    };
  });
}

function toMinutes(time: string) {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

export function formatTime(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const suffix = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${m.toString().padStart(2, "0")} ${suffix}`;
}

export function formatPrice(price: number | null) {
  if (price == null) return "Ask us";
  return `Rs ${Number(price).toLocaleString("en-PK")}`;
}
