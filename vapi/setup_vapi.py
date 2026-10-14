"""Create or update the Airways Dental Clinic assistant and its tools in Vapi.

Reads VAPI_API_KEY and VAPI_WEBHOOK_SECRET from vapi/.env (never printed).
Saves created IDs to vapi/ids.json so re-running updates instead of duplicating.

Run: python3 -I vapi/setup_vapi.py
"""
import json
import pathlib
import sys
import urllib.error
import urllib.request

HERE = pathlib.Path(__file__).resolve().parent
API = "https://api.vapi.ai"
TOOLS_URL = "https://annask1.app.n8n.cloud/webhook/vapi-tools"
EVENTS_URL = "https://annask1.app.n8n.cloud/webhook/vapi-events"

# Swap these if a test call shows a problem
MODEL = {"provider": "anthropic", "model": "claude-haiku-5-5", "temperature": 0.3}
TRANSCRIBER = {"provider": "deepgram", "model": "nova-3", "language": "en"}
# Vapi's Naina v2 voice produced no audible audio in web calls (2026-10-13), so keep Azure
VOICE = {"provider": "azure", "voiceId": "en-IN-NeerjaNeural"}

# Tried 2026-10-13: backgroundSpeechDenoisingPlan + backgroundSound "off" + stopSpeakingPlan
# made web calls silent (0 TTS characters), so none are set. Re-add one at a time if needed.
NOISE_SETTINGS: dict = {}
# Wait longer before replying when the caller is mid-number, so a phone number
# spoken with pauses is not cut off after a few digits
START_SPEAKING_PLAN = {
    "waitSeconds": 0.6,
    "transcriptionEndpointingPlan": {
        "onPunctuationSeconds": 0.3,
        "onNoPunctuationSeconds": 1.5,
        "onNumberSeconds": 2.0,
    },
}

# Vapi speaks these itself while a tool runs. The model is told to call tools without
# speaking first: a spoken preamble in the same turn as a tool call left calls stuck
# with "Tool Result Still Pending" and no reply (2026-10-13 test calls).
TOOL_MESSAGES = [
    {"type": "request-start", "content": "One moment, let me check that for you.", "blocking": False},
    {"type": "request-response-delayed", "content": "Sorry, still checking, just a second.", "timingMilliseconds": 4000},
    {"type": "request-failed", "content": "Sorry, I couldn't reach our booking system just now."},
]

FIRST_MESSAGE = "Hello, thank you for calling Airways Dental Clinic. This is Ayesha. How can I help you today?"

TOOLS = [
    {
        "name": "get_clinic_info",
        "description": "Get the clinic's services (with prices and durations), dentists and their working hours, address and today's date in Karachi.",
        "parameters": {"type": "object", "properties": {}},
    },
    {
        "name": "check_availability",
        "description": "List open appointment start times for a service on one date.",
        "parameters": {
            "type": "object",
            "properties": {
                "date": {"type": "string", "description": "Date in YYYY-MM-DD format, in Karachi time."},
                "service": {"type": "string", "description": "Service name, e.g. Consultation, Checkup & Cleaning, Filling, Tooth Extraction, Root Canal, Teeth Whitening, Emergency Visit."},
                "dentist": {"type": "string", "description": "Optional dentist name if the caller asks for a specific dentist."},
            },
            "required": ["date", "service"],
        },
    },
    {
        "name": "book_appointment",
        "description": "Book an appointment after the caller has confirmed the service, time and name.",
        "parameters": {
            "type": "object",
            "properties": {
                "full_name": {"type": "string", "description": "Patient's full name."},
                "service": {"type": "string", "description": "Service name."},
                "start_local": {"type": "string", "description": "Start time exactly as returned by check_availability, format YYYY-MM-DD HH:MM."},
                "dentist": {"type": "string", "description": "Optional dentist name."},
                "phone": {"type": "string", "description": "Caller's full 11-digit mobile number, e.g. 03123456789, confirmed by reading it back."},
                "notes": {"type": "string", "description": "Optional short note, e.g. the problem the caller described."},
            },
            "required": ["full_name", "phone", "service", "start_local"],
        },
    },
    {
        "name": "get_patient_appointments",
        "description": "Find the caller's patient record and upcoming appointments by phone number.",
        "parameters": {
            "type": "object",
            "properties": {
                "phone": {"type": "string", "description": "Caller's full 11-digit mobile number, e.g. 03123456789, confirmed by reading it back."},
            },
            "required": ["phone"],
        },
    },
    {
        "name": "reschedule_appointment",
        "description": "Move an existing appointment to a new time. Check availability for the new date first.",
        "parameters": {
            "type": "object",
            "properties": {
                "appointment_id": {"type": "string", "description": "appointment_id from get_patient_appointments."},
                "new_start_local": {"type": "string", "description": "New start time from check_availability, format YYYY-MM-DD HH:MM."},
                "phone": {"type": "string", "description": "Caller's full 11-digit mobile number, e.g. 03123456789, confirmed by reading it back."},
            },
            "required": ["appointment_id", "phone", "new_start_local"],
        },
    },
    {
        "name": "cancel_appointment",
        "description": "Cancel an appointment after the caller clearly confirms.",
        "parameters": {
            "type": "object",
            "properties": {
                "appointment_id": {"type": "string", "description": "appointment_id from get_patient_appointments."},
                "phone": {"type": "string", "description": "Caller's full 11-digit mobile number, e.g. 03123456789, confirmed by reading it back."},
            },
            "required": ["appointment_id", "phone"],
        },
    },
]


def load_env():
    env_file = HERE / ".env"
    if not env_file.exists():
        sys.exit(f"Missing {env_file}. Add VAPI_API_KEY=... and VAPI_WEBHOOK_SECRET=... to it.")
    env = {}
    for line in env_file.read_text().splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            key, value = line.split("=", 1)
            env[key.strip()] = value.strip().strip('"').strip("'")
    for key in ("VAPI_API_KEY", "VAPI_WEBHOOK_SECRET"):
        if not env.get(key):
            sys.exit(f"{key} is empty in {env_file}.")
    return env


def call(method, path, api_key, body=None):
    req = urllib.request.Request(
        API + path,
        method=method,
        data=json.dumps(body).encode() if body is not None else None,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            # Vapi's Cloudflare blocks urllib's default User-Agent (error 1010)
            "User-Agent": "airways-dental-setup/1.0",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read() or b"{}")
    except urllib.error.HTTPError as err:
        sys.exit(f"Vapi {method} {path} failed ({err.code}): {err.read().decode()[:800]}")


def main():
    env = load_env()
    api_key = env["VAPI_API_KEY"]
    server_headers = {"X-Vapi-Secret": env["VAPI_WEBHOOK_SECRET"]}
    ids_file = HERE / "ids.json"
    ids = json.loads(ids_file.read_text()) if ids_file.exists() else {"tools": {}}

    for tool in TOOLS:
        body = {
            "function": tool,
            "server": {"url": TOOLS_URL, "headers": server_headers, "timeoutSeconds": 20},
            "messages": TOOL_MESSAGES,
        }
        existing = ids["tools"].get(tool["name"])
        if existing:
            call("PATCH", f"/tool/{existing}", api_key, body)
            print(f"updated tool  {tool['name']}")
        else:
            created = call("POST", "/tool", api_key, {"type": "function", **body})
            ids["tools"][tool["name"]] = created["id"]
            print(f"created tool  {tool['name']}")
        ids_file.write_text(json.dumps(ids, indent=2))

    assistant = {
        "name": "Airways Dental Receptionist",
        "firstMessage": FIRST_MESSAGE,
        "model": {
            **MODEL,
            "messages": [{"role": "system", "content": (HERE / "system-prompt.md").read_text()}],
            "toolIds": list(ids["tools"].values()),
            "tools": [{"type": "endCall"}],
        },
        "transcriber": TRANSCRIBER,
        "voice": VOICE,
        "startSpeakingPlan": START_SPEAKING_PLAN,
        **NOISE_SETTINGS,
        "server": {"url": EVENTS_URL, "headers": server_headers},
        "serverMessages": ["end-of-call-report"],
        "analysisPlan": {"summaryPlan": {"enabled": True}},
        "maxDurationSeconds": 900,
        # Spoken in full before hanging up, so the goodbye is not cut off
        "endCallMessage": "Thank you for calling Airways Dental Clinic. Goodbye!",
    }
    if ids.get("assistant"):
        call("PATCH", f"/assistant/{ids['assistant']}", api_key, assistant)
        print("updated assistant")
    else:
        created = call("POST", "/assistant", api_key, assistant)
        ids["assistant"] = created["id"]
        print("created assistant")
    ids_file.write_text(json.dumps(ids, indent=2))
    print(f"assistant id: {ids['assistant']}")


if __name__ == "__main__":
    main()
