import VoiceAgent from "@/components/VoiceAgent";
import { formatPrice, getClinicData } from "@/lib/clinic";

export default async function Home() {
  const clinic = await getClinicData();
  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
    `${clinic.name}, ${clinic.address ?? "Gulshan-e-Iqbal, Karachi"}`,
  )}`;

  return (
    <>
      <header className="sticky top-0 z-20 border-b border-teal-900/5 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
          <a href="#" className="flex items-center gap-2 font-bold text-slate-900">
            <ToothLogo />
            <span>{clinic.name}</span>
          </a>
          <nav className="hidden gap-6 text-sm font-medium text-slate-600 md:flex">
            <a href="#services" className="hover:text-teal-700">Services</a>
            <a href="#dentists" className="hover:text-teal-700">Dentists</a>
            <a href="#visit" className="hover:text-teal-700">Visit us</a>
          </nav>
          <a
            href="#book"
            className="rounded-full bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700"
          >
            Book now
          </a>
        </div>
      </header>

      <main>
        <section id="book" className="relative overflow-hidden bg-gradient-to-b from-teal-50 via-white to-white">
          <div className="pointer-events-none absolute -right-32 -top-32 h-96 w-96 rounded-full bg-teal-200/40 blur-3xl" />
          <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-16 sm:px-6 md:grid-cols-2 md:py-24">
            <div>
              <p className="inline-flex items-center gap-2 rounded-full bg-teal-100 px-3 py-1 text-xs font-semibold text-teal-800">
                <span className="h-2 w-2 rounded-full bg-teal-500" /> Booking open 24/7
              </p>
              <h1 className="mt-4 text-4xl font-extrabold tracking-tight text-slate-900 sm:text-5xl">
                Healthy smiles in Gulshan-e-Iqbal
              </h1>
              <p className="mt-4 max-w-md text-lg text-slate-600">
                Gentle, modern dental care near Maskan Chowrangi. Book your visit in under a minute by
                talking to Ayesha, our AI receptionist. No waiting on hold.
              </p>
              <ul className="mt-6 space-y-2 text-sm text-slate-700">
                <li className="flex gap-2"><Check /> Book, reschedule or cancel by voice</li>
                <li className="flex gap-2"><Check /> Instant confirmation with your dentist&apos;s name and time</li>
                <li className="flex gap-2"><Check /> Checkups, fillings, root canals, whitening and emergencies</li>
              </ul>
            </div>
            <VoiceAgent />
          </div>
        </section>

        <section id="services" className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <h2 className="text-3xl font-bold text-slate-900">Our services</h2>
          <p className="mt-2 text-slate-600">Transparent pricing. Ask Ayesha to book any of these.</p>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {clinic.services.map((service) => (
              <article key={service.id} className="rounded-2xl border border-slate-200 p-5 transition hover:border-teal-300 hover:shadow-md">
                <div className="flex items-start justify-between gap-3">
                  <h3 className="font-semibold text-slate-900">{service.name}</h3>
                  <span className="whitespace-nowrap rounded-full bg-teal-50 px-2.5 py-1 text-sm font-semibold text-teal-800">
                    {formatPrice(service.price)}
                  </span>
                </div>
                {service.description && <p className="mt-2 text-sm text-slate-600">{service.description}</p>}
                <p className="mt-3 text-xs font-medium text-slate-500">About {service.duration_min} minutes</p>
              </article>
            ))}
          </div>
        </section>

        <section id="dentists" className="bg-slate-50">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
            <h2 className="text-3xl font-bold text-slate-900">Meet our dentists</h2>
            <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {clinic.dentists.map((dentist) => (
                <article key={dentist.id} className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-teal-100 text-lg font-bold text-teal-800">
                    {initials(dentist.full_name)}
                  </div>
                  <h3 className="mt-3 font-semibold text-slate-900">{dentist.full_name}</h3>
                  {dentist.specialty && <p className="text-sm text-slate-600">{dentist.specialty}</p>}
                  <p className="mt-3 text-xs text-slate-500">{summariseDays(dentist.hours.map((h) => h.weekday))}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="visit" className="mx-auto grid max-w-6xl gap-8 px-4 py-16 sm:px-6 md:grid-cols-2">
          <div>
            <h2 className="text-3xl font-bold text-slate-900">Visit us</h2>
            <p className="mt-4 text-slate-700">{clinic.address}</p>
            {clinic.phone && <p className="mt-2 text-slate-700">Phone: {clinic.phone}</p>}
            <a
              href={mapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-6 inline-flex rounded-full border border-teal-600 px-4 py-2 text-sm font-semibold text-teal-700 hover:bg-teal-50"
            >
              Get directions
            </a>
          </div>
          <div className="rounded-2xl border border-slate-200 p-5">
            <h3 className="font-semibold text-slate-900">Opening hours</h3>
            <dl className="mt-3 divide-y divide-slate-100 text-sm">
              {clinic.openingHours.map(({ day, ranges }) => (
                <div key={day} className="flex justify-between gap-4 py-2">
                  <dt className="text-slate-600">{day}</dt>
                  <dd className="text-right font-medium text-slate-900">
                    {ranges.length ? ranges.join(", ") : <span className="text-slate-400">Closed</span>}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </section>
      </main>

      <footer className="border-t border-slate-200">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-8 text-sm text-slate-500 sm:flex-row sm:justify-between sm:px-6">
          <p>© {clinic.name}</p>
          <p>In a dental emergency with heavy bleeding or swelling, go to the nearest hospital emergency department.</p>
        </div>
      </footer>
    </>
  );
}

function initials(name: string) {
  return name
    .replace(/^Dr\.?\s+/i, "")
    .split(/\s+/)
    .map((part) => part[0])
    .slice(0, 2)
    .join("");
}

function summariseDays(weekdays: number[]) {
  const names = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const unique = [...new Set(weekdays)].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7));
  return unique.length ? `Available ${unique.map((d) => names[d]).join(", ")}` : "";
}

function Check() {
  return (
    <svg className="mt-0.5 h-4 w-4 flex-none text-teal-600" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
      <path fillRule="evenodd" d="M16.7 5.3a1 1 0 0 1 0 1.4l-8 8a1 1 0 0 1-1.4 0l-4-4a1 1 0 1 1 1.4-1.4L8 12.6l7.3-7.3a1 1 0 0 1 1.4 0z" clipRule="evenodd" />
    </svg>
  );
}

function ToothLogo() {
  return (
    <svg className="h-7 w-7 text-teal-600" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 4.5C10.3 3.3 8.3 2.8 6.6 3.3 4 4 2.8 6.6 3.4 9.6c.4 2 1.3 3.3 1.8 5 .6 2 .7 6.4 2.6 6.4 1.6 0 1.8-2.9 2.3-4.6.3-1 .9-1.6 1.9-1.6s1.6.6 1.9 1.6c.5 1.7.7 4.6 2.3 4.6 1.9 0 2-4.4 2.6-6.4.5-1.7 1.4-3 1.8-5 .6-3-.6-5.6-3.2-6.3-1.7-.5-3.7 0-5.4 1.2z" />
    </svg>
  );
}

