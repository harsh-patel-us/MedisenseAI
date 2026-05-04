# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

MediSense AI is a full-stack AI-powered medical intelligence platform with **three** core workflows:

- **Doctor side**: Audio file upload → STT → diarization → medical NER → AI SOAP note generation → PDF export
- **Patient side**: Lab report upload → text extraction → AI analysis → health guide (diet/exercise/precautions) → PDF export
- **Patient chatbot ("Medisense AI")**: Persistent, session-based AI medical assistant that remembers patient history, uploaded reports, and past conversations — with file attachment support (images + PDFs) and voice input/output

Additional features:
- **Google Meet consultations**: The only video-call surface. Doctors and patients schedule a meeting through `/consultation/schedule`, the backend creates a Google Calendar event with an auto-generated Meet link, and both parties join via the standard Google Meet client (no in-app WebRTC room).
- **Google Meet transcript processing**: Once a meeting ends, doctors process the Meet transcript through the full diarization → NER → SOAP pipeline directly from the doctor dashboard. The conference id is auto-derived from the Meet link at scheduling time, so there is no extra "link conference" step in the happy path.
- **Google Calendar integration**: OAuth-based calendar event creation with auto-generated Meet links. Supports a platform-level Google account (single shared calendar) or per-user OAuth.
- **Sarvam AI STT/TTS**: Indic multilingual speech-to-text (saaras:v3) and text-to-speech (bulbul:v3) for voice input/output in the patient chatbot, with graceful fallback to Gemini Flash.
- **Website chatbot widget**: Visitor-facing support chatbot for platform questions and general health queries.
- **Authentication**: JWT-based login/register with role-based access (doctor / patient).

> **Removed (Apr–May 2026):** the in-app WebRTC video room. `routers/consultation.py`, `frontend/src/pages/ConsultationRoom.tsx`, `frontend/src/pages/JoinConsultation.tsx`, the `frontend/src/components/consultation/` directory and `frontend/src/api/consultationApi.ts` no longer exist. All scheduling and listing endpoints now live in `routers/meet.py`.

**All AI/ML runs via cloud APIs** (OpenRouter, Sarvam AI, Google). No models are downloaded or executed locally.

## Development Commands

### Backend (`/backend`)
```bash
# Setup
python -m venv venv
venv\Scripts\activate          # Windows
pip install -r requirements.txt

# Run
python main.py
# OR
uvicorn main:app --reload --host 127.0.0.1 --port 8000

# API docs: http://localhost:8000/docs
```

### Frontend (`/frontend`)
```bash
npm install
npm run dev        # Dev server on http://localhost:5173
npm run build      # TypeScript compile + Vite bundle
npm run lint       # ESLint
npm run preview    # Preview production build
```

### Google Calendar Setup (one-time)
```bash
cd backend
python scripts/setup_google_calendar.py
# Paste the output GOOGLE_REFRESH_TOKEN + GOOGLE_CALENDAR_EMAIL into .env
```

### Demo Data
```bash
# From project root — generates 3 sample PDF lab reports in demo/sample_reports/
pip install reportlab
python demo/generate_sample_reports.py

# Generates a ~15-20 sec doctor/patient dialog MP3 in demo/sample_audio/
# for testing the Doctor Dashboard "Upload Consultation Audio" flow
pip install gTTS
python demo/generate_sample_audio.py
```

## Architecture

### Backend (`/backend`)

**FastAPI async application** — entry point `main.py`.

- **`config.py`**: Pydantic settings loaded from `.env` (all configuration variables). No prompts — those live in `prompts/`.

- **`prompts/`**: All AI system prompts stored as plain-text `.txt` files, loaded at import time by `prompts/__init__.py`. Prompt engineers can edit these without touching Python code.
  - `soap_note.txt` — SOAP note generation from labeled transcript
  - `report_analysis.txt` — Extract findings from any medical report type
  - `summary_specialist.txt` — Plain-language summary + specialist routing
  - `lifestyle_guide.txt` — Diet, exercise, precautions tailored to conditions
  - `patient_explanation.txt` — Post-call patient-friendly explanation
  - `patient_chatbot_system.txt` — Medisense AI system prompt with patient context slots
  - `patient_chatbot_summary.txt` — Auto-summarize chat sessions for memory
  - `chatbot_system.txt` — Website visitor chatbot personality
  - `safety_system.txt` — Medical safety guardrails prepended to every LLM call

- **`routers/`**: Seven route groups (all mounted under `/api`)
  - `auth.py` — JWT-based register/login/me endpoints
  - `doctor.py` — `POST /doctor/upload-audio` accepts an audio file, transcribes it via Gemini Flash, and returns alternating DOCTOR/PATIENT segments. POST endpoints for SOAP generation and PDF export, GET `/doctor/sessions` for past consultations. The legacy `WebSocket /doctor/stream-audio` route is still present but no longer used by the dashboard (live recording was removed)
  - `patient.py` — POST endpoints for file upload, analysis, and PDF export, plus `/patient/history`, `/history/{id}`, `/history/{id}/file`, `/history/{id}/pdf`
  - `chatbot.py` — Website support chatbot widget (visitor-facing, stateless or session-based)
  - `patient_chatbot.py` — Medisense AI persistent patient chatbot (`/message`, `/history/{patient_id}`, `/session/{session_id}`, `/session/end`, `/voice-message`, `/tts`, `/attachment/{attachment_id}`)
  - `meet.py` — Single home for everything Google Meet related:
    - `POST /meet/schedule` — create a Google Calendar event + Meet link, persist a `ConsultationSession` row in `status="scheduled"`, auto-extract the conference id from the Meet URL.
    - `GET  /meet/scheduled` — list the current user's scheduled meetings (ordered by `scheduled_at`).
    - `GET  /meet/sessions/unprocessed` — list sessions that have a Meet conference id but no SOAP yet.
    - `POST /meet/link-conference` — defensive fallback to bind a conference id to a session if scheduling didn't auto-derive it.
    - `POST /meet/process-transcript` — kick off the diarization → NER → SOAP background task.
    - `GET  /meet/process-status/{task_id}` — poll the background task and pick up the resulting SOAP / patient explanation.
    - `POST /meet/webhook` — HMAC-SHA256 signed Google "meeting ended" webhook.
  - `google_oauth.py` — Google OAuth flow for Calendar integration (`/integrations/google/status`, `/auth-url`, `/callback`, `/disconnect`)

- **`services/`**: Core business logic (all cloud-based, no local models)
  - `claude_service.py` — All LLM calls via OpenRouter (uses the OpenAI SDK against an OpenRouter base URL); includes vision-based OCR for scanned documents
  - `transcription.py` — STT via Gemini Flash on OpenRouter (default: `google/gemini-2.5-flash`)
  - `sarvam_stt_service.py` — Sarvam AI streaming + batch STT (saaras:v3 for doctor flows, saarika:v2.5 codemix for patient chatbot); falls back to Gemini Flash when `SARVAM_API_KEY` is not set
  - `sarvam_tts_service.py` — Sarvam AI text-to-speech (bulbul:v3) with REST and WebSocket modes; returns empty payload when not configured
  - `diarization.py` — Speaker labeling (Doctor/Patient) using pause-based heuristic (pure Python, no local models)
  - `ner.py` — Medical NER using regex keyword matching (pure Python, no local models)
  - `report_parser.py` — PDF text extraction via PyMuPDF; scanned/image pages use OpenRouter vision OCR (no local Tesseract)
  - `pdf_export.py` — PDF generation via ReportLab (SOAP notes, patient health guides, consultation summaries)
  - `auth_service.py` — Password hashing (bcrypt) + JWT token creation/verification
  - `chatbot_agent.py` — OpenAI Agents SDK multi-agent system for the website chatbot widget (Triage → Platform Support / Health Info agents)
  - `patient_chatbot.py` — Medisense AI agent: session management, memory injection (reports + past summaries), vision-capable file analysis, auto-summarization
  - `google_calendar.py` — Google Calendar event creation with Meet links using platform-level or per-user OAuth

- **`models/`**: Pydantic schemas for request/response validation
  - `auth_models.py` — Register/login request, user response, token response
  - `doctor_models.py` — SOAP note structures, transcript segments, medical entities
  - `patient_models.py` — Patient analysis and upload response shapes
  - `chatbot_models.py` — Chatbot message request/response
  - `patient_chatbot_models.py` — Patient chat session, message, history, send-message, voice-message request/response, TTS request/response

- **`database.py`**: SQLAlchemy async ORM (SQLite by default, PostgreSQL via `asyncpg` in prod). 7 tables; idempotent `ALTER TABLE ADD COLUMN` migrations in `init_db()` keep both backends in sync.
  - `User` — Auth users (email, password_hash, full_name, role, Google OAuth fields).
  - `ConsultationSession` — Doctor-side **and** scheduling rows. Beyond the original transcript/SOAP fields, this table now persists:
    - Meet linkage: `meet_conference_id`, `processing_status`, `processing_task_id`.
    - Scheduling: `scheduled_at` (TIMESTAMP, **stored UTC-naive** — see warning below), `duration_minutes`, `reason`, `patient_email`, `doctor_email`, `organizer_id` (FK → users), `organizer_role` ("doctor" | "patient").
    - Google artifacts: `meet_link`, `google_event_id`, `google_event_link`, `google_invite_status` ("sent" | "skipped" | "failed"), `google_invite_error`.
  - `ChatbotSession` — Website chatbot widget sessions (messages JSON).
  - `PatientAnalysisRecord` — Patient-side report analyses (findings, diet/exercise/precautions, PDF path).
  - `PatientChatSession` — Medisense AI chat sessions (title, summary, message count).
  - `PatientChatMessage` — Individual messages in patient chat sessions (role, content, file_references).
  - `PatientChatAudit` — Append-only audit trail for patient chat API access.

  > **Datetime gotcha**: `scheduled_at` is a naive `DateTime` column → maps to `TIMESTAMP WITHOUT TIME ZONE` in Postgres. The frontend sends ISO 8601 with a `Z`/offset, so `meet.py` parses it as tz-aware and then strips to UTC before storing. asyncpg refuses to bind tz-aware datetimes against naive columns — keep this conversion in any new code that writes to the column.

- **`scripts/`**:
  - `setup_google_calendar.py` — One-time script to obtain Google refresh token for platform-level Calendar/Meet integration

- **`utils/`**:
  - `helpers.py` — ID generation, file validation, JSON extraction from LLM responses
  - `storage.py` — File storage utilities

### Frontend (`/frontend/src`)

**React 19 + TypeScript + Vite** — entry point `main.tsx`.

- **`App.tsx`** — Landing page (hero, stats, feature cards, interactive demo, FAQ, footer) + Navbar + route setup. Contains `PublicOnly` and `VisitorOnlyChatbot` wrappers. The "Join Call" navbar/footer entries and the `/consultation/join` and `/consultation/room/:roomId` routes have been removed; the only consultation entry point is `/consultation/schedule`.
- **`pages/`** (14 pages, no in-app video room)
  - `Login.tsx` / `Register.tsx` — Auth pages
  - `DoctorDashboard.tsx` — Audio **file upload**, transcript view, SOAP note editor, PDF export, plus a "Process Google Meet Consultation" section that lists unprocessed Meet sessions, triggers processing, polls `/meet/process-status/{task_id}`, and shows the result in `SoapNoteEditor`. The header has a "📅 Schedule Google Meet" link to `/consultation/schedule`. The old in-browser recorder and live transcript flow is commented out — the dashboard now expects the doctor to upload a pre-recorded consultation audio file.
  - `PatientDashboard.tsx` — Report uploader, 4-tab results interface
  - `PatientChat.tsx` — Medisense AI persistent chatbot (sidebar with session history, message bubbles, file attachments, animated thinking indicator, microphone button for voice input with STT transcription, TTS toggle for voice replies)
  - `SchedulePage.tsx` — **Both doctors and patients** can schedule. Form posts to `/api/meet/schedule`; the success panel shows the Meet link with a copy button + "Open Google Meet Now" CTA. The upcoming-meetings card has a "Join Google Meet" button + "Calendar" link, and (doctors only) a deep-link to the Meet processing section on the dashboard.
  - `AboutPage.tsx` / `ContactPage.tsx` / `FeaturesPage.tsx` / `UseCasesPage.tsx` / `PricingPage.tsx` / `SecurityPage.tsx` / `IntegrationsPage.tsx` / `ResourcesPage.tsx` — Marketing pages
- **`components/`**
  - `ChatbotWidget.tsx` — Floating chatbot widget for visitors
  - `ProtectedRoute.tsx` — Role-based route guard
  - `ScrollToTop.tsx` — Scroll restoration on navigation
  - `doctor/` — AudioFileUpload, TranscriptView, SoapNoteEditor (the older AudioRecorder + LiveTranscript files are still on disk but no longer imported by `DoctorDashboard.tsx`)
  - `patient/` — ReportUploader, ReportSummary, SpecialistGuide, DietExercisePlan, PrecautionsList
  - (No `consultation/` directory — VideoGrid, CallControls, ConsultationTranscript and PostCallSummary were removed with the WebRTC room.)
- **`api/`** (7 modules — no `consultationApi.ts`)
  - `authApi.ts` — Login, register, token management, current user
  - `doctorApi.ts` — WebSocket connection + SOAP generation calls
  - `patientApi.ts` — File upload, analysis trigger, PDF export, history endpoints
  - `chatbotApi.ts` — Website chatbot API
  - `patientChatbotApi.ts` — Medisense AI chat API (sessions, messages, history, file upload, voice transcription, TTS synthesis)
  - `meetApi.ts` — **Now owns all scheduling types and calls**: `scheduleMeeting`, `listScheduledMeetings`, `linkConference`, `processTranscript`, `getProcessStatus`, `listUnprocessedSessions`, plus the `ScheduleMeetingRequest` / `ScheduledMeeting` interfaces.
  - `googleIntegrationApi.ts` — Google OAuth integration API
- **`contexts/`**
  - `AuthContext.tsx` — React context for auth state (user, token, login/logout/register)
- **`hooks/`**
  - `useAudioRecorder.ts` — Browser audio capture via Web Audio API
  - `useWebSocket.ts` — Real-time transcript streaming
- **`types/`** — `auth.types.ts`, `doctor.types.ts`, `patient.types.ts`, `chatbot.types.ts`, `patientChatbot.types.ts`, and a trimmed `consultation.types.ts` that now only re-exports the Google integration shapes still used by `googleIntegrationApi.ts` (`GoogleInviteStatus`, `GoogleConnectionStatus`, `GoogleAuthUrlResponse`).

**API proxy**: Vite dev server proxies `/api/*` to `http://localhost:8000`, so no CORS issues in development.

**Styling**: Vanilla CSS with glassmorphism design via custom CSS variables (`index.css`). No Tailwind.

## Key Technical Notes

- **All AI/ML is cloud-based** — no models are downloaded or run locally. All LLM, STT, TTS, and vision OCR calls go through cloud APIs (OpenRouter, Sarvam AI).
- **AI calls** route through OpenRouter using the OpenAI SDK. The default model is `openai/gpt-4o-mini`, configurable via `.env`. Vision model also defaults to `gpt-4o-mini`.
- **Nine AI prompt templates** live in `prompts/*.txt` files — SOAP generation, report analysis, summary/specialists, lifestyle guide, patient-friendly consultation explanation, chatbot system prompts (website + patient), session summary, and safety system message. Import them via `from prompts import SOAP_NOTE_PROMPT`.
- **Configuration** is managed via `config.py` (pydantic-settings) loading all variables from `.env`. Prompts are separate in the `prompts/` package.
- **Authentication** is JWT-based (HS256, 7-day expiry). Users register as `doctor` or `patient`. Protected routes on the frontend use `ProtectedRoute` with role filtering.
- **Speaker diarization** uses a pause-based heuristic (>1.5s gap = speaker switch). Pure Python regex, no local models.
- **Medical NER** uses regex keyword matching for symptoms, medications, diagnoses, and vitals. Pure Python, no local models.
- **OCR for scanned documents** uses OpenRouter vision models (no local Tesseract binary needed).
- **Medisense AI chatbot** maintains persistent memory across sessions via auto-generated session summaries + patient report history injection into the system prompt.
- **Patient chat file attachments** (images/PDFs) are converted to base64 client-side and sent inline to a vision-capable model for analysis.
- **Patient chat voice input** records audio via `MediaRecorder`, sends base64 to `/patient/chat/voice-message` (Sarvam codemix STT with Gemini fallback), and populates the text input for user confirmation before sending.
- **Patient chat TTS** is toggled in the chat header. When enabled, each assistant reply is sent to `/patient/chat/tts` (Sarvam bulbul:v3), and the returned base64 WAV is played via Web Audio API.
- **Google Calendar + Meet integration** is the only video-call surface. Scheduling a consultation creates a Calendar event with an auto-generated Meet link; the conference id is parsed out of the Meet URL and stored on the same `ConsultationSession` row in `processing_status="pending"`. Setup via `python scripts/setup_google_calendar.py` (platform-level), or per-user via the OAuth flow in `routers/google_oauth.py`.
- **Google Meet processing**: doctors see unprocessed sessions on their dashboard, click "Process", and the backend runs the diarization → NER → SOAP pipeline via FastAPI `BackgroundTasks`. The dashboard polls `/meet/process-status/{task_id}` and renders the result in `SoapNoteEditor`.
- **Scheduling endpoints** all live in `routers/meet.py` — there is no `routers/consultation.py` anymore. Scheduling is permitted for both `doctor` and `patient` roles; the `organizer_role` column records which one created the row.
- **Doctor consultation audio** is now a single-shot upload through `POST /doctor/upload-audio`. The backend reads the whole file, transcribes it via Gemini Flash, splits the multi-line transcript into alternating DOCTOR/PATIENT segments, and returns them with a fresh `session_id` for `POST /doctor/generate-note`. The legacy `WebSocket /doctor/stream-audio` route still exists but the dashboard does not call it.
- **Database migrations** are handled via idempotent `ALTER TABLE ADD COLUMN` statements in `init_db()` so the same code works against SQLite (dev) and PostgreSQL (prod via asyncpg).

## Environment Configuration

Backend requires `/backend/.env` with all variables loaded by `config.py`:

```env
# ── OpenRouter / LLM ─────────────────────────
OPENROUTER_API_KEY=sk-or-...
OPENROUTER_BASE_URL=https://openrouter.ai/api/v1
AI_MODEL=openai/gpt-4o-mini

# ── Chatbot widget model ─────────────────────
CHATBOT_MODEL=openai/gpt-4o-mini

# ── Patient persistent chatbot (Medisense AI)
PATIENT_CHATBOT_MODEL=openai/gpt-4o-mini
PATIENT_CHATBOT_SUMMARY_EVERY=10
VISION_MODEL=openai/gpt-4o-mini

# ── App settings ─────────────────────────────
APP_HOST=127.0.0.1
APP_PORT=8000
ENVIRONMENT=development

# ── File upload ──────────────────────────────
UPLOAD_DIR=./tmp/medisense_uploads
MAX_FILE_SIZE_MB=20
ALLOWED_FILE_TYPES=application/pdf,image/jpeg,image/png

# ── Speech / NLP ─────────────────────────────
WHISPER_MODEL=google/gemini-2.5-flash

# ── Database ─────────────────────────────────
DATABASE_URL=sqlite+aiosqlite:///./medisense.db

# ── CORS ─────────────────────────────────────
FRONTEND_URL=http://localhost:5173

# ── Consultation / Medical LLM ───────────────
MEDICAL_MODEL=openai/gpt-4o-mini

# ── Auth / JWT ───────────────────────────────
JWT_SECRET=<256-bit-hex-secret>
JWT_ALGORITHM=HS256
JWT_EXPIRES_MINUTES=10080

# ── Google Calendar OAuth ────────────────────
GOOGLE_CLIENT_ID=<from-google-cloud-console>
GOOGLE_CLIENT_SECRET=<from-google-cloud-console>
GOOGLE_REDIRECT_URI=http://localhost:8000/integrations/google/callback
GOOGLE_POST_AUTH_REDIRECT=http://localhost:5173/consultation/schedule

# ── Platform-level Google account ────────────
GOOGLE_REFRESH_TOKEN=<from-setup-script>
GOOGLE_CALENDAR_EMAIL=<email>

# ── Google Meet transcript webhook ───────────
GOOGLE_MEET_WEBHOOK_SECRET=<256-bit-hex-secret>

# ── Sarvam AI (Indic STT/TTS) ────────────────
SARVAM_API_KEY=<sarvam-key-or-empty>
SARVAM_STT_MODEL=saaras:v3
SARVAM_TTS_MODEL=bulbul:v3
SARVAM_BASE_URL=https://api.sarvam.ai
SARVAM_WS_BASE_URL=wss://api.sarvam.ai
SARVAM_TTS_SPEAKER=anushka
SARVAM_TTS_LANGUAGE=en-IN
```
