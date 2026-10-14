"use client";

import Vapi from "@vapi-ai/web";
import { useEffect, useRef, useState } from "react";

type Status = "idle" | "connecting" | "live" | "ended" | "error";
type Line = { role: "assistant" | "user"; text: string };

const PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPI_PUBLIC_KEY;
const ASSISTANT_ID = process.env.NEXT_PUBLIC_VAPI_ASSISTANT_ID;

export default function VoiceAgent() {
  const vapiRef = useRef<Vapi | null>(null);
  const transcriptRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [speaking, setSpeaking] = useState(false);
  const [volume, setVolume] = useState(0);
  const [lines, setLines] = useState<Line[]>([]);
  const [error, setError] = useState<string | null>(null);

  const configured = Boolean(PUBLIC_KEY && ASSISTANT_ID);

  useEffect(() => {
    if (!PUBLIC_KEY) return;
    const vapi = new Vapi(PUBLIC_KEY);
    vapiRef.current = vapi;

    vapi.on("call-start", () => setStatus("live"));
    vapi.on("call-end", () => {
      setStatus("ended");
      setSpeaking(false);
      setVolume(0);
    });
    vapi.on("speech-start", () => setSpeaking(true));
    vapi.on("speech-end", () => setSpeaking(false));
    vapi.on("volume-level", (v) => setVolume(v));
    vapi.on("message", (message) => {
      if (message?.type === "transcript" && message.transcriptType === "final") {
        setLines((prev) => [...prev, { role: message.role, text: message.transcript }]);
      }
    });
    vapi.on("error", (err) => {
      // When Ayesha hangs up, the SDK reports "Meeting ended due to ejection". That is a
      // normal end of call, not a failure.
      const text = JSON.stringify(err ?? "").toLowerCase();
      if (text.includes("ejection") || text.includes("meeting has ended")) {
        setStatus("ended");
        setSpeaking(false);
        setVolume(0);
        return;
      }
      console.error("Vapi error", err);
      setError("The call could not continue. Please try again, or check your microphone.");
      setStatus("error");
    });

    return () => {
      vapi.stop();
      vapi.removeAllListeners();
    };
  }, []);

  useEffect(() => {
    transcriptRef.current?.scrollTo({ top: transcriptRef.current.scrollHeight, behavior: "smooth" });
  }, [lines]);

  async function startCall() {
    if (!vapiRef.current || !ASSISTANT_ID) return;
    setError(null);
    setLines([]);
    setStatus("connecting");
    try {
      await vapiRef.current.start(ASSISTANT_ID);
    } catch (err) {
      console.error(err);
      setError("Could not start the call. Please allow microphone access and try again.");
      setStatus("error");
    }
  }

  function endCall() {
    vapiRef.current?.stop();
  }

  const inCall = status === "connecting" || status === "live";
  const ring = 1 + Math.min(volume, 1) * 0.35;

  return (
    <div className="rounded-3xl bg-white/90 p-6 shadow-xl shadow-teal-900/10 ring-1 ring-teal-900/5 backdrop-blur sm:p-8">
      <div className="flex flex-col items-center text-center">
        <div className="relative flex h-32 w-32 items-center justify-center">
          <span
            className="absolute inset-0 rounded-full bg-teal-400/25 transition-transform duration-150"
            style={{ transform: `scale(${inCall ? ring : 1})` }}
          />
          <span
            className={`absolute inset-3 rounded-full bg-teal-400/30 ${status === "connecting" ? "animate-ping" : ""}`}
          />
          <button
            type="button"
            onClick={inCall ? endCall : startCall}
            disabled={!configured}
            aria-label={inCall ? "End call with Ayesha" : "Start call with Ayesha"}
            className={`relative flex h-24 w-24 items-center justify-center rounded-full text-white shadow-lg transition focus:outline-none focus-visible:ring-4 focus-visible:ring-teal-300 disabled:cursor-not-allowed disabled:opacity-50 ${
              inCall ? "bg-rose-500 hover:bg-rose-600" : "bg-teal-600 hover:bg-teal-700"
            }`}
          >
            {inCall ? <PhoneDownIcon /> : <MicIcon />}
          </button>
        </div>

        <p className="mt-5 text-lg font-semibold text-slate-900">
          {status === "idle" && "Talk to Ayesha"}
          {status === "connecting" && "Connecting…"}
          {status === "live" && (speaking ? "Ayesha is speaking…" : "Listening…")}
          {status === "ended" && "Call ended. Thank you!"}
          {status === "error" && "Something went wrong"}
        </p>
        <p className="mt-1 text-sm text-slate-500">
          {!configured
            ? "Voice booking is being set up. Please check back soon."
            : inCall
              ? "Speak naturally. Tap the red button to hang up."
              : "Our AI receptionist books, reschedules and cancels appointments, 24/7."}
        </p>
        {error && <p className="mt-3 text-sm text-rose-600">{error}</p>}
      </div>

      {lines.length > 0 && (
        <div
          ref={transcriptRef}
          className="mt-6 max-h-56 space-y-2 overflow-y-auto rounded-2xl bg-slate-50 p-4 text-left text-sm"
          aria-live="polite"
        >
          {lines.map((line, i) => (
            <p key={i} className={line.role === "assistant" ? "text-teal-800" : "text-slate-700"}>
              <span className="font-semibold">{line.role === "assistant" ? "Ayesha: " : "You: "}</span>
              {line.text}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

function MicIcon() {
  return (
    <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="9" y="2" width="6" height="12" rx="3" />
      <path d="M5 10a7 7 0 0 0 14 0" />
      <path d="M12 17v5" />
    </svg>
  );
}

function PhoneDownIcon() {
  return (
    <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 15.5c5-4.7 13-4.7 18 0l-2.2 2.6a1.5 1.5 0 0 1-1.9.3l-2.3-1.4a1.5 1.5 0 0 1-.7-1.3v-1.3a12 12 0 0 0-3.8 0v1.3a1.5 1.5 0 0 1-.7 1.3l-2.3 1.4a1.5 1.5 0 0 1-1.9-.3z" />
    </svg>
  );
}
